(function initGoIndiaRidePerformanceBoost(global) {
    "use strict";

    const DEFER_SELECTOR = "script[data-goi-defer-src]";
    const LOADED_ATTR = "data-goi-loaded";
    const LOAD_DELAY_MS = 45000;
    const IDLE_TIMEOUT_MS = 60000;
    const PRELOAD_DELAY_MS = 30000;
    const SCRIPT_GAP_MS = 1800;
    let deferredRuntimeStarted = false;

    function readAutoLoadPreference() {
        try {
            const query = new URLSearchParams(global.location.search || "");
            if (query.get("goiFutureRuntime") === "1") return true;
            if (query.get("goiFutureRuntime") === "0") return false;
            if (global.__GOINDIARIDE_AUTO_LOAD_FUTURE_RUNTIME__ === true) return true;
            return global.localStorage && global.localStorage.getItem("goindiaride_enable_future_runtime") === "true";
        } catch (_error) {
            return false;
        }
    }

    function waitForIdle(timeoutMs) {
        return new Promise((resolve) => {
            if (typeof global.requestIdleCallback === "function") {
                global.requestIdleCallback(resolve, { timeout: timeoutMs });
                return;
            }
            setTimeout(resolve, Math.min(timeoutMs, 2500));
        });
    }

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
            await waitForIdle(IDLE_TIMEOUT_MS);
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

    function startDeferredRuntimeNow() {
        if (deferredRuntimeStarted) return;
        deferredRuntimeStarted = true;
        loadDeferredRuntimeScripts();
    }

    function scheduleDeferredRuntime() {
        if (!readAutoLoadPreference()) return;
        setTimeout(warmDeferredRuntimeCache, PRELOAD_DELAY_MS);
        if (typeof global.requestIdleCallback === "function") {
            global.requestIdleCallback(startDeferredRuntime, { timeout: IDLE_TIMEOUT_MS });
            return;
        }

        startDeferredRuntime();
    }

    function bindManualLoad() {
        global.addEventListener("goindiaride:load-deferred-features", startDeferredRuntimeNow);
    }

    global.__GOINDIARIDE_FAST_BOOT__ = true;
    global.GoIndiaRideLoadDeferredFeatures = startDeferredRuntimeNow;
    bindManualLoad();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scheduleDeferredRuntime, { once: true });
    } else {
        scheduleDeferredRuntime();
    }
})(window);
