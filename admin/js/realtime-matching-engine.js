(function initRealtimeMatchingEnginePhase6(global) {
    "use strict";

    const VERSION = "goindiaride_realtime_matching_phase6_v1";
    const STORE_KEY = "goindiaride_realtime_matching_phase6_snapshot";
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

    function toPoint(value) {
        if (!value) return null;
        if (Array.isArray(value) && value.length >= 2) return normalizeLatLng(value[0], value[1]);
        if (typeof value === "string") {
            const match = value.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
            return match ? normalizeLatLng(match[1], match[2]) : null;
        }
        if (typeof value === "object") {
            return normalizeLatLng(value.lat ?? value.latitude ?? value.y, value.lng ?? value.lon ?? value.longitude ?? value.x);
        }
        return null;
    }

    function normalizeLatLng(latValue, lngValue) {
        const lat = Number(latValue);
        const lng = Number(lngValue);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { lat, lng };
    }

    function radians(value) {
        return (value * Math.PI) / 180;
    }

    function distanceKm(from, to) {
        if (!from || !to) return null;
        const dLat = radians(to.lat - from.lat);
        const dLng = radians(to.lng - from.lng);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
        return Number((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
    }

    function minutesSince(value) {
        const time = Date.parse(value || "");
        if (!Number.isFinite(time)) return 0;
        return Math.max(0, Math.round((Date.now() - time) / 60000));
    }

    function formatNumber(value) {
        return new Intl.NumberFormat("en-IN").format(Number(value || 0));
    }

    function bookingStatus(row) {
        const review = cleanText(row.adminReviewStatus || "", 40).toLowerCase();
        const status = cleanText(row.status || "", 40).toLowerCase();
        if (review === "approved") return "approved";
        if (status === "completed") return "completed";
        if (status === "cancelled" || status === "rejected") return "closed";
        return "pending";
    }

    function getBookingId(row) {
        return cleanText(row.bookingId || row.id || row._id, 100);
    }

    function getBookingPickup(row) {
        return toPoint(row.pickupCoordinates)
            || toPoint(row.locationPins && row.locationPins.pickup)
            || toPoint(row.fareQuote && row.fareQuote.pickupCoordinates)
            || toPoint(row.pickupLocation)
            || toPoint(row.pickup);
    }

    function collectBookings() {
        const seen = new Set();
        const rows = [];
        BOOKING_KEYS.forEach((key) => {
            readArray(key).forEach((row) => {
                if (!row || typeof row !== "object") return;
                const id = getBookingId(row);
                if (!id || seen.has(id)) return;
                seen.add(id);
                rows.push({ ...row, sourceKey: row.sourceKey || key });
            });
        });
        return rows;
    }

    function collectDrivers() {
        const rows = [];
        DRIVER_LOCATION_KEYS.forEach((key) => {
            readArray(key).forEach((row) => {
                if (row && typeof row === "object") rows.push({ ...row, sourceKey: key });
            });
        });
        return rows;
    }

    function buildLocalPlan() {
        const bookings = collectBookings()
            .filter((row) => bookingStatus(row) === "approved")
            .filter((row) => !cleanText(row.driverId || row.assignedDriverId || "", 120))
            .map((row) => ({
                bookingId: getBookingId(row),
                pickup: getBookingPickup(row),
                pickupLabel: cleanText(row.pickup || row.pickupLocation || row.from || "", 120),
                dropLabel: cleanText(row.dropoff || row.dropLocation || row.drop || row.to || "", 120),
                createdAt: row.createdAt || row.updatedAt
            }));
        const drivers = collectDrivers()
            .map((row) => ({
                driverId: cleanText(row.userId || row.driverId || row.id || row._id, 120),
                point: toPoint(row),
                freshnessMinutes: minutesSince(row.updatedAt || row.lastReportedAt || row.capturedAt),
                status: cleanText(row.status || "tracking", 40).toLowerCase()
            }))
            .filter((row) => row.driverId && row.point && row.status === "tracking" && row.freshnessMinutes <= 8);
        const candidates = [];

        bookings.forEach((booking) => {
            drivers.forEach((driver) => {
                const km = distanceKm(driver.point, booking.pickup);
                if (km === null || km > 70) return;
                const etaMinutes = Math.max(1, Math.ceil((km / 24) * 60 + 2));
                candidates.push({
                    bookingId: booking.bookingId,
                    driverId: driver.driverId,
                    pickup: booking.pickupLabel,
                    drop: booking.dropLabel,
                    distanceKm: km,
                    etaMinutes,
                    freshnessMinutes: driver.freshnessMinutes,
                    confidence: Math.max(35, Math.min(99, Math.round(100 - etaMinutes * 1.4 - driver.freshnessMinutes * 2))),
                    cost: etaMinutes * 100 + km * 18 + driver.freshnessMinutes * 11
                });
            });
        });

        const usedBookings = new Set();
        const usedDrivers = new Set();
        const assignments = candidates
            .sort((a, b) => a.cost - b.cost)
            .filter((row) => {
                if (usedBookings.has(row.bookingId) || usedDrivers.has(row.driverId)) return false;
                usedBookings.add(row.bookingId);
                usedDrivers.add(row.driverId);
                return true;
            });

        return {
            counts: {
                eligibleBookings: bookings.length,
                liveDrivers: drivers.length,
                candidateEdges: candidates.length,
                matchedBookings: assignments.length,
                unmatchedBookings: Math.max(0, bookings.length - assignments.length),
                unusedDrivers: Math.max(0, drivers.length - usedDrivers.size)
            },
            assignments,
            rankedCandidates: candidates.slice(0, 20),
            unmatchedBookings: bookings.filter((row) => !usedBookings.has(row.bookingId)).map((row) => ({
                bookingId: row.bookingId,
                pickup: row.pickupLabel,
                reason: row.pickup ? "no_driver_within_sla" : "missing_pickup_coordinates"
            })),
            goldenSignals: {
                matchRate: { label: "Match rate", value: bookings.length ? Math.round((assignments.length / bookings.length) * 100) : 100, unit: "percent" },
                medianEta: { label: "Median ETA", value: median(assignments.map((row) => row.etaMinutes)), unit: "minutes" },
                supplyDemandRatio: { label: "Supply demand", value: bookings.length ? Number((drivers.length / bookings.length).toFixed(2)) : drivers.length, unit: "drivers_per_booking" }
            }
        };
    }

    function median(values) {
        const sorted = (values || []).filter((value) => Number.isFinite(Number(value))).map(Number).sort((a, b) => a - b);
        if (!sorted.length) return 0;
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
    }

    function buildLocalSnapshot() {
        return {
            ok: true,
            active: true,
            productionReady: true,
            databaseConnected: false,
            version: VERSION,
            generatedAt: new Date().toISOString(),
            plan: buildLocalPlan()
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

    async function fetchCsrfToken(apiBase, token) {
        const response = await fetchJson(`${apiBase}/api/security/csrf-token`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        return cleanText(response.csrfToken, 2000);
    }

    async function loadRemoteSnapshot() {
        const apiBase = getApiBase();
        if (!apiBase || typeof fetch !== "function") return null;
        const token = getAccessToken();
        const health = await fetchJson(`${apiBase}/health/realtime-matching-engine`).catch(() => null);
        if (!token) return health ? { ...buildLocalSnapshot(), ...health, plan: buildLocalPlan() } : null;
        return fetchJson(`${apiBase}/api/admin/matching/engine`, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`
            }
        }).catch(() => (health ? { ...buildLocalSnapshot(), ...health, plan: buildLocalPlan() } : null));
    }

    async function runRemoteMatching(apply) {
        const apiBase = getApiBase();
        const token = getAccessToken();
        if (!apiBase || !token) return null;
        const csrfToken = await fetchCsrfToken(apiBase, token);
        return fetchJson(`${apiBase}/api/admin/matching/run`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken,
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ apply: Boolean(apply), limit: 24 })
        });
    }

    function mount() {
        const overview = document.getElementById("view-overview");
        if (!overview || document.getElementById("realtimeMatchingEnginePhase6")) return null;
        const panel = document.createElement("section");
        panel.id = "realtimeMatchingEnginePhase6";
        panel.className = "workspace-panel realtime-matching-panel";
        panel.setAttribute("data-realtime-matching-engine", "phase6");
        panel.setAttribute("data-realtime-matching-version", VERSION);
        const opsPanel = document.getElementById("adminOperationsCenterPhase5");
        if (opsPanel && opsPanel.nextSibling) {
            overview.insertBefore(panel, opsPanel.nextSibling);
        } else if (opsPanel) {
            overview.appendChild(panel);
        } else {
            overview.insertBefore(panel, overview.firstChild);
        }
        return panel;
    }

    function signalCards(plan) {
        const counts = plan.counts || {};
        const signals = plan.goldenSignals || {};
        return [
            ["Match Rate", signals.matchRate && `${signals.matchRate.value}%`, "fa-route"],
            ["Median ETA", signals.medianEta && `${signals.medianEta.value} min`, "fa-clock"],
            ["Demand", counts.eligibleBookings, "fa-person"],
            ["Live Drivers", counts.liveDrivers, "fa-car-side"]
        ].map((item) => `
            <article class="matching-signal">
                <i class="fas ${escapeHtml(item[2])}"></i>
                <span>${escapeHtml(item[0])}</span>
                <strong>${escapeHtml(item[1] === undefined ? 0 : item[1])}</strong>
            </article>
        `).join("");
    }

    function assignmentRows(plan) {
        const rows = plan.assignments || [];
        if (!rows.length) return `<div class="empty-state compact">No approved booking match ready.</div>`;
        return rows.slice(0, 6).map((row) => `
            <article class="matching-row">
                <div>
                    <strong>${escapeHtml(row.bookingId || "Booking")}</strong>
                    <span>${escapeHtml(row.pickup || "Pickup")} -> ${escapeHtml(row.drop || "Drop")}</span>
                </div>
                <small>${escapeHtml(row.driverId || "driver")} | ${escapeHtml(row.etaMinutes || 0)} min | ${escapeHtml(row.confidence || 0)}%</small>
            </article>
        `).join("");
    }

    function candidateRows(plan) {
        const rows = plan.rankedCandidates || [];
        if (!rows.length) return `<div class="empty-state compact">No candidate edges inside SLA.</div>`;
        return rows.slice(0, 5).map((row) => `
            <article class="matching-row slim">
                <div>
                    <strong>${escapeHtml(row.driverId || "driver")}</strong>
                    <span>${escapeHtml(row.bookingId || "booking")}</span>
                </div>
                <small>${escapeHtml(row.distanceKm || 0)} km | ${escapeHtml(row.etaMinutes || 0)} min</small>
            </article>
        `).join("");
    }

    function render(snapshot) {
        const panel = mount();
        if (!panel) return;
        const plan = snapshot.plan || buildLocalPlan();
        const counts = plan.counts || {};
        const statusText = snapshot.databaseConnected ? "Backend live" : "Local preview";
        const canApply = Boolean(getAccessToken() && counts.matchedBookings);
        panel.innerHTML = `
            <div class="panel-title-row">
                <div>
                    <span class="section-kicker">Phase 6</span>
                    <h2>Real-Time Matching Engine</h2>
                </div>
                <div class="matching-actions">
                    <span class="status-pill ${snapshot.active ? "good" : ""}">${escapeHtml(statusText)}</span>
                    <button class="secondary-action" id="matchingRefreshBtn" type="button"><i class="fas fa-rotate"></i> Refresh</button>
                    <button class="primary-action" id="matchingApplyBtn" type="button" ${canApply ? "" : "disabled"}><i class="fas fa-link"></i> Apply</button>
                </div>
            </div>
            <div class="matching-grid">
                <section class="matching-signal-grid">${signalCards(plan)}</section>
                <section class="matching-lane">
                    <header><span>Match Preview</span><strong>${escapeHtml(counts.matchedBookings || 0)}</strong></header>
                    ${assignmentRows(plan)}
                </section>
                <section class="matching-lane">
                    <header><span>Candidate Edges</span><strong>${escapeHtml(counts.candidateEdges || 0)}</strong></header>
                    ${candidateRows(plan)}
                </section>
            </div>
        `;
        const refresh = document.getElementById("matchingRefreshBtn");
        const apply = document.getElementById("matchingApplyBtn");
        if (refresh) refresh.addEventListener("click", () => refreshSnapshot(true));
        if (apply) apply.addEventListener("click", () => applyMatches());
    }

    async function refreshSnapshot(manual) {
        const local = buildLocalSnapshot();
        render(local);
        const remote = await loadRemoteSnapshot();
        const next = remote && remote.version === VERSION ? remote : local;
        writeSnapshot(next);
        render(next);
        if (manual && typeof global.showToast === "function") {
            global.showToast(next.databaseConnected ? "Matching engine refreshed." : "Matching preview refreshed locally.", "success");
        }
        return next;
    }

    async function applyMatches() {
        const local = buildLocalSnapshot();
        render(local);
        const result = await runRemoteMatching(true).catch(() => null);
        const next = result && result.version === VERSION ? result : local;
        writeSnapshot(next);
        render(next);
        if (typeof global.showToast === "function") {
            const applied = next.applied && Number(next.applied.appliedCount || 0);
            global.showToast(applied ? `${applied} match applied.` : "No match applied.", applied ? "success" : "warning");
        }
        return next;
    }

    global.GoIndiaRideRealtimeMatchingEngine = {
        VERSION,
        applyMatches,
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
