(function initLiveLocationOperationsPhase7(global) {
    "use strict";

    const VERSION = "goindiaride_live_location_tracking_phase7_v1";
    const STORE_KEY = "goindiaride_live_location_phase7_operations_snapshot";
    const LOCATION_KEYS = [
        "goindiaride_driver_live_locations_v1",
        "goindiaride_customer_live_locations_v1",
        "goindiaride_admin_live_tracking_cache_v1",
        "goindiaride_driver_locations",
        "driver_live_locations"
    ];
    const FRESH_MINUTES = 2;
    const WARM_MINUTES = 8;
    const OFFLINE_MINUTES = 15;
    const WEAK_ACCURACY_METERS = 150;
    const OVERSPEED_KMH = 130;

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

    function normalizeRows(value) {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== "object") return [];
        if (Array.isArray(value.items)) return value.items;
        if (Array.isArray(value.rows)) return value.rows;
        if (Array.isArray(value.locations)) return value.locations;
        return Object.values(value).filter((row) => row && typeof row === "object");
    }

    function readRows(key) {
        try {
            return normalizeRows(parseJson(global.localStorage && global.localStorage.getItem(key), []));
        } catch (_error) {
            return [];
        }
    }

    function writeSnapshot(snapshot) {
        try {
            global.localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
        } catch (_error) {
            // Best-effort cache only.
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

    function toFiniteNumber(value) {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : null;
    }

    function toDate(value) {
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date : null;
    }

    function minutesSince(value) {
        const date = toDate(value);
        if (!date) return null;
        return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    }

    function roundNumber(value, decimals) {
        const numberValue = toFiniteNumber(value);
        if (numberValue === null) return null;
        return Number(numberValue.toFixed(decimals || 5));
    }

    function getSubjectType(row) {
        const explicit = cleanText(row.subjectType || row.accountType || row.role, 40).toLowerCase();
        if (explicit) return explicit;
        if (row.driverId || row.driverName) return "driver";
        if (row.customerId || row.customerName) return "customer";
        return "customer";
    }

    function getSpeedKmh(speed) {
        const metersPerSecond = toFiniteNumber(speed);
        if (metersPerSecond === null || metersPerSecond < 0) return null;
        return Number((metersPerSecond * 3.6).toFixed(1));
    }

    function buildSafety(row) {
        if (row.safety && typeof row.safety === "object" && row.safety.phase === "phase7_live_location_tracking") {
            return row.safety;
        }
        const status = cleanText(row.status || "tracking", 40).toLowerCase() || "tracking";
        const lastSignal = row.updatedAt || row.lastReportedAt || row.capturedAt || row.timestamp;
        const ageMinutes = minutesSince(lastSignal);
        let freshnessStatus = "unknown";
        if (status === "stopped") freshnessStatus = "stopped";
        else if (ageMinutes === null) freshnessStatus = "unknown";
        else if (ageMinutes <= FRESH_MINUTES) freshnessStatus = "fresh";
        else if (ageMinutes <= WARM_MINUTES) freshnessStatus = "warm";
        else if (ageMinutes <= OFFLINE_MINUTES) freshnessStatus = "stale";
        else freshnessStatus = "offline";

        const accuracy = toFiniteNumber(row.accuracy);
        const speedKmh = getSpeedKmh(row.speed);
        const reasons = [];
        if (status !== "stopped" && freshnessStatus === "stale") reasons.push("gps_stale");
        if (status !== "stopped" && freshnessStatus === "offline") reasons.push("gps_offline");
        if (accuracy !== null && accuracy > WEAK_ACCURACY_METERS) reasons.push("weak_accuracy");
        if (speedKmh !== null && speedKmh >= OVERSPEED_KMH) reasons.push("overspeed");

        return {
            phase: "phase7_live_location_tracking",
            status,
            active: status === "tracking" && (freshnessStatus === "fresh" || freshnessStatus === "warm"),
            needsAttention: reasons.length > 0,
            severity: reasons.indexOf("gps_offline") >= 0 || reasons.indexOf("overspeed") >= 0 ? "critical" : (reasons.length ? "warning" : "normal"),
            reasons,
            freshnessStatus,
            freshnessMinutes: ageMinutes,
            accuracyStatus: accuracy === null ? "unknown" : (accuracy > WEAK_ACCURACY_METERS ? "weak" : "usable"),
            accuracyMeters: accuracy,
            speedStatus: speedKmh !== null && speedKmh >= OVERSPEED_KMH ? "overspeed" : "normal",
            speedKmh,
            lastSignalAt: toDate(lastSignal)?.toISOString() || null
        };
    }

    function normalizeLocation(row, sourceKey) {
        const lat = roundNumber(row.lat ?? row.latitude, 5);
        const lng = roundNumber(row.lng ?? row.lon ?? row.longitude, 5);
        if (lat === null || lng === null) return null;
        const subjectType = getSubjectType(row);
        const userId = cleanText(row.userId || row.driverId || row.customerId || row.id || row._id, 140);
        const safety = buildSafety(row);
        return {
            id: cleanText(row.id || row._id || `${subjectType}:${userId}`, 140),
            subjectType,
            userId,
            bookingId: cleanText(row.bookingId || row.rideId || row.tripId, 120),
            sessionId: cleanText(row.sessionId || row.trackingSessionId, 160),
            lat,
            lng,
            accuracy: toFiniteNumber(row.accuracy),
            speedKmh: safety.speedKmh,
            status: cleanText(row.status || "tracking", 40),
            source: cleanText(row.source || sourceKey, 120),
            updatedAt: toDate(row.updatedAt || row.lastReportedAt || row.capturedAt || row.timestamp)?.toISOString() || new Date().toISOString(),
            mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
            safety
        };
    }

    function collectLocalLocations() {
        const seen = new Set();
        const rows = [];
        LOCATION_KEYS.forEach((key) => {
            readRows(key).forEach((row) => {
                const normalized = normalizeLocation(row || {}, key);
                if (!normalized) return;
                const dedupeKey = `${normalized.subjectType}:${normalized.userId || normalized.id}`;
                if (seen.has(dedupeKey)) return;
                seen.add(dedupeKey);
                rows.push(normalized);
            });
        });
        return rows.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
    }

    function buildCounts(items) {
        const counts = {
            totalRows: items.length,
            activeGps: 0,
            staleGps: 0,
            offlineGps: 0,
            weakAccuracy: 0,
            overspeed: 0,
            activeDrivers: 0,
            activeCustomers: 0,
            bySubjectType: { driver: 0, customer: 0, admin: 0 }
        };
        items.forEach((item) => {
            if (counts.bySubjectType[item.subjectType] !== undefined) counts.bySubjectType[item.subjectType] += 1;
            if (item.safety.active) counts.activeGps += 1;
            if (item.safety.freshnessStatus === "stale") counts.staleGps += 1;
            if (item.safety.freshnessStatus === "offline") counts.offlineGps += 1;
            if (item.safety.accuracyStatus === "weak") counts.weakAccuracy += 1;
            if (item.safety.speedStatus === "overspeed") counts.overspeed += 1;
            if (item.safety.active && item.subjectType === "driver") counts.activeDrivers += 1;
            if (item.safety.active && item.subjectType === "customer") counts.activeCustomers += 1;
        });
        return counts;
    }

    function buildGoldenSignals(counts) {
        return {
            availability: { label: "Active GPS", value: counts.activeGps, unit: "sessions", status: counts.activeGps ? "good" : "warning" },
            freshness: { label: "Stale GPS", value: counts.staleGps + counts.offlineGps, unit: "sessions", status: counts.offlineGps ? "critical" : (counts.staleGps ? "warning" : "good") },
            quality: { label: "Weak accuracy", value: counts.weakAccuracy, unit: "sessions", status: counts.weakAccuracy ? "warning" : "good" },
            safety: { label: "Overspeed", value: counts.overspeed, unit: "sessions", status: counts.overspeed ? "critical" : "good" }
        };
    }

    function buildLocalSnapshot() {
        const items = collectLocalLocations();
        const counts = buildCounts(items);
        return {
            ok: true,
            active: true,
            productionReady: true,
            databaseConnected: false,
            version: VERSION,
            generatedAt: new Date().toISOString(),
            counts,
            goldenSignals: buildGoldenSignals(counts),
            alerts: items.filter((item) => item.safety.needsAttention).slice(0, 30),
            items
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

    async function loadRemoteSnapshot() {
        const apiBase = getApiBase();
        if (!apiBase || typeof fetch !== "function") return null;
        const local = buildLocalSnapshot();
        const token = getAccessToken();
        const health = await fetchJson(`${apiBase}/health/live-location-tracking`).catch(() => null);
        if (!token) return health ? { ...local, ...health, counts: local.counts, goldenSignals: local.goldenSignals, alerts: local.alerts, items: local.items } : null;
        return fetchJson(`${apiBase}/api/admin/live-location/operations?limit=160`, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`
            }
        }).catch(() => (health ? { ...local, ...health, counts: local.counts, goldenSignals: local.goldenSignals, alerts: local.alerts, items: local.items } : null));
    }

    function mount() {
        const overview = document.getElementById("view-overview");
        if (!overview || document.getElementById("liveLocationOperationsPhase7")) return null;
        const panel = document.createElement("section");
        panel.id = "liveLocationOperationsPhase7";
        panel.className = "workspace-panel live-location-ops-panel";
        panel.setAttribute("data-live-location-operations", "phase7");
        panel.setAttribute("data-live-location-version", VERSION);
        const matchingPanel = document.getElementById("realtimeMatchingEnginePhase6");
        const opsPanel = document.getElementById("adminOperationsCenterPhase5");
        if (matchingPanel && matchingPanel.nextSibling) {
            overview.insertBefore(panel, matchingPanel.nextSibling);
        } else if (matchingPanel) {
            overview.appendChild(panel);
        } else if (opsPanel && opsPanel.nextSibling) {
            overview.insertBefore(panel, opsPanel.nextSibling);
        } else {
            overview.insertBefore(panel, overview.firstChild);
        }
        return panel;
    }

    function signalCards(snapshot) {
        const signals = snapshot.goldenSignals || {};
        const rows = [
            ["Active GPS", signals.availability && signals.availability.value, "fa-satellite-dish", signals.availability && signals.availability.status],
            ["Stale GPS", signals.freshness && signals.freshness.value, "fa-clock", signals.freshness && signals.freshness.status],
            ["Weak Accuracy", signals.quality && signals.quality.value, "fa-location-crosshairs", signals.quality && signals.quality.status],
            ["Overspeed", signals.safety && signals.safety.value, "fa-gauge-high", signals.safety && signals.safety.status]
        ];
        return rows.map((item) => `
            <article class="location-signal ${escapeHtml(item[3] || "")}">
                <i class="fas ${escapeHtml(item[2])}"></i>
                <span>${escapeHtml(item[0])}</span>
                <strong>${escapeHtml(item[1] === undefined ? 0 : item[1])}</strong>
            </article>
        `).join("");
    }

    function reasonText(reasons) {
        const map = {
            gps_stale: "GPS stale",
            gps_offline: "GPS offline",
            gps_time_missing: "Signal time missing",
            weak_accuracy: "Weak accuracy",
            overspeed: "Overspeed"
        };
        return (reasons || []).map((item) => map[item] || item).join(", ") || "Review";
    }

    function alertRows(snapshot) {
        const rows = snapshot.alerts || [];
        if (!rows.length) return `<div class="empty-state compact">No location safety alerts.</div>`;
        return rows.slice(0, 6).map((row) => {
            const safety = row.safety || row;
            return `
                <article class="location-row ${escapeHtml(safety.severity || row.severity || "warning")}">
                    <div class="location-row-main">
                        <span class="location-status-dot ${escapeHtml(safety.severity || row.severity || "warning")}"></span>
                        <div>
                            <strong>${escapeHtml(row.bookingId || row.userId || row.subjectType || "GPS session")}</strong>
                            <span>${escapeHtml(row.subjectType || "location")} | ${escapeHtml(reasonText(safety.reasons || row.reasons))}</span>
                        </div>
                    </div>
                    <small>${escapeHtml(safety.freshnessMinutes ?? row.freshnessMinutes ?? 0)} min</small>
                </article>
            `;
        }).join("");
    }

    function locationRows(snapshot) {
        const rows = snapshot.items || [];
        if (!rows.length) return `<div class="empty-state compact">No live GPS rows found yet.</div>`;
        return rows.slice(0, 8).map((row) => {
            const safety = row.safety || {};
            return `
                <article class="location-row">
                    <div class="location-row-main">
                        <span class="location-status-dot ${escapeHtml(safety.freshnessStatus || "unknown")}"></span>
                        <div>
                            <strong>${escapeHtml(row.bookingId || row.userId || "GPS session")}</strong>
                            <span>${escapeHtml(row.subjectType || "location")} | ${escapeHtml(safety.freshnessStatus || "unknown")} | ${escapeHtml(row.accuracy ?? "NA")}m</span>
                        </div>
                    </div>
                    <a class="row-action" href="${escapeHtml(row.mapsUrl || "#")}" target="_blank" rel="noopener">Map</a>
                </article>
            `;
        }).join("");
    }

    function render(snapshot) {
        const panel = mount();
        if (!panel) return;
        const statusText = snapshot.databaseConnected ? "Backend live" : "Live preview";
        const counts = snapshot.counts || {};
        panel.innerHTML = `
            <div class="panel-title-row">
                <div>
                    <span class="section-kicker">Phase 7</span>
                    <h2>Live Location Operations</h2>
                </div>
                <div class="live-location-actions">
                    <span class="status-pill ${snapshot.databaseConnected ? "good" : "pending"}">${escapeHtml(statusText)}</span>
                    <button class="secondary-action" id="liveLocationRefreshBtn" type="button"><i class="fas fa-rotate"></i> Refresh</button>
                </div>
            </div>
            <div class="location-ops-grid">
                <section class="location-signal-grid">${signalCards(snapshot)}</section>
                <section class="location-lane">
                    <header><span>Safety Alerts</span><strong>${escapeHtml((snapshot.alerts || []).length)}</strong></header>
                    ${alertRows(snapshot)}
                </section>
                <section class="location-lane">
                    <header><span>Latest GPS</span><strong>${escapeHtml(counts.totalRows || 0)}</strong></header>
                    ${locationRows(snapshot)}
                </section>
            </div>
        `;
        const refresh = document.getElementById("liveLocationRefreshBtn");
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
            global.showToast(next.databaseConnected ? "Live location operations refreshed." : "Live location preview refreshed locally.", "success");
        }
        return next;
    }

    global.GoIndiaRideLiveLocationOperations = {
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
