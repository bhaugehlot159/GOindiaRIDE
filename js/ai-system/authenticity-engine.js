(function initGoIndiaAuthenticityEngine(global) {
    "use strict";

    if (!global || global.GoIndiaAuthenticityEngine) {
        return;
    }

    const STATE_KEY = "goindia_ai_auth_state_v1";
    const EVENTS_KEY = "goindia_ai_auth_events_v1";
    const MAX_EVENTS = 240;

    const suspiciousPattern = /<\s*script|javascript:|onerror\s*=|onload\s*=|union\s+select|drop\s+table|\bor\b\s+1\s*=\s*1/i;

    let signalBootstrapped = false;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function safeParse(raw, fallback) {
        try {
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function readState() {
        const state = safeParse(localStorage.getItem(STATE_KEY), {});
        return typeof state === "object" && state ? state : {};
    }

    function saveState(state) {
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
        } catch (error) {
            // ignore
        }
    }

    function readEvents() {
        const events = safeParse(localStorage.getItem(EVENTS_KEY), []);
        return Array.isArray(events) ? events : [];
    }

    function saveEvents(events) {
        try {
            localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
        } catch (error) {
            // ignore
        }
    }

    function labelFromScore(score) {
        if (score >= 70) return "real";
        if (score >= 45) return "review";
        return "fake_suspected";
    }

    function statusFromLabel(label) {
        if (label === "real") return "healthy";
        if (label === "review") return "elevated";
        return "critical";
    }

    function createModeState(mode) {
        return {
            mode,
            score: 62,
            label: "review",
            status: "elevated",
            firstSeenAt: nowIso(),
            updatedAt: nowIso(),
            lastActionAt: null,
            flags: [],
            metrics: {
                mouseSignals: 0,
                keySignals: 0,
                scrollSignals: 0,
                suspiciousSignals: 0,
                rapidActions: 0,
                honeypotHits: 0,
            },
        };
    }

    function getModeState(mode) {
        const safeMode = String(mode || "public").toLowerCase();
        const state = readState();

        if (!state[safeMode]) {
            state[safeMode] = createModeState(safeMode);
            saveState(state);
        }

        return state[safeMode];
    }

    function setModeState(mode, nextModeState) {
        const safeMode = String(mode || "public").toLowerCase();
        const state = readState();
        state[safeMode] = nextModeState;
        saveState(state);
    }

    function pushEvent(mode, type, message, detail) {
        const events = readEvents();
        events.unshift({
            id: `AUTH-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
            mode: String(mode || "public").toLowerCase(),
            type,
            message,
            detail: detail || {},
            at: nowIso(),
            page: location.pathname,
        });
        saveEvents(events);
    }

    function dispatchUpdate(mode, snapshot) {
        global.dispatchEvent(
            new CustomEvent("goindia:authenticity-update", {
                detail: {
                    mode,
                    snapshot,
                },
            })
        );
    }

    function mutateScore(mode, delta, reason, type, detail) {
        const next = getModeState(mode);

        next.score = clamp(Math.round((next.score + Number(delta || 0)) * 100) / 100, 0, 100);
        next.label = labelFromScore(next.score);
        next.status = statusFromLabel(next.label);
        next.updatedAt = nowIso();

        if (reason && !next.flags.includes(reason)) {
            next.flags = [reason, ...next.flags].slice(0, 10);
        }

        setModeState(mode, next);

        if (reason || type) {
            pushEvent(mode, type || "signal", reason || "Score updated", detail || {});
        }

        const snapshot = assessSession(mode);
        dispatchUpdate(mode, snapshot);

        return snapshot;
    }

    function isSuspiciousPayload(payload) {
        if (!payload) return false;

        if (typeof payload === "string") {
            return suspiciousPattern.test(payload);
        }

        if (Array.isArray(payload)) {
            return payload.some((item) => isSuspiciousPayload(item));
        }

        if (typeof payload === "object") {
            return Object.values(payload).some((value) => isSuspiciousPayload(value));
        }

        return false;
    }

    function gatherSignals(mode) {
        const safeMode = String(mode || "public").toLowerCase();
        const state = getModeState(safeMode);

        // Browser automation hint
        if (navigator.webdriver) {
            state.metrics.suspiciousSignals += 1;
            state.flags = ["webdriver_detected", ...state.flags.filter((f) => f !== "webdriver_detected")].slice(0, 10);
            state.score = clamp(state.score - 28, 0, 100);
        }

        // Human activity bonus
        const humanSignals = state.metrics.mouseSignals + state.metrics.keySignals + state.metrics.scrollSignals;
        if (humanSignals >= 8) {
            state.score = clamp(state.score + 4, 0, 100);
        }

        state.label = labelFromScore(state.score);
        state.status = statusFromLabel(state.label);
        state.updatedAt = nowIso();

        setModeState(safeMode, state);

        return state;
    }

    function assessSession(mode) {
        const safeMode = String(mode || "public").toLowerCase();
        const state = gatherSignals(safeMode);

        return {
            mode: safeMode,
            score: Math.round(state.score),
            label: state.label,
            status: state.status,
            isTrusted: state.label === "real",
            updatedAt: state.updatedAt,
            metrics: state.metrics,
            flags: state.flags,
        };
    }

    function registerAction(mode, actionName, payload) {
        const safeMode = String(mode || "public").toLowerCase();
        const state = getModeState(safeMode);
        const now = Date.now();

        if (state.lastActionAt) {
            const gap = now - Number(state.lastActionAt || 0);
            if (gap < 700) {
                state.metrics.rapidActions += 1;
                setModeState(safeMode, state);
                mutateScore(safeMode, -8, "rapid_action_sequence", "rapid_action", { gapMs: gap, actionName });
            } else if (gap > 4000) {
                mutateScore(safeMode, 2, "steady_human_pace", "human_pace", { gapMs: gap, actionName });
            }
        }

        state.lastActionAt = now;
        setModeState(safeMode, state);

        if (payload && payload.honeypotValue) {
            state.metrics.honeypotHits += 1;
            setModeState(safeMode, state);
            mutateScore(safeMode, -40, "honeypot_triggered", "honeypot", { actionName });
        }

        if (payload && Number(payload.fillDurationMs || 0) > 0 && Number(payload.fillDurationMs) < 1300) {
            mutateScore(safeMode, -14, "too_fast_form_submit", "form_speed", {
                actionName,
                fillDurationMs: Number(payload.fillDurationMs),
            });
        }

        if (isSuspiciousPayload(payload)) {
            const latest = getModeState(safeMode);
            latest.metrics.suspiciousSignals += 1;
            setModeState(safeMode, latest);
            mutateScore(safeMode, -26, "suspicious_payload_detected", "payload", { actionName });
        }

        return assessSession(safeMode);
    }

    function createHoneypot(form, fieldName) {
        const name = String(fieldName || "goi_contact_website");
        let input = form.querySelector(`input[name="${name}"]`);
        if (input) {
            return input;
        }

        input = document.createElement("input");
        input.type = "text";
        input.name = name;
        input.autocomplete = "off";
        input.tabIndex = -1;
        input.setAttribute("aria-hidden", "true");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        input.style.opacity = "0";
        input.style.height = "0";
        input.style.width = "0";
        form.appendChild(input);
        return input;
    }

    function watchForm(form, config) {
        if (!form || form.dataset.aiAuthWatch === "1") {
            return null;
        }

        const safeConfig = config || {};
        const mode = String(safeConfig.mode || "public").toLowerCase();
        const minFillMs = Math.max(600, Number(safeConfig.minFillMs || 1600));
        const honeypotInput = createHoneypot(form, safeConfig.honeypotFieldName || `goi_hp_${mode}`);
        const startedAt = Date.now();

        form.dataset.aiAuthWatch = "1";

        form.addEventListener(
            "submit",
            () => {
                const fillDurationMs = Date.now() - startedAt;
                const honeypotValue = String(honeypotInput.value || "").trim();

                registerAction(mode, "form_submit", {
                    fillDurationMs,
                    honeypotValue,
                    tooFast: fillDurationMs < minFillMs,
                });
            },
            true
        );

        return {
            mode,
            honeypotFieldName: honeypotInput.name,
            startedAt,
        };
    }

    function bootstrapSignals() {
        if (signalBootstrapped) {
            return;
        }
        signalBootstrapped = true;

        const modes = ["public", "customer", "driver", "admin", "login", "signup", "booking"];

        const limitedSignal = (() => {
            let lastAt = 0;
            return (fn) => {
                const now = Date.now();
                if (now - lastAt < 700) return;
                lastAt = now;
                fn();
            };
        })();

        document.addEventListener("mousemove", () => {
            limitedSignal(() => {
                modes.forEach((mode) => {
                    const state = getModeState(mode);
                    state.metrics.mouseSignals += 1;
                    setModeState(mode, state);
                });
            });
        }, { passive: true });

        document.addEventListener("keydown", () => {
            limitedSignal(() => {
                modes.forEach((mode) => {
                    const state = getModeState(mode);
                    state.metrics.keySignals += 1;
                    setModeState(mode, state);
                });
            });
        });

        document.addEventListener("scroll", () => {
            limitedSignal(() => {
                modes.forEach((mode) => {
                    const state = getModeState(mode);
                    state.metrics.scrollSignals += 1;
                    setModeState(mode, state);
                });
            });
        }, { passive: true });
    }

    function getSnapshot(mode) {
        if (mode) return assessSession(mode);

        const state = readState();
        const all = {};
        Object.keys(state).forEach((key) => {
            all[key] = assessSession(key);
        });
        return all;
    }

    bootstrapSignals();

    global.GoIndiaAuthenticityEngine = {
        assessSession,
        registerAction,
        watchForm,
        getSnapshot,
        getEvents: readEvents,
        labelFromScore,
        statusFromLabel,
    };
})(window);
