module.exports = function (runtime, global) {

    require("object-observe-lite.min")();
    require("array-observe.min")();


    var ui = {};
    ui.__view_cache__ = {};

    ui.layout = function (xml) {
        runtime.ui.layoutInflater.setContext(activity);
        var view = runtime.ui.layoutInflater.inflate(xml.toString());
        ui.setContentView(view);
    }

    ui.setContentView = function (view) {
        ui.view = view;
        ui.__view_cache__ = {};
        ui.run(function () {
            activity.setContentView(view);
        });
    }

    ui.findById = function (id) {
        if (!ui.view)
            return null;
        var v = ui.findByStringId(ui.view.getChildAt(0), id);
        if (v) {
            v = decorate(v);
        }
        return v;
    }

    ui.isUiThread = function () {
        importClass(android.os.Looper);
        return Looper.myLooper() == Looper.getMainLooper();
    }

    ui.run = function (action) {
        if (ui.isUiThread()) {
            return action();
        }
        var err = null;
        var result;
        var disposable = global.threads.disposable();
        runtime.uiHandler.post(function () {
            try {
                result = action();
                disposable.setAndNotify(true);
            } catch (e) {
                err = e;
                disposable.setAndNotify(true);
            }
        });
        disposable.blockedGet();
        if (err) {
            throw err;
        }
        return result;
    }

    ui.post = function (action, delay) {
        delay = delay || 0;
        runtime.getUiHandler().postDelay(wrapUiAction(action), delay);
    }

    ui.statusBarColor = function (color) {
        if (typeof (color) == 'string') {
            color = android.graphics.Color.parseColor(color);
        }
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            ui.run(function () {
                activity.getWindow().setStatusBarColor(color);
            });
        }
    }

    ui.finish = function () {
        ui.run(function () {
            activity.finish();
        });
    }

    ui.findByStringId = function (view, id) {
        return com.stardust.autojs.core.ui.JsViewHelper.findViewByStringId(view, id);
    }

    runtime.ui.bindingContext = global;
    runtime.ui.layoutInflater.setLayoutInflaterDelegate({
        beforeConvertXml: function (xml) {
            return null;
        },
        afterConvertXml: function (xml) {
            return xml;
        },
        afterInflation: function (result, xml, parent) {
            return result;
        },
        beforeInflation: function (xml, parent) {
            return null;
        },
        beforeInflateView: function (node, parent, attachToParent) {
            return null;
        },
        afterInflateView: function (view, node, parent, attachToParent) {
            return view;
        },
        beforeCreateView: function (node, viewName, attrs) {
            return null;
        },
        afterCreateView: function (view, node, viewName, attrs) {
            if (view.getClass().getName() == "com.stardust.autojs.core.ui.widget.JsListView") {
                initListView(view);
            }
            return view;
        },
        beforeApplyAttributes: function (view, inflater, attrs, parent) {
            return false;
        },
        afterApplyAttributes: function (view, inflater, attrs, parent) {

        },
        beforeInflateChildren: function (inflater, node, parent) {
            return false;
        },
        afterInflateChildren: function (inflater, node, parent) {

        },
        afterApplyPendingAttributesOfChildren: function (inflater, view) {

        },
        beforeApplyPendingAttributesOfChildren: function (inflater, view) {
            return false;
        },
        beforeApplyAttribute: function (inflater, view, ns, attrName, value, parent, attrs) {
            value = bind(value);
            inflater.setAttr(view, ns, attrName, value, parent, attrs);
            this.afterApplyAttribute(inflater, view, ns, attrName, value, parent, attrs);
            return true;
        },
        afterApplyAttribute: function (inflater, view, ns, attrName, value, parent, attrs) {

        }
    });

    function bind(value) {
        var ctx = runtime.ui.bindingContext;
        if (ctx == null)
            return;
        var i = -1;
        while ((i = value.indexOf("{{", i + 1)) >= 0) {
            var j = value.indexOf("}}", i + 1);
            if (j < 0)
                return value;
            value = value.substring(0, i) + evalInContext(value.substring(i + 2, j), ctx) + value.substring(j + 2);
            i = j + 1;
        }
        return value;
    }

    function evalInContext(expr, ctx) {
        return global.__exitIfError__(function () {
            log(ctx.toString());
            with(ctx){
                return eval(expr);
            }
        });
       
    }

    function decorate(view) {
        var view = global.events.__asEmitter__(Object.create(view));
        if (view.getClass().getName() == "com.stardust.autojs.core.ui.widget.JsListView") {
            view = decorateList(view);
        }
        var gestureDetector = new android.view.GestureDetector(context, {
            onDown: function (e) {
                e = wrapMotionEvent(e);
                emit("touch_down", e, view);
                return e.consumed;
            },
            onShowPress: function (e) {
                e = wrapMotionEvent(e);
                emit("show_press", e, view);
            },
            onSingleTapUp: function (e) {
                e = wrapMotionEvent(e);
                emit("single_tap", e, view);
                return e.consumed;
            },
            onScroll: function (e1, e2, distanceX, distanceY) {
                e1 = wrapMotionEvent(e1);
                e2 = wrapMotionEvent(e2);
                emit("scroll", e1, e2, distanceX, distanceY, view);
                return e1.consumed || e2.consumed;
            },
            onLongPress: function (e) {
                e = wrapMotionEvent(e);
                emit("long_press", e, view);
            },
            onFling: function (e1, e2, velocityX, velocityY) {
                e1 = wrapMotionEvent(e1);
                e2 = wrapMotionEvent(e2);
                emit("fling", e1, e2, velocityX, velocityY, view);
                return e1.consumed || e2.consumed;
            }
        });
        view.setOnTouchListener(function (v, event) {
            if (gestureDetector.onTouchEvent(event)) {
                return true;
            }
            event = wrapMotionEvent(event);
            event.consumed = false;
            emit("touch", event, view);
            return event.consumed;
        })
        view.setOnLongClickListener(function (v) {
            var event = {};
            event.consumed = false;
            emit("long_click", event, view);
            return event.consumed;
        });
        view.setOnClickListener(function (v) {
            emit("click", view);
        });
        view.setOnKeyListener(function (v, keyCode, event) {
            event = wrapMotionEvent(event);
            emit("key", keyCode, event, v);
            return event.consumed;
        });
        if (typeof (view.setOnCheckedChangeListener) == 'function') {
            view.setOnCheckedChangeListener(function (v, isChecked) {
                emit("check", isChecked, view);
            });
        }
        view._id = function (id) {
            return ui.findById(view, id);
        }
        view.click = function (listener) {
            if (listener) {
                view.setOnClickListener(new android.view.View.OnClickListener(wrapUiAction(listener)));
            } else {
                view.performClick();
            }
        }
        view.longClick = function (listener) {
            if (listener) {
                view.setOnLongClickListener(wrapUiAction(listener, false));
            } else {
                view.performLongClick();
            }
        }
        function emit() {
            var args = arguments;
            global.__exitIfError__(function () {
                //不支持使用apply的原因是rhino会把参数中的primitive变成object
                functionApply(view.emit, args);
                //view.emit.apply(view, args);
            });
        }
        return view;
    }



    function initListView(list) {
        list.setDataSourceAdapter({
            getItemCount: function (data) {
                return data.length;
            },
            getItem: function (data, i) {
                return data[i];
            },
            setDataSource: function (data) {
                var adapter = list.getAdapter();
                Array.observe(data, function (changes) {
                    changes.forEach(change => {
                        if (change.type == 'splice') {
                            if (change.removed && change.removed.length > 0) {
                                adapter.notifyItemRangeRemoved(change.index, change.removed.length);
                            }
                            if (change.addedCount > 0) {
                                adapter.notifyItemRangeInserted(change.index, change.addedCount);
                            }
                        } else if (change.type == 'update') {
                            adapter.notifyItemChanged(parseInt(change.name));
                        }
                    });
                });
            }
        });
    }

    function decorateList(list) {

        return list;
    }

    ui.__decorate__ = decorate;

    function wrapUiAction(action, defReturnValue) {
        if (typeof (activity) != 'undefined') {
            return function () { return action(); };
        }
        return function () {
            return __exitIfError__(action, defReturnValue);
        }
    }

    function wrapMotionEvent(e) {
        e = Object.create(e);
        e.consumed = false;
        return e;
    }

    function functionApply(func, args) {
        if (args.length == 0)
            return func();
        if (args.length == 1)
            return func(args[0]);
        if (args.length == 2)
            return func(args[0], args[1]);
        if (args.length == 3)
            return func(args[0], args[1], args[2]);
        if (args.length == 4)
            return func(args[0], args[1], args[2], args[3]);
        if (args.length == 5)
            return func(args[0], args[1], args[2], args[3], args[4]);
        if (args.length == 6)
            return func(args[0], args[1], args[2], args[3], args[4], args[5]);
        throw new Error("too many arguments: " + args.length);
    }

    var proxy = runtime.ui;
    proxy.__proxy__ = {
        set: function (name, value) {
            ui[name] = value;
        },
        get: function (name) {
            if (!ui[name] && ui.view) {
                var cache = ui.__view_cache__[name];
                if (cache) {
                    return cache;
                }
                cache = ui.findById(name);
                if (cache) {
                    ui.__view_cache__[name] = cache;
                    return cache;
                }
            }
            return ui[name];
        }
    };


    return proxy;
}