(function initGoIndiaAIAutoCore(global) {
    "use strict";

    if (!global || global.GoIndiaAIAutoCore) {
        return;
    }

    const INCIDENT_KEYS = [
        "goindia_ai_security_incidents_v1",
        "goindia_security_incidents",
    ];

    const BOOKING_KEYS = ["bookings", "goride_bookings"];
    const DRIVER_KEYS = ["drivers", "goride_drivers"];
    const USER_KEYS = ["users", "goride_users"];

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) {
                return fallback;
            }
            const parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function readFirstArray(keys) {
        for (const key of keys) {
            const data = readJson(key, []);
            if (Array.isArray(data) && data.length) {
                return data;
            }
        }

        return [];
    }

    function readAllIncidents() {
        for (const key of INCIDENT_KEYS) {
            const data = readJson(key, []);
            if (Array.isArray(data) && data.length) {
                return data;
            }
        }

        return [];
    }

    function severityWeight(level) {
        const normalized = String(level || "").toLowerCase();
        if (normalized === "critical") return 20;
        if (normalized === "high") return 14;
        if (normalized === "medium") return 8;
        return 3;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function statusFromScore(score) {
        if (score >= 75) return "critical";
        if (score >= 45) return "elevated";
        return "healthy";
    }

    function getAuthenticitySnapshot(mode) {
        const normalizedMode = String(mode || "public").toLowerCase();

        if (global.GoIndiaAuthenticityEngine && typeof global.GoIndiaAuthenticityEngine.assessSession === "function") {
            try {
                const snapshot = global.GoIndiaAuthenticityEngine.assessSession(normalizedMode);
                if (snapshot && typeof snapshot === "object") {
                    return snapshot;
                }
            } catch (error) {
                // ignore
            }
        }

        let rawState = null;
        try {
            rawState = JSON.parse(localStorage.getItem("goindia_ai_auth_state_v1") || "{}");
        } catch (error) {
            rawState = {};
        }

        const modeState = (rawState && rawState[normalizedMode]) || {};
        const score = Number(modeState.score);
        const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 62;

        let label = "review";
        if (safeScore >= 70) label = "real";
        else if (safeScore < 45) label = "fake_suspected";

        return {
            mode: normalizedMode,
            score: safeScore,
            label,
            status: label === "real" ? "healthy" : label === "review" ? "elevated" : "critical",
            isTrusted: label === "real",
            updatedAt: modeState.updatedAt || new Date().toISOString(),
            metrics: modeState.metrics || {},
            flags: modeState.flags || [],
        };
    }

    function getRecentIncidents(mode, hours) {
        const windowMs = Math.max(1, Number(hours || 24)) * 60 * 60 * 1000;
        const now = Date.now();

        return readAllIncidents().filter((incident) => {
            const ts = Date.parse(incident.at || incident.createdAt || "");
            if (Number.isNaN(ts) || now - ts > windowMs) {
                return false;
            }

            if (!mode) {
                return true;
            }

            const page = String(incident.page || "").toLowerCase();
            const type = String(incident.type || "").toLowerCase();
            return page.includes(mode) || type.includes(mode) || page === "";
        });
    }

    function countIf(items, predicate) {
        let total = 0;
        for (const item of items) {
            if (predicate(item)) {
                total += 1;
            }
        }
        return total;
    }

    function evaluateMode(mode) {
        const normalizedMode = String(mode || "customer").toLowerCase();
        const incidents = getRecentIncidents(normalizedMode, 24);
        const authenticity = getAuthenticitySnapshot(normalizedMode);
        const allBookings = readFirstArray(BOOKING_KEYS);
        const allDrivers = readFirstArray(DRIVER_KEYS);
        const allUsers = readFirstArray(USER_KEYS);

        const pendingBookings = countIf(
            allBookings,
            (b) => ["pending", "confirmed", "driver_assigned", "ride_started", "in_progress", "ongoing"].includes(String(b.status || "").toLowerCase())
        );
        const completedBookings = countIf(allBookings, (b) => String(b.status || "").toLowerCase() === "completed");
        const cancelledBookings = countIf(allBookings, (b) => String(b.status || "").toLowerCase() === "cancelled");

        const now = new Date();
        const expiredLicenses = countIf(allDrivers, (driver) => {
            const expiry = Date.parse(driver.drivingLicenseExpiry || driver.licenseExpiry || "");
            return !Number.isNaN(expiry) && expiry < now.getTime();
        });
        const unverifiedLicenses = countIf(allDrivers, (driver) => {
            if (driver.licenseVerified === true) {
                return false;
            }
            return Boolean(driver.drivingLicenseNumber || driver.licenseNumber);
        });

        const activeDrivers = countIf(
            allDrivers,
            (driver) => Boolean(driver.isOnline) || String(driver.status || "").toLowerCase() === "available"
        );

        const baseRisk = incidents.slice(0, 16).reduce((sum, incident) => sum + severityWeight(incident.level), 0);

        let risk = baseRisk;

        if (authenticity.label === "fake_suspected") {
            risk += 28;
        } else if (authenticity.label === "review") {
            risk += 10;
        } else {
            risk = Math.max(0, risk - 6);
        }

        if (normalizedMode === "customer") {
            const totalResolved = completedBookings + cancelledBookings;
            const cancelRatio = totalResolved > 0 ? cancelledBookings / totalResolved : 0;
            if (cancelRatio >= 0.35 && totalResolved >= 4) {
                risk += 12;
            }
            if (pendingBookings >= 6) {
                risk += 8;
            }
        }

        if (normalizedMode === "driver") {
            if (expiredLicenses > 0) {
                risk += 18;
            }
            if (unverifiedLicenses >= 2) {
                risk += 10;
            }
            if (pendingBookings >= 8) {
                risk += 8;
            }
        }

        if (normalizedMode === "admin") {
            const criticalCount = countIf(incidents, (incident) => String(incident.level || "").toLowerCase() === "critical");
            if (criticalCount >= 2) {
                risk += 18;
            }
            if (cancelledBookings >= 10) {
                risk += 12;
            }
            if (activeDrivers < Math.max(2, Math.floor(allDrivers.length * 0.25)) && allDrivers.length >= 4) {
                risk += 10;
            }
        }

        const score = clamp(Math.round(risk), 0, 100);
        const status = statusFromScore(score);

        return {
            mode: normalizedMode,
            score,
            status,
            incidents24h: incidents.length,
            criticalIncidents: countIf(incidents, (incident) => String(incident.level || "").toLowerCase() === "critical"),
            pendingBookings,
            completedBookings,
            cancelledBookings,
            totalBookings: allBookings.length,
            activeDrivers,
            totalDrivers: allDrivers.length,
            totalUsers: allUsers.length,
            expiredLicenses,
            unverifiedLicenses,
            authenticityScore: authenticity.score,
            authenticityLabel: authenticity.label,
            authenticityStatus: authenticity.status,
            authenticityTrusted: Boolean(authenticity.isTrusted),
            authenticityFlags: Array.isArray(authenticity.flags) ? authenticity.flags.slice(0, 5) : [],
            refreshedAt: new Date().toISOString(),
        };
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function ensureStyles() {
        if (document.getElementById("goindia-ai-mode-style")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "goindia-ai-mode-style";
        style.textContent = `
            .goi-ai-mode-panel {
                margin: 1rem 0;
                border: 1px solid rgba(11, 31, 58, 0.16);
                border-radius: 14px;
                background: linear-gradient(110deg, rgba(255,153,51,0.14) 0%, rgba(255,255,255,0.94) 46%, rgba(19,136,8,0.16) 100%);
                box-shadow: 0 10px 22px rgba(15, 23, 42, 0.09);
                padding: 1rem;
            }

            .goi-ai-mode-head {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 0.65rem;
                margin-bottom: 0.75rem;
            }

            .goi-ai-mode-title {
                margin: 0;
                font-size: 1.05rem;
                color: #0b1f3a;
                font-weight: 800;
            }

            .goi-ai-mode-score {
                font-size: 0.8rem;
                padding: 0.3rem 0.6rem;
                border-radius: 999px;
                border: 1px solid transparent;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                font-weight: 700;
            }

            .goi-ai-mode-score.healthy {
                color: #0f766e;
                background: #ccfbf1;
                border-color: #99f6e4;
            }

            .goi-ai-mode-score.elevated {
                color: #b45309;
                background: #fef3c7;
                border-color: #fde68a;
            }

            .goi-ai-mode-score.critical {
                color: #b91c1c;
                background: #fee2e2;
                border-color: #fecaca;
            }

            .goi-ai-mode-metrics {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 0.6rem;
                margin-bottom: 0.8rem;
            }

            .goi-ai-mode-metric {
                border-radius: 10px;
                border: 1px solid rgba(11,31,58,0.12);
                background: rgba(255,255,255,0.86);
                padding: 0.55rem 0.65rem;
            }

            .goi-ai-mode-metric strong {
                display: block;
                color: #0b1f3a;
                font-size: 1rem;
                line-height: 1.1;
            }

            .goi-ai-mode-metric span {
                color: rgba(11,31,58,0.68);
                font-size: 0.72rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .goi-ai-mode-modules {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                gap: 0.7rem;
            }

            .goi-ai-module {
                border: 1px solid rgba(11,31,58,0.14);
                border-radius: 12px;
                background: rgba(255,255,255,0.9);
                padding: 0.7rem;
            }

            .goi-ai-module-top {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 0.45rem;
            }

            .goi-ai-module-name {
                color: #0b1f3a;
                font-size: 0.88rem;
                font-weight: 700;
            }

            .goi-ai-module-state {
                font-size: 0.66rem;
                font-weight: 700;
                text-transform: uppercase;
                border-radius: 999px;
                padding: 0.2rem 0.45rem;
            }

            .goi-ai-module-state.healthy {
                background: #dcfce7;
                color: #166534;
            }

            .goi-ai-module-state.elevated {
                background: #fef3c7;
                color: #b45309;
            }

            .goi-ai-module-state.critical {
                background: #fee2e2;
                color: #b91c1c;
            }

            .goi-ai-module-desc {
                margin-top: 0.4rem;
                color: rgba(11,31,58,0.78);
                font-size: 0.78rem;
                line-height: 1.35;
            }

            .goi-ai-module-action {
                margin-top: 0.45rem;
                color: #0f766e;
                font-size: 0.75rem;
                font-weight: 600;
            }

            .goi-ai-mode-meta {
                margin-top: 0.75rem;
                font-size: 0.72rem;
                color: rgba(11,31,58,0.62);
                text-align: right;
            }
        `;

        document.head.appendChild(style);
    }

    function defaultModules(mode, summary) {
        if (mode === "driver") {
            return [
                {
                    title: "Trip Match AI",
                    status: summary.pendingBookings > 7 ? "elevated" : "healthy",
                    detail: "Auto assigns balanced requests by distance, rating, and live trust signals.",
                    action: summary.pendingBookings > 7 ? "Action: Priority balancing enabled" : "Action: Queue optimized",
                },
                {
                    title: "Document Guardian",
                    status: summary.expiredLicenses > 0 ? "critical" : summary.unverifiedLicenses > 0 ? "elevated" : "healthy",
                    detail: "Watches license validity and verification state for all active drivers.",
                    action: summary.expiredLicenses > 0 ? "Action: Expired license lock queued" : "Action: Compliance synced",
                },
                {
                    title: "Earnings Auto Coach",
                    status: summary.status,
                    detail: "Generates shift-time suggestions and auto warns on low-yield ride bands.",
                    action: "Action: Shift recommendation updated",
                },
                {
                    title: "Fake vs Real Detector",
                    status: summary.authenticityStatus || "elevated",
                    detail: "Driver session authenticity AI checks behavior and form-bot signals.",
                    action:                         "Action: " + String(summary.authenticityLabel || "review").replace(/_/g, " ") + " gate",
                },
            ];
        }

        if (mode === "admin") {
            return [
                {
                    title: "Fraud Command AI",
                    status: summary.criticalIncidents >= 2 ? "critical" : summary.status,
                    detail: "Combines anomaly bursts, cancel abuse, and device misuse into one command stream.",
                    action: summary.criticalIncidents >= 2 ? "Action: Auto-ban workflow armed" : "Action: Threat watch stable",
                },
                {
                    title: "Policy Auto Enforcer",
                    status: summary.cancelledBookings >= 10 ? "elevated" : "healthy",
                    detail: "Automatically tightens rate limits and booking restrictions on suspicious clusters.",
                    action: "Action: Policy profile applied",
                },
                {
                    title: "Compliance Radar",
                    status: summary.expiredLicenses > 0 ? "elevated" : "healthy",
                    detail: "Checks driver document and portal security posture from one control layer.",
                    action: "Action: Compliance digest generated",
                },
                {
                    title: "Fake vs Real Detector",
                    status: summary.authenticityStatus || "elevated",
                    detail: "Admin session authenticity guard highlights potentially fake or scripted access.",
                    action:                         "Action: " + String(summary.authenticityLabel || "review").replace(/_/g, " ") + " inspection",
                },
            ];
        }

        return [
            {
                title: "Smart Pickup AI",
                status: summary.pendingBookings > 5 ? "elevated" : "healthy",
                detail: "Predicts faster pickup lanes using live city load and trusted-driver pool.",
                action: "Action: Pickup lanes refreshed",
            },
            {
                title: "Fare Integrity AI",
                status: summary.status,
                detail: "Runs fare hash and route checks before booking finalization.",
                action: "Action: Fare guard active",
            },
            {
                title: "Safety Auto Router",
                status: summary.criticalIncidents > 0 ? "elevated" : "healthy",
                detail: "Routes SOS and anomaly alerts to nearest verified response chain.",
                action: "Action: Emergency graph synced",
            },
            {
                title: "Fake vs Real Detector",
                status: summary.authenticityStatus || "elevated",
                detail: "Customer session authenticity AI checks fake signup/login and scripted actions.",
                action:                     "Action: " + String(summary.authenticityLabel || "review").replace(/_/g, " ") + " verification",
            },
        ];
    }

    function resolveContainer(selectors) {
        if (!selectors) {
            return document.body;
        }

        if (Array.isArray(selectors)) {
            for (const selector of selectors) {
                const node = document.querySelector(selector);
                if (node) {
                    return node;
                }
            }
            return null;
        }

        return document.querySelector(selectors);
    }

    function buildPanelHtml(config, summary, modules) {
        const metrics = [
            { label: "Risk score", value: summary.score },
            { label: "Incidents (24h)", value: summary.incidents24h },
            { label: "Pending rides", value: summary.pendingBookings },
            { label: "Critical", value: summary.criticalIncidents },
            { label: "Session authenticity", value: summary.authenticityScore || 0 },
        ];

        const metricHtml = metrics
            .map(
                (metric) =>
                    `<div class="goi-ai-mode-metric"><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.label)}</span></div>`
            )
            .join("");

        const moduleHtml = modules
            .map((module) => {
                const state = statusFromScore(module.score || 0) === "critical" ? "critical" : module.status || summary.status;
                return `
                    <article class="goi-ai-module">
                        <div class="goi-ai-module-top">
                            <div class="goi-ai-module-name">${escapeHtml(module.title)}</div>
                            <span class="goi-ai-module-state ${escapeHtml(state)}">${escapeHtml(state)}</span>
                        </div>
                        <div class="goi-ai-module-desc">${escapeHtml(module.detail)}</div>
                        <div class="goi-ai-module-action">${escapeHtml(module.action)}</div>
                    </article>
                `;
            })
            .join("");

        const refreshedLabel = new Date(summary.refreshedAt).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });

        return `
            <div class="goi-ai-mode-head">
                <h3 class="goi-ai-mode-title">${escapeHtml(config.title || "AI Auto System")}</h3>
                <span class="goi-ai-mode-score ${escapeHtml(summary.status)}">${escapeHtml(summary.status)} • ${escapeHtml(summary.score)}</span>
            </div>
            <div class="goi-ai-mode-metrics">${metricHtml}</div>
            <div class="goi-ai-mode-modules">${moduleHtml}</div>
            <div class="goi-ai-mode-meta">Auto generated update: ${escapeHtml(refreshedLabel)}</div>
        `;
    }

    function mount(config) {
        const safeConfig = config || {};
        const mode = String(safeConfig.mode || "customer").toLowerCase();
        const instanceKey = safeConfig.id || `mode:${mode}`;

        global.__goiAiAutoPanels = global.__goiAiAutoPanels || {};

        if (global.__goiAiAutoPanels[instanceKey] && document.body.contains(global.__goiAiAutoPanels[instanceKey].panel)) {
            return global.__goiAiAutoPanels[instanceKey];
        }

        const container = resolveContainer(safeConfig.selectors || safeConfig.selector);
        if (!container) {
            return null;
        }

        ensureStyles();

        const panel = document.createElement("section");
        panel.className = "goi-ai-mode-panel";
        panel.setAttribute("data-goi-ai-mode", mode);

        const position = safeConfig.insertPosition || "afterbegin";
        container.insertAdjacentElement(position, panel);

        const refresh = () => {
            const summary = evaluateMode(mode);
            const modules =
                typeof safeConfig.moduleFactory === "function"
                    ? safeConfig.moduleFactory(summary, statusFromScore)
                    : defaultModules(mode, summary);

            panel.innerHTML = buildPanelHtml(safeConfig, summary, modules);
            panel.dispatchEvent(
                new CustomEvent("goindia:ai-auto-refresh", {
                    detail: {
                        mode,
                        summary,
                        modules,
                    },
                })
            );
        };

        refresh();

        const intervalMs = Math.max(8000, Number(safeConfig.intervalMs || 15000));
        const timer = setInterval(refresh, intervalMs);

        const api = { panel, refresh, timer };
        global.__goiAiAutoPanels[instanceKey] = api;

        return api;
    }

    global.GoIndiaAIAutoCore = {
        mount,
        evaluateMode,
        getRecentIncidents,
        getAuthenticitySnapshot,
        statusFromScore,
    };
})(window);
