(function initGoIndiaRidePerformanceBoost(global) {
    "use strict";

    const DEFER_SELECTOR = "script[data-goi-defer-src]";
    const LOADED_ATTR = "data-goi-loaded";
    const LOAD_DELAY_MS = 60;
    const IDLE_TIMEOUT_MS = 700;
    let deferredRuntimeStarted = false;

    function loadScriptTag(placeholder) {
        return new Promise((resolve) => {
            const src = placeholder.getAttribute("data-goi-defer-src");
            if (!src || placeholder.getAttribute(LOADED_ATTR) === "true") {
                resolve();
                return;
            }

            placeholder.setAttribute(LOADED_ATTR, "true");
            const script = document.createElement("script");
            script.src = src;
            script.async = false;
            script.dataset.goiDeferredRuntime = "true";

            Array.from(placeholder.attributes).forEach((attr) => {
                if (attr.name === "data-goi-defer-src" || attr.name === LOADED_ATTR) return;
                if (attr.name === "src" || attr.name === "type") return;
                script.setAttribute(attr.name, attr.value);
            });

            script.onload = () => resolve();
            script.onerror = () => resolve();
            placeholder.parentNode.insertBefore(script, placeholder.nextSibling);
        });
    }

    function warmDeferredRuntimeCache() {
        const seen = new Set();
        Array.from(document.querySelectorAll(DEFER_SELECTOR)).forEach((placeholder) => {
            const src = placeholder.getAttribute("data-goi-defer-src");
            if (!src || seen.has(src)) return;
            seen.add(src);

            const link = document.createElement("link");
            link.rel = "preload";
            link.as = "script";
            link.href = src;
            link.fetchPriority = "low";
            document.head.appendChild(link);
        });
    }

    async function loadDeferredRuntimeScripts() {
        const placeholders = Array.from(document.querySelectorAll(DEFER_SELECTOR));
        for (const placeholder of placeholders) {
            await loadScriptTag(placeholder);
        }
        global.dispatchEvent(new CustomEvent("goindiaride:deferred-runtime-loaded", {
            detail: { count: placeholders.length }
        }));
    }

    function startDeferredRuntime() {
        if (deferredRuntimeStarted) return;
        deferredRuntimeStarted = true;
        setTimeout(loadDeferredRuntimeScripts, LOAD_DELAY_MS);
    }

    function scheduleDeferredRuntime() {
        warmDeferredRuntimeCache();
        if (typeof global.requestIdleCallback === "function") {
            global.requestIdleCallback(startDeferredRuntime, { timeout: IDLE_TIMEOUT_MS });
            return;
        }

        startDeferredRuntime();
    }

    function bindEarlyInteractionLoad() {
        const events = ["pointerdown", "keydown", "touchstart", "scroll"];
        const loadNow = () => {
            events.forEach((eventName) => global.removeEventListener(eventName, loadNow));
            startDeferredRuntime();
        };
        events.forEach((eventName) => global.addEventListener(eventName, loadNow, { once: true, passive: true }));
    }

    global.__GOINDIARIDE_FAST_BOOT__ = true;
    global.GoIndiaRideLoadDeferredFeatures = startDeferredRuntime;
    bindEarlyInteractionLoad();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scheduleDeferredRuntime, { once: true });
    } else {
        scheduleDeferredRuntime();
    }
})(window);
