(function initAdminFeatureControlCenter() {
    "use strict";

    const STORE_KEY = "goindiaride_admin_universal_feature_controls_v1";
    const AUDIT_KEY = "adminAuditLogs";
    const LOCAL_EVENT = "goindiaride:admin-universal-feature-control-update";
    const CATALOG_URL = "../js/ultimate/feature-index/customer.json";
    const CATALOG_SHARD_URLS = [
        "../js/ultimate/feature-index/customer.json"
    ];
    const BACKEND_PATH = "/api/admin/feature-control";
    const MAX_RENDER_ROWS = 160;
    const CATALOG_IDLE_DELAY_MS = 12000;
    const CATALOG_IDLE_TIMEOUT_MS = 20000;
    const BLOCKED_STATUSES = ["disabled", "paused", "blocked", "approval_required", "pending_approval"];
    const CORE_PORTAL_FEATURES = {
        customer: [
            "home_dashboard", "booking", "quick_booking", "saved_places", "fare_estimator",
            "active_rides", "scheduled_rides", "airport_transfers", "outstation_rides",
            "hourly_rentals", "trip_modes", "ride_history", "wallet", "wallet_topup",
            "wallet_withdrawal", "wallet_transfer", "rewards", "messages", "donations",
            "split_fare", "tourism", "travel_card", "temple_timings", "cultural_guide",
            "local_events", "tour_packages", "heritage_walks", "food_guide", "shopping_guide",
            "profile", "ride_preferences", "emergency_contacts", "notifications",
            "customer_support", "emergency"
        ]
    };
    const CORE_FEATURE_LABELS = {
        home_dashboard: "Customer home dashboard",
        booking: "Booking entry and ride confirmation",
        quick_booking: "Quick booking actions",
        saved_places: "Saved places",
        fare_estimator: "Fare estimator",
        active_rides: "Active rides",
        scheduled_rides: "Scheduled rides",
        airport_transfers: "Airport transfers",
        outstation_rides: "Outstation rides",
        hourly_rentals: "Hourly rentals",
        trip_modes: "Trip mode controls",
        ride_history: "Ride history and receipts",
        wallet: "Wallet",
        wallet_topup: "Wallet top-up",
        wallet_withdrawal: "Wallet withdrawal",
        wallet_transfer: "Wallet transfer",
        rewards: "Rewards and coupons",
        messages: "Messages",
        donations: "Donations",
        split_fare: "Split fare",
        tourism: "Tourism guide",
        travel_card: "Travel card",
        temple_timings: "Temple timings",
        cultural_guide: "Cultural guide",
        local_events: "Local events",
        tour_packages: "Tour packages",
        heritage_walks: "Heritage walks",
        food_guide: "Food guide",
        shopping_guide: "Shopping guide",
        profile: "Profile",
        ride_preferences: "Ride preferences",
        emergency_contacts: "Emergency contacts",
        notifications: "Notifications",
        customer_support: "Customer support",
        emergency: "Emergency controls"
    };

    const state = {
        catalog: [],
        query: "",
        category: "customer",
        status: "all",
        backendOnline: false,
        loaded: false,
        loading: false
    };

    function scheduleIdle(callback, delayMs = 0) {
        const run = () => {
            if (typeof window.requestIdleCallback === "function") {
                window.requestIdleCallback(callback, { timeout: CATALOG_IDLE_TIMEOUT_MS });
                return;
            }
            window.setTimeout(callback, 180);
        };
        window.setTimeout(run, delayMs);
    }

    function $(selector, root = document) {
        return root.querySelector(selector);
    }

    function parseJson(raw, fallback) {
        try {
            const parsed = JSON.parse(raw || "");
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (_error) {
            return fallback;
        }
    }

    function cleanText(value, fallback = "") {
        const text = String(value ?? "").replace(/\s+/g, " ").trim();
        return text || fallback;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function featureKey(category, featureId) {
        return `${cleanText(category).toLowerCase() || "general"}:${cleanText(featureId).toLowerCase()}`;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function readStore() {
        const store = parseJson(localStorage.getItem(STORE_KEY), {});
        return {
            version: 1,
            updatedAt: store.updatedAt || "",
            features: store.features && typeof store.features === "object" && !Array.isArray(store.features)
                ? store.features
                : {}
        };
    }

    function writeStore(store) {
        const next = {
            version: 1,
            updatedAt: nowIso(),
            features: store.features || {}
        };
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: { store: next } }));
        return next;
    }

    function defaultControl() {
        return {
            enabled: true,
            status: "active",
            approvalRequired: false,
            reason: "",
            correction: "",
            labelOverride: "",
            updatedAt: ""
        };
    }

    function getControl(feature) {
        const store = readStore();
        return {
            ...defaultControl(),
            ...(store.features[featureKey(feature.category, feature.featureId)] || {})
        };
    }

    function isControlBlocked(control) {
        const status = cleanText(control.status || "active").toLowerCase();
        return control.enabled === false || control.approvalRequired === true || BLOCKED_STATUSES.includes(status);
    }

    function addAudit(action, details, metadata = {}) {
        const rows = parseJson(localStorage.getItem(AUDIT_KEY), []);
        if (!Array.isArray(rows)) return;
        rows.unshift({
            action,
            details,
            metadata,
            timestamp: nowIso(),
            source: "admin_feature_control_center"
        });
        localStorage.setItem(AUDIT_KEY, JSON.stringify(rows.slice(0, 1000)));
    }

    function notifyPortals(feature, control) {
        if (!window.PortalConnector || typeof window.PortalConnector.createNotification !== "function") return;
        window.PortalConnector.createNotification({
            type: "admin_universal_feature_control_update",
            title: "Admin Feature Control",
            message: control.reason || `${feature.featureId} set to ${control.status}.`,
            sourcePortal: "admin",
            targetPortals: ["customer", "admin"],
            metadata: {
                category: feature.category,
                featureId: feature.featureId,
                status: control.status,
                enabled: control.enabled,
                approvalRequired: control.approvalRequired
            }
        });
    }

    function getApiBase() {
        const fromWindow = cleanText(window.GOINDIARIDE_API_BASE || window.__GOINDIARIDE_API_ORIGIN__ || "");
        const fromStorage = cleanText(localStorage.getItem("goindiaride_admin_api_base") || localStorage.getItem("goindiaride_api_base") || "");
        const base = fromWindow || fromStorage || (window.location.origin || "");
        return base.replace(/\/$/, "");
    }

    function getAccessToken() {
        return cleanText(
            localStorage.getItem("accessToken")
            || localStorage.getItem("authToken")
            || localStorage.getItem("token")
            || ""
        );
    }

    async function fetchBackendCatalog() {
        const token = getAccessToken();
        if (!token) return null;
        const response = await fetch(`${getApiBase()}${BACKEND_PATH}/catalog?limit=1000`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`
            },
            credentials: "include"
        });
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null);
        if (!payload || !Array.isArray(payload.items)) return null;
        state.backendOnline = true;
        return payload.items.map((item) => ({
            featureId: cleanText(item.featureId),
            category: cleanText(item.category || "general").toLowerCase(),
            bucket: cleanText(item.bucket || "general"),
            description: cleanText(item.description || item.text || ""),
            blockKey: cleanText(item.blockKey || ""),
            sourceLine: item.sourceLine || null,
            control: item.control && typeof item.control === "object" ? item.control : null
        })).filter((item) => item.featureId && item.category === "customer");
    }

    async function fetchStaticCatalogUrl(url, seen = new Set()) {
        const absoluteUrl = new URL(url, window.location.href).toString();
        if (seen.has(absoluteUrl)) return [];
        seen.add(absoluteUrl);

        const response = await fetch(absoluteUrl, { cache: "no-store" });
        if (!response.ok) return [];
        const payload = await response.json().catch(() => ({}));
        if (Array.isArray(payload.parts) && payload.parts.length) {
            const partResults = await Promise.all(payload.parts.map((partUrl) => (
                fetchStaticCatalogUrl(new URL(partUrl, absoluteUrl).toString(), seen).catch(() => [])
            )));
            return [].concat(...partResults);
        }
        const items = Array.isArray(payload.items) ? payload.items : [];
        return items.map((item) => ({
            featureId: cleanText(item.featureId),
            category: cleanText(item.category || "general").toLowerCase(),
            bucket: cleanText(item.bucket || "general"),
            description: cleanText(item.description || item.text || ""),
            blockKey: cleanText(item.blockKey || ""),
            sourceLine: item.sourceLine || null
        })).filter((item) => item.featureId && item.category === "customer");
    }

    async function fetchStaticCatalog() {
        const shardResults = await Promise.all(CATALOG_SHARD_URLS.map((url) => (
            fetchStaticCatalogUrl(url).catch(() => [])
        )));
        const shardItems = [].concat(...shardResults);
        if (shardItems.length) return shardItems;
        return fetchStaticCatalogUrl(CATALOG_URL);
    }

    function mergeBackendControls(items) {
        const store = readStore();
        let changed = false;
        items.forEach((item) => {
            if (!item.control || typeof item.control !== "object") return;
            const key = featureKey(item.category, item.featureId);
            store.features[key] = {
                ...store.features[key],
                ...item.control,
                featureId: item.featureId,
                category: item.category
            };
            changed = true;
        });
        if (changed) writeStore(store);
    }

    function isCorePortalFeature(feature) {
        const list = CORE_PORTAL_FEATURES[feature.category] || [];
        return list.includes(feature.featureId);
    }

    function coreCatalogItems() {
        const rows = [];
        Object.keys(CORE_PORTAL_FEATURES).forEach((category) => {
            CORE_PORTAL_FEATURES[category].forEach((featureId) => {
                rows.push({
                    featureId,
                    category,
                    bucket: "core",
                    description: CORE_FEATURE_LABELS[featureId] || featureId.replace(/_/g, " "),
                    blockKey: `${category}-core-${featureId}`,
                    sourceLine: null
                });
            });
        });
        return rows;
    }

    function mergeCatalog(primary, secondary) {
        const byKey = new Map();
        [...primary, ...secondary].forEach((item) => {
            const key = featureKey(item.category, item.featureId);
            if (!byKey.has(key)) byKey.set(key, item);
        });
        return Array.from(byKey.values());
    }

    function syncCorePortalBridge(feature, control) {
        if (!window.AdminControlBridge || !isCorePortalFeature(feature)) return;
        const reason = control.reason || `${feature.featureId} set to ${control.status} by admin.`;
        if (typeof window.AdminControlBridge.setFeatureStatus === "function") {
            window.AdminControlBridge.setFeatureStatus(feature.category, feature.featureId, control.status, reason, {
                enabled: control.enabled,
                approvalRequired: control.approvalRequired,
                correction: control.correction,
                labelOverride: control.labelOverride
            });
            return;
        }
        if (typeof window.AdminControlBridge.setFeatureEnabled === "function") {
            window.AdminControlBridge.setFeatureEnabled(feature.category, feature.featureId, !isControlBlocked(control), reason);
        }
        if (control.correction && typeof window.AdminControlBridge.setFeatureCorrection === "function") {
            window.AdminControlBridge.setFeatureCorrection(feature.category, feature.featureId, control.correction, {
                reason,
                labelOverride: control.labelOverride
            });
        }
    }

    function mirrorIntoAdminBridgeStore(store) {
        if (!window.AdminControlBridge || typeof window.AdminControlBridge.readControls !== "function" || typeof window.AdminControlBridge.writeControls !== "function") {
            return;
        }
        const controls = window.AdminControlBridge.readControls();
        controls.universalFeatures = {
            ...(controls.universalFeatures || {}),
            ...(store.features || {})
        };
        controls.universalFeatureControlUpdatedAt = store.updatedAt;
        window.AdminControlBridge.writeControls(controls);
    }

    async function syncBackendFeature(feature, control) {
        const token = getAccessToken();
        if (!token) return false;
        try {
            const response = await fetch(`${getApiBase()}${BACKEND_PATH}/state/${encodeURIComponent(feature.category)}/${encodeURIComponent(feature.featureId)}`, {
                method: "PUT",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                credentials: "include",
                body: JSON.stringify({
                    ...control,
                    blockKey: feature.blockKey,
                    bucket: feature.bucket,
                    description: feature.description
                })
            });
            state.backendOnline = response.ok;
            return response.ok;
        } catch (_error) {
            state.backendOnline = false;
            return false;
        }
    }

    function saveFeatureControl(feature, patch) {
        const store = readStore();
        const key = featureKey(feature.category, feature.featureId);
        const previous = store.features[key] || {};
        const status = cleanText(patch.status || previous.status || "active").toLowerCase();
        const approvalRequired = patch.approvalRequired === true || status === "approval_required" || status === "pending_approval";
        const enabled = Object.prototype.hasOwnProperty.call(patch, "enabled")
            ? Boolean(patch.enabled)
            : !(approvalRequired || BLOCKED_STATUSES.includes(status));
        const control = {
            ...defaultControl(),
            ...previous,
            ...patch,
            featureId: feature.featureId,
            category: feature.category,
            bucket: feature.bucket,
            blockKey: feature.blockKey,
            description: feature.description,
            enabled,
            status,
            approvalRequired,
            updatedAt: nowIso()
        };
        store.features[key] = control;
        const nextStore = writeStore(store);
        mirrorIntoAdminBridgeStore(nextStore);
        syncCorePortalBridge(feature, control);
        addAudit("UNIVERSAL_FEATURE_CONTROL_CHANGED", `${feature.featureId} set to ${status}`, {
            category: feature.category,
            featureId: feature.featureId,
            status,
            enabled,
            approvalRequired
        });
        notifyPortals(feature, control);
        syncBackendFeature(feature, control);
        render();
    }

    function filteredCatalog() {
        const q = state.query.toLowerCase();
        return state.catalog.filter((feature) => {
            if (state.category !== "all" && feature.category !== state.category) return false;
            const control = getControl(feature);
            const blocked = isControlBlocked(control);
            const approval = control.approvalRequired === true || control.status === "approval_required" || control.status === "pending_approval";
            if (state.status === "active" && blocked) return false;
            if (state.status === "paused" && (!blocked || approval)) return false;
            if (state.status === "approval" && !approval) return false;
            if (!q) return true;
            return [
                feature.featureId,
                feature.category,
                feature.bucket,
                feature.description,
                feature.blockKey,
                control.reason,
                control.correction
            ].join(" ").toLowerCase().includes(q);
        });
    }

    function catalogSummary() {
        return state.catalog.reduce((acc, feature) => {
            const control = getControl(feature);
            const category = feature.category || "general";
            acc[category] = acc[category] || { total: 0, active: 0, paused: 0, approval: 0 };
            acc[category].total += 1;
            if (control.approvalRequired || control.status === "approval_required" || control.status === "pending_approval") {
                acc[category].approval += 1;
            } else if (isControlBlocked(control)) {
                acc[category].paused += 1;
            } else {
                acc[category].active += 1;
            }
            return acc;
        }, {});
    }

    function statusLabel(control) {
        if (control.approvalRequired || control.status === "approval_required" || control.status === "pending_approval") return "Approval";
        if (isControlBlocked(control)) return "Paused";
        return "Active";
    }

    function statusClass(control) {
        if (control.approvalRequired || control.status === "approval_required" || control.status === "pending_approval") return "pending";
        return isControlBlocked(control) ? "rejected" : "approved";
    }

    function renderRows(items) {
        if (!items.length) {
            return `<div class="empty-state">No features match this filter.</div>`;
        }
        return items.slice(0, MAX_RENDER_ROWS).map((feature) => {
            const control = getControl(feature);
            const note = cleanText(control.correction || control.reason || "");
            return `
                <article class="az-feature-row" data-feature-row="${escapeHtml(featureKey(feature.category, feature.featureId))}">
                    <div class="az-feature-copy">
                        <strong>${escapeHtml(feature.featureId)} <span>${escapeHtml(feature.category)}</span></strong>
                        <small>${escapeHtml(feature.description || feature.blockKey || "Feature control")}</small>
                        ${note ? `<em>${escapeHtml(note)}</em>` : ""}
                    </div>
                    <div class="az-feature-meta">
                        <span>${escapeHtml(feature.bucket || "general")}</span>
                        <span class="status-pill ${statusClass(control)}">${statusLabel(control)}</span>
                    </div>
                    <div class="control-actions az-actions">
                        <button class="row-action" data-az-action="enable" data-category="${escapeHtml(feature.category)}" data-feature-id="${escapeHtml(feature.featureId)}" type="button"><i class="fas fa-play"></i> On</button>
                        <button class="danger-action" data-az-action="disable" data-category="${escapeHtml(feature.category)}" data-feature-id="${escapeHtml(feature.featureId)}" type="button"><i class="fas fa-pause"></i> Off</button>
                        <button class="row-action" data-az-action="approval" data-category="${escapeHtml(feature.category)}" data-feature-id="${escapeHtml(feature.featureId)}" type="button"><i class="fas fa-user-check"></i> Approval</button>
                        <button class="row-action" data-az-action="edit" data-category="${escapeHtml(feature.category)}" data-feature-id="${escapeHtml(feature.featureId)}" type="button" title="Edit note"><i class="fas fa-pen-to-square"></i></button>
                    </div>
                </article>
            `;
        }).join("");
    }

    function renderSummary(summary) {
        const categories = ["customer"];
        return categories.map((category) => {
            const row = summary[category] || { total: 0, active: 0, paused: 0, approval: 0 };
            return `
                <article class="az-summary-tile">
                    <small>${escapeHtml(category)}</small>
                    <strong>${row.active}/${row.total}</strong>
                    <span>${row.paused} paused | ${row.approval} approval</span>
                </article>
            `;
        }).join("");
    }

    function render() {
        const host = $("#adminAzFeatureControlBody");
        if (!host) return;
        const items = filteredCatalog();
        const hidden = Math.max(0, items.length - MAX_RENDER_ROWS);
        $("#adminAzFeatureSummary").innerHTML = renderSummary(catalogSummary());
        $("#adminAzFeatureCount").textContent = `${items.length} shown`;
        $("#adminAzFeatureSync").textContent = state.backendOnline ? "Backend sync" : "Local control";
        host.innerHTML = `
            ${renderRows(items)}
            ${hidden ? `<div class="az-more-note">${hidden} more features hidden by render limit. Use search/filter to narrow.</div>` : ""}
        `;
    }

    function installStyles() {
        if ($("#adminAzFeatureControlStyles")) return;
        const style = document.createElement("style");
        style.id = "adminAzFeatureControlStyles";
        style.textContent = `
            .az-feature-panel{margin-top:1rem}
            .az-toolbar{display:flex;gap:.65rem;flex-wrap:wrap;align-items:center;margin:.9rem 0}
            .az-toolbar input,.az-toolbar select{border:1px solid #d8e1ef;border-radius:7px;padding:.65rem .75rem;min-height:38px;background:#fff;color:#0f172a}
            .az-toolbar input{flex:1 1 260px}
            .az-summary-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:.65rem;margin:.85rem 0}
            .az-summary-tile{border:1px solid #e2e8f0;border-radius:8px;background:#f8fbff;padding:.7rem}
            .az-summary-tile small,.az-summary-tile span{display:block;color:#667085}
            .az-summary-tile strong{display:block;font-size:1.1rem;margin:.2rem 0;color:#0f172a}
            .az-feature-list{display:grid;gap:.55rem}
            .az-feature-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:.8rem;align-items:center;border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:.75rem}
            .az-feature-copy strong{display:block;color:#0f172a}
            .az-feature-copy strong span{font-size:.75rem;color:#667085;font-weight:700;text-transform:uppercase;margin-left:.35rem}
            .az-feature-copy small,.az-feature-copy em{display:block;color:#667085;line-height:1.35;margin-top:.2rem}
            .az-feature-copy em{color:#7c2d12;font-style:normal}
            .az-feature-meta{display:grid;gap:.35rem;justify-items:end;color:#667085;font-size:.82rem}
            .az-actions{justify-content:flex-end}
            .az-more-note{padding:.7rem;color:#667085;text-align:center;border:1px dashed #cbd5e1;border-radius:8px}
            @media (max-width:1100px){.az-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.az-feature-row{grid-template-columns:1fr}.az-feature-meta{justify-items:start}.az-actions{justify-content:flex-start}}
        `;
        document.head.appendChild(style);
    }

    function ensurePanel() {
        const portalView = $("#view-portals");
        if (!portalView || $("#adminAzFeatureControl")) return;
        const section = document.createElement("section");
        section.id = "adminAzFeatureControl";
        section.className = "workspace-panel wide-panel az-feature-panel";
        section.innerHTML = `
            <div class="panel-title-row">
                <div>
                    <span class="section-kicker">Customer feature authority</span>
                    <h2>Customer Live Feature Control</h2>
                </div>
                <span class="status-pill good" id="adminAzFeatureSync">Local control</span>
            </div>
            <div class="az-toolbar">
                <input id="adminAzFeatureSearch" type="search" placeholder="Search customer feature id, Hindi/English description or note">
                <select id="adminAzFeatureCategory" aria-label="Feature category">
                    <option value="customer">Customer</option>
                </select>
                <select id="adminAzFeatureStatus" aria-label="Feature status">
                    <option value="all">All status</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="approval">Approval</option>
                </select>
                <button class="row-action" data-az-bulk="enable" type="button"><i class="fas fa-play"></i> On visible</button>
                <button class="danger-action" data-az-bulk="disable" type="button"><i class="fas fa-pause"></i> Off visible</button>
                <button class="row-action" data-az-bulk="approval" type="button"><i class="fas fa-user-check"></i> Approval visible</button>
                <span class="status-pill" id="adminAzFeatureCount">Loading</span>
            </div>
            <div class="az-summary-grid" id="adminAzFeatureSummary"></div>
            <div class="az-feature-list" id="adminAzFeatureControlBody">
                <div class="empty-state">Loading A-Z feature catalog...</div>
            </div>
        `;
        portalView.appendChild(section);
    }

    function findFeature(category, featureId) {
        const key = featureKey(category, featureId);
        return state.catalog.find((feature) => featureKey(feature.category, feature.featureId) === key) || null;
    }

    function actionPatch(action, feature) {
        if (action === "enable") {
            return {
                enabled: true,
                status: "active",
                approvalRequired: false,
                reason: `${feature.featureId} enabled by admin portal.`
            };
        }
        if (action === "approval") {
            return {
                enabled: false,
                status: "approval_required",
                approvalRequired: true,
                reason: `${feature.featureId} requires admin approval.`
            };
        }
        return {
            enabled: false,
            status: "disabled",
            approvalRequired: false,
            reason: `${feature.featureId} paused by admin portal.`
        };
    }

    function bindEvents() {
        document.addEventListener("input", (event) => {
            if (event.target && event.target.id === "adminAzFeatureSearch") {
                state.query = event.target.value || "";
                render();
            }
        });
        document.addEventListener("change", (event) => {
            if (event.target && event.target.id === "adminAzFeatureCategory") {
                state.category = event.target.value || "all";
                render();
            }
            if (event.target && event.target.id === "adminAzFeatureStatus") {
                state.status = event.target.value || "all";
                render();
            }
        });
        document.addEventListener("click", (event) => {
            const bulk = event.target.closest("[data-az-bulk]");
            if (bulk) {
                const action = bulk.getAttribute("data-az-bulk");
                filteredCatalog().slice(0, MAX_RENDER_ROWS).forEach((feature) => {
                    saveFeatureControl(feature, actionPatch(action, feature));
                });
                return;
            }

            const button = event.target.closest("[data-az-action]");
            if (!button) return;
            const feature = findFeature(button.getAttribute("data-category"), button.getAttribute("data-feature-id"));
            if (!feature) return;
            const action = button.getAttribute("data-az-action");
            if (action === "edit") {
                const current = getControl(feature);
                const note = window.prompt("Admin note / correction", current.correction || current.reason || "");
                if (note === null) return;
                saveFeatureControl(feature, {
                    correction: cleanText(note),
                    reason: cleanText(note) || current.reason || `${feature.featureId} note updated by admin.`
                });
                return;
            }
            saveFeatureControl(feature, actionPatch(action, feature));
        });
    }

    async function loadCatalog() {
        try {
            const backendItems = await fetchBackendCatalog();
            if (backendItems && backendItems.length) {
                state.catalog = mergeCatalog(coreCatalogItems(), backendItems);
                mergeBackendControls(backendItems);
                return;
            }
        } catch (_error) {
            state.backendOnline = false;
        }
        state.catalog = mergeCatalog(coreCatalogItems(), await fetchStaticCatalog());
    }

    async function loadCatalogAndRender() {
        if (state.loading || state.loaded) return;
        state.loading = true;
        installStyles();
        ensurePanel();
        try {
            await loadCatalog();
            state.loaded = true;
            mirrorIntoAdminBridgeStore(readStore());
            render();
        } finally {
            state.loading = false;
        }
    }

    function requestCatalogLoad() {
        scheduleIdle(loadCatalogAndRender);
    }

    function init() {
        installStyles();
        ensurePanel();
        bindEvents();
        const portalNav = document.querySelector('[data-view="portals"]');
        if (portalNav) portalNav.addEventListener("click", requestCatalogLoad, { once: true });
        scheduleIdle(loadCatalogAndRender, CATALOG_IDLE_DELAY_MS);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.AdminFeatureControlCenter = {
        keys: { STORE_KEY, LOCAL_EVENT },
        readStore,
        writeStore,
        getControl,
        saveFeatureControl,
        render
    };
})();
