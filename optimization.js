/*!
 * GOindiaRIDE Optimization Layer
 * Safe for static GitHub Pages sites. Include near the end of <body>.
 */
(function initGoIndiaRideOptimization(global, document) {
  "use strict";

  if (!global || !document || global.__GOINDIARIDE_OPTIMIZATION_ACTIVE__) return;
  global.__GOINDIARIDE_OPTIMIZATION_ACTIVE__ = true;

  var VERSION = "20260531-opt1";
  var CONFIG = {
    lazyRootMargin: "360px 0px",
    staticCacheName: "goindiaride-static-assets-" + VERSION,
    maxPrecacheAssets: 72,
    maxListenerCountPerTarget: 80,
    eventIntervals: {
      scroll: 80,
      resize: 160,
      mousemove: 80,
      pointermove: 80,
      touchmove: 80,
      wheel: 80
    },
    intervalMinDelay: 250,
    intervalMaxCallsPerMinute: 240,
    intervalLongTaskMs: 80,
    intervalLongTaskStrikes: 5,
    rafLongTaskMs: 42,
    rafLongTaskStrikes: 10,
    eventLoopLagMs: 1800,
    memoryCheckMs: 15000,
    memoryGrowthRatio: 1.55,
    domNodeWarningCount: 4500
  };

  var transparentPixel =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  var heavyEvents = Object.keys(CONFIG.eventIntervals);
  var staticAssetPattern = /\.(?:css|js|mjs|json|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf)(?:[?#].*)?$/i;
  var mediaObserver = null;
  var emergencyModeUntil = 0;
  var lastLoopTick = Date.now();
  var listenerStore = new WeakMap();
  var listenerCounts = new WeakMap();
  var intervalStats = new Map();
  var rafStats = new WeakMap();
  var nativeAddEventListener = global.EventTarget && global.EventTarget.prototype.addEventListener;
  var nativeRemoveEventListener = global.EventTarget && global.EventTarget.prototype.removeEventListener;
  var nativeSetInterval = global.setInterval;
  var nativeClearInterval = global.clearInterval;
  var nativeSetTimeout = global.setTimeout;
  var nativeRequestAnimationFrame = global.requestAnimationFrame;
  var nativeFetch = global.fetch;

  function now() {
    return Date.now();
  }

  function isEmergencyMode() {
    return now() < emergencyModeUntil;
  }

  function enterEmergencyMode(reason) {
    emergencyModeUntil = Math.max(emergencyModeUntil, now() + 20000);
    try {
      global.dispatchEvent(new CustomEvent("goindiaride:optimization-emergency", {
        detail: { reason: reason || "main_thread_pressure", until: emergencyModeUntil }
      }));
    } catch (_error) {}
  }

  function onIdle(callback, timeoutMs) {
    if (typeof global.requestIdleCallback === "function") {
      return global.requestIdleCallback(callback, { timeout: timeoutMs || 2500 });
    }
    return nativeSetTimeout(callback, 120);
  }

  function throttle(callback, waitMs) {
    var lastRun = 0;
    var timer = 0;
    var lastArgs = null;
    var lastThis = null;

    return function throttledCallback() {
      lastArgs = arguments;
      lastThis = this;
      var delay = isEmergencyMode() ? Math.max(waitMs, 250) : waitMs;
      var elapsed = now() - lastRun;

      function run() {
        timer = 0;
        lastRun = now();
        callback.apply(lastThis, lastArgs);
        lastArgs = null;
        lastThis = null;
      }

      if (elapsed >= delay) {
        if (timer) {
          global.clearTimeout(timer);
          timer = 0;
        }
        run();
      } else if (!timer) {
        timer = nativeSetTimeout(run, delay - elapsed);
      }
    };
  }

  function debounce(callback, waitMs) {
    var timer = 0;
    return function debouncedCallback() {
      var args = arguments;
      var context = this;
      if (timer) global.clearTimeout(timer);
      timer = nativeSetTimeout(function runDebounced() {
        timer = 0;
        callback.apply(context, args);
      }, isEmergencyMode() ? Math.max(waitMs, 300) : waitMs);
    };
  }

  function isNearViewport(element, extraPx) {
    if (!element || typeof element.getBoundingClientRect !== "function") return true;
    var rect = element.getBoundingClientRect();
    var margin = Number(extraPx || 0);
    var width = global.innerWidth || document.documentElement.clientWidth || 0;
    var height = global.innerHeight || document.documentElement.clientHeight || 0;
    return rect.bottom >= -margin && rect.right >= -margin && rect.top <= height + margin && rect.left <= width + margin;
  }

  function isCriticalMedia(element) {
    if (!element) return true;
    if (element.hasAttribute("data-no-optimize") || element.hasAttribute("data-opt-critical")) return true;
    var loading = String(element.getAttribute("loading") || "").toLowerCase();
    var priority = String(element.getAttribute("fetchpriority") || element.getAttribute("fetchPriority") || "").toLowerCase();
    return loading === "eager" || priority === "high" || isNearViewport(element, 80);
  }

  function restoreMedia(element) {
    if (!element || element.__goiMediaLoaded) return;
    var src = element.getAttribute("data-goi-opt-src") || element.getAttribute("data-src");
    var srcset = element.getAttribute("data-goi-opt-srcset") || element.getAttribute("data-srcset");
    var sizes = element.getAttribute("data-goi-opt-sizes") || element.getAttribute("data-sizes");

    if (srcset && element.tagName === "IMG") element.setAttribute("srcset", srcset);
    if (sizes && element.tagName === "IMG") element.setAttribute("sizes", sizes);
    if (src) element.setAttribute("src", src);

    element.__goiMediaLoaded = true;
    element.removeAttribute("data-goi-opt-src");
    element.removeAttribute("data-goi-opt-srcset");
    element.removeAttribute("data-goi-opt-sizes");
  }

  function prepareMedia(element) {
    if (!element || element.__goiMediaPrepared || element.hasAttribute("data-no-optimize")) return;
    var tag = element.tagName;
    if (tag !== "IMG" && tag !== "IFRAME") return;

    element.__goiMediaPrepared = true;

    if (tag === "IMG") {
      element.setAttribute("loading", element.getAttribute("loading") || "lazy");
      element.setAttribute("decoding", element.getAttribute("decoding") || "async");
      if (!element.getAttribute("fetchpriority") && !element.getAttribute("fetchPriority")) {
        element.setAttribute("fetchpriority", "low");
      }

      if (!isCriticalMedia(element) && !element.complete) {
        var src = element.getAttribute("src");
        var srcset = element.getAttribute("srcset");
        var sizes = element.getAttribute("sizes");
        if (src && !element.getAttribute("data-goi-opt-src")) {
          element.setAttribute("data-goi-opt-src", src);
          element.setAttribute("src", transparentPixel);
        }
        if (srcset && !element.getAttribute("data-goi-opt-srcset")) {
          element.setAttribute("data-goi-opt-srcset", srcset);
          element.removeAttribute("srcset");
        }
        if (sizes && !element.getAttribute("data-goi-opt-sizes")) {
          element.setAttribute("data-goi-opt-sizes", sizes);
          element.removeAttribute("sizes");
        }
      }
    }

    if (tag === "IFRAME") {
      element.setAttribute("loading", element.getAttribute("loading") || "lazy");
      if (!isCriticalMedia(element)) {
        var iframeSrc = element.getAttribute("src");
        if (iframeSrc && iframeSrc !== "about:blank" && !element.getAttribute("data-goi-opt-src")) {
          element.setAttribute("data-goi-opt-src", iframeSrc);
          element.setAttribute("src", "about:blank");
        }
      }
    }

    if (isNearViewport(element, 360)) {
      restoreMedia(element);
    } else if (mediaObserver) {
      mediaObserver.observe(element);
    }
  }

  function scanMedia(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = [];
    if (scope.matches && (scope.matches("img") || scope.matches("iframe"))) nodes.push(scope);
    nodes = nodes.concat(Array.prototype.slice.call(scope.querySelectorAll ? scope.querySelectorAll("img,iframe") : []));
    for (var i = 0; i < nodes.length; i += 1) prepareMedia(nodes[i]);
  }

  function initLazyMedia() {
    if ("IntersectionObserver" in global) {
      mediaObserver = new IntersectionObserver(function handleEntries(entries) {
        for (var i = 0; i < entries.length; i += 1) {
          if (!entries[i].isIntersecting) continue;
          restoreMedia(entries[i].target);
          mediaObserver.unobserve(entries[i].target);
        }
      }, { rootMargin: CONFIG.lazyRootMargin, threshold: 0.01 });
    }

    scanMedia(document);

    if ("MutationObserver" in global) {
      var mutationObserver = new MutationObserver(debounce(function handleMutations(mutations) {
        for (var i = 0; i < mutations.length; i += 1) {
          var added = mutations[i].addedNodes || [];
          for (var j = 0; j < added.length; j += 1) {
            if (added[j] && added[j].nodeType === 1) scanMedia(added[j]);
          }
        }
      }, 120));
      mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function normalizeOptions(type, options) {
    var normalized = options;
    var shouldBePassive = type === "scroll" || type === "mousemove" || type === "pointermove" || type === "touchmove" || type === "wheel";
    if (!shouldBePassive) return options;
    if (options === undefined || options === false) return { passive: true, capture: Boolean(options) };
    if (options === true) return { passive: true, capture: true };
    if (typeof options === "object" && options.passive === undefined) {
      normalized = Object.assign({}, options, { passive: true });
    }
    return normalized;
  }

  function getCapture(options) {
    return typeof options === "boolean" ? options : Boolean(options && options.capture);
  }

  function getListenerBucket(target, type, capture) {
    var byType = listenerStore.get(target);
    if (!byType) {
      byType = new Map();
      listenerStore.set(target, byType);
    }
    var key = type + ":" + (capture ? "1" : "0");
    var bucket = byType.get(key);
    if (!bucket) {
      bucket = new WeakMap();
      byType.set(key, bucket);
    }
    return bucket;
  }

  function incrementListenerCount(target, type) {
    var byType = listenerCounts.get(target);
    if (!byType) {
      byType = {};
      listenerCounts.set(target, byType);
    }
    byType[type] = (byType[type] || 0) + 1;
    return byType[type];
  }

  function decrementListenerCount(target, type) {
    var byType = listenerCounts.get(target);
    if (byType && byType[type]) byType[type] -= 1;
  }

  function patchEventListeners() {
    if (!nativeAddEventListener || !nativeRemoveEventListener || global.__GOINDIARIDE_LISTENER_PATCHED__) return;
    global.__GOINDIARIDE_LISTENER_PATCHED__ = true;

    global.EventTarget.prototype.addEventListener = function optimizedAddEventListener(type, listener, options) {
      if (typeof listener !== "function" || heavyEvents.indexOf(type) === -1 || listener.__goiNoOptimize) {
        return nativeAddEventListener.call(this, type, listener, normalizeOptions(type, options));
      }

      var capture = getCapture(options);
      var bucket = getListenerBucket(this, type, capture);
      var existing = bucket.get(listener);
      if (existing) return undefined;

      var wait = CONFIG.eventIntervals[type] || 100;
      var wrapped = type === "resize" ? debounce(listener, wait) : throttle(listener, wait);
      wrapped.__goiOptimizedListener = true;
      bucket.set(listener, wrapped);

      var count = incrementListenerCount(this, type);
      if (count > CONFIG.maxListenerCountPerTarget) {
        enterEmergencyMode("listener_pressure:" + type);
        return undefined;
      }

      return nativeAddEventListener.call(this, type, wrapped, normalizeOptions(type, options));
    };

    global.EventTarget.prototype.removeEventListener = function optimizedRemoveEventListener(type, listener, options) {
      if (typeof listener === "function" && heavyEvents.indexOf(type) !== -1) {
        var bucket = getListenerBucket(this, type, getCapture(options));
        var wrapped = bucket.get(listener);
        if (wrapped) {
          bucket.delete(listener);
          decrementListenerCount(this, type);
          return nativeRemoveEventListener.call(this, type, wrapped, options);
        }
      }
      return nativeRemoveEventListener.call(this, type, listener, options);
    };
  }

  function patchTimers() {
    if (global.__GOINDIARIDE_TIMER_PATCHED__) return;
    global.__GOINDIARIDE_TIMER_PATCHED__ = true;

    global.setInterval = function optimizedSetInterval(callback, delay) {
      var safeDelay = Math.max(Number(delay) || 0, CONFIG.intervalMinDelay);
      var id = 0;
      var stat = { calls: 0, windowStart: now(), longTasks: 0, cancelled: false };

      function guardedInterval() {
        if (stat.cancelled) return;
        var current = now();
        if (current - stat.windowStart >= 60000) {
          stat.calls = 0;
          stat.windowStart = current;
          stat.longTasks = Math.max(0, stat.longTasks - 1);
        }
        stat.calls += 1;
        if (stat.calls > CONFIG.intervalMaxCallsPerMinute || isEmergencyMode()) {
          stat.cancelled = true;
          nativeClearInterval(id);
          intervalStats.delete(id);
          enterEmergencyMode("interval_storm");
          return;
        }
        var started = now();
        try {
          if (typeof callback === "function") callback.apply(this, arguments);
          else (0, eval)(String(callback));
        } finally {
          if (now() - started > CONFIG.intervalLongTaskMs) stat.longTasks += 1;
          if (stat.longTasks >= CONFIG.intervalLongTaskStrikes) {
            stat.cancelled = true;
            nativeClearInterval(id);
            intervalStats.delete(id);
            enterEmergencyMode("long_interval_task");
          }
        }
      }

      id = nativeSetInterval(guardedInterval, safeDelay);
      intervalStats.set(id, stat);
      return id;
    };

    global.clearInterval = function optimizedClearInterval(id) {
      var stat = intervalStats.get(id);
      if (stat) stat.cancelled = true;
      intervalStats.delete(id);
      return nativeClearInterval(id);
    };

    if (nativeRequestAnimationFrame) {
      global.requestAnimationFrame = function optimizedRequestAnimationFrame(callback) {
        if (typeof callback !== "function") return nativeRequestAnimationFrame.call(global, callback);
        var stat = rafStats.get(callback);
        if (!stat) {
          stat = { longTasks: 0 };
          rafStats.set(callback, stat);
        }
        return nativeRequestAnimationFrame.call(global, function guardedRaf(timestamp) {
          if (stat.longTasks >= CONFIG.rafLongTaskStrikes || isEmergencyMode()) return;
          var started = now();
          callback(timestamp);
          if (now() - started > CONFIG.rafLongTaskMs) stat.longTasks += 1;
          else stat.longTasks = Math.max(0, stat.longTasks - 1);
          if (stat.longTasks >= CONFIG.rafLongTaskStrikes) enterEmergencyMode("raf_long_task_loop");
        });
      };
    }
  }

  function initLongTaskObserver() {
    if (!("PerformanceObserver" in global)) return;
    try {
      var longTasks = [];
      var observer = new PerformanceObserver(function observeLongTasks(list) {
        var entries = list.getEntries();
        var current = now();
        for (var i = 0; i < entries.length; i += 1) {
          if (entries[i].duration >= 80) longTasks.push(current);
        }
        longTasks = longTasks.filter(function keepRecent(time) { return current - time < 10000; });
        if (longTasks.length >= 8) enterEmergencyMode("long_task_pressure");
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch (_error) {}
  }

  function initHealthWatchers() {
    nativeSetInterval(function eventLoopWatchdog() {
      var current = now();
      var lag = current - lastLoopTick - 2000;
      lastLoopTick = current;
      if (lag > CONFIG.eventLoopLagMs) enterEmergencyMode("event_loop_lag");
    }, 2000);

    var lastHeap = 0;
    nativeSetInterval(function memoryWatchdog() {
      var nodeCount = document.getElementsByTagName("*").length;
      if (nodeCount > CONFIG.domNodeWarningCount) enterEmergencyMode("dom_growth");

      var memory = global.performance && global.performance.memory;
      if (!memory || !memory.usedJSHeapSize) return;
      var heap = memory.usedJSHeapSize;
      if (lastHeap && heap > lastHeap * CONFIG.memoryGrowthRatio) {
        enterEmergencyMode("heap_growth");
        try {
          global.dispatchEvent(new CustomEvent("goindiaride:optimization-memory-pressure", {
            detail: { usedJSHeapSize: heap, previousJSHeapSize: lastHeap, domNodes: nodeCount }
          }));
        } catch (_error) {}
      }
      lastHeap = heap;
    }, CONFIG.memoryCheckMs);
  }

  function isCacheableRequest(input, init) {
    try {
      var request = input instanceof Request ? input : new Request(input, init);
      if (request.method && request.method !== "GET") return false;
      var url = new URL(request.url, global.location.href);
      if (url.origin !== global.location.origin) return false;
      return staticAssetPattern.test(url.pathname + url.search);
    } catch (_error) {
      return false;
    }
  }

  function patchFetchCache() {
    if (!nativeFetch || !("caches" in global) || global.__GOINDIARIDE_FETCH_CACHE_PATCHED__) return;
    global.__GOINDIARIDE_FETCH_CACHE_PATCHED__ = true;

    global.fetch = function optimizedFetch(input, init) {
      if (!isCacheableRequest(input, init)) return nativeFetch.apply(this, arguments);
      var request = input instanceof Request ? input : new Request(input, init);

      return caches.open(CONFIG.staticCacheName).then(function withCache(cache) {
        return cache.match(request).then(function fromCache(cached) {
          if (cached) return cached;
          return nativeFetch(request).then(function fromNetwork(response) {
            if (response && response.ok) cache.put(request, response.clone()).catch(function noop() {});
            return response;
          });
        });
      }).catch(function cacheFailure() {
        return nativeFetch(request);
      });
    };
  }

  function collectStaticAssets() {
    var urls = [];
    function add(value) {
      if (!value) return;
      try {
        var url = new URL(value, global.location.href);
        if (url.origin === global.location.origin && staticAssetPattern.test(url.pathname + url.search)) {
          var normalized = url.href;
          if (urls.indexOf(normalized) === -1) urls.push(normalized);
        }
      } catch (_error) {}
    }

    Array.prototype.forEach.call(document.querySelectorAll("script[src],link[rel='stylesheet'][href],img[src],source[srcset]"), function collect(node) {
      add(node.getAttribute("src") || node.getAttribute("href"));
      var srcset = node.getAttribute("srcset");
      if (srcset) {
        srcset.split(",").forEach(function collectSrcset(part) {
          add(part.trim().split(/\s+/)[0]);
        });
      }
    });
    return urls.slice(0, CONFIG.maxPrecacheAssets);
  }

  function precacheStaticAssets() {
    if (!("caches" in global)) return;
    onIdle(function cacheAssets() {
      var assets = collectStaticAssets();
      if (!assets.length) return;
      caches.open(CONFIG.staticCacheName).then(function opened(cache) {
        assets.forEach(function cacheOne(url) {
          cache.add(url).catch(function noop() {});
        });
      }).catch(function noop() {});
    }, 4000);
  }

  function init() {
    patchEventListeners();
    patchTimers();
    patchFetchCache();
    initLongTaskObserver();
    initHealthWatchers();
    initLazyMedia();
    precacheStaticAssets();
  }

  global.GoIndiaRideOptimization = {
    version: VERSION,
    throttle: throttle,
    debounce: debounce,
    scanMedia: scanMedia,
    enterEmergencyMode: enterEmergencyMode
  };

  function scheduleInit() {
    nativeSetTimeout(init, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInit, { once: true });
  } else {
    scheduleInit();
  }
})(window, document);
