(function initAdminOperationsCenterPhase5(global) {
    "use strict";

    const VERSION = "goindiaride_admin_operations_center_phase5_v1";
    const STORE_KEY = "goindiaride_admin_operations_center_phase5_snapshot";
    const BOOKING_KEYS = [
        "goindiaride_active_bookings",
        "goindiaride_admin_review_inbox_v1",
        "goindiaride_live_customer_booking_queue_v1",
        "bookings",
        "goride_bookings",
        "customer_bookings",
        "customerBookings"
    ];
    const DRIVER_LOCATION_KEYS = [
        "goindiaride_driver_live_locations_v1",
        "goindiaride_admin_live_tracking_cache_v1",
        "goindiaride_driver_locations",
        "driver_live_locations"
    ];
    const PHASE_HEALTH_ENDPOINTS = [
        ["fraud", "/health/fraud-detection"],
        ["gdpr", "/health/gdpr-compliance"],
        ["security", "/health/security-hardening"],
        ["push", "/health/push-notifications"]
    ];

    function cleanText(value, maxLength) {
        return String(value || "")
            .replace(/[<>]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, maxLength || 180);
    }

    function escapeHtml(value) {
        return cleanText(value, 500)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function parseJson(raw, fallback) {
        try {
            const parsed = JSON.parse(raw || "");
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (_error) {
            return fallback;
        }
    }

    function readArray(key) {
        const value = parseJson(global.localStorage && global.localStorage.getItem(key), []);
        return Array.isArray(value) ? value : [];
    }

    function writeSnapshot(snapshot) {
        try {
            global.localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
        } catch (_error) {
            // Snapshot persistence is best effort.
        }
    }

    function readSnapshot() {
        try {
            return parseJson(global.localStorage.getItem(STORE_KEY), null);
        } catch (_error) {
            return null;
        }
    }

    function normalizeApiBase(value) {
        const text = cleanText(value, 300).replace(/\/+$/, "");
        return /^https?:\/\//i.test(text) ? text : "";
    }

    function getApiBase() {
        const explicit = normalizeApiBase(
            global.GOINDIARIDE_API_BASE
            || global.__GOINDIARIDE_API_ORIGIN__
            || global.__GOINDIARIDE_RUNTIME_API_ORIGIN__
            || (global.localStorage && global.localStorage.getItem("goindiaride_admin_api_base"))
            || (global.localStorage && global.localStorage.getItem("goindiaride_api_base"))
            || ""
        );
        if (explicit) return explicit;

        const host = String(global.location && global.location.hostname || "").toLowerCase();
        if (host === "localhost" || host === "127.0.0.1") return "http://localhost:5000";
        if (host === "goindiaride.in" || host === "www.goindiaride.in" || host.endsWith("github.io")) {
            return "https://goindiaride.onrender.com";
        }
        return "";
    }

    function getAccessToken() {
        try {
            return cleanText(
                global.localStorage.getItem("accessToken")
                || global.localStorage.getItem("authToken")
                || global.localStorage.getItem("token")
                || "",
                5000
            );
        } catch (_error) {
            return "";
        }
    }

    function toAmount(value) {
        const amount = Number(value || 0);
        return Number.isFinite(amount) && amount > 0 ? amount : 0;
    }

    function formatNumber(value) {
        return new Intl.NumberFormat("en-IN").format(Number(value || 0));
    }

    function minutesSince(value) {
        const time = Date.parse(value || "");
        if (!Number.isFinite(time)) return 0;
        return Math.max(0, Math.round((Date.now() - time) / 60000));
    }

    function bookingId(row) {
        return cleanText(row.bookingId || row.id || row._id || "", 100);
    }

    function bookingStatus(row) {
        const review = cleanText(row.adminReviewStatus || "", 40).toLowerCase();
        const status = cleanText(row.status || "", 40).toLowerCase();
        if (review === "approved") return "approved";
        if (review === "rejected" || status === "rejected") return "rejected";
        if (status === "completed") return "completed";
        if (status === "driver_assigned") return "driver_assigned";
        return "pending";
    }

    function collectLocalBookings() {
        const seen = new Set();
        const rows = [];
        BOOKING_KEYS.forEach((key) => {
            readArray(key).forEach((row) => {
                if (!row || typeof row !== "object") return;
                const id = bookingId(row);
                if (!id || seen.has(id)) return;
                seen.add(id);
                rows.push({ ...row, sourceKey: row.sourceKey || key });
            });
        });
        return rows;
    }

    function collectLocalDriverLocations() {
        const rows = [];
        DRIVER_LOCATION_KEYS.forEach((key) => {
            readArray(key).forEach((row) => {
                if (row && typeof row === "object") rows.push(row);
            });
        });
        return rows;
    }

    function calculateDispatchPressure(counts) {
        const demand = Number(counts.pendingBookings || 0) + (Number(counts.approvedUnassigned || 0) * 1.5);
        const supply = Math.max(1, Number(counts.activeDriverLocations || 0));
        const stalePenalty = Math.min(25, Number(counts.staleDriverLocations || 0) * 5);
        return Math.min(100, Math.round((demand / supply) * 25 + stalePenalty));
    }

    function buildLocalSnapshot() {
        const bookings = collectLocalBookings();
        const driverLocations = collectLocalDriverLocations();
        const notifications = readArray("goindiaride_portal_notifications");
        const pendingRows = bookings.filter((row) => bookingStatus(row) === "pending");
        const approvedRows = bookings.filter((row) => bookingStatus(row) === "approved" || bookingStatus(row) === "driver_assigned");
        const approvedUnassigned = approvedRows.filter((row) => !cleanText(row.driverId || row.driverName || row.driver?.id || "", 120)).length;
        const now = Date.now();
        const activeDriverLocations = driverLocations.filter((row) => {
            const updatedAt = Date.parse(row.updatedAt || row.lastReportedAt || row.capturedAt || "");
            return Number.isFinite(updatedAt) && now - updatedAt <= 5 * 60 * 1000;
        }).length;
        const staleDriverLocations = driverLocations.filter((row) => {
            const updatedAt = Date.parse(row.updatedAt || row.lastReportedAt || row.capturedAt || "");
            return Number.isFinite(updatedAt) && now - updatedAt > 15 * 60 * 1000;
        }).length;
        const dispatchRows = pendingRows
            .slice()
            .sort((a, b) => minutesSince(b.createdAt || b.updatedAt) - minutesSince(a.createdAt || a.updatedAt))
            .slice(0, 6)
            .map((row) => ({
                bookingId: bookingId(row),
                pickup: cleanText(row.pickup || row.pickupLocation || row.from || "", 120),
                drop: cleanText(row.dropoff || row.dropLocation || row.drop || row.to || "", 120),
                amount: toAmount(row.amount || row.totalFare || row.finalFare || row.fare),
                ageMinutes: minutesSince(row.createdAt || row.updatedAt),
                priority: toAmount(row.amount || row.totalFare || row.finalFare || row.fare) >= 5000 ? "high" : "normal"
            }));

        const counts = {
            totalBookings: bookings.length,
            bookings24h: bookings.filter((row) => minutesSince(row.createdAt || row.updatedAt) <= 24 * 60).length,
            pendingBookings: pendingRows.length,
            approvedBookings: approvedRows.length,
            approvedUnassigned,
            completedBookings: bookings.filter((row) => bookingStatus(row) === "completed").length,
            activeDriverLocations,
            staleDriverLocations,
            openIncidents: notifications.filter((row) => /incident|sos|fraud|security|risk/i.test(cleanText(row.type || row.title || row.message))).length,
            criticalIncidents: notifications.filter((row) => /critical|sos|emergency/i.test(cleanText(row.type || row.title || row.message))).length,
            unreadAdminNotifications: notifications.filter((row) => !Array.isArray(row.readBy) || !row.readBy.includes("admin")).length,
            activePushSubscriptions: 0,
            maxPendingAgeMinutes: dispatchRows.reduce((max, row) => Math.max(max, Number(row.ageMinutes || 0)), 0)
        };
        counts.dispatchPressure = calculateDispatchPressure(counts);

        return {
            ok: true,
            active: true,
            productionReady: true,
            databaseConnected: false,
            version: VERSION,
            generatedAt: new Date().toISOString(),
            counts,
            goldenSignals: {
                latency: { label: "Queue age", value: counts.maxPendingAgeMinutes, unit: "minutes", status: counts.maxPendingAgeMinutes >= 20 ? "warning" : "good" },
                traffic: { label: "Bookings 24h", value: counts.bookings24h, unit: "requests", status: "good" },
                errors: { label: "Open incidents", value: counts.openIncidents, unit: "incidents", status: counts.criticalIncidents > 0 ? "critical" : (counts.openIncidents > 0 ? "warning" : "good") },
                saturation: { label: "Dispatch pressure", value: counts.dispatchPressure, unit: "score", status: counts.dispatchPressure >= 80 ? "critical" : (counts.dispatchPressure >= 50 ? "warning" : "good") }
            },
            queues: {
                dispatch: dispatchRows,
                incidents: []
            },
            runbook: [
                { id: "triage_pending_bookings", label: "Triage pending bookings", owner: "booking_ops", active: counts.pendingBookings > 0 },
                { id: "assign_driver_with_live_location", label: "Assign driver with fresh GPS", owner: "dispatch", active: counts.approvedUnassigned > 0 },
                { id: "review_security_incidents", label: "Review safety incidents", owner: "safety_ops", active: counts.openIncidents > 0 },
                { id: "verify_phase_health", label: "Verify phase health", owner: "ops_lead", active: true }
            ],
            phaseHealth: {}
        };
    }

    async function fetchJson(url, options) {
        const response = await fetch(url, {
            credentials: "include",
            cache: "no-store",
            ...(options || {})
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(body.message || `status_${response.status}`);
            error.status = response.status;
            throw error;
        }
        return body;
    }

    async function loadPublicPhaseHealth(apiBase) {
        const results = await Promise.all(PHASE_HEALTH_ENDPOINTS.map(([key, endpoint]) => (
            fetchJson(`${apiBase}${endpoint}`)
                .then((body) => [key, body])
                .catch(() => [key, { ok: false, active: false, endpoint }])
        )));
        return results.reduce((acc, row) => {
            acc[row[0]] = row[1];
            return acc;
        }, {});
    }

    async function loadRemoteSnapshot() {
        const apiBase = getApiBase();
        if (!apiBase || typeof fetch !== "function") return null;
        const token = getAccessToken();
        const publicHealth = await fetchJson(`${apiBase}/health/admin-operations-center`).catch(() => null);
        const phaseHealth = await loadPublicPhaseHealth(apiBase);
        const publicSnapshot = publicHealth ? { ...buildLocalSnapshot(), ...publicHealth, phaseHealth } : null;
        if (!token) return publicSnapshot;
        return fetchJson(`${apiBase}/api/admin/operations/center`, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`
            }
        })
            .then((snapshot) => ({
                ...snapshot,
                phaseHealth: {
                    ...phaseHealth,
                    ...(snapshot.phaseHealth || {})
                }
            }))
            .catch(() => publicSnapshot);
    }

    function signalIcon(status) {
        if (status === "critical") return "fa-circle-exclamation";
        if (status === "warning") return "fa-triangle-exclamation";
        return "fa-circle-check";
    }

    function renderSignalCards(snapshot) {
        const signals = snapshot.goldenSignals || {};
        return Object.keys(signals).map((key) => {
            const signal = signals[key] || {};
            const status = cleanText(signal.status || "good", 20);
            return `
                <article class="ops-signal-card is-${escapeHtml(status)}">
                    <i class="fas ${signalIcon(status)}"></i>
                    <span>${escapeHtml(signal.label || key)}</span>
                    <strong>${escapeHtml(formatNumber(signal.value))}</strong>
                    <small>${escapeHtml(signal.unit || "")}</small>
                </article>
            `;
        }).join("");
    }

    function renderDispatchRows(snapshot) {
        const rows = (snapshot.queues && snapshot.queues.dispatch) || [];
        if (!rows.length) return `<div class="empty-state compact">No dispatch rows waiting.</div>`;
        return rows.slice(0, 6).map((row) => `
            <article class="ops-lane-row">
                <div>
                    <strong>${escapeHtml(row.bookingId || "Booking")}</strong>
                    <span>${escapeHtml(row.pickup || "Pickup")} -> ${escapeHtml(row.drop || "Drop")}</span>
                </div>
                <small>${escapeHtml(row.priority || "normal")} | ${escapeHtml(row.ageMinutes || 0)} min</small>
            </article>
        `).join("");
    }

    function renderIncidentRows(snapshot) {
        const rows = (snapshot.queues && snapshot.queues.incidents) || [];
        if (!rows.length) return `<div class="empty-state compact">No open incident rows.</div>`;
        return rows.slice(0, 6).map((row) => `
            <article class="ops-lane-row">
                <div>
                    <strong>${escapeHtml(row.incidentId || "Incident")}</strong>
                    <span>${escapeHtml(row.eventType || row.recommendedAction || "Review")}</span>
                </div>
                <small>${escapeHtml(row.severity || "medium")} | ${escapeHtml(row.riskScore || 0)}</small>
            </article>
        `).join("");
    }

    function renderRunbook(snapshot) {
        const rows = Array.isArray(snapshot.runbook) ? snapshot.runbook : [];
        return rows.slice(0, 5).map((row) => `
            <article class="ops-runbook-row ${row.active ? "is-active" : ""}">
                <i class="fas ${row.active ? "fa-bolt" : "fa-check"}"></i>
                <div>
                    <strong>${escapeHtml(row.label || row.id)}</strong>
                    <span>${escapeHtml(row.owner || "ops")}</span>
                </div>
            </article>
        `).join("");
    }

    function renderPhaseHealth(snapshot) {
        const health = snapshot.phaseHealth || {};
        const rows = [
            ["Fraud", health.fraud],
            ["GDPR", health.gdpr],
            ["Security", health.security],
            ["Push", health.push]
        ];
        return rows.map((row) => {
            const active = row[1] && row[1].active !== false && row[1].ok !== false;
            return `
                <span class="ops-health-pill ${active ? "good" : "warn"}">
                    <i class="fas ${active ? "fa-circle-check" : "fa-triangle-exclamation"}"></i>
                    ${escapeHtml(row[0])}
                </span>
            `;
        }).join("");
    }

    function mount() {
        const overview = document.getElementById("view-overview");
        if (!overview || document.getElementById("adminOperationsCenterPhase5")) return null;
        const panel = document.createElement("section");
        panel.id = "adminOperationsCenterPhase5";
        panel.className = "workspace-panel operations-center-panel";
        panel.setAttribute("data-admin-operations-center", "phase5");
        panel.setAttribute("data-admin-operations-version", VERSION);
        overview.insertBefore(panel, overview.firstChild);
        return panel;
    }

    function render(snapshot) {
        const panel = mount();
        if (!panel) return;
        const counts = snapshot.counts || {};
        const connected = snapshot.databaseConnected ? "Backend live" : "Live snapshot";
        panel.innerHTML = `
            <div class="panel-title-row">
                <div>
                    <span class="section-kicker">Operations team</span>
                    <h2>Admin Operations Command Center</h2>
                </div>
                <div class="ops-center-actions">
                    <span class="status-pill ${snapshot.productionReady ? "good" : ""}" id="opsCenterStatus">${escapeHtml(connected)}</span>
                    <button class="secondary-action" id="opsCenterRefreshBtn" type="button"><i class="fas fa-rotate"></i> Refresh</button>
                </div>
            </div>
            <div class="ops-command-grid">
                <section class="ops-signal-grid" aria-label="Operations golden signals">
                    ${renderSignalCards(snapshot)}
                </section>
                <section class="ops-lane">
                    <header><span>Dispatch Queue</span><strong>${escapeHtml(counts.pendingBookings || 0)}</strong></header>
                    ${renderDispatchRows(snapshot)}
                </section>
                <section class="ops-lane">
                    <header><span>Incident Queue</span><strong>${escapeHtml(counts.openIncidents || 0)}</strong></header>
                    ${renderIncidentRows(snapshot)}
                </section>
                <section class="ops-lane">
                    <header><span>Runbook</span><strong>${escapeHtml((snapshot.runbook || []).filter((row) => row.active).length)}</strong></header>
                    ${renderRunbook(snapshot)}
                </section>
            </div>
            <div class="ops-health-row">
                ${renderPhaseHealth(snapshot)}
                <span class="ops-health-pill"><i class="fas fa-location-dot"></i>${escapeHtml(counts.activeDriverLocations || 0)} live drivers</span>
                <span class="ops-health-pill"><i class="fas fa-bell"></i>${escapeHtml(counts.unreadAdminNotifications || 0)} alerts</span>
                <span class="ops-health-pill"><i class="fas fa-paper-plane"></i>${escapeHtml(counts.activePushSubscriptions || 0)} push devices</span>
            </div>
        `;
        const refresh = document.getElementById("opsCenterRefreshBtn");
        if (refresh) refresh.addEventListener("click", () => refreshSnapshot(true));
    }

    async function refreshSnapshot(manual) {
        const local = buildLocalSnapshot();
        render(local);
        const remote = await loadRemoteSnapshot();
        const next = remote && remote.version === VERSION ? remote : local;
        writeSnapshot(next);
        render(next);
        if (manual && typeof global.showToast === "function") {
            global.showToast(next.databaseConnected ? "Operations center refreshed." : "Operations center refreshed locally.", "success");
        }
        return next;
    }

    global.GoIndiaRideAdminOperationsCenter = {
        VERSION,
        buildLocalSnapshot,
        refresh: refreshSnapshot,
        render
    };

    function boot() {
        const cached = readSnapshot();
        render(cached && cached.version === VERSION ? cached : buildLocalSnapshot());
        refreshSnapshot(false).catch(() => {});
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})(window);
