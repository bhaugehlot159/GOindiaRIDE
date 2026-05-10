(function initGoIndiaRidePerformanceBoost(global) {
    "use strict";

    const DEFER_SELECTOR = "script[data-goi-defer-src]";
    const LOADED_ATTR = "data-goi-loaded";
    const LOAD_DELAY_MS = 900;

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

    async function loadDeferredRuntimeScripts() {
        const placeholders = Array.from(document.querySelectorAll(DEFER_SELECTOR));
        for (const placeholder of placeholders) {
            await loadScriptTag(placeholder);
        }
        global.dispatchEvent(new CustomEvent("goindiaride:deferred-runtime-loaded", {
            detail: { count: placeholders.length }
        }));
    }

    function scheduleDeferredRuntime() {
        const run = () => {
            setTimeout(loadDeferredRuntimeScripts, LOAD_DELAY_MS);
        };

        if (typeof global.requestIdleCallback === "function") {
            global.requestIdleCallback(run, { timeout: 2500 });
            return;
        }

        run();
    }

    global.__GOINDIARIDE_FAST_BOOT__ = true;

    if (document.readyState === "complete") {
        scheduleDeferredRuntime();
    } else {
        global.addEventListener("load", scheduleDeferredRuntime, { once: true });
    }
})(window);
