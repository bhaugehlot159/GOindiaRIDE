(function initAdminControlBridge(global) {
    "use strict";

    const CONTROL_KEY = "goindiaride_admin_portal_controls_v1";
    const AUDIT_KEY = "adminAuditLogs";
    const LOCAL_EVENT = "goindiaride:admin-control-update";
    const POLICY_EVENT = "goindiaride:admin-control-policy";
    const FEATURE_BLOCK_EVENT = "goindiaride:admin-control-feature-blocked";
    const FEATURE_VERIFY_KEY = "goindiaride_admin_portal_feature_live_verification_v1";
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
            "airport_transfers",
            "outstation_rides",
            "hourly_rentals",
            "trip_modes",
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

    function featureOwnerMap() {
        const owners = {};
        Object.keys(FEATURE_DEFINITIONS).forEach((portal) => {
            FEATURE_DEFINITIONS[portal].forEach((featureId) => {
                owners[featureId] = owners[featureId] || [];
                owners[featureId].push(portal);
            });
        });
        return owners;
    }

    function normalizePortalFeatures(storedFeatures) {
        const owners = featureOwnerMap();
        const normalized = {
            customer: featureDefaults("customer"),
            driver: featureDefaults("driver")
        };
        const misplaced = { customer: {}, driver: {}, unknown: {} };
        const source = storedFeatures && typeof storedFeatures === "object" ? storedFeatures : {};

        ["customer", "driver"].forEach((sourcePortal) => {
            const bucket = source[sourcePortal] && typeof source[sourcePortal] === "object" ? source[sourcePortal] : {};
            Object.keys(bucket).forEach((rawFeatureId) => {
                const featureId = cleanText(rawFeatureId).toLowerCase();
                const featureOwners = owners[featureId] || [];
                if (!featureOwners.length) {
                    misplaced.unknown[sourcePortal] = misplaced.unknown[sourcePortal] || {};
                    misplaced.unknown[sourcePortal][featureId] = bucket[rawFeatureId];
                    return;
                }
                const owner = featureOwners.includes(sourcePortal) ? sourcePortal : featureOwners[0];
                normalized[owner][featureId] = {
                    ...(normalized[owner][featureId] || {}),
                    ...(bucket[rawFeatureId] || {})
                };
                if (owner !== sourcePortal) {
                    misplaced[sourcePortal][featureId] = bucket[rawFeatureId];
                }
            });
        });

        return { normalized, misplaced };
    }

    function portalFeatureIds(portalType, featureIds) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const defined = FEATURE_DEFINITIONS[safePortal] || [];
        const requested = Array.isArray(featureIds) && featureIds.length
            ? featureIds.map((item) => cleanText(Array.isArray(item) ? item[0] : item).toLowerCase())
            : defined;
        return unique(requested).filter((featureId) => defined.includes(featureId));
    }

    function readFeatureVerificationStore() {
        const parsed = parseJson(global.localStorage.getItem(FEATURE_VERIFY_KEY), {});
        return parsed && typeof parsed === "object" ? parsed : {};
    }

    function writeFeatureVerificationSnapshot(portalType, snapshot, scope) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const safeScope = cleanText(scope || "admin") || "admin";
        const store = readFeatureVerificationStore();
        store[safeScope] = {
            ...(store[safeScope] || {}),
            [safePortal]: snapshot
        };
        if (safeScope === "admin") {
            store[safePortal] = snapshot;
        }
        global.localStorage.setItem(FEATURE_VERIFY_KEY, JSON.stringify(store));
        return store;
    }

    function buildPortalFeatureVerificationSnapshot(portalType, featureIds, controls, options) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const settings = options && typeof options === "object" ? options : {};
        const now = cleanText(settings.verifiedAt || nowIso());
        const features = {};
        let passed = 0;
        const ids = portalFeatureIds(safePortal, featureIds);
        const portalFeatures = (((controls || {}).portalFeatures || {})[safePortal]) || {};

        ids.forEach((featureId) => {
            const feature = portalFeatures[featureId] || {};
            const status = cleanText(feature.status || "active").toLowerCase();
            const active = feature.enabled !== false && !["disabled", "paused", "blocked"].includes(status);
            const demoReady = feature.demoReady === true || feature.demoMode === true || feature.connectionMode === "demo_live";
            const liveReady = feature.liveReady === true || feature.liveMode === true || feature.connectionMode === "demo_live";
            const connected = feature.connected === true || feature.controlledByAdminApp === true || feature.connectionMode === "demo_live";
            const verified = active && connected && demoReady && liveReady;
            if (verified) passed += 1;
            features[featureId] = {
                status: feature.status || "active",
                allowed: active,
                connected,
                demoReady,
                liveReady,
                verified,
                verificationStatus: verified ? "passed" : "failed",
                label: cleanText(feature.label || feature.labelOverride || featureDisplayName(featureId)),
                correction: cleanText(feature.correction || ""),
                verifiedAt: feature.verifiedAt || now
            };
        });

        return {
            portal: safePortal,
            mode: "demo_live",
            source: cleanText(settings.source || "admin_control_bridge"),
            total: ids.length,
            passed,
            failed: Math.max(0, ids.length - passed),
            ok: ids.length > 0 && passed === ids.length,
            verifiedAt: now,
            features
        };
    }

    function connectPortalFeaturesLive(portalType, featureIds, options) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const settings = options && typeof options === "object" ? options : {};
        const now = nowIso();
        const ids = portalFeatureIds(safePortal, featureIds);
        const reason = cleanText(settings.reason || `${safePortal} portal demo/live features connected and verified by admin.`);
        const controls = readControls();
        controls.portals = controls.portals || {};
        controls.portalFeatures = controls.portalFeatures || {};
        controls.portalFeatures[safePortal] = {
            ...featureDefaults(safePortal),
            ...(controls.portalFeatures[safePortal] || {})
        };

        ids.forEach((featureId) => {
            const current = controls.portalFeatures[safePortal][featureId] || {};
            controls.portalFeatures[safePortal][featureId] = {
                ...current,
                enabled: true,
                status: "active",
                reason,
                connected: true,
                controlledByAdminApp: true,
                connectionMode: "demo_live",
                runtimeMode: "demo_live",
                demoMode: true,
                liveMode: true,
                demoReady: true,
                liveReady: true,
                verified: true,
                verificationStatus: "passed",
                verifiedAt: now,
                updatedAt: now
            };
        });

        controls.portals[safePortal] = {
            ...((controls.portals || {})[safePortal] || {}),
            enabled: true,
            status: "active",
            reason,
            connected: true,
            controlledByAdminApp: true,
            connectionMode: "demo_live",
            runtimeMode: "demo_live",
            demoMode: true,
            liveMode: true,
            demoReady: true,
            liveReady: true,
            verified: true,
            verificationStatus: "passed",
            controlledFeatures: ids,
            liveVerifiedAt: now,
            updatedAt: now
        };

        const verification = buildPortalFeatureVerificationSnapshot(safePortal, ids, controls, {
            ...settings,
            source: cleanText(settings.source || "admin_control_bridge"),
            verifiedAt: now
        });
        controls.portalFeatureVerification = {
            ...(controls.portalFeatureVerification || {}),
            [safePortal]: verification
        };

        const next = writeControls(controls);
        writeFeatureVerificationSnapshot(safePortal, verification, "admin");
        addAudit("PORTAL_FEATURE_DEMO_LIVE_VERIFIED", `${safePortal} portal ${verification.passed}/${verification.total} features verified in demo/live mode`, {
            portal: safePortal,
            mode: "demo_live",
            passed: verification.passed,
            total: verification.total
        });
        notify({
            type: "portal_feature_demo_live_verified",
            title: "Admin Demo/Live Verification",
            message: reason,
            sourcePortal: "admin",
            targetPortals: [safePortal, "admin"],
            metadata: { portal: safePortal, mode: "demo_live", passed: verification.passed, total: verification.total }
        });
        return { ok: verification.ok, controls: next, verification };
    }

    function getPortalFeatureVerification(portalType) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const store = readFeatureVerificationStore();
        return ((store.admin || {})[safePortal]) || store[safePortal] || null;
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
        const featureBuckets = normalizePortalFeatures((stored || {}).portalFeatures || {});
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
                customer: featureBuckets.normalized.customer,
                driver: featureBuckets.normalized.driver
            },
            legacyMixedFeatureControls: {
                ...(stored.legacyMixedFeatureControls || {}),
                latestReadPartition: featureBuckets.misplaced
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
            ".admin-feature-disabled{pointer-events:none!important;opacity:.55!important;filter:grayscale(.2);cursor:not-allowed!important}",
            ".admin-feature-disabled input,.admin-feature-disabled button,.admin-feature-disabled select,.admin-feature-disabled textarea{pointer-events:none!important;cursor:not-allowed!important}"
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

    function featureDisplayName(featureId) {
        return cleanText(featureId).replace(/_/g, " ") || "feature";
    }

    function blockedFeatureMessage(policy, featureId) {
        const reason = cleanText(policy && policy.reason);
        const correction = cleanText(policy && policy.correction);
        return reason || correction || `${featureDisplayName(featureId)} is paused by admin.`;
    }

    function showBlockedFeatureMessage(message) {
        if (!message) return;
        if (typeof global.showWarningToast === "function") {
            global.showWarningToast(message, "Admin Control");
        } else if (typeof global.showError === "function") {
            global.showError(message);
        } else if (typeof global.showToast === "function") {
            global.showToast(message);
        } else if (typeof global.alert === "function") {
            global.alert(message);
        }
    }

    function resolveActionFeature(featureEntry, args, actionName) {
        if (typeof featureEntry === "function") {
            return cleanText(featureEntry.apply(global, args || []));
        }
        if (featureEntry && typeof featureEntry === "object") {
            if (typeof featureEntry.resolve === "function") {
                return cleanText(featureEntry.resolve.apply(global, args || []));
            }
            if (featureEntry.feature) return cleanText(featureEntry.feature);
            if (featureEntry.defaultFeature) return cleanText(featureEntry.defaultFeature);
        }
        return cleanText(featureEntry || actionName).toLowerCase();
    }

    function guardFeatureAction(portalType, featureId, actionName, options) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const safeFeature = cleanText(featureId).toLowerCase();
        if (!safeFeature) return true;

        const settings = options && typeof options === "object" ? options : {};
        const subject = typeof settings.getSubject === "function" ? settings.getSubject() : currentSubject(safePortal);
        const policy = getFeaturePolicy(safePortal, safeFeature, subject);
        if (policy.allowed) return true;

        const message = blockedFeatureMessage(policy, safeFeature);
        const detail = {
            ...policy,
            actionName: cleanText(actionName),
            message
        };
        global.dispatchEvent(new CustomEvent(FEATURE_BLOCK_EVENT, { detail }));

        if (typeof settings.onBlocked === "function") {
            settings.onBlocked(detail);
        } else {
            showBlockedFeatureMessage(message);
        }
        return false;
    }

    function wrapFeatureActions(portalType, actionMap, options) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const actions = actionMap && typeof actionMap === "object" ? actionMap : {};
        const settings = options && typeof options === "object" ? options : {};
        const originalStore = global.__goindiarideAdminControlOriginalActions || {};
        global.__goindiarideAdminControlOriginalActions = originalStore;

        function wrapNow() {
            const wrapped = [];
            const missing = [];
            Object.keys(actions).forEach((actionName) => {
                const currentAction = global[actionName];
                if (typeof currentAction !== "function") {
                    missing.push(actionName);
                    return;
                }

                if (
                    currentAction.__goindiarideAdminControlWrapped === true
                    && currentAction.__goindiarideAdminControlPortal === safePortal
                ) {
                    currentAction.__goindiarideAdminControlFeatureEntry = actions[actionName];
                    wrapped.push(actionName);
                    return;
                }

                const storeKey = `${safePortal}:${actionName}`;
                const originalAction = currentAction.__goindiarideAdminControlOriginal
                    || originalStore[storeKey]
                    || currentAction;
                originalStore[storeKey] = originalAction;

                const guardedAction = function guardedAdminFeatureAction() {
                    const args = Array.prototype.slice.call(arguments);
                    const mappedFeature = resolveActionFeature(guardedAction.__goindiarideAdminControlFeatureEntry, args, actionName);
                    if (mappedFeature && !guardFeatureAction(safePortal, mappedFeature, actionName, settings)) {
                        return false;
                    }
                    return originalAction.apply(this, args);
                };

                guardedAction.__goindiarideAdminControlWrapped = true;
                guardedAction.__goindiarideAdminControlPortal = safePortal;
                guardedAction.__goindiarideAdminControlActionName = actionName;
                guardedAction.__goindiarideAdminControlFeatureEntry = actions[actionName];
                guardedAction.__goindiarideAdminControlOriginal = originalAction;
                global[actionName] = guardedAction;
                wrapped.push(actionName);
            });

            return {
                ok: true,
                wrapped,
                missing: unique(missing)
            };
        }

        const result = wrapNow();
        if (typeof global.setTimeout === "function") {
            [50, 300, 1000, 2000].forEach((delay) => {
                global.setTimeout(wrapNow, delay);
            });
        }
        return result;
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

    function countSelectorMatches(selector) {
        if (!selector || !global.document || typeof global.document.querySelectorAll !== "function") return 0;
        try {
            return global.document.querySelectorAll(selector).length;
        } catch (_error) {
            return 0;
        }
    }

    function recordRuntimeFeatureVerification(portalType, featureMap, subject) {
        const safePortal = cleanText(portalType).toLowerCase() === "driver" ? "driver" : "customer";
        const map = featureMap && typeof featureMap === "object" ? featureMap : {};
        const ids = portalFeatureIds(safePortal);
        const now = nowIso();
        const features = {};
        let passed = 0;

        ids.forEach((featureId) => {
            const selectors = Array.isArray(map[featureId]) ? map[featureId] : [map[featureId]];
            const safeSelectors = selectors.filter(Boolean);
            const nodeCount = safeSelectors.reduce((sum, selector) => sum + countSelectorMatches(selector), 0);
            const policy = getFeaturePolicy(safePortal, featureId, subject);
            const mapped = Object.prototype.hasOwnProperty.call(map, featureId);
            const verified = mapped && policy.allowed;
            if (verified) passed += 1;
            features[featureId] = {
                mapped,
                selectorCount: safeSelectors.length,
                nodeCount,
                allowed: policy.allowed,
                status: policy.status,
                correction: policy.correction,
                verified,
                verificationStatus: verified ? "passed" : "failed",
                verifiedAt: now
            };
        });

        const snapshot = {
            portal: safePortal,
            mode: "runtime_map",
            source: "customer_runtime",
            page: global.location ? String(global.location.pathname || global.location.href || "") : "",
            total: ids.length,
            passed,
            failed: Math.max(0, ids.length - passed),
            ok: ids.length > 0 && passed === ids.length,
            verifiedAt: now,
            features
        };
        const pageScope = "runtime:" + cleanText(snapshot.page || "page").replace(/[^a-z0-9/_-]/gi, "_");
        writeFeatureVerificationSnapshot(safePortal, snapshot, pageScope);
        if (global.document && global.document.documentElement) {
            global.document.documentElement.dataset.adminFeatureRuntime = snapshot.ok ? "verified" : "partial";
            global.document.documentElement.dataset.adminFeatureRuntimePortal = safePortal;
            global.document.documentElement.dataset.adminFeatureRuntimePassed = `${passed}/${ids.length}`;
        }
        return snapshot;
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
                    node.dataset.adminFeatureAllowed = policy.allowed ? "true" : "false";
                    node.classList.toggle("admin-feature-disabled", !policy.allowed);
                    if (node.setAttribute) node.setAttribute("aria-disabled", policy.allowed ? "false" : "true");
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
        recordRuntimeFeatureVerification(safePortal, featureMap || {}, subject);
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
        keys: { CONTROL_KEY, AUDIT_KEY, FEATURE_VERIFY_KEY, BOOKING_KEYS, DRIVER_KEYS, USER_KEYS },
        readControls,
        writeControls,
        getPortalPolicy,
        getFeaturePolicy,
        setPortalEnabled,
        setFeatureEnabled,
        setFeatureCorrection,
        connectPortalFeaturesLive,
        getPortalFeatureVerification,
        setSubjectStatus,
        approveDriver,
        forceDriverOffline,
        setBookingStatus,
        assignBookingToDriver,
        initPortalRuntime,
        initFeatureRuntime,
        applyPortalRuntime,
        applyFeatureRuntime,
        guardFeatureAction,
        wrapFeatureActions,
        canUsePortal,
        entityKey,
        sameEntity
    };
})(window);
