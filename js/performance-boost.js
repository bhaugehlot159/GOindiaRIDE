(function initGoIndiaRidePerformanceBoost(global) {
    "use strict";

    const DEFER_SELECTOR = "script[data-goi-defer-src]";
    const LOADED_ATTR = "data-goi-loaded";
    const LOAD_DELAY_MS = 600;
    const IDLE_TIMEOUT_MS = 3500;
    const PRELOAD_DELAY_MS = 900;
    const SCRIPT_GAP_MS = 120;
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
            await new Promise((resolve) => setTimeout(resolve, SCRIPT_GAP_MS));
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
        setTimeout(warmDeferredRuntimeCache, PRELOAD_DELAY_MS);
        if (typeof global.requestIdleCallback === "function") {
            global.requestIdleCallback(startDeferredRuntime, { timeout: IDLE_TIMEOUT_MS });
            return;
        }

        startDeferredRuntime();
    }

    function bindEarlyInteractionLoad() {
        const events = ["pointerdown", "keydown"];
        const loadNow = () => {
            events.forEach((eventName) => global.removeEventListener(eventName, loadNow));
            setTimeout(startDeferredRuntime, LOAD_DELAY_MS);
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
