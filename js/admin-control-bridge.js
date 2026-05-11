(function initAdminControlBridge(global) {
    "use strict";

    const CONTROL_KEY = "goindiaride_admin_portal_controls_v1";
    const AUDIT_KEY = "adminAuditLogs";
    const LOCAL_EVENT = "goindiaride:admin-control-update";
    const POLICY_EVENT = "goindiaride:admin-control-policy";
    const BOOKING_KEYS = [
        "bookings",
        "goride_bookings",
        "goindiaride_admin_review_inbox_v1",
        "adminDemoBookings",
        "goindiaride_active_bookings",
        "goindiaride_scheduled_rides",
        "goindiaride_ride_history",
        "customerBookings",
        "customer_bookings"
    ];
    const DRIVER_KEYS = ["drivers", "goride_drivers", "adminDemoDrivers"];
    const USER_KEYS = ["users", "goride_users", "adminDemoUsers"];
    const FEATURE_DEFINITIONS = {
        customer: [
            "home_dashboard",
            "booking",
            "quick_booking",
            "saved_places",
            "fare_estimator",
            "active_rides",
            "scheduled_rides",
            "ride_history",
            "wallet",
            "wallet_topup",
            "wallet_withdrawal",
            "wallet_transfer",
            "rewards",
            "messages",
            "donations",
            "split_fare",
            "tourism",
            "travel_card",
            "temple_timings",
            "cultural_guide",
            "local_events",
            "tour_packages",
            "heritage_walks",
            "food_guide",
            "shopping_guide",
            "profile",
            "ride_preferences",
            "emergency_contacts",
            "notifications",
            "customer_support",
            "emergency"
        ],
        driver: ["availability", "booking_requests", "active_trips", "earnings", "kyc", "wallet", "messages", "safety"]
    };

    function nowIso() {
        return new Date().toISOString();
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
        const parsed = parseJson(global.localStorage.getItem(key), []);
        return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
    }

    function writeArray(key, rows) {
        if (Array.isArray(rows)) {
            global.localStorage.setItem(key, JSON.stringify(rows));
        }
    }

    function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function normalizeEmail(value) {
        return cleanText(value).toLowerCase();
    }

    function normalizePhone(value) {
        const raw = cleanText(value);
        if (!raw) return "";
        const compact = raw.replace(/\s+/g, "");
        if (compact.charAt(0) === "+") {
            const digits = compact.slice(1).replace(/\D/g, "");
            return digits ? `+${digits}` : "";
        }
        const digits = compact.replace(/\D/g, "");
        if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
        return digits ? `+${digits}` : "";
    }

    function unique(values) {
        return Array.from(new Set(values.map((item) => cleanText(item)).filter(Boolean)));
    }

    function identityTokens(entity) {
        const source = entity && typeof entity === "object" ? entity : {};
        return {
            ids: unique([
                source.id,
                source._id,
                source.userId,
                source.customerId,
                source.driverId,
                source.backendUserId,
                source.uid
            ]),
            emails: unique([
                source.email,
                source.userEmail,
                source.customerEmail,
                source.driverEmail
            ].map(normalizeEmail)),
            phones: unique([
                source.phone,
                source.mobile,
                source.contact,
                source.customerPhone,
                source.driverPhone
            ].map(normalizePhone))
        };
    }

    function entityKey(entity) {
        if (typeof entity === "string") return cleanText(entity).toLowerCase();
        const tokens = identityTokens(entity);
        return (tokens.ids[0] || tokens.emails[0] || tokens.phones[0] || "").toLowerCase();
    }

    function sameEntity(row, subject) {
        const left = identityTokens(row);
        const right = identityTokens(subject);
        return left.ids.some((id) => right.ids.includes(id))
            || left.emails.some((email) => right.emails.includes(email))
            || left.phones.some((phone) => right.phones.includes(phone));
    }

    function featureDefaults(portalType) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        return (FEATURE_DEFINITIONS[safePortal] || []).reduce((acc, featureId) => {
            acc[featureId] = { enabled: true, status: "active", reason: "", updatedAt: "" };
            return acc;
        }, {});
    }

    function defaultControls() {
        return {
            version: 1,
            updatedAt: nowIso(),
            portals: {
                customer: { enabled: true, status: "active", reason: "", updatedAt: "" },
                driver: { enabled: true, status: "active", reason: "", updatedAt: "" }
            },
            portalFeatures: {
                customer: featureDefaults("customer"),
                driver: featureDefaults("driver")
            },
            customers: {},
            drivers: {},
            bookings: {}
        };
    }

    function readControls() {
        const defaults = defaultControls();
        const stored = parseJson(global.localStorage.getItem(CONTROL_KEY), {});
        return {
            ...defaults,
            ...stored,
            portals: {
                ...defaults.portals,
                ...(stored.portals || {}),
                customer: { ...defaults.portals.customer, ...((stored.portals || {}).customer || {}) },
                driver: { ...defaults.portals.driver, ...((stored.portals || {}).driver || {}) }
            },
            portalFeatures: {
                customer: {
                    ...defaults.portalFeatures.customer,
                    ...(((stored.portalFeatures || {}).customer) || {})
                },
                driver: {
                    ...defaults.portalFeatures.driver,
                    ...(((stored.portalFeatures || {}).driver) || {})
                }
            },
            customers: { ...(stored.customers || {}) },
            drivers: { ...(stored.drivers || {}) },
            bookings: { ...(stored.bookings || {}) }
        };
    }

    function writeControls(nextControls) {
        const controls = {
            ...readControls(),
            ...(nextControls || {}),
            updatedAt: nowIso()
        };
        global.localStorage.setItem(CONTROL_KEY, JSON.stringify(controls));
        global.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: { controls } }));
        return controls;
    }

    function addAudit(action, details, metadata) {
        const rows = readArray(AUDIT_KEY);
        rows.unshift({
            action,
            details,
            metadata: metadata || {},
            timestamp: nowIso(),
            source: "admin_control_bridge"
        });
        writeArray(AUDIT_KEY, rows);
    }

    function notify(payload) {
        if (!global.PortalConnector || typeof global.PortalConnector.createNotification !== "function") return null;
        return global.PortalConnector.createNotification(payload);
    }

    function patchRows(keys, matcher, patcher) {
        let touched = false;
        keys.forEach((key) => {
            const rows = readArray(key);
            if (!rows.length) return;
            let changed = false;
            const nextRows = rows.map((row) => {
                if (!matcher(row, key)) return row;
                changed = true;
                touched = true;
                return {
                    ...row,
                    ...patcher(row, key),
                    updatedAt: nowIso()
                };
            });
            if (changed) writeArray(key, nextRows);
        });
        return touched;
    }

    function currentSubject(portalType, explicitSubject) {
        if (explicitSubject && typeof explicitSubject === "object") return explicitSubject;
        if (portalType === "driver") {
            return parseJson(global.localStorage.getItem("currentDriver"), null)
                || parseJson(global.localStorage.getItem("driver_data"), null)
                || {};
        }
        return parseJson(global.localStorage.getItem("currentUser"), null)
            || parseJson(global.localStorage.getItem("goindiaride.profile.runtime"), null)
            || {};
    }

    function getPortalPolicy(portalType, subject) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const controls = readControls();
        const portal = controls.portals[safePortal] || {};
        const key = entityKey(subject || currentSubject(safePortal));
        const scoped = key ? (safePortal === "driver" ? controls.drivers[key] : controls.customers[key]) || {} : {};
        const status = cleanText(scoped.status || portal.status || "active").toLowerCase();
        const allowed = portal.enabled !== false
            && scoped.enabled !== false
            && !["suspended", "blocked", "offline_forced", "disabled"].includes(status);

        return {
            portal: safePortal,
            subjectKey: key,
            allowed,
            status,
            reason: cleanText(scoped.reason || portal.reason || ""),
            portalControl: portal,
            subjectControl: scoped,
            updatedAt: scoped.updatedAt || portal.updatedAt || controls.updatedAt
        };
    }

    function getFeaturePolicy(portalType, featureId, subject) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const safeFeature = cleanText(featureId).toLowerCase();
        const portalPolicy = getPortalPolicy(safePortal, subject);
        const controls = readControls();
        const feature = (((controls.portalFeatures || {})[safePortal]) || {})[safeFeature] || {};
        const status = cleanText(feature.status || "active").toLowerCase();
        const featureAllowed = feature.enabled !== false && !["disabled", "paused", "blocked"].includes(status);
        return {
            portal: safePortal,
            feature: safeFeature,
            allowed: portalPolicy.allowed && featureAllowed,
            portalAllowed: portalPolicy.allowed,
            status,
            reason: cleanText(feature.reason || portalPolicy.reason || ""),
            correction: cleanText(feature.correction || ""),
            labelOverride: cleanText(feature.labelOverride || ""),
            updatedAt: feature.updatedAt || portalPolicy.updatedAt
        };
    }

    function setPortalEnabled(portalType, enabled, reason) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const controls = readControls();
        controls.portals[safePortal] = {
            ...(controls.portals[safePortal] || {}),
            enabled: Boolean(enabled),
            status: enabled ? "active" : "disabled",
            reason: cleanText(reason),
            updatedAt: nowIso()
        };
        const next = writeControls(controls);
        const label = `${safePortal} portal ${enabled ? "enabled" : "disabled"}`;
        addAudit("PORTAL_ACCESS_CHANGED", label, { portal: safePortal, enabled: Boolean(enabled), reason: cleanText(reason) });
        notify({
            type: enabled ? "portal_enabled_by_admin" : "portal_disabled_by_admin",
            title: "Admin Portal Control",
            message: reason || label,
            sourcePortal: "admin",
            targetPortals: [safePortal, "admin"],
            metadata: { portal: safePortal, enabled: Boolean(enabled), reason: cleanText(reason) }
        });
        return next;
    }

    function setFeatureEnabled(portalType, featureId, enabled, reason) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const safeFeature = cleanText(featureId).toLowerCase();
        if (!safeFeature) return { ok: false, reason: "missing_feature" };
        const controls = readControls();
        controls.portalFeatures = controls.portalFeatures || {};
        controls.portalFeatures[safePortal] = {
            ...featureDefaults(safePortal),
            ...(controls.portalFeatures[safePortal] || {})
        };
        controls.portalFeatures[safePortal][safeFeature] = {
            ...(controls.portalFeatures[safePortal][safeFeature] || {}),
            enabled: Boolean(enabled),
            status: enabled ? "active" : "disabled",
            reason: cleanText(reason),
            updatedAt: nowIso()
        };
        const next = writeControls(controls);
        addAudit("PORTAL_FEATURE_CHANGED", `${safePortal} feature ${safeFeature} ${enabled ? "enabled" : "disabled"}`, {
            portal: safePortal,
            feature: safeFeature,
            enabled: Boolean(enabled),
            reason: cleanText(reason)
        });
        notify({
            type: "portal_feature_control_update",
            title: "Admin Feature Control",
            message: reason || `${safeFeature.replace(/_/g, " ")} ${enabled ? "enabled" : "paused"} by admin.`,
            sourcePortal: "admin",
            targetPortals: [safePortal, "admin"],
            metadata: { portal: safePortal, feature: safeFeature, enabled: Boolean(enabled), reason: cleanText(reason) }
        });
        return { ok: true, controls: next };
    }

    function setFeatureCorrection(portalType, featureId, correction, options) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const safeFeature = cleanText(featureId).toLowerCase();
        const safeCorrection = cleanText(correction);
        const settings = options && typeof options === "object" ? options : {};
        if (!safeFeature) return { ok: false, reason: "missing_feature" };

        const controls = readControls();
        controls.portalFeatures = controls.portalFeatures || {};
        controls.portalFeatures[safePortal] = {
            ...featureDefaults(safePortal),
            ...(controls.portalFeatures[safePortal] || {})
        };

        const current = controls.portalFeatures[safePortal][safeFeature] || {};
        const currentReason = cleanText(current.reason || "");
        const currentCorrection = cleanText(current.correction || "");
        const nextReason = safeCorrection
            ? cleanText(settings.reason || safeCorrection)
            : (currentReason === currentCorrection ? "" : currentReason);
        controls.portalFeatures[safePortal][safeFeature] = {
            ...current,
            correction: safeCorrection,
            reason: nextReason,
            labelOverride: cleanText(settings.labelOverride || current.labelOverride || ""),
            correctedAt: nowIso(),
            updatedAt: nowIso()
        };

        const next = writeControls(controls);
        const message = safeCorrection || `${safeFeature.replace(/_/g, " ")} correction cleared by admin.`;
        addAudit("PORTAL_FEATURE_CORRECTION", `${safePortal} feature ${safeFeature} correction updated by admin`, {
            portal: safePortal,
            feature: safeFeature,
            correction: safeCorrection,
            labelOverride: cleanText(settings.labelOverride || "")
        });
        notify({
            type: "portal_feature_correction_update",
            title: "Admin Feature Correction",
            message,
            sourcePortal: "admin",
            targetPortals: [safePortal, "admin"],
            metadata: {
                portal: safePortal,
                feature: safeFeature,
                correction: safeCorrection,
                labelOverride: cleanText(settings.labelOverride || "")
            }
        });
        return { ok: true, controls: next };
    }

    function setSubjectStatus(portalType, subject, status, reason) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const key = entityKey(subject);
        if (!key) return { ok: false, reason: "missing_subject" };
        const safeStatus = cleanText(status || "active").toLowerCase();
        const controls = readControls();
        const bucketName = safePortal === "driver" ? "drivers" : "customers";
        controls[bucketName][key] = {
            ...(controls[bucketName][key] || {}),
            enabled: !["suspended", "blocked", "offline_forced", "disabled"].includes(safeStatus),
            status: safeStatus,
            reason: cleanText(reason),
            subject: {
                id: identityTokens(subject).ids[0] || "",
                email: identityTokens(subject).emails[0] || "",
                phone: identityTokens(subject).phones[0] || "",
                name: cleanText(subject.name || subject.fullname || subject.driverName || subject.customerName)
            },
            updatedAt: nowIso()
        };

        const targetKeys = safePortal === "driver" ? DRIVER_KEYS : USER_KEYS;
        patchRows(targetKeys, (row) => sameEntity(row, subject), () => ({
            adminControlStatus: safeStatus,
            portalAccess: controls[bucketName][key].enabled ? "enabled" : "disabled",
            adminControlReason: cleanText(reason)
        }));

        writeControls(controls);
        addAudit(`${safePortal.toUpperCase()}_ACCESS_CHANGED`, `${safePortal} ${key} set to ${safeStatus}`, { key, status: safeStatus, reason: cleanText(reason) });
        notify({
            type: `${safePortal}_access_update`,
            title: "Admin Access Update",
            message: reason || `Your ${safePortal} portal status is ${safeStatus}.`,
            sourcePortal: "admin",
            targetPortals: [safePortal, "admin"],
            metadata: { portal: safePortal, subjectKey: key, status: safeStatus, reason: cleanText(reason) }
        });
        return { ok: true, controls: readControls() };
    }

    function approveDriver(subject, reason) {
        const result = setSubjectStatus("driver", subject, "approved", reason || "Driver approved by admin.");
        if (!result.ok) return result;
        patchRows(DRIVER_KEYS, (row) => sameEntity(row, subject), () => ({
            approvalStatus: "approved",
            status: "approved",
            verified: true,
            verifiedAt: nowIso(),
            adminControlStatus: "approved"
        }));
        notify({
            type: "driver_approval_update",
            title: "Driver Approved",
            message: reason || "Your driver profile is approved by admin.",
            sourcePortal: "admin",
            targetPortals: ["driver", "admin"],
            metadata: { status: "approved", subjectKey: entityKey(subject) }
        });
        return result;
    }

    function forceDriverOffline(subject, reason) {
        const result = setSubjectStatus("driver", subject, "offline_forced", reason || "Admin forced driver offline.");
        if (!result.ok) return result;
        patchRows(DRIVER_KEYS, (row) => sameEntity(row, subject), () => ({
            isOnline: false,
            online: false,
            adminForceOffline: true,
            adminControlStatus: "offline_forced"
        }));

        const currentDriver = currentSubject("driver");
        if (sameEntity(currentDriver, subject)) {
            const driverData = parseJson(global.localStorage.getItem("driver_data"), {});
            global.localStorage.setItem("driver_data", JSON.stringify({
                ...driverData,
                isOnline: false,
                adminForceOffline: true,
                adminControlStatus: "offline_forced",
                adminControlReason: cleanText(reason)
            }));
            global.localStorage.setItem("online_status", "false");
        }
        return result;
    }

    function setBookingStatus(bookingId, status, details) {
        const id = cleanText(bookingId);
        if (!id) return { ok: false, reason: "missing_booking_id" };
        const safeStatus = cleanText(status || "pending").toLowerCase();
        const meta = details && typeof details === "object" ? details : {};
        const patch = {
            status: safeStatus,
            adminReviewStatus: safeStatus === "approved" ? "approved" : safeStatus === "rejected" ? "rejected" : meta.adminReviewStatus || safeStatus,
            adminDecision: meta.decision || `admin_${safeStatus}`,
            adminDecisionAt: nowIso(),
            adminControlReason: cleanText(meta.reason || "")
        };
        const touched = patchRows(BOOKING_KEYS, (row) => cleanText(row.id || row.bookingId || row._id) === id, () => patch);
        const controls = readControls();
        controls.bookings[id] = {
            ...(controls.bookings[id] || {}),
            status: safeStatus,
            reason: cleanText(meta.reason || ""),
            updatedAt: nowIso()
        };
        writeControls(controls);
        addAudit("BOOKING_STATUS_CHANGED", `Booking ${id} set to ${safeStatus}`, { bookingId: id, status: safeStatus, touched });
        notify({
            type: "booking_admin_status_update",
            title: "Booking Status Updated",
            message: meta.reason || `Booking ${id} status changed to ${safeStatus}.`,
            sourcePortal: "admin",
            targetPortals: ["customer", "driver", "admin"],
            booking: { id, bookingId: id, ...patch },
            metadata: { bookingId: id, status: safeStatus }
        });
        return { ok: true, touched };
    }

    function assignBookingToDriver(bookingId, driver, reason) {
        const id = cleanText(bookingId);
        const driverKey = entityKey(driver);
        if (!id || !driverKey) return { ok: false, reason: "missing_booking_or_driver" };
        const driverName = cleanText(driver.name || driver.fullname || driver.driverName || "Driver");
        const patch = {
            status: "driver_assigned",
            adminReviewStatus: "approved",
            driverId: identityTokens(driver).ids[0] || driverKey,
            driverName,
            assignedAt: nowIso(),
            adminControlReason: cleanText(reason)
        };
        const touched = patchRows(BOOKING_KEYS, (row) => cleanText(row.id || row.bookingId || row._id) === id, () => patch);
        addAudit("BOOKING_DRIVER_ASSIGNED", `Booking ${id} assigned to ${driverName}`, { bookingId: id, driverKey, touched });
        notify({
            type: "driver_assigned",
            title: "Driver Assigned",
            message: reason || `Booking ${id} assigned to ${driverName}.`,
            sourcePortal: "admin",
            targetPortals: ["customer", "driver", "admin"],
            booking: { id, bookingId: id, ...patch },
            metadata: { bookingId: id, driverKey, driverName }
        });
        return { ok: true, touched };
    }

    function injectRuntimeStyles() {
        if (global.document.getElementById("goindiaride-admin-control-style")) return;
        const style = global.document.createElement("style");
        style.id = "goindiaride-admin-control-style";
        style.textContent = [
            ".admin-control-banner{position:sticky;top:0;z-index:20000;display:none;align-items:center;gap:10px;padding:10px 14px;background:#7c2d12;color:#fff;font:700 14px/1.35 Inter,Segoe UI,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.16)}",
            ".admin-control-banner.active{display:flex}",
            ".admin-control-banner i{font-style:normal}",
            "html[data-admin-portal-locked='true'] .admin-lock-sensitive{pointer-events:none;opacity:.55}",
            ".admin-feature-disabled{pointer-events:none!important;opacity:.55!important;filter:grayscale(.2)}",
            ".admin-feature-disabled input,.admin-feature-disabled button,.admin-feature-disabled select,.admin-feature-disabled textarea{pointer-events:none!important}"
        ].join("");
        global.document.head.appendChild(style);
    }

    function ensureBanner() {
        injectRuntimeStyles();
        let banner = global.document.getElementById("goindiarideAdminControlBanner");
        if (!banner) {
            banner = global.document.createElement("div");
            banner.id = "goindiarideAdminControlBanner";
            banner.className = "admin-control-banner";
            banner.innerHTML = "<i>!</i><span></span>";
            global.document.body.insertBefore(banner, global.document.body.firstChild);
        }
        return banner;
    }

    function applyPortalRuntime(portalType, options) {
        const settings = options || {};
        const subject = typeof settings.getSubject === "function" ? settings.getSubject() : currentSubject(portalType);
        const policy = getPortalPolicy(portalType, subject);
        const banner = ensureBanner();
        const message = policy.reason || (policy.allowed ? "" : "Admin has paused this portal. Please contact support.");
        banner.querySelector("span").textContent = message;
        banner.classList.toggle("active", !policy.allowed);
        global.document.documentElement.dataset.adminPortalLocked = policy.allowed ? "false" : "true";
        global.dispatchEvent(new CustomEvent(POLICY_EVENT, { detail: policy }));
        if (!policy.allowed && typeof settings.onBlocked === "function") settings.onBlocked(policy);
        if (policy.allowed && typeof settings.onAllowed === "function") settings.onAllowed(policy);
        return policy;
    }

    function initPortalRuntime(portalType, options) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const apply = () => applyPortalRuntime(safePortal, options || {});
        const controls = readControls();
        controls.portals[safePortal] = {
            ...(controls.portals[safePortal] || {}),
            lastSeenAt: nowIso(),
            lastSeenUrl: global.location ? String(global.location.href || "") : ""
        };
        writeControls(controls);
        apply();
        global.addEventListener("storage", (event) => {
            if (event.key === CONTROL_KEY) apply();
        });
        global.addEventListener(LOCAL_EVENT, apply);
        return apply;
    }

    function applyFeatureRuntime(portalType, featureMap, options) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const settings = options || {};
        const subject = typeof settings.getSubject === "function" ? settings.getSubject() : currentSubject(safePortal);
        injectRuntimeStyles();
        Object.keys(featureMap || {}).forEach((featureId) => {
            const policy = getFeaturePolicy(safePortal, featureId, subject);
            const selectors = Array.isArray(featureMap[featureId]) ? featureMap[featureId] : [featureMap[featureId]];
            selectors.filter(Boolean).forEach((selector) => {
                global.document.querySelectorAll(selector).forEach((node) => {
                    node.dataset.adminFeatureConnected = "true";
                    node.dataset.adminFeature = featureId;
                    if (!Object.prototype.hasOwnProperty.call(node.dataset, "adminOriginalTitle")) {
                        node.dataset.adminOriginalTitle = node.title || "";
                    }
                    node.classList.toggle("admin-feature-disabled", !policy.allowed);
                    if ("disabled" in node && node.dataset.adminOriginalDisabled === undefined) {
                        node.dataset.adminOriginalDisabled = node.disabled ? "true" : "false";
                    }
                    if ("disabled" in node) {
                        node.disabled = !policy.allowed || node.dataset.adminOriginalDisabled === "true";
                    }
                    node.dataset.adminFeatureCorrection = policy.correction || "";
                    node.dataset.adminFeatureLabelOverride = policy.labelOverride || "";
                    node.title = policy.allowed
                        ? (policy.correction ? `Admin note: ${policy.correction}` : node.dataset.adminOriginalTitle)
                        : (policy.reason || policy.correction || "This feature is paused by admin.");
                });
            });
        });
        return readControls();
    }

    function initFeatureRuntime(portalType, featureMap, options) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const apply = () => applyFeatureRuntime(safePortal, featureMap || {}, options || {});
        apply();
        global.addEventListener("storage", (event) => {
            if (event.key === CONTROL_KEY) apply();
        });
        global.addEventListener(LOCAL_EVENT, apply);
        if (global.MutationObserver && global.document && global.document.body) {
            let applyTimer = null;
            const observer = new global.MutationObserver(() => {
                global.clearTimeout(applyTimer);
                applyTimer = global.setTimeout(apply, 80);
            });
            observer.observe(global.document.body, { childList: true, subtree: true });
        }
        return apply;
    }

    function canUsePortal(portalType, subject) {
        return getPortalPolicy(portalType, subject).allowed;
    }

    global.AdminControlBridge = {
        keys: { CONTROL_KEY, AUDIT_KEY, BOOKING_KEYS, DRIVER_KEYS, USER_KEYS },
        readControls,
        writeControls,
        getPortalPolicy,
        getFeaturePolicy,
        setPortalEnabled,
        setFeatureEnabled,
        setFeatureCorrection,
        setSubjectStatus,
        approveDriver,
        forceDriverOffline,
        setBookingStatus,
        assignBookingToDriver,
        initPortalRuntime,
        initFeatureRuntime,
        applyPortalRuntime,
        applyFeatureRuntime,
        canUsePortal,
        entityKey,
        sameEntity
    };
})(window);
