(function initStandaloneAdminApp() {
    "use strict";

    const ADMIN_REVIEW_INBOX_KEY = "goindiaride_admin_review_inbox_v1";
    const SETTINGS_KEY = "goindiaride_admin_app_settings_v1";
    const AUTO_REFRESH_DISABLED_MIGRATION_KEY = "goindiaride_admin_auto_refresh_manual_default_v1";
    const AUDIT_KEY = "adminAuditLogs";
    const BOOKING_KEYS = [
        "bookings",
        "goride_bookings",
        ADMIN_REVIEW_INBOX_KEY,
        "goindiaride_active_bookings",
        "goindiaride_scheduled_rides",
        "goindiaride_ride_history",
        "customerBookings",
        "customer_bookings",
        "adminDemoBookings"
    ];
    const DRIVER_KEYS = ["drivers", "goride_drivers", "adminDemoDrivers"];
    const USER_KEYS = ["users", "goride_users", "adminDemoUsers"];
    const NOTIFICATION_KEY = "goindiaride_portal_notifications";
    const ADMIN_CONNECTION_KEY = "goindiaride_admin_portal_connection_v1";
    const ADMIN_QUEUE_SYNC_SIGNAL_KEY = "goindiaride_admin_review_queue_signal_v1";
    const ADMIN_BOOKING_EDIT_SIGNAL_KEY = "goindiaride_admin_booking_edit_signal_v1";
    const ADMIN_BOOKING_AUTOFILL_MEMORY_KEY = "goindiaride_admin_booking_autofill_memory_v1";
    const ADMIN_BOOKING_AUTOCOMPLETE_SCRIPT_URLS = [
        "../js/locations.js",
        "../js/rajasthan-data.js",
        "../js/data/rajasthan-master-data.js",
        "../js/rajasthan-live-data.js",
        "../js/autocomplete.js?v=20260316-autocomplete-fix2",
        "../js/autocomplete-downward-hotfix.js?v=20260316-livefix1"
    ];
    const CUSTOMER_BOOKING_SPLIT_KEY = "goindiaride_admin_customer_bookings_current_v1";
    const DRIVER_BOOKING_SPLIT_KEY = "goindiaride_admin_driver_bookings_current_v1";
    const BOOKING_SPLIT_VIEW_KEY = "goindiaride_admin_booking_split_views_current_v1";
    const ADMIN_INTERNAL_BOOKING_SCAN_SKIP_KEYS = new Set([
        CUSTOMER_BOOKING_SPLIT_KEY,
        DRIVER_BOOKING_SPLIT_KEY,
        BOOKING_SPLIT_VIEW_KEY
    ]);
    const TOAST_SEEN_KEY = "goindiaride_admin_app_seen_toasts_v1";
    const DEFAULT_API_BASE = "https://goindiaride.onrender.com";
    const ADMIN_AUTO_REFRESH_INTERVAL_MS = 10 * 1000;
    const ADMIN_AUTH_BOOKING_SYNC_INTERVAL_MS = 60 * 1000;
    const CUSTOMER_BOOKING_SYNC_KEYS = [
        "bookings",
        "goride_bookings",
        "goindiaride_active_bookings",
        "customerBookings",
        "customer_bookings"
    ];
    const ADMIN_LOGOUT_KEYS = [
        "currentAdmin",
        "userRole",
        "role",
        "accountType",
        "accessToken",
        "authToken",
        "token",
        "goindiaride_refresh_token",
        "goindiaride_refresh_token_v1",
        "goindiaride_session_continuity_v1",
        "goindiaride_auth_mode",
        "goindiaride_auth_reason",
        "goindiaride_admin_session",
        "goindiaride_admin_otp_context",
        "admin2FAEmail",
        "admin2FAOTP",
        "admin2FAMethod"
    ];
    const PORTAL_FEATURES = ["customer", "driver", "bookings", "finance", "safety"];
    const CUSTOMER_FEATURES = [
        ["home_dashboard", "Home dashboard", "Customer home screen, quick actions and summary tiles"],
        ["booking", "Book ride", "Booking entry, route and fare handoff"],
        ["quick_booking", "Quick booking", "Where-to search, ride type buttons and instant booking entry"],
        ["saved_places", "Saved places", "Recent places and favorite locations"],
        ["fare_estimator", "Fare estimator", "Fare calculator, preview and route estimate widgets"],
        ["active_rides", "Active rides", "Live ride cards and edit controls"],
        ["scheduled_rides", "Scheduled rides", "Scheduled ride list and recurring ride controls"],
        ["airport_transfers", "Airport transfers", "Airport pickup and drop booking flow controls"],
        ["outstation_rides", "Outstation rides", "Intercity outstation ride selection and review controls"],
        ["hourly_rentals", "Hourly rentals", "Hourly rental and day trip booking controls"],
        ["trip_modes", "Trip modes", "One-way, round-trip and multi-city journey mode controls"],
        ["ride_history", "Ride history", "Past trips and receipts"],
        ["wallet", "Wallet", "Add money, withdrawal and ledger"],
        ["wallet_topup", "Wallet top-up", "Customer add-money and online payment initiation"],
        ["wallet_withdrawal", "Wallet withdrawal", "Withdrawal request form and destination details"],
        ["wallet_transfer", "Wallet transfer", "Customer wallet transfer action"],
        ["rewards", "Rewards", "Cashback, reward points and coupon actions"],
        ["messages", "Messages", "Customer-driver chat"],
        ["donations", "Donations", "Donation flow and receipts"],
        ["split_fare", "Split fare", "Split fare action and shared payment modal"],
        ["tourism", "Tourism", "Tourism guide section and travel discovery"],
        ["travel_card", "Travel card", "Digital tourist travel card and QR details"],
        ["temple_timings", "Temple timings", "Temple aarti timings module"],
        ["cultural_guide", "Cultural guide", "Culture, customs and local guidance"],
        ["local_events", "Local events", "Festival, fair and event alerts"],
        ["tour_packages", "Tour packages", "Package browsing and tour booking actions"],
        ["heritage_walks", "Heritage walks", "Heritage walk routes and details"],
        ["food_guide", "Food guide", "Local food and restaurant guide"],
        ["shopping_guide", "Shopping guide", "Markets, handicrafts and shopping guide"],
        ["profile", "Profile", "Customer account details"],
        ["ride_preferences", "Ride preferences", "Customer ride preferences modal"],
        ["emergency_contacts", "Emergency contacts", "Emergency contact setup and quick contact"],
        ["notifications", "Notifications", "Customer notification settings"],
        ["customer_support", "Customer support", "Support chat and help requests"],
        ["emergency", "Emergency", "SOS, police and ambulance controls"]
    ];
    const DRIVER_FEATURES = [
        ["availability", "Availability", "Online/offline driver state"],
        ["booking_requests", "Booking requests", "Incoming trip requests"],
        ["active_trips", "Active trips", "Trip progress controls"],
        ["earnings", "Earnings", "Payout and earning views"],
        ["kyc", "KYC", "Document review status"],
        ["wallet", "Wallet", "Driver wallet and withdrawals"],
        ["messages", "Messages", "Driver-customer chat"],
        ["safety", "Safety", "SOS and monitoring controls"]
    ];
    const QUIET_NOTIFICATION_TEXT = ["admin step-1 login failed", "405 not allowed"];
    const BOOKING_STATUS_OPTIONS = [
        ["pending_admin_review", "Pending Admin Review"],
        ["approved", "Approved"],
        ["rejected", "Rejected"],
        ["driver_assigned", "Driver Assigned"],
        ["pending_reassignment", "Pending Reassignment"],
        ["completed", "Completed"],
        ["cancelled", "Cancelled"]
    ];
    const ADMIN_REVIEW_OPTIONS = [
        ["pending", "Pending"],
        ["approved", "Approved"],
        ["rejected", "Rejected"]
    ];

    const state = {
        bookings: [],
        driverBookings: [],
        drivers: [],
        users: [],
        notifications: [],
        connection: loadConnectionState(),
        controls: null,
        query: "",
        bookingQuery: "",
        view: "overview",
        bookingFilter: "all",
        queueFilter: "all",
        hideOldActivity: false,
        settings: loadSettings(),
        seenToasts: loadSeenToasts(),
        startupAt: Date.now(),
        editingBookingId: "",
        refreshTimer: null,
        backendBookingSyncing: false,
        lastAuthenticatedBookingSyncAt: 0,
        authBookingSyncCooldownUntil: 0
    };
    let adminBookingAutocompleteReady = Boolean(
        typeof window.initializeAutocomplete === "function"
        && window.locationsData
    );
    let adminBookingAutocompleteLoaderPromise = null;

    const viewTitles = {
        overview: "Operations Overview",
        portals: "Portal Control",
        bookings: "Booking Control",
        drivers: "Driver Operations",
        finance: "Finance Control",
        safety: "Safety Inbox",
        settings: "Workspace Settings"
    };

    function $(selector, root = document) {
        return root.querySelector(selector);
    }

    function $all(selector, root = document) {
        return Array.from(root.querySelectorAll(selector));
    }

    function parseJson(raw, fallback) {
        try {
            const parsed = JSON.parse(raw || "");
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (_error) {
            return fallback;
        }
    }

    function normalizeAbsoluteScriptUrl(sourceUrl) {
        try {
            return new URL(String(sourceUrl || ""), window.location.href).href;
        } catch (_error) {
            return String(sourceUrl || "");
        }
    }

    function loadScriptOnce(sourceUrl) {
        const absoluteUrl = normalizeAbsoluteScriptUrl(sourceUrl);
        const existing = Array.from(document.querySelectorAll("script[src]"))
            .find((script) => normalizeAbsoluteScriptUrl(script.getAttribute("src")) === absoluteUrl);
        if (existing) {
            if (!Object.prototype.hasOwnProperty.call(existing.dataset || {}, "adminScriptLoaded")) {
                return Promise.resolve();
            }
            if (existing.dataset.adminScriptLoaded === "1") return Promise.resolve();
            return new Promise((resolve, reject) => {
                existing.addEventListener("load", () => {
                    existing.dataset.adminScriptLoaded = "1";
                    resolve();
                }, { once: true });
                existing.addEventListener("error", () => reject(new Error(`Failed to load ${sourceUrl}`)), { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = sourceUrl;
            script.async = false;
            script.dataset.adminScriptLoaded = "0";
            script.addEventListener("load", () => {
                script.dataset.adminScriptLoaded = "1";
                resolve();
            }, { once: true });
            script.addEventListener("error", () => reject(new Error(`Failed to load ${sourceUrl}`)), { once: true });
            document.head.appendChild(script);
        });
    }

    function ensureAdminBookingAutocompleteAssets() {
        if (adminBookingAutocompleteReady) return Promise.resolve(true);
        if (adminBookingAutocompleteLoaderPromise) return adminBookingAutocompleteLoaderPromise;

        adminBookingAutocompleteLoaderPromise = ADMIN_BOOKING_AUTOCOMPLETE_SCRIPT_URLS
            .reduce((chain, scriptUrl) => chain.then(() => loadScriptOnce(scriptUrl)), Promise.resolve())
            .then(() => {
                adminBookingAutocompleteReady = typeof window.initializeAutocomplete === "function" && Boolean(window.locationsData);
                return adminBookingAutocompleteReady;
            })
            .catch((error) => {
                console.warn("[admin-app] booking autocomplete assets could not be loaded", error);
                adminBookingAutocompleteReady = false;
                return false;
            })
            .finally(() => {
                if (!adminBookingAutocompleteReady) {
                    adminBookingAutocompleteLoaderPromise = null;
                }
            });

        return adminBookingAutocompleteLoaderPromise;
    }

    function connectBookingAutocompleteForInputs(inputIds = []) {
        const safeIds = Array.isArray(inputIds) ? inputIds.filter(Boolean) : [];
        if (!safeIds.length) return;
        ensureAdminBookingAutocompleteAssets().then((ready) => {
            if (!ready || typeof window.initializeAutocomplete !== "function") return;
            safeIds.forEach((inputId) => {
                const input = document.getElementById(inputId);
                if (!input) return;
                window.initializeAutocomplete(inputId);
            });
        });
    }

    function readArray(key) {
        const parsed = parseJson(localStorage.getItem(key), []);
        if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === "object");
        if (parsed && typeof parsed === "object") {
            const preferred = ["items", "data", "records", "bookings", "rows", "results", "list"];
            for (const field of preferred) {
                if (Array.isArray(parsed[field])) return parsed[field].filter((item) => item && typeof item === "object");
            }
            const values = Object.values(parsed);
            if (values.length && values.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
                return values;
            }
        }
        return [];
    }

    function writeArray(key, rows) {
        if (!Array.isArray(rows)) return;
        localStorage.setItem(key, JSON.stringify(rows));
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function cleanText(value, fallback = "") {
        const text = String(value ?? "").replace(/\s+/g, " ").trim();
        return text || fallback;
    }

    function toAmount(value) {
        const number = typeof value === "number"
            ? value
            : Number(String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
        return Number.isFinite(number) ? Math.max(0, number) : 0;
    }

    function formatMoney(value) {
        return `INR ${Math.round(toAmount(value)).toLocaleString("en-IN")}`;
    }

    function formatDate(value) {
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return "Not set";
        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function buildOutboundDateTime(rideDate, rideTime) {
        const date = cleanText(rideDate);
        const time = cleanText(rideTime);
        if (!date) return "";
        if (!time) return `${date}T00:00:00.000Z`;
        const safeTime = /^\d{2}:\d{2}/.test(time) ? `${time}:00` : "00:00:00";
        return `${date}T${safeTime}.000Z`;
    }

    function isPlainObject(value) {
        return Boolean(value && typeof value === "object" && !Array.isArray(value));
    }

    function firstText(...values) {
        for (const value of values) {
            if (value === null || value === undefined) continue;
            if (isPlainObject(value) || Array.isArray(value)) continue;
            const text = cleanText(value);
            if (text) return text;
        }
        return "";
    }

    function hashText(value) {
        const text = cleanText(value);
        let hash = 0;
        for (let index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash) + text.charCodeAt(index);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    function sourceLooksBookingRelated(sourceKey) {
        return /booking|bookings|ride|rides|trip|trips|reservation|admin_review/i.test(cleanText(sourceKey));
    }

    function sourceLooksDriverBookingRelated(sourceKey) {
        return /driver[_-]?(booking|bookings|request|requests|ride|rides)|booking_requests|driver_only|driver-only|driver_queue/i.test(cleanText(sourceKey));
    }

    function sourceLooksCustomerBookingRelated(sourceKey) {
        return /customer|admin_review|active_bookings|scheduled_rides|ride_history|fallback_admin_review_queue|booking_submit|bookings/i.test(cleanText(sourceKey));
    }

    function getBookingIdentity(row) {
        return firstText(
            row.bookingId,
            row.id,
            row._id,
            row.rideId,
            row.tripId,
            row.referenceId,
            row.orderId,
            row.bookingReference,
            row.reference
        );
    }

    function makeSyntheticBookingId(row, sourceKey = "local") {
        const basis = [
            sourceKey,
            row.pickup || row.pickupLocation || row.from || row.origin || "",
            row.dropoff || row.drop || row.dropLocation || row.to || row.destination || "",
            row.rideDate || row.date || row.createdAt || row.timestamp || "",
            row.rideTime || row.time || "",
            row.customerEmail || row.email || row.customerPhone || row.phone || "",
            row.totalFare || row.amount || row.finalFare || row.fare || ""
        ].join("|");
        return `LOCAL-${hashText(basis || sourceKey).toUpperCase()}`;
    }

    function isBookingLikeRecord(row, sourceKey = "") {
        if (!isPlainObject(row)) return false;
        if (Array.isArray(row.targetPortals) && firstText(row.type, row.title, row.message) && isPlainObject(row.booking)) {
            return false;
        }
        const pickup = firstText(row.pickup, row.pickupLocation, row.from, row.origin, row.source);
        const dropoff = firstText(row.dropoff, row.drop, row.dropLocation, row.to, row.destination);
        const identity = getBookingIdentity(row);
        const tripMeta = firstText(
            row.rideDate,
            row.rideTime,
            row.outboundDateTime,
            row.returnDate,
            row.returnTime,
            row.vehicleType,
            row.rideType,
            row.tripPlan,
            row.bookingMode,
            row.paymentMethod
        );
        const status = firstText(row.status, row.adminReviewStatus, row.backendStatus, row.bookingStatus, row.lifecycleStatus);
        const hasFare = toAmount(row.totalFare || row.amount || row.finalFare || row.fare || row.fareQuote?.amount || row.fareBreakdown?.totalFare) > 0;
        const hasRoute = Boolean(pickup && dropoff);
        const hintedSource = sourceLooksBookingRelated(sourceKey);
        return (hasRoute && (identity || tripMeta || status || hasFare))
            || (hintedSource && Boolean(identity) && (hasRoute || tripMeta || status || hasFare));
    }

    function isPlaceholderText(value) {
        const text = cleanText(value).toLowerCase();
        return !text || text === "pickup pending" || text === "drop pending" || text === "not set" || text === "distance pending";
    }

    function hasUsableBookingRoute(row = {}) {
        const pickup = firstText(row.pickup, row.pickupLocation, row.from, row.origin);
        const dropoff = firstText(row.dropoff, row.drop, row.dropLocation, row.to, row.destination);
        return !isPlaceholderText(pickup) && !isPlaceholderText(dropoff);
    }

    function getDriverCandidateId(row = {}) {
        const driver = isPlainObject(row.driver) ? row.driver : {};
        return cleanText(
            row.driverId
            || row.driverBookingId
            || row.driverRequestId
            || row.bookingRequestId
            || row.requestId
            || row.bookingId
            || row.id
            || row._id
            || driver.id
            || driver._id
        );
    }

    function driverIdentityName(row = {}) {
        const driver = isPlainObject(row.driver) ? row.driver : {};
        return cleanText(row.driverName || driver.name || row.name || row.fullName || row.fullname || row.customerName).toLowerCase();
    }

    function nameLooksDriverOnly(row = {}) {
        const name = driverIdentityName(row);
        return /\bdriver\b/.test(name) || /verified driver/.test(name);
    }

    function hasDriverVehicleSignal(row = {}) {
        const vehicle = isPlainObject(row.vehicle) ? row.vehicle : {};
        return Boolean(firstText(row.vehicleNumber, row.vehicleModel, row.vehicleType, row.rideType, vehicle.number, vehicle.model, vehicle.type));
    }

    function hasDriverOnlyPrimarySignal(row = {}, sourceKey = "") {
        const id = getDriverCandidateId(row);
        const source = cleanText(row.sourceKey || row.source || sourceKey).toLowerCase();
        return /^drv/i.test(id)
            || (nameLooksDriverOnly(row) && hasDriverVehicleSignal(row))
            || (sourceLooksDriverBookingRelated(source) && (nameLooksDriverOnly(row) || hasDriverVehicleSignal(row)));
    }

    function hasStrongDriverOperationalIdentity(row = {}) {
        const driver = isPlainObject(row.driver) ? row.driver : {};
        const vehicle = isPlainObject(row.vehicle) ? row.vehicle : {};
        const id = getDriverCandidateId(row);
        return /^drv/i.test(id)
            || Boolean(firstText(
                row.driverId,
                row.driverName,
                row.driverPhone,
                row.approvalStatus,
                row.kycStatus,
                row.kycVerified,
                row.docsVerified,
                row.licenseNumber,
                row.licenceNumber,
                row.dlNumber,
                row.vehicleNumber,
                driver.id,
                driver.name,
                driver.phone,
                vehicle.number
            ));
    }

    function hasCustomerBookingIdentity(row = {}) {
        const customer = isPlainObject(row.customer) ? row.customer : {};
        const customerSnapshot = isPlainObject(row.customerSnapshot) ? row.customerSnapshot : {};
        const driverOnlyShell = hasDriverOnlyPrimarySignal(row) && !hasUsableBookingRoute(row);
        const explicitCustomer = firstText(
            row.customerId,
            row.userId,
            row.backendUserId,
            row.customerEmail,
            customerSnapshot.name,
            customerSnapshot.email,
            customer.id,
            customer._id,
            customer.name,
            customer.email
        );
        if (explicitCustomer) return true;
        if (!driverOnlyShell && firstText(row.customerName)) return true;
        if (firstUsableAdminPhone(row.customerPhone, customerSnapshot.phone, customer.phone)) return true;
        return Boolean(firstUsableAdminPhone(row.phone, row.mobile, row.contact) && !driverOnlyShell && !hasStrongDriverOperationalIdentity(row));
    }

    function hasDriverOperationalIdentity(row = {}) {
        const driver = isPlainObject(row.driver) ? row.driver : {};
        const vehicle = isPlainObject(row.vehicle) ? row.vehicle : {};
        return hasStrongDriverOperationalIdentity(row)
            || Boolean(firstText(
                row.vehicleModel,
                row.vehicleType,
                row.isOnline,
                row.online,
                driver.id,
                driver.name,
                driver.phone,
                vehicle.number,
                vehicle.model,
                vehicle.type
            ));
    }

    function isDriverOnlyOperationalRecord(row = {}, sourceKey = "") {
        if (!isPlainObject(row)) return false;
        const source = cleanText(row.sourceKey || row.source || sourceKey).toLowerCase();
        const status = cleanText(row.status || row.approvalStatus || row.driverStatus || "").toLowerCase();
        const mode = cleanText(row.bookingMode || row.mode || row.tripPlan || "").toLowerCase();
        const driverSignals = hasDriverOperationalIdentity(row);
        const driverSource = sourceLooksDriverBookingRelated(source)
            || source.includes("drivers")
            || source.includes("driver_data")
            || source.includes("driver portal");
        const operationalStatus = ["pending", "approved", "available", "active", "inactive", "suspended", "offline_forced", "blocked", "rejected", "cancelled"].includes(status);
        return driverSignals
            && !hasUsableBookingRoute(row)
            && (!hasCustomerBookingIdentity(row) || hasDriverOnlyPrimarySignal(row, sourceKey))
            && (driverSource || operationalStatus || /^driver[_-]?only/.test(mode));
    }

    function hasCustomerBookingSignal(row = {}, sourceKey = "") {
        if (hasDriverOnlyPrimarySignal(row, sourceKey) && !hasUsableBookingRoute(row)) return false;
        const route = hasUsableBookingRoute(row);
        const customerIdentity = hasCustomerBookingIdentity(row);
        const identity = getBookingIdentity(row);
        const tripMeta = firstText(
            row.rideDate,
            row.rideTime,
            row.outboundDateTime,
            row.returnDate,
            row.returnTime,
            row.vehicleType,
            row.rideType,
            row.tripPlan,
            row.bookingMode,
            row.paymentMethod
        );
        const hasFare = toAmount(row.totalFare || row.amount || row.finalFare || row.fare || row.fareQuote?.amount || row.fareBreakdown?.totalFare) > 0;
        const customerSource = sourceLooksCustomerBookingRelated(row.sourceKey || row.source || sourceKey);
        return (route && Boolean(identity || customerIdentity || tripMeta || hasFare))
            || (customerIdentity && Boolean(identity || route || tripMeta || hasFare || customerSource))
            || (customerSource && Boolean(identity) && Boolean(route || customerIdentity || tripMeta || hasFare));
    }

    function getAdminBookingRecordScope(row = {}, sourceKey = "") {
        if (!isPlainObject(row) || isInternalDiagnosticBooking(row)) return "";
        const explicitScope = cleanText(row.adminBookingScope || row.portalScope || row.bookingScope || row.recordScope || row.ownerPortal).toLowerCase();
        if (explicitScope.includes("driver")) return "driver";
        if (explicitScope.includes("customer")) return "customer";
        if (hasDriverOnlyPrimarySignal(row, sourceKey) && !hasUsableBookingRoute(row)) return "driver";
        if (isDriverOnlyOperationalRecord(row, sourceKey)) return "driver";
        if (hasCustomerBookingSignal(row, sourceKey)) return "customer";
        if (sourceLooksDriverBookingRelated(row.sourceKey || row.source || sourceKey) && hasDriverOperationalIdentity(row)) return "driver";
        if (isBookingLikeRecord(row, sourceKey)) return "customer";
        return "";
    }

    function isInternalDiagnosticBooking(row) {
        const text = [
            row?.bookingId,
            row?.id,
            row?.sourceKey,
            row?.customerEmail,
            row?.customerName,
            row?.notes,
            row?.mode
        ].join(" ").toLowerCase();
        return (
            /\b(bktest|ridpublic|codex_live_test|codex test|adminDemoBookings|admin demo)\b/i.test(text)
            || cleanText(row?.bookingId || row?.id).startsWith("LOCAL-")
        );
    }

    function bookingCompletenessScore(row) {
        if (!row || typeof row !== "object") return 0;
        let score = 0;
        const pickup = firstText(row.pickup, row.pickupLocation, row.from, row.origin);
        const dropoff = firstText(row.dropoff, row.dropLocation, row.drop, row.to, row.destination);
        if (!isPlaceholderText(pickup)) score += 15;
        if (!isPlaceholderText(dropoff)) score += 15;
        if (toAmount(row.totalFare || row.amount || row.finalFare || row.fare || row.fareQuote?.amount || row.fareBreakdown?.totalFare) > 0) score += 12;
        if (toAmount(row.distanceKm || row.distance || row.fareQuote?.distanceKm || row.fareBreakdown?.distanceKm) > 0) score += 8;
        if (firstText(row.customerPhone, row.customerEmail, row.customerSnapshot?.phone, row.customerSnapshot?.email)) score += 10;
        if (firstText(row.rideDate, row.outboundDateTime)) score += 6;
        if (firstText(row.rideTime)) score += 4;
        if (firstText(row.vehicleType, row.rideType, row.vehicleModel)) score += 4;
        if (Array.isArray(row.stops) && row.stops.length) score += 2;
        if (isPlainObject(row.fareBreakdown) && Object.keys(row.fareBreakdown).length) score += 4;
        if (/backend|customer_booking_submit|customer_dashboard_public_sync|fallback_admin_review_queue/i.test(cleanText(row.sourceKey))) score += 5;
        if (/portal_notifications|notification|signal/i.test(cleanText(row.sourceKey))) score -= 10;
        if (isInternalDiagnosticBooking(row)) score -= 100;
        return score;
    }

    function mergeBookingRowsByQuality(existing = {}, incoming = {}) {
        const existingScore = bookingCompletenessScore(existing);
        const incomingScore = bookingCompletenessScore(incoming);
        const primary = incomingScore >= existingScore ? incoming : existing;
        const secondary = incomingScore >= existingScore ? existing : incoming;
        const merged = { ...secondary, ...primary };
        [
            "pickup",
            "pickupLocation",
            "from",
            "dropoff",
            "drop",
            "dropLocation",
            "to",
            "customerName",
            "customerPhone",
            "customerEmail",
            "rideDate",
            "rideTime",
            "vehicleType",
            "paymentMethod"
        ].forEach((field) => {
            if (isPlaceholderText(merged[field]) && !isPlaceholderText(secondary[field])) {
                merged[field] = secondary[field];
            }
        });
        ["fare", "totalFare", "amount", "finalFare", "distanceKm", "distance"].forEach((field) => {
            if (toAmount(merged[field]) <= 0 && toAmount(secondary[field]) > 0) {
                merged[field] = secondary[field];
            }
        });
        if (!isPlainObject(merged.customerSnapshot) && isPlainObject(secondary.customerSnapshot)) {
            merged.customerSnapshot = secondary.customerSnapshot;
        }
        if (!isPlainObject(merged.fareBreakdown) && isPlainObject(secondary.fareBreakdown)) {
            merged.fareBreakdown = secondary.fareBreakdown;
        }
        if (!isPlainObject(merged.fareQuote) && isPlainObject(secondary.fareQuote)) {
            merged.fareQuote = secondary.fareQuote;
        }
        return merged;
    }

    function pushBookingCandidate(row, sourceKey, target) {
        const scope = getAdminBookingRecordScope(row, sourceKey);
        if (!scope) return;
        const bookingId = getBookingIdentity(row) || makeSyntheticBookingId(row, sourceKey);
        target.push({
            ...row,
            id: bookingId,
            bookingId,
            adminBookingScope: scope,
            sourceKey: row.sourceKey || sourceKey,
            discoveredByAdminScanner: true
        });
    }

    function extractBookingCandidates(value, sourceKey, target, depth = 0) {
        if (depth > 5 || value === null || value === undefined) return;
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (isPlainObject(item)) {
                    pushBookingCandidate(item, `${sourceKey}[${index}]`, target);
                }
                extractBookingCandidates(item, `${sourceKey}[${index}]`, target, depth + 1);
            });
            return;
        }
        if (!isPlainObject(value)) return;

        pushBookingCandidate(value, sourceKey, target);

        [
            "booking",
            "ride",
            "trip",
            "payload",
            "record",
            "item",
            "data",
            "notification"
        ].forEach((field) => {
            if (value[field] !== undefined) extractBookingCandidates(value[field], `${sourceKey}.${field}`, target, depth + 1);
        });

        [
            "items",
            "records",
            "bookings",
            "rides",
            "activeRides",
            "scheduledRides",
            "rideHistory",
            "history",
            "rows",
            "results",
            "list",
            "queue",
            "notifications"
        ].forEach((field) => {
            if (value[field] !== undefined) extractBookingCandidates(value[field], `${sourceKey}.${field}`, target, depth + 1);
        });

        if (sourceLooksBookingRelated(sourceKey)) {
            Object.entries(value).forEach(([key, item]) => {
                if ([
                    "booking",
                    "ride",
                    "trip",
                    "payload",
                    "record",
                    "item",
                    "data",
                    "items",
                    "records",
                    "bookings",
                    "rides",
                    "activeRides",
                    "scheduledRides",
                    "rideHistory",
                    "history",
                    "rows",
                    "results",
                    "list",
                    "queue",
                    "notifications"
                ].includes(key)) return;
                if (isPlainObject(item) || Array.isArray(item)) {
                    extractBookingCandidates(item, `${sourceKey}.${key}`, target, depth + 1);
                }
            });
        }
    }

    function scanStorageForBookingRows(storage, label) {
        const rows = [];
        try {
            if (!storage || typeof storage.length !== "number") return rows;
            for (let index = 0; index < storage.length; index += 1) {
                const key = storage.key(index);
                if (!key) continue;
                if (ADMIN_INTERNAL_BOOKING_SCAN_SKIP_KEYS.has(key)) continue;
                const parsed = parseJson(storage.getItem(key), null);
                extractBookingCandidates(parsed, `${label}:${key}`, rows);
            }
        } catch (_error) {
            return rows;
        }
        return rows;
    }

    function scanAllStorageForBookingRows() {
        return [
            ...scanStorageForBookingRows(localStorage, "localStorage"),
            ...scanStorageForBookingRows(sessionStorage, "sessionStorage")
        ];
    }

    function humanizeKey(key) {
        return cleanText(key)
            .replace(/[_-]+/g, " ")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function formatPlainValue(value, fallback = "Not set") {
        if (value === true) return "Yes";
        if (value === false) return "No";
        if (Array.isArray(value)) {
            const list = value.map((item) => cleanText(item)).filter(Boolean);
            return list.length ? list.join(", ") : fallback;
        }
        if (isPlainObject(value)) {
            return formatObjectSummary(value, fallback);
        }
        return cleanText(value, fallback);
    }

    function formatObjectSummary(value, fallback = "Not set") {
        if (!isPlainObject(value)) return fallback;
        const entries = Object.entries(value)
            .filter(([, item]) => {
                if (item === null || item === undefined || item === "") return false;
                if (Array.isArray(item)) return item.length > 0;
                if (isPlainObject(item)) return Object.keys(item).length > 0;
                return true;
            })
            .slice(0, 12);
        if (!entries.length) return fallback;
        return entries.map(([key, item]) => `${humanizeKey(key)}: ${formatPlainValue(item)}`).join(" | ");
    }

    function formatEnabledFlags(value, fallback = "None") {
        if (!isPlainObject(value)) return fallback;
        const enabled = Object.entries(value)
            .filter(([, item]) => item === true || item === "true" || item === "yes" || item === 1 || cleanText(item))
            .map(([key, item]) => item === true || item === "true" || item === "yes" || item === 1
                ? humanizeKey(key)
                : `${humanizeKey(key)}: ${formatPlainValue(item)}`);
        return enabled.length ? enabled.join(", ") : fallback;
    }

    function formatSourceInline(value, maxLength = 56) {
        const raw = cleanText(value, "");
        if (!raw) return "split_store";
        const normalized = raw
            .replace(/^localStorage:/i, "")
            .replace(/^sessionStorage:/i, "")
            .replace(/\s+/g, " ");
        if (normalized.length <= maxLength) return normalized;
        return `${normalized.slice(0, Math.max(12, maxLength - 1)).trimEnd()}…`;
    }

    function renderDetailPairs(pairs) {
        return pairs
            .map(([label, value]) => [label, formatPlainValue(value)])
            .filter(([, value]) => value && value !== "Not set")
            .map(([label, value]) => `
                <div class="booking-detail-pair">
                    <span>${escapeHtml(label)}</span>
                    <strong>${escapeHtml(value)}</strong>
                </div>
            `).join("");
    }

    function renderDetailSection(title, pairs) {
        const rows = renderDetailPairs(pairs);
        if (!rows) return "";
        return `
            <section class="booking-detail-section">
                <h3>${escapeHtml(title)}</h3>
                <div class="booking-detail-grid">${rows}</div>
            </section>
        `;
    }

    function renderBookingHighlights(booking) {
        const items = [
            ["fa-calendar-days", "Ride", [booking.rideDate, booking.rideTime].filter(Boolean).join(" ") || booking.outboundDateTime],
            ["fa-car-side", "Vehicle", booking.vehicleType || booking.rideType || booking.vehicleModel],
            ["fa-users", "Passengers", booking.passengers ? `${booking.passengers} passenger${Number(booking.passengers) === 1 ? "" : "s"}` : ""],
            ["fa-credit-card", "Payment", booking.paymentMethod || booking.payment?.method || booking.paymentMode],
            ["fa-phone", "Contact", booking.customerPhone || booking.customerEmail]
        ].filter(([, , value]) => cleanText(value));

        if (!items.length) return "";
        return `
            <div class="booking-mini-grid">
                ${items.map(([icon, label, value]) => {
                    const plainValue = formatPlainValue(value);
                    const titleAttr = plainValue.length > 40 ? ` title="${escapeHtml(plainValue)}"` : "";
                    return `
                        <span><i class="fas ${icon}"></i><strong>${escapeHtml(label)}</strong><span class="booking-mini-value"${titleAttr}>${escapeHtml(plainValue)}</span></span>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderBookingFullDetails(booking, options = {}) {
        const openAttr = options.open ? " open" : "";
        const safePayload = escapeHtml(JSON.stringify(booking, null, 2));
        const returnDate = booking.returnDate || booking.returnTrip?.returnDate;
        const returnTime = booking.returnTime || booking.returnTrip?.returnTime;
        const specialRequests = isPlainObject(booking.specialRequests)
            ? booking.specialRequests
            : booking.customerFeatures?.specialRequests;
        const safetyAccessibility = isPlainObject(booking.safetyAccessibility)
            ? booking.safetyAccessibility
            : booking.customerFeatures?.safetyAccessibility;

        const sections = [
            renderDetailSection("Customer", [
                ["Name", booking.customerName],
                ["Phone", booking.customerPhone],
                ["Email", booking.customerEmail],
                ["Customer ID", booking.customerId || booking.userId || booking.backendUserId]
            ]),
            renderDetailSection("Trip", [
                ["Pickup", booking.pickup || booking.pickupLocation || booking.from],
                ["Drop", booking.dropoff || booking.dropLocation || booking.drop || booking.to],
                ["Ride date", booking.rideDate],
                ["Ride time", booking.rideTime],
                ["Outbound time", booking.outboundDateTime],
                ["Return date", returnDate],
                ["Return time", returnTime],
                ["Trip plan", booking.tripPlan || booking.bookingMode || booking.mode],
                ["Vehicle type", booking.vehicleType || booking.rideType],
                ["Vehicle model", booking.vehicleModel],
                ["Passengers", booking.passengers],
                ["Luggage", booking.luggage],
                ["Stops", booking.stops],
                ["Notes", booking.notes]
            ]),
            renderDetailSection("Fare And Payment", [
                ["Total fare", formatMoney(booking.fare || booking.totalFare || booking.amount || booking.finalFare)],
                ["Distance", booking.distanceKm ? `${Math.round(toAmount(booking.distanceKm) * 10) / 10} km` : ""],
                ["Distance source", booking.distanceSource],
                ["Payment method", booking.paymentMethod || booking.payment?.method || booking.paymentMode],
                ["Budget amount", booking.budgetAmount ? formatMoney(booking.budgetAmount) : ""],
                ["Customer bid", booking.customerBidAmount ? formatMoney(booking.customerBidAmount) : ""],
                ["Fare breakdown", booking.fareBreakdown],
                ["Fare quote", booking.fareQuote],
                ["Payment data", booking.payment],
                ["Promo", booking.promo || booking.referralCode]
            ]),
            renderDetailSection("Admin And Driver", [
                ["Booking ID", booking.bookingId],
                ["Source", booking.sourceKey],
                ["Booking status", getStatusLabel(booking)],
                ["Admin review", booking.adminReviewStatus || booking.reviewStatus],
                ["Admin note", booking.adminReviewNote],
                ["Driver ID", booking.driverId],
                ["Driver name", booking.driverName],
                ["Created", formatDate(booking.createdAt || booking.timestamp || booking.date)],
                ["Updated", formatDate(booking.updatedAt)],
                ["Last edited", formatDate(booking.lastEditedAt)],
                ["Edit count", booking.editCount],
                ["Admin email", formatObjectSummary(booking.adminEmailDispatch)],
                ["Customer email", formatObjectSummary(booking.customerEmailDispatch)]
            ]),
            renderDetailSection("Requests", [
                ["Special requests", formatEnabledFlags(specialRequests)],
                ["Safety and accessibility", formatEnabledFlags(safetyAccessibility)],
                ["AC preference", booking.acPreference],
                ["Luggage space", booking.luggageSpace]
            ])
        ].filter(Boolean).join("");

        return `
            <details class="booking-full-details"${openAttr}>
                <summary><i class="fas fa-circle-info"></i><span>Full booking details</span></summary>
                <div class="booking-detail-content">
                    ${sections || `<div class="empty-state">No extra booking details stored for this row.</div>`}
                    <details class="booking-payload-details">
                        <summary>Stored payload</summary>
                        <pre>${safePayload}</pre>
                    </details>
                </div>
            </details>
        `;
    }

    function renderBookingCompactDetails(booking) {
        const quick = renderBookingHighlights(booking);
        const full = renderBookingFullDetails(booking);
        if (!quick && !full) return "";
        return `
            <details class="booking-row-details">
                <summary><i class="fas fa-layer-group"></i><span>Booking details</span></summary>
                ${quick}
                ${full}
            </details>
        `;
    }

    function renderPortalFeatureFolder(portal, title, description, features, controls) {
        const portalFeatures = ((controls.portalFeatures || {})[portal]) || {};
        const rows = features.map((feature) => {
            const control = portalFeatures[feature[0]] || {};
            const enabled = control.enabled !== false && !["disabled", "paused", "blocked"].includes(cleanText(control.status || "active").toLowerCase());
            const featureLabel = cleanText(control.labelOverride || feature[1]);
            const correction = cleanText(control.correction || "");
            return `
                <div class="feature-control-row" data-feature-owner="${escapeHtml(portal)}">
                    <div class="feature-control-copy">
                        <strong>${escapeHtml(featureLabel)}</strong>
                        <small>${escapeHtml(feature[2])}</small>
                        ${correction ? `<small class="feature-correction-note">Admin correction: ${escapeHtml(correction)}</small>` : ""}
                    </div>
                    <div class="control-actions">
                        <span class="status-pill ${enabled ? "approved" : "rejected"}">${enabled ? "Connected" : "Paused"}</span>
                        <button class="row-action" data-control-action="edit-feature" data-portal="${escapeHtml(portal)}" data-feature="${escapeHtml(feature[0])}" type="button" title="Edit correction"><i class="fas fa-pen-to-square"></i></button>
                        <button class="row-action" data-control-action="enable-feature" data-portal="${escapeHtml(portal)}" data-feature="${escapeHtml(feature[0])}" type="button"><i class="fas fa-link"></i></button>
                        <button class="danger-action" data-control-action="disable-feature" data-portal="${escapeHtml(portal)}" data-feature="${escapeHtml(feature[0])}" type="button"><i class="fas fa-pause"></i></button>
                    </div>
                </div>
            `;
        }).join("");
        return `
            <details class="portal-feature-folder ${portal}-feature-folder">
                <summary>
                    <span><i class="fas ${portal === "driver" ? "fa-car-side" : "fa-user"}"></i> ${escapeHtml(title)}</span>
                    <small>${features.length} features</small>
                </summary>
                <p>${escapeHtml(description)}</p>
                <div class="portal-feature-list">${rows}</div>
            </details>
        `;
    }

    function formValue(value) {
        return escapeHtml(formatPlainValue(value, ""));
    }

    function serializeList(value) {
        if (!Array.isArray(value)) return "";
        return value.map((item) => cleanText(item)).filter(Boolean).join("\n");
    }

    function serializeMap(value) {
        if (!isPlainObject(value) || !Object.keys(value).length) return "";
        return JSON.stringify(value, null, 2);
    }

    function parseTextList(value) {
        return String(value || "")
            .split(/[\n,]+/)
            .map((item) => cleanText(item))
            .filter(Boolean)
            .slice(0, 12);
    }

    function parseFlexibleMap(value) {
        const text = String(value || "").trim();
        if (!text) return {};
        try {
            const parsed = JSON.parse(text);
            if (isPlainObject(parsed)) return parsed;
        } catch (_error) {
            // Admin may enter comma-separated flags instead of JSON.
        }

        return text.split(/[\n,]+/).reduce((acc, item) => {
            const token = cleanText(item);
            if (!token) return acc;
            const separatorIndex = Math.max(token.indexOf("="), token.indexOf(":"));
            if (separatorIndex > 0) {
                const key = cleanText(token.slice(0, separatorIndex));
                const rawValue = cleanText(token.slice(separatorIndex + 1));
                if (key) acc[key] = rawValue || true;
            } else {
                acc[token] = true;
            }
            return acc;
        }, {});
    }

    function renderSelectOptions(options, currentValue) {
        const selected = cleanText(currentValue).toLowerCase();
        return options.map(([value, label]) => `
            <option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(label)}</option>
        `).join("");
    }

    function renderDetailedSelectOptions(options, currentValue, fieldName = "") {
        const selected = normalizeAutofillFullText(fieldName, currentValue).toLowerCase();
        return options.map(([value, label]) => {
            const safeValue = cleanText(value);
            const isSelected = selected && selected === safeValue.toLowerCase();
            return `<option value="${escapeHtml(safeValue)}"${isSelected ? " selected" : ""}>${escapeHtml(label || safeValue)}</option>`;
        }).join("");
    }

    function renderEditInput(name, label, value, attrs = "") {
        return `
            <label class="booking-edit-field">
                <span>${escapeHtml(label)}</span>
                <input name="${escapeHtml(name)}" value="${formValue(value)}" ${attrs}>
            </label>
        `;
    }

    function renderEditDetailedSelect(name, label, value, options) {
        return `
            <label class="booking-edit-field">
                <span>${escapeHtml(label)}</span>
                <select name="${escapeHtml(name)}">${renderDetailedSelectOptions(options, value, name)}</select>
            </label>
        `;
    }

    function renderBookingEditSection(title, fields, options = {}) {
        const openAttr = options.open ? " open" : "";
        const countLabel = fields.length ? ` <small>${fields.length} fields</small>` : "";
        return `
            <details class="booking-edit-section"${openAttr}>
                <summary><span>${escapeHtml(title)}</span>${countLabel}</summary>
                <div class="booking-edit-section-grid">
                    ${fields.join("")}
                </div>
            </details>
        `;
    }

    function renderEditTextarea(name, label, value, attrs = "") {
        return `
            <label class="booking-edit-field wide">
                <span>${escapeHtml(label)}</span>
                <textarea name="${escapeHtml(name)}" ${attrs}>${formValue(value)}</textarea>
            </label>
        `;
    }

    function readAdminAutofillMemory() {
        const parsed = parseJson(localStorage.getItem(ADMIN_BOOKING_AUTOFILL_MEMORY_KEY), {});
        return isPlainObject(parsed) ? parsed : {};
    }

    function writeAdminAutofillMemory(nextMemory = {}) {
        const safeMemory = isPlainObject(nextMemory) ? nextMemory : {};
        localStorage.setItem(ADMIN_BOOKING_AUTOFILL_MEMORY_KEY, JSON.stringify(safeMemory));
    }

    function normalizeAutofillNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    const BOOKING_AUTOFILL_FIELDS = [
        "customerName", "customerPhone", "customerEmail",
        "pickup", "dropoff", "rideDate", "rideTime", "returnDate", "returnTime",
        "tripPlan", "vehicleType", "vehicleModel", "passengers", "luggage",
        "paymentMethod", "fare", "distanceKm", "driverId", "driverName",
        "status", "adminReviewStatus", "stops", "notes", "specialRequests",
        "safetyAccessibility", "adminEditReason"
    ];

    const BOOKING_AUTOFILL_FULL_LABELS = {
        tripPlan: {
            city: "City / local ride within one city",
            local: "City / local ride within one city",
            outstation: "Outstation intercity ride with route and fare confirmation",
            one_way: "One-way outstation ride with no return booking",
            round_trip: "Round-trip outstation ride with confirmed return journey",
            rental: "Hourly rental / day rental ride with flexible local stops",
            hourly: "Hourly rental / day rental ride with flexible local stops",
            airport: "Airport pickup or drop transfer",
            airport_pickup: "Airport pickup transfer with flight and terminal coordination",
            airport_drop: "Airport drop transfer with departure-time buffer",
            multi_city: "Multi-city journey with route stops",
            sightseeing: "Sightseeing / tourism ride with planned attraction stops",
            tour_package: "Tour package ride with itinerary and support coordination",
            corporate: "Corporate / business ride with invoice-ready details",
            wedding_event: "Wedding / event ride with scheduled reporting time",
            medical: "Medical / emergency support ride with priority pickup",
            city_tour: "City tour package with fixed local sightseeing points",
            pilgrimage: "Pilgrimage / temple tour with planned waiting time",
            hotel_transfer: "Hotel, resort or villa transfer with doorstep pickup",
            employee_shuttle: "Employee shuttle / monthly corporate commute",
            hill_station: "Hill-station outstation ride with experienced hill-route driver",
            event_shuttle: "Event shuttle for guest movement and multiple pickups",
            late_night: "Late-night ride with verified driver and safety priority"
        },
        vehicleType: {
            economy: "Economy ride category for budget city travel",
            mini: "Mini compact ride category for 1-3 passengers",
            sedan: "Sedan comfort ride category for family or business travel",
            suv: "SUV family ride category for 5-7 passengers and luggage",
            premium: "Premium ride category with upgraded comfort",
            luxury: "Luxury ride category for VIP or special occasions",
            tempo_traveller: "Tempo traveller category for group travel",
            wheelchair_accessible: "Wheelchair accessible vehicle category",
            women_safe: "Women-safe preferred ride category with verified driver",
            ev: "Electric vehicle category where available",
            mpv: "MPV / MUV category for family with extra luggage",
            corporate_fleet: "Corporate fleet category with invoice and reporting support",
            pet_friendly: "Pet-friendly cab category with prior driver confirmation"
        },
        vehicleModel: {
            hatchback_car: "Hatchback car for compact city rides",
            sedan_car: "Sedan car with AC comfort and boot space",
            suv_car: "SUV car with extra seats and luggage space",
            innova_crysta: "Toyota Innova Crysta / equivalent family SUV",
            ertiga: "Maruti Ertiga / equivalent 6-7 seat MPV",
            tempo_traveller: "Tempo traveller for group tours",
            luxury_car: "Luxury car for premium guest travel",
            wheelchair_accessible_car: "Wheelchair accessible car with assistance",
            ev_car: "Electric vehicle option where available",
            swift_dzire: "Swift Dzire / equivalent sedan for 4 passengers",
            toyota_etios: "Toyota Etios / equivalent sedan for outstation travel",
            toyota_innova: "Toyota Innova / equivalent 6-7 seat family vehicle",
            tavera: "Chevrolet Tavera / equivalent large family vehicle",
            xylo_marazzo: "Xylo, Marazzo, Triber or equivalent 6-7 seat SUV",
            brezza_prime: "Maruti Brezza / SUV Prime equivalent compact SUV",
            twelve_seater_traveller: "12-seater tempo traveller for group movement",
            force_traveller: "Force Traveller / equivalent large group vehicle"
        },
        luggage: {
            none: "No luggage",
            small: "Small luggage: 1 cabin bag or backpack",
            medium: "Medium luggage: 1-2 suitcases",
            large: "Large luggage: 3-4 suitcases",
            extra: "Extra luggage: 5+ bags or bulky items",
            sports: "Sports / fragile luggage requiring careful handling",
            wheelchair: "Wheelchair or medical equipment luggage",
            assured_boot: "Assured boot luggage space required",
            roof_carrier: "Roof-top carrier required for extra bags",
            airport_luggage: "Airport luggage: checked bags plus cabin bags",
            family_luggage: "Family trip luggage with multiple suitcases",
            no_cng_boot: "Avoid CNG boot-space issue; luggage space must be clear"
        },
        paymentMethod: {
            cash: "Cash payment to driver after ride",
            upi: "UPI payment using Indian payment apps",
            card: "Card payment by debit or credit card",
            wallet: "GOindiaRIDE wallet payment",
            online: "Online payment link before ride",
            paypal: "PayPal payment for international customer",
            razorpay: "Razorpay online payment gateway",
            advance_partial: "Partial advance payment with balance after ride",
            corporate_invoice: "Corporate invoice / account billing",
            net_banking: "Net banking payment before ride",
            ewallet: "External e-wallet payment option",
            pay_later: "Pay-later / collect balance after ride",
            full_advance: "Full advance prepaid booking"
        }
    };

    const BOOKING_REQUIREMENT_OPTIONS = {
        tripPlan: Object.values(BOOKING_AUTOFILL_FULL_LABELS.tripPlan).map((value) => [value, value]),
        vehicleType: Object.values(BOOKING_AUTOFILL_FULL_LABELS.vehicleType).map((value) => [value, value]),
        vehicleModel: Object.values(BOOKING_AUTOFILL_FULL_LABELS.vehicleModel).map((value) => [value, value]),
        luggage: Object.values(BOOKING_AUTOFILL_FULL_LABELS.luggage).map((value) => [value, value]),
        paymentMethod: Object.values(BOOKING_AUTOFILL_FULL_LABELS.paymentMethod).map((value) => [value, value])
    };

    function normalizeAutofillFullText(fieldName, value) {
        const text = cleanText(value);
        if (!text) return "";
        const labels = Object.values(BOOKING_AUTOFILL_FULL_LABELS[fieldName] || {});
        if (labels.includes(text)) return text;
        const key = text.toLowerCase().replace(/[\s-]+/g, "_");
        const label = BOOKING_AUTOFILL_FULL_LABELS[fieldName]?.[key];
        if (label) return label;
        return text
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function normalizeAutofillDate(value) {
        const text = cleanText(value);
        if (!text) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) return "";
        return date.toISOString().slice(0, 10);
    }

    function normalizeAutofillTime(value) {
        const text = cleanText(value);
        if (!text) return "";
        const direct = text.match(/^(\d{1,2}):(\d{2})/);
        if (direct) return `${direct[1].padStart(2, "0")}:${direct[2]}`;
        const meridian = text.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
        if (!meridian) return "";
        let hours = Number(meridian[1]);
        const minutes = meridian[2] || "00";
        const suffix = meridian[3].toLowerCase();
        if (suffix === "pm" && hours < 12) hours += 12;
        if (suffix === "am" && hours === 12) hours = 0;
        return `${String(hours).padStart(2, "0")}:${minutes}`;
    }

    function normalizeAutofillTemplateValue(fieldName, value) {
        if (["tripPlan", "vehicleType", "vehicleModel", "luggage", "paymentMethod"].includes(fieldName)) {
            return normalizeAutofillFullText(fieldName, value);
        }
        if (["rideDate", "returnDate"].includes(fieldName)) return normalizeAutofillDate(value);
        if (["rideTime", "returnTime"].includes(fieldName)) return normalizeAutofillTime(value);
        if (fieldName === "customerPhone") return firstUsableAdminPhone(value) || cleanText(value);
        if (fieldName === "customerEmail") return normalizeAdminEmailValue(value);
        return value;
    }

    function buildDefaultBookingAutofillTemplate(form) {
        const customer = findAdminCreateCustomer(form?.elements?.customerKey?.value || "");
        return {
            customerName: cleanText(customer?.name || customer?.fullname || customer?.customerName || "Walk-in Customer"),
            customerPhone: firstUsableAdminPhone(customer?.phone, customer?.mobile, customer?.customerPhone) || "+919999999999",
            customerEmail: normalizeAdminEmailValue(customer?.email || customer?.customerEmail || "customer@goindiaride.in"),
            pickup: "Udaipur, Rajasthan",
            dropoff: "Jaipur, Rajasthan",
            rideDate: defaultAdminRideDate(),
            rideTime: defaultAdminRideTime(),
            returnDate: "",
            returnTime: "",
            tripPlan: "City / local ride within one city",
            vehicleType: "Sedan comfort ride category for family or business travel",
            vehicleModel: "Sedan car with AC comfort and boot space",
            passengers: 1,
            luggage: "No luggage",
            paymentMethod: "Cash payment to driver after ride",
            fare: 0,
            distanceKm: 0,
            driverId: "",
            driverName: "",
            status: "pending_admin_review",
            adminReviewStatus: "pending",
            stops: "No route stops requested",
            notes: "Admin assisted booking with complete customer, trip, fare, payment, safety and review details filled.",
            specialRequests: JSON.stringify({
                trip_assistance: "Customer support can confirm route, fare and timing before dispatch",
                driver_preference: "Verified GOindiaRIDE driver with clean vehicle and polite behaviour",
                communication: "Call or WhatsApp customer before pickup"
            }, null, 2),
            safetyAccessibility: JSON.stringify({
                safety_priority: "Share ride details with customer and keep SOS support available",
                accessibility: "Ask customer if wheelchair, senior citizen support or child seat is needed",
                luggage_help: "Driver should help with luggage at pickup and drop"
            }, null, 2),
            adminEditReason: "Autofilled complete booking details so admin can create or edit without typing."
        };
    }

    function mergeAutofillTemplateWithDefaults(template = {}, form) {
        const defaults = buildDefaultBookingAutofillTemplate(form);
        const merged = { ...defaults };
        BOOKING_AUTOFILL_FIELDS.forEach((fieldName) => {
            if (!Object.prototype.hasOwnProperty.call(template, fieldName)) return;
            const value = normalizeAutofillTemplateValue(fieldName, template[fieldName]);
            if (cleanText(value) || String(value ?? "") === "0") merged[fieldName] = value;
        });
        return merged;
    }

    function normalizePartialAutofillTemplate(template = {}) {
        const normalized = {};
        BOOKING_AUTOFILL_FIELDS.forEach((fieldName) => {
            if (!Object.prototype.hasOwnProperty.call(template, fieldName)) return;
            const value = normalizeAutofillTemplateValue(fieldName, template[fieldName]);
            if (cleanText(value) || String(value ?? "") === "0") normalized[fieldName] = value;
        });
        return normalized;
    }

    function buildAutofillTemplateFromBooking(row = {}) {
        const specialRequests = isPlainObject(row.specialRequests)
            ? row.specialRequests
            : (isPlainObject(row.customerFeatures?.specialRequests) ? row.customerFeatures.specialRequests : {});
        const safetyAccessibility = isPlainObject(row.safetyAccessibility)
            ? row.safetyAccessibility
            : (isPlainObject(row.customerFeatures?.safetyAccessibility) ? row.customerFeatures.safetyAccessibility : {});
        return {
            customerName: cleanText(row.customerName || row.customerSnapshot?.name || row.name || ""),
            customerPhone: firstUsableAdminPhone(row.customerPhone, row.customerSnapshot?.phone, row.phone, row.mobile),
            customerEmail: normalizeAdminEmailValue(row.customerEmail || row.customerSnapshot?.email || row.email || ""),
            pickup: cleanText(row.pickup || row.pickupLocation || row.from || ""),
            dropoff: cleanText(row.dropoff || row.dropLocation || row.drop || row.to || ""),
            rideDate: normalizeAutofillDate(row.rideDate || row.pickupDate || row.date || row.outboundDateTime || row.createdAt),
            rideTime: normalizeAutofillTime(row.rideTime || row.pickupTime || row.time || row.outboundDateTime),
            returnDate: normalizeAutofillDate(row.returnDate || row.returnTrip?.returnDate || row.returnDateTime),
            returnTime: normalizeAutofillTime(row.returnTime || row.returnTrip?.returnTime || row.returnDateTime),
            tripPlan: normalizeAutofillFullText("tripPlan", row.tripPlan || row.bookingMode || row.mode || ""),
            vehicleType: normalizeAutofillFullText("vehicleType", row.vehicleType || row.rideType || ""),
            vehicleModel: normalizeAutofillFullText("vehicleModel", row.vehicleModel || ""),
            passengers: normalizeAutofillNumber(row.passengers, 1),
            luggage: normalizeAutofillFullText("luggage", row.luggage || ""),
            paymentMethod: normalizeAutofillFullText("paymentMethod", row.paymentMethod || row.payment?.method || row.paymentMode || ""),
            fare: toAmount(row.fare || row.totalFare || row.amount || row.finalFare),
            distanceKm: toAmount(row.distanceKm || row.distance || row.fareQuote?.distanceKm || row.fareBreakdown?.distanceKm),
            driverId: cleanText(row.driverId || row.assignedDriverId || row.driver?.id || ""),
            driverName: cleanText(row.driverName || row.assignedDriverName || row.driver?.name || ""),
            status: cleanText(row.status || "pending_admin_review"),
            adminReviewStatus: cleanText(row.adminReviewStatus || "pending"),
            stops: serializeList(Array.isArray(row.stops) ? row.stops : []),
            notes: cleanText(row.notes || ""),
            specialRequests: serializeMap(specialRequests),
            safetyAccessibility: serializeMap(safetyAccessibility),
            adminEditReason: cleanText(row.adminEditReason || row.editHistory?.[row.editHistory.length - 1]?.reason || "Autofilled with full booking details from recent admin booking data."),
            updatedAt: cleanText(row.updatedAt || row.lastEditedAt || row.createdAt || "")
        };
    }

    function getBookingFreshnessForAutofill(row = {}) {
        const source = row || {};
        const points = [
            source.adminLastEditedAt,
            source.lastEditedAt,
            source.updatedAt,
            source.createdAt
        ]
            .map((value) => new Date(value || 0).getTime())
            .filter((value) => Number.isFinite(value));
        return points.length ? Math.max(...points) : 0;
    }

    function buildBookingCustomerKeySet(row = {}) {
        const keySet = new Set();
        const addKey = (value) => {
            const token = cleanText(value).toLowerCase();
            if (token) keySet.add(token);
        };
        addKey(row.customerId);
        addKey(row.userId);
        addKey(row.backendUserId);
        addKey(row.id);
        addKey(row.customerEmail);
        addKey(row.email);
        const phone = firstUsableAdminPhone(row.customerPhone, row.phone, row.mobile, row.contact);
        if (phone) addKey(phone);
        return keySet;
    }

    function findLatestTemplateBookingForCustomer(customerKey = "") {
        const safeKey = cleanText(customerKey).toLowerCase();
        if (!safeKey) return null;
        return state.bookings
            .filter((row) => row && !isInternalDiagnosticBooking(row))
            .filter((row) => buildBookingCustomerKeySet(row).has(safeKey))
            .sort((left, right) => getBookingFreshnessForAutofill(right) - getBookingFreshnessForAutofill(left))[0] || null;
    }

    function findLatestGlobalTemplateBooking() {
        return state.bookings
            .filter((row) => row && !isInternalDiagnosticBooking(row))
            .sort((left, right) => getBookingFreshnessForAutofill(right) - getBookingFreshnessForAutofill(left))[0] || null;
    }

    function setFormFieldValue(form, name, value, fillMissingOnly = false) {
        if (!form || !name) return false;
        const field = form.elements[name];
        if (!field) return false;
        const nextValue = String(value ?? "");
        const currentValue = String(field.value || "");
        if (fillMissingOnly && cleanText(currentValue)) return false;
        if (currentValue === nextValue) return false;
        field.value = nextValue;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function renderLocationSuggestions(id) {
        const suggestions = new Set();
        const addLocation = (value) => {
            const text = cleanText(value);
            if (text && text.length <= 160) suggestions.add(text);
        };
        state.bookings.forEach((booking) => {
            addLocation(booking.pickup);
            addLocation(booking.pickupLocation);
            addLocation(booking.from);
            addLocation(booking.dropoff);
            addLocation(booking.dropLocation);
            addLocation(booking.drop);
            addLocation(booking.to);
        });
        const options = Array.from(suggestions).slice(0, 120).map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
        return `<datalist id="${escapeHtml(id)}">${options}</datalist>`;
    }

    function applyBookingTemplateToForm(form, template = {}, options = {}) {
        if (!form || !isPlainObject(template)) return false;
        const fillMissingOnly = Boolean(options.fillMissingOnly);
        let changed = false;
        BOOKING_AUTOFILL_FIELDS.forEach((fieldName) => {
            if (!Object.prototype.hasOwnProperty.call(template, fieldName)) return;
            changed = setFormFieldValue(form, fieldName, template[fieldName], fillMissingOnly) || changed;
        });
        return changed;
    }

    function saveFormAutofillMemory(form) {
        if (!form) return;
        const currentMemory = readAdminAutofillMemory();
        const nextMemory = { ...currentMemory };
        BOOKING_AUTOFILL_FIELDS.forEach((fieldName) => {
            if (!form.elements[fieldName]) return;
            const value = form.elements[fieldName].value;
            if (cleanText(value) || String(value || "") === "0") {
                nextMemory[fieldName] = value;
            }
        });
        nextMemory.updatedAt = new Date().toISOString();
        writeAdminAutofillMemory(nextMemory);
    }

    function applyMemoryToForm(form, options = {}) {
        const memory = readAdminAutofillMemory();
        if (!isPlainObject(memory) || !Object.keys(memory).length) return false;
        return applyBookingTemplateToForm(form, normalizePartialAutofillTemplate(memory), options);
    }

    function normalizeAdminPhoneValue(value) {
        const raw = cleanText(value);
        if (!raw) return "";
        const compact = raw.replace(/\s+/g, "");
        if (compact.startsWith("+")) {
            const digits = compact.slice(1).replace(/\D/g, "");
            return digits ? `+${digits}` : "";
        }
        const digits = compact.replace(/\D/g, "");
        if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
        return digits ? `+${digits}` : "";
    }

    function normalizeAdminEmailValue(value) {
        return cleanText(value).toLowerCase();
    }

    function adminPhoneLooksUsable(value) {
        const digits = cleanText(value).replace(/\D/g, "");
        if (!digits || digits === "91") return false;
        return digits.length >= 8 && digits.length <= 15;
    }

    function firstUsableAdminPhone(...values) {
        for (const value of values) {
            const phone = normalizeAdminPhoneValue(value);
            if (adminPhoneLooksUsable(phone)) return phone;
        }
        return "";
    }

    function adminAccountRole(row = {}) {
        return cleanText(row.role || row.userRole || row.accountType || row.userType || row.type || row.portalType).toLowerCase();
    }

    function adminIdentityName(row = {}) {
        return cleanText(row.driverName || row.name || row.fullName || row.fullname || row.customerName).toLowerCase();
    }

    function adminRowLooksDriver(row = {}) {
        const role = adminAccountRole(row);
        const source = cleanText(row.sourceKey || row.source || "").toLowerCase();
        const identityName = adminIdentityName(row);
        const hasCustomerContact = Boolean(
            row.customerId
            || row.customerName
            || row.customerEmail
            || row.email
            || firstUsableAdminPhone(row.customerPhone, row.phone, row.mobile)
        );
        return role === "driver"
            || role.includes("driver")
            || source.includes("driver")
            || Boolean(identityName.includes("driver") && !hasCustomerContact)
            || Boolean(row.driverId)
            || Boolean(row.driverName)
            || Boolean(row.vehicleNumber)
            || Boolean(row.vehicleModel && !row.customerId && !row.customerName)
            || Boolean(row.vehicleType && !row.customerId && !row.customerName && !row.customerEmail && !row.customerPhone);
    }

    function adminRowLooksCustomer(row = {}) {
        const role = adminAccountRole(row);
        if (role && role.includes("driver")) return false;
        if (role && (role.includes("customer") || role.includes("user"))) return true;
        return Boolean(
            row.customerId
            || row.customerName
            || row.customerEmail
            || row.email
            || firstUsableAdminPhone(row.customerPhone, row.phone, row.mobile)
        );
    }

    function getCustomerEntityKey(row = {}) {
        return cleanText(row.customerId || row.userId || row.id || row.email || row.customerEmail || firstUsableAdminPhone(row.phone, row.mobile, row.customerPhone)).toLowerCase();
    }

    function defaultAdminRideDate() {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        return date.toISOString().slice(0, 10);
    }

    function defaultAdminRideTime() {
        const date = new Date();
        date.setHours(date.getHours() + 2, 0, 0, 0);
        return date.toTimeString().slice(0, 5);
    }

    function generateAdminBookingId() {
        const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 14);
        const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
        return `BKADM${stamp}${suffix}`;
    }

    function ensureBookingEditorModal() {
        let modal = $("#bookingEditModal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "bookingEditModal";
        modal.className = "booking-edit-modal";
        modal.setAttribute("aria-hidden", "true");
        modal.innerHTML = `
            <div class="booking-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="bookingEditTitle">
                <header>
                    <div>
                        <span class="section-kicker">Full control</span>
                        <h2 id="bookingEditTitle">Edit Booking</h2>
                    </div>
                    <button class="icon-button" data-close-booking-editor type="button" title="Close editor"><i class="fas fa-xmark"></i></button>
                </header>
                <form id="bookingEditForm"></form>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    function ensureAdminCreateBookingModal() {
        let modal = $("#adminCreateBookingModal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "adminCreateBookingModal";
        modal.className = "booking-edit-modal";
        modal.setAttribute("aria-hidden", "true");
        modal.innerHTML = `
            <div class="booking-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="adminCreateBookingTitle">
                <header>
                    <div>
                        <span class="section-kicker">Admin customer assist</span>
                        <h2 id="adminCreateBookingTitle">Add Booking For Customer</h2>
                    </div>
                    <button class="icon-button" data-close-admin-create-booking type="button" title="Close booking creator"><i class="fas fa-xmark"></i></button>
                </header>
                <form id="adminCreateBookingForm"></form>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    function renderAdminCustomerOptions() {
        const customers = getCustomerRows().slice(0, 300);
        if (!customers.length) {
            return `<option value="">Manual customer details</option>`;
        }
        return [
            `<option value="">Manual customer details</option>`,
            ...customers.map((customer) => {
                const key = getCustomerEntityKey(customer);
                const label = [
                    customer.name || customer.fullname || "Customer",
                    firstUsableAdminPhone(customer.phone, customer.mobile, customer.customerPhone) || "",
                    customer.email || ""
                ].filter(Boolean).join(" | ");
                return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`;
            })
        ].join("");
    }

    function buildAdminCreateBookingForm() {
        const customerFields = [
            `<label class="booking-edit-field wide">
                <span>Select existing customer</span>
                <select name="customerKey" id="adminCreateCustomerSelect">${renderAdminCustomerOptions()}</select>
            </label>`,
            renderEditInput("customerName", "Customer name", ""),
            renderEditInput("customerPhone", "Customer phone", "", 'placeholder="+91XXXXXXXXXX" autocomplete="tel"'),
            renderEditInput("customerEmail", "Customer email", "", 'type="email" placeholder="name@domain.com" autocomplete="email"')
        ];
        const tripFields = [
            renderEditInput("pickup", "Pickup", "", 'id="adminCreatePickupInput" required list="adminCreatePickupSuggestions" autocomplete="street-address"'),
            renderEditInput("dropoff", "Drop", "", 'id="adminCreateDropoffInput" required list="adminCreateDropSuggestions" autocomplete="street-address"'),
            renderEditInput("rideDate", "Ride date", defaultAdminRideDate(), 'type="date" required'),
            renderEditInput("rideTime", "Ride time", defaultAdminRideTime(), 'type="time" required'),
            renderEditInput("passengers", "Passengers", 1, 'type="number" min="1" max="20"'),
            renderEditInput("fare", "Fare / amount", 0, 'type="number" min="0" step="1"')
        ];
        const requirementFields = [
            renderEditDetailedSelect("tripPlan", "Trip plan", "city", BOOKING_REQUIREMENT_OPTIONS.tripPlan),
            renderEditDetailedSelect("vehicleType", "Vehicle type", "sedan", BOOKING_REQUIREMENT_OPTIONS.vehicleType),
            renderEditDetailedSelect("vehicleModel", "Vehicle model", "sedan_car", BOOKING_REQUIREMENT_OPTIONS.vehicleModel),
            renderEditDetailedSelect("luggage", "Luggage", "none", BOOKING_REQUIREMENT_OPTIONS.luggage),
            renderEditDetailedSelect("paymentMethod", "Payment method", "cash", BOOKING_REQUIREMENT_OPTIONS.paymentMethod),
            renderEditInput("distanceKm", "Distance KM", 0, 'type="number" min="0" step="0.1"')
        ];
        const routeFields = [
            renderEditInput("returnDate", "Return date", "", 'type="date"'),
            renderEditInput("returnTime", "Return time", "", 'type="time"'),
            renderEditTextarea("stops", "Stops", "", 'placeholder="One stop per line"'),
            renderEditTextarea("specialRequests", "Special requests", "", 'placeholder="JSON or comma list"'),
            renderEditTextarea("safetyAccessibility", "Safety and accessibility", "", 'placeholder="JSON or comma list"')
        ];
        const adminFields = [
            `<label class="booking-edit-field">
                <span>Booking status</span>
                <select name="status">${renderSelectOptions(BOOKING_STATUS_OPTIONS, "pending_admin_review")}</select>
            </label>`,
            `<label class="booking-edit-field">
                <span>Admin review</span>
                <select name="adminReviewStatus">${renderSelectOptions(ADMIN_REVIEW_OPTIONS, "pending")}</select>
            </label>`,
            renderEditTextarea("notes", "Admin/customer notes", "Booking created by admin for customer assistance."),
            renderEditTextarea("adminEditReason", "Admin note", "Admin created this booking for the customer.", 'placeholder="Reason shown in audit/customer notification"')
        ];
        return `
            <div class="booking-edit-sections">
                ${renderBookingEditSection("Trip essentials", tripFields, { open: true })}
                ${renderBookingEditSection("Ride requirements", requirementFields)}
                ${renderBookingEditSection("Customer details", customerFields)}
                ${renderBookingEditSection("Return, stops and safety", routeFields)}
                ${renderBookingEditSection("Admin status and notes", adminFields)}
            </div>
            ${renderLocationSuggestions("adminCreatePickupSuggestions")}
            ${renderLocationSuggestions("adminCreateDropSuggestions")}
            <div class="booking-edit-actions">
                <button class="text-button" data-close-admin-create-booking type="button">Cancel</button>
                <button class="secondary-action" data-admin-create-autofill type="button"><i class="fas fa-wand-magic-sparkles"></i> Auto fill</button>
                <button class="primary-action" type="submit"><i class="fas fa-plus"></i> Add booking</button>
            </div>
        `;
    }

    function setAdminModalBodyLock() {
        const hasOpenModal = Boolean(
            $("#adminCreateBookingModal")?.classList.contains("open")
            || $("#bookingEditModal")?.classList.contains("open")
        );
        document.body.classList.toggle("admin-modal-open", hasOpenModal);
    }

    function findAdminCreateCustomer(key) {
        const safeKey = cleanText(key).toLowerCase();
        if (!safeKey) return null;
        return getCustomerRows().find((customer) => getCustomerEntityKey(customer) === safeKey) || null;
    }

    function hydrateAdminCreateCustomerFields(form, customer) {
        if (!form) return;
        if (!customer) {
            if (form.elements.customerName) form.elements.customerName.value = "";
            if (form.elements.customerPhone) form.elements.customerPhone.value = "";
            if (form.elements.customerEmail) form.elements.customerEmail.value = "";
            return;
        }
        const name = cleanText(customer.name || customer.fullname || customer.customerName || "");
        const phone = firstUsableAdminPhone(customer.phone, customer.mobile, customer.customerPhone);
        const email = normalizeAdminEmailValue(customer.email || customer.customerEmail || "");
        if (form.elements.customerName && name) form.elements.customerName.value = name;
        if (form.elements.customerPhone && phone) form.elements.customerPhone.value = phone;
        if (form.elements.customerEmail && email) form.elements.customerEmail.value = email;
    }

    function resolveCreateFormCustomerKey(form) {
        if (!form) return "";
        const selectKey = cleanText(form.elements.customerKey?.value || "").toLowerCase();
        if (selectKey) return selectKey;
        const email = normalizeAdminEmailValue(form.elements.customerEmail?.value || "");
        if (email) return email;
        const phone = firstUsableAdminPhone(form.elements.customerPhone?.value || "");
        return cleanText(phone).toLowerCase();
    }

    function applyCreateFormAutofill(form, options = {}) {
        if (!form) return { changed: false, source: "none" };
        const fillMissingOnly = Boolean(options.fillMissingOnly);
        const customerKey = resolveCreateFormCustomerKey(form);
        const customerTemplateRow = customerKey ? findLatestTemplateBookingForCustomer(customerKey) : null;
        const globalTemplateRow = customerTemplateRow ? null : findLatestGlobalTemplateBooking();
        const sourceTemplate = customerTemplateRow
            ? buildAutofillTemplateFromBooking(customerTemplateRow)
            : (globalTemplateRow ? buildAutofillTemplateFromBooking(globalTemplateRow) : {});
        const completeTemplate = mergeAutofillTemplateWithDefaults(sourceTemplate, form);
        let changed = false;

        changed = applyBookingTemplateToForm(form, completeTemplate, { fillMissingOnly }) || changed;
        changed = applyMemoryToForm(form, { fillMissingOnly }) || changed;
        if (changed) saveFormAutofillMemory(form);

        return {
            changed,
            source: customerTemplateRow ? "customer_latest_booking" : (globalTemplateRow ? "recent_booking" : "default_full_booking")
        };
    }

    function applyEditFormAutofill(form, booking, options = {}) {
        if (!form || !booking) return { changed: false, source: "none" };
        const fillMissingOnly = options.fillMissingOnly !== false;
        const customerKeys = buildBookingCustomerKeySet(booking);
        let templateRow = null;
        for (const key of customerKeys) {
            templateRow = findLatestTemplateBookingForCustomer(key);
            if (templateRow && cleanText(templateRow.bookingId || templateRow.id) !== cleanText(booking.bookingId || booking.id)) break;
            templateRow = null;
        }
        if (!templateRow) templateRow = findLatestGlobalTemplateBooking();

        let changed = false;
        const sourceTemplate = templateRow
            ? buildAutofillTemplateFromBooking(templateRow)
            : buildAutofillTemplateFromBooking(booking);
        const completeTemplate = mergeAutofillTemplateWithDefaults(sourceTemplate, form);
        changed = applyBookingTemplateToForm(form, completeTemplate, { fillMissingOnly }) || changed;
        changed = applyMemoryToForm(form, { fillMissingOnly }) || changed;
        if (changed) saveFormAutofillMemory(form);
        return { changed, source: templateRow ? "recent_template_booking" : "default_full_booking" };
    }

    function openAdminCreateBookingModal() {
        const modal = ensureAdminCreateBookingModal();
        const form = $("#adminCreateBookingForm", modal);
        if (form) {
            form.innerHTML = buildAdminCreateBookingForm();
            const select = form.querySelector("#adminCreateCustomerSelect");
            if (select && !cleanText(select.value)) {
                const firstRealOption = Array.from(select.options || []).find((option) => cleanText(option?.value || ""));
                if (firstRealOption) {
                    select.value = firstRealOption.value;
                    const customer = findAdminCreateCustomer(firstRealOption.value);
                    hydrateAdminCreateCustomerFields(form, customer);
                }
            }
            applyCreateFormAutofill(form, { fillMissingOnly: false });
            connectBookingAutocompleteForInputs(["adminCreatePickupInput", "adminCreateDropoffInput"]);
        }
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        setAdminModalBodyLock();
        modal.querySelector("input[name='pickup']")?.focus();
    }

    function closeAdminCreateBookingModal() {
        const modal = $("#adminCreateBookingModal");
        if (!modal) return;
        const form = $("#adminCreateBookingForm", modal);
        if (form) saveFormAutofillMemory(form);
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        setAdminModalBodyLock();
    }

    function buildBookingEditForm(booking) {
        const specialRequests = isPlainObject(booking.specialRequests)
            ? booking.specialRequests
            : booking.customerFeatures?.specialRequests;
        const safetyAccessibility = isPlainObject(booking.safetyAccessibility)
            ? booking.safetyAccessibility
            : booking.customerFeatures?.safetyAccessibility;
        const customerFields = [
            renderEditInput("customerName", "Customer name", booking.customerName),
            renderEditInput("customerPhone", "Customer phone", booking.customerPhone),
            renderEditInput("customerEmail", "Customer email", booking.customerEmail, 'type="email"')
        ];
        const tripFields = [
            renderEditInput("pickup", "Pickup", booking.pickup || booking.pickupLocation, 'id="adminEditPickupInput" list="adminEditPickupSuggestions" autocomplete="street-address"'),
            renderEditInput("dropoff", "Drop", booking.dropoff || booking.dropLocation, 'id="adminEditDropoffInput" list="adminEditDropSuggestions" autocomplete="street-address"'),
            renderEditInput("rideDate", "Ride date", booking.rideDate, 'type="date"'),
            renderEditInput("rideTime", "Ride time", booking.rideTime, 'type="time"'),
            renderEditInput("passengers", "Passengers", booking.passengers || 1, 'type="number" min="1" max="20"'),
            renderEditInput("fare", "Fare / amount", booking.fare || booking.totalFare || booking.amount || booking.finalFare, 'type="number" min="0" step="1"')
        ];
        const requirementFields = [
            renderEditDetailedSelect("tripPlan", "Trip plan", booking.tripPlan || booking.bookingMode || booking.mode, BOOKING_REQUIREMENT_OPTIONS.tripPlan),
            renderEditDetailedSelect("vehicleType", "Vehicle type", booking.vehicleType || booking.rideType, BOOKING_REQUIREMENT_OPTIONS.vehicleType),
            renderEditDetailedSelect("vehicleModel", "Vehicle model", booking.vehicleModel, BOOKING_REQUIREMENT_OPTIONS.vehicleModel),
            renderEditDetailedSelect("luggage", "Luggage", booking.luggage, BOOKING_REQUIREMENT_OPTIONS.luggage),
            renderEditDetailedSelect("paymentMethod", "Payment method", booking.paymentMethod || booking.payment?.method || booking.paymentMode, BOOKING_REQUIREMENT_OPTIONS.paymentMethod),
            renderEditInput("distanceKm", "Distance KM", booking.distanceKm || booking.distance, 'type="number" min="0" step="0.1"')
        ];
        const routeFields = [
            renderEditInput("returnDate", "Return date", booking.returnDate || booking.returnTrip?.returnDate, 'type="date"'),
            renderEditInput("returnTime", "Return time", booking.returnTime || booking.returnTrip?.returnTime, 'type="time"'),
            renderEditTextarea("stops", "Stops", serializeList(booking.stops), 'placeholder="One stop per line"'),
            renderEditTextarea("specialRequests", "Special requests", serializeMap(specialRequests), 'placeholder=\'JSON or comma list: pet=true, extra_waiting=true\''),
            renderEditTextarea("safetyAccessibility", "Safety and accessibility", serializeMap(safetyAccessibility), 'placeholder=\'JSON or comma list: wheelchair=true, child_seat=true\'')
        ];
        const adminFields = [
            renderEditInput("driverId", "Driver ID", booking.driverId),
            renderEditInput("driverName", "Driver name", booking.driverName),
            `<label class="booking-edit-field">
                <span>Booking status</span>
                <select name="status">${renderSelectOptions(BOOKING_STATUS_OPTIONS, booking.status)}</select>
            </label>`,
            `<label class="booking-edit-field">
                <span>Admin review</span>
                <select name="adminReviewStatus">${renderSelectOptions(ADMIN_REVIEW_OPTIONS, booking.adminReviewStatus || "pending")}</select>
            </label>`,
            renderEditTextarea("notes", "Notes", booking.notes),
            renderEditTextarea("adminEditReason", "Admin edit note", "", 'placeholder="Reason shown in audit/customer notification"')
        ];
        return `
            <input type="hidden" name="bookingId" value="${escapeHtml(booking.bookingId)}">
            <div class="booking-edit-sections">
                ${renderBookingEditSection("Trip essentials", tripFields, { open: true })}
                ${renderBookingEditSection("Ride requirements", requirementFields)}
                ${renderBookingEditSection("Customer details", customerFields)}
                ${renderBookingEditSection("Return, stops and safety", routeFields)}
                ${renderBookingEditSection("Driver, status and notes", adminFields)}
            </div>
            ${renderLocationSuggestions("adminEditPickupSuggestions")}
            ${renderLocationSuggestions("adminEditDropSuggestions")}
            <div class="booking-edit-actions">
                <button class="text-button" data-close-booking-editor type="button">Cancel</button>
                <button class="secondary-action" data-booking-edit-autofill type="button"><i class="fas fa-wand-magic-sparkles"></i> Auto fill</button>
                <button class="primary-action" type="submit"><i class="fas fa-floppy-disk"></i> Save booking</button>
            </div>
        `;
    }

    function openBookingEditor(bookingId) {
        const booking = state.bookings.find((item) => item.bookingId === bookingId);
        if (!booking) {
            showToast("Booking not found.");
            return;
        }

        state.editingBookingId = bookingId;
        const modal = ensureBookingEditorModal();
        const title = $("#bookingEditTitle", modal);
        const form = $("#bookingEditForm", modal);
        if (title) title.textContent = `Edit Booking ${bookingId}`;
        if (form) {
            form.innerHTML = buildBookingEditForm(booking);
            applyEditFormAutofill(form, booking, { fillMissingOnly: false });
            connectBookingAutocompleteForInputs(["adminEditPickupInput", "adminEditDropoffInput"]);
        }
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        setAdminModalBodyLock();
        modal.querySelector("input[name='pickup']")?.focus();
    }

    function closeBookingEditor() {
        const modal = $("#bookingEditModal");
        state.editingBookingId = "";
        if (!modal) return;
        const form = $("#bookingEditForm", modal);
        if (form) saveFormAutofillMemory(form);
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        setAdminModalBodyLock();
    }

    function collectBookingEditForm(form) {
        const data = new FormData(form);
        const text = (name) => cleanText(data.get(name));
        return {
            bookingId: text("bookingId"),
            customerName: text("customerName"),
            customerPhone: text("customerPhone"),
            customerEmail: text("customerEmail"),
            pickup: text("pickup"),
            dropoff: text("dropoff"),
            rideDate: text("rideDate"),
            rideTime: text("rideTime"),
            returnDate: text("returnDate"),
            returnTime: text("returnTime"),
            tripPlan: text("tripPlan"),
            vehicleType: text("vehicleType"),
            vehicleModel: text("vehicleModel"),
            passengers: Math.min(Math.max(Number(text("passengers")) || 1, 1), 20),
            luggage: text("luggage"),
            paymentMethod: text("paymentMethod"),
            fare: toAmount(text("fare")),
            distanceKm: toAmount(text("distanceKm")),
            driverId: text("driverId"),
            driverName: text("driverName"),
            status: text("status") || "pending_admin_review",
            adminReviewStatus: text("adminReviewStatus") || "pending",
            stops: parseTextList(data.get("stops")),
            notes: text("notes"),
            specialRequests: parseFlexibleMap(data.get("specialRequests")),
            safetyAccessibility: parseFlexibleMap(data.get("safetyAccessibility")),
            adminEditReason: text("adminEditReason")
        };
    }

    function collectAdminCreateBookingForm(form) {
        const data = new FormData(form);
        const text = (name) => cleanText(data.get(name));
        const selectedCustomer = findAdminCreateCustomer(text("customerKey"));
        const selectedKey = selectedCustomer ? getCustomerEntityKey(selectedCustomer) : "";
        const customerName = text("customerName") || cleanText(selectedCustomer?.name || selectedCustomer?.fullname || selectedCustomer?.customerName || "Customer");
        const customerPhone = firstUsableAdminPhone(text("customerPhone"), selectedCustomer?.phone, selectedCustomer?.mobile, selectedCustomer?.customerPhone);
        const customerEmail = normalizeAdminEmailValue(text("customerEmail") || selectedCustomer?.email || selectedCustomer?.customerEmail || "");
        return {
            bookingId: generateAdminBookingId(),
            customerKey: selectedKey,
            customerId: cleanText(selectedCustomer?.id || selectedCustomer?.userId || selectedCustomer?.customerId || selectedKey || customerEmail || customerPhone),
            customerName,
            customerPhone,
            customerEmail,
            pickup: text("pickup"),
            dropoff: text("dropoff"),
            rideDate: text("rideDate"),
            rideTime: text("rideTime"),
            returnDate: text("returnDate"),
            returnTime: text("returnTime"),
            tripPlan: text("tripPlan") || "city",
            vehicleType: text("vehicleType") || "sedan",
            vehicleModel: text("vehicleModel"),
            passengers: Math.min(Math.max(Number(text("passengers")) || 1, 1), 20),
            luggage: text("luggage") || "none",
            paymentMethod: text("paymentMethod") || "cash",
            fare: toAmount(text("fare")),
            distanceKm: toAmount(text("distanceKm")),
            status: text("status") || "pending_admin_review",
            adminReviewStatus: text("adminReviewStatus") || "pending",
            stops: parseTextList(data.get("stops")),
            notes: text("notes"),
            specialRequests: parseFlexibleMap(data.get("specialRequests")),
            safetyAccessibility: parseFlexibleMap(data.get("safetyAccessibility")),
            adminEditReason: text("adminEditReason") || "Admin created this booking for the customer."
        };
    }

    function validateAdminCreateBooking(data) {
        if (!cleanText(data.customerName)) return "Customer name is required.";
        if (!cleanText(data.customerPhone) && !cleanText(data.customerEmail)) return "Customer phone or email is required.";
        if (cleanText(data.customerPhone) && !adminPhoneLooksUsable(data.customerPhone)) return "Enter a full customer phone number, not only country code.";
        if (!cleanText(data.pickup)) return "Pickup is required.";
        if (!cleanText(data.dropoff)) return "Drop is required.";
        if (!cleanText(data.rideDate)) return "Ride date is required.";
        if (!cleanText(data.rideTime)) return "Ride time is required.";
        return "";
    }

    function buildAdminCreatedBooking(data) {
        const now = new Date().toISOString();
        const amount = toAmount(data.fare);
        const distanceKm = toAmount(data.distanceKm);
        const customerId = cleanText(data.customerId || data.customerKey || data.customerEmail || data.customerPhone || `admin_customer_${Date.now()}`);
        return {
            id: data.bookingId,
            bookingId: data.bookingId,
            customerId,
            backendUserId: customerId,
            userId: customerId,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerEmail: data.customerEmail,
            customerSnapshot: {
                id: customerId,
                name: data.customerName,
                phone: data.customerPhone,
                email: data.customerEmail
            },
            pickup: data.pickup,
            pickupLocation: data.pickup,
            from: data.pickup,
            dropoff: data.dropoff,
            drop: data.dropoff,
            dropLocation: data.dropoff,
            to: data.dropoff,
            rideDate: data.rideDate,
            rideTime: data.rideTime,
            returnDate: data.returnDate,
            returnTime: data.returnTime,
            returnTrip: {
                enabled: Boolean(data.returnDate || data.returnTime),
                returnDate: data.returnDate || "",
                returnTime: data.returnTime || ""
            },
            tripPlan: data.tripPlan,
            vehicleType: data.vehicleType,
            rideType: data.vehicleType,
            vehicleModel: data.vehicleModel,
            passengers: data.passengers,
            luggage: data.luggage,
            paymentMethod: data.paymentMethod,
            fare: amount,
            totalFare: amount,
            amount,
            finalFare: amount,
            distanceKm,
            distance: distanceKm,
            status: data.status,
            adminReviewStatus: data.adminReviewStatus,
            notes: data.notes,
            stops: data.stops,
            specialRequests: data.specialRequests,
            safetyAccessibility: data.safetyAccessibility,
            customerFeatures: {
                specialRequests: data.specialRequests,
                safetyAccessibility: data.safetyAccessibility
            },
            fareBreakdown: {
                totalFare: amount,
                amount,
                distanceKm,
                distanceSource: "admin_manual",
                adminCreatedAt: now
            },
            fareQuote: {
                amount,
                distanceKm,
                source: "admin_manual"
            },
            mode: "admin_created_for_customer",
            sourceKey: "admin_portal_customer_booking",
            adminCreated: true,
            createdBy: "admin",
            createdAt: now,
            updatedAt: now,
            adminLastEditedAt: now,
            adminEditReason: data.adminEditReason,
            editPolicyVersion: "admin_portal_full_control_v1",
            statusHistory: [
                {
                    status: "admin_created",
                    at: now,
                    source: "standalone_admin_app",
                    note: data.adminEditReason
                }
            ],
            editHistory: [
                {
                    editedAt: now,
                    by: "admin",
                    source: "standalone_admin_app",
                    reason: data.adminEditReason,
                    changedFields: ["booking_created_for_customer"]
                }
            ]
        };
    }

    function sameValue(left, right) {
        return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    }

    function buildBookingEditPatch(booking, data) {
        const current = {
            customerName: booking.customerName || "",
            customerPhone: booking.customerPhone || "",
            customerEmail: booking.customerEmail || "",
            pickup: booking.pickup || booking.pickupLocation || "",
            dropoff: booking.dropoff || booking.dropLocation || "",
            rideDate: booking.rideDate || "",
            rideTime: booking.rideTime || "",
            returnDate: booking.returnDate || booking.returnTrip?.returnDate || "",
            returnTime: booking.returnTime || booking.returnTrip?.returnTime || "",
            tripPlan: booking.tripPlan || booking.bookingMode || booking.mode || "",
            vehicleType: booking.vehicleType || booking.rideType || "",
            vehicleModel: booking.vehicleModel || "",
            passengers: Number(booking.passengers || 1),
            luggage: booking.luggage || "",
            paymentMethod: booking.paymentMethod || booking.payment?.method || booking.paymentMode || "",
            fare: toAmount(booking.fare || booking.totalFare || booking.amount || booking.finalFare),
            distanceKm: toAmount(booking.distanceKm || booking.distance),
            driverId: booking.driverId || "",
            driverName: booking.driverName || "",
            status: booking.status || "pending_admin_review",
            adminReviewStatus: booking.adminReviewStatus || "pending",
            stops: Array.isArray(booking.stops) ? booking.stops : [],
            notes: booking.notes || "",
            specialRequests: isPlainObject(booking.specialRequests)
                ? booking.specialRequests
                : (isPlainObject(booking.customerFeatures?.specialRequests) ? booking.customerFeatures.specialRequests : {}),
            safetyAccessibility: isPlainObject(booking.safetyAccessibility)
                ? booking.safetyAccessibility
                : (isPlainObject(booking.customerFeatures?.safetyAccessibility) ? booking.customerFeatures.safetyAccessibility : {})
        };

        const changedFields = [];
        const previousValues = {};
        const nextValues = {};
        Object.keys(current).forEach((field) => {
            if (sameValue(current[field], data[field])) return;
            changedFields.push(field);
            previousValues[field] = current[field];
            nextValues[field] = data[field];
        });

        if (!changedFields.length) return { changedFields: [], updates: {} };

        const now = new Date().toISOString();
        const reason = data.adminEditReason || "Updated by admin portal.";
        const nextEditCount = Number(booking.editCount || (Array.isArray(booking.editHistory) ? booking.editHistory.length : 0) || 0) + 1;
        const editHistory = Array.isArray(booking.editHistory) ? booking.editHistory.slice(-49) : [];
        const statusHistory = Array.isArray(booking.statusHistory) ? booking.statusHistory.slice(-49) : [];
        const existingFareBreakdown = isPlainObject(booking.fareBreakdown) ? booking.fareBreakdown : {};
        const existingFareQuote = isPlainObject(booking.fareQuote) ? booking.fareQuote : {};
        const existingCustomerSnapshot = isPlainObject(booking.customerSnapshot) ? booking.customerSnapshot : {};
        const existingCustomerFeatures = isPlainObject(booking.customerFeatures) ? booking.customerFeatures : {};

        editHistory.push({
            editedAt: now,
            by: "admin",
            source: "standalone_admin_app",
            reason,
            changedFields,
            previousValues,
            nextValues
        });
        statusHistory.push({
            status: "admin_edited",
            at: now,
            source: "standalone_admin_app",
            note: reason
        });

        const updates = {
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            customerEmail: data.customerEmail,
            customerSnapshot: {
                ...existingCustomerSnapshot,
                name: data.customerName,
                phone: data.customerPhone,
                email: data.customerEmail
            },
            pickup: data.pickup,
            pickupLocation: data.pickup,
            from: data.pickup,
            dropoff: data.dropoff,
            drop: data.dropoff,
            dropLocation: data.dropoff,
            to: data.dropoff,
            rideDate: data.rideDate,
            rideTime: data.rideTime,
            outboundDateTime: buildOutboundDateTime(data.rideDate, data.rideTime),
            returnDate: data.returnDate,
            returnTime: data.returnTime,
            returnTrip: {
                returnDate: data.returnDate,
                returnTime: data.returnTime,
                returnDateTime: buildOutboundDateTime(data.returnDate, data.returnTime)
            },
            tripPlan: data.tripPlan,
            vehicleType: data.vehicleType,
            rideType: data.vehicleType,
            vehicleModel: data.vehicleModel,
            passengers: data.passengers,
            luggage: data.luggage,
            paymentMethod: data.paymentMethod,
            fare: data.fare,
            totalFare: data.fare,
            amount: data.fare,
            finalFare: data.fare,
            distanceKm: data.distanceKm,
            distance: data.distanceKm,
            driverId: data.driverId,
            driverName: data.driverName,
            status: data.status,
            adminReviewStatus: data.adminReviewStatus,
            notes: data.notes,
            stops: data.stops,
            specialRequests: data.specialRequests,
            safetyAccessibility: data.safetyAccessibility,
            customerFeatures: {
                ...existingCustomerFeatures,
                specialRequests: data.specialRequests,
                safetyAccessibility: data.safetyAccessibility
            },
            fareBreakdown: {
                ...existingFareBreakdown,
                totalFare: data.fare,
                distanceKm: data.distanceKm,
                adminEditedAt: now
            },
            fareQuote: {
                ...existingFareQuote,
                amount: data.fare,
                distanceKm: data.distanceKm,
                source: existingFareQuote.source || existingFareBreakdown.distanceSource || "admin_edit"
            },
            editCount: nextEditCount,
            lastEditedAt: now,
            adminLastEditedAt: now,
            adminEditReason: reason,
            editPolicyVersion: "admin_portal_full_control_v1",
            editHistory,
            statusHistory
        };

        return { changedFields, previousValues, nextValues, updates, reason };
    }

    function loadSettings() {
        const parsed = parseJson(localStorage.getItem(SETTINGS_KEY), {});
        const shouldDisableAutoRefresh = localStorage.getItem(AUTO_REFRESH_DISABLED_MIGRATION_KEY) !== "1";
        const settings = {
            autoRefresh: shouldDisableAutoRefresh ? false : parsed.autoRefresh === true,
            compactRows: parsed.compactRows === true,
            portalPopupAlerts: parsed.portalPopupAlerts === true,
            apiBase: resolveAdminApiBase(
                parsed.apiBase
                || localStorage.getItem("goindiaride_admin_api_base")
                || localStorage.getItem("goindiaride_api_base")
                || DEFAULT_API_BASE
            )
        };
        if (shouldDisableAutoRefresh) {
            localStorage.setItem(AUTO_REFRESH_DISABLED_MIGRATION_KEY, "1");
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        }
        return settings;
    }

    function saveSettings() {
        state.settings.apiBase = resolveAdminApiBase(state.settings.apiBase || DEFAULT_API_BASE);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
        if (state.settings.apiBase) {
            localStorage.setItem("goindiaride_api_base", state.settings.apiBase.replace(/\/$/, ""));
            localStorage.setItem("goindiaride_admin_api_base", state.settings.apiBase.replace(/\/$/, ""));
        }
    }

    function loadConnectionState() {
        const parsed = parseJson(localStorage.getItem(ADMIN_CONNECTION_KEY), {});
        return parsed && typeof parsed === "object" ? parsed : {};
    }

    function loadSeenToasts() {
        const parsed = parseJson(localStorage.getItem(TOAST_SEEN_KEY), []);
        return new Set(Array.isArray(parsed) ? parsed.filter(Boolean).slice(-500) : []);
    }

    function saveSeenToasts() {
        localStorage.setItem(TOAST_SEEN_KEY, JSON.stringify(Array.from(state.seenToasts).slice(-500)));
    }

    function normalizeApiBase(value) {
        return cleanText(value || DEFAULT_API_BASE).replace(/\/$/, "");
    }

    function isFrontendOnlyApiBase(base) {
        try {
            const parsed = new URL(normalizeApiBase(base));
            const host = cleanText(parsed.hostname || "").toLowerCase();
            return host === "goindiaride.in" || host === "www.goindiaride.in";
        } catch (_error) {
            return false;
        }
    }

    function resolveAdminApiBase(value) {
        const normalized = normalizeApiBase(value || DEFAULT_API_BASE);
        return isFrontendOnlyApiBase(normalized) ? DEFAULT_API_BASE : normalized;
    }

    function buildBackendApiCandidates() {
        const host = cleanText(window.location?.hostname || "").toLowerCase();
        const sameOriginBase = cleanText(window.location?.origin || "").replace(/\/$/, "");
        const preferredConfigured = resolveAdminApiBase(
            state.settings.apiBase
            || localStorage.getItem("goindiaride_admin_api_base")
            || localStorage.getItem("goindiaride_api_base")
            || ""
        );
        const explicitWindowBase = resolveAdminApiBase(
            window.GOINDIARIDE_API_BASE
            || window.__GOINDIARIDE_RUNTIME_API_ORIGIN__
            || window.__GOINDIARIDE_API_ORIGIN__
            || ""
        );
        const primaryCloudBase = normalizeApiBase(DEFAULT_API_BASE);
        const primaryWebsiteHost = host === "goindiaride.in" || host === "www.goindiaride.in";
        const ordered = primaryWebsiteHost
            ? [primaryCloudBase, preferredConfigured, explicitWindowBase]
            : [preferredConfigured, explicitWindowBase, sameOriginBase, primaryCloudBase];
        const seen = new Set();
        return ordered.filter((base) => {
            if (primaryWebsiteHost && isFrontendOnlyApiBase(base)) return false;
            if (!base || seen.has(base)) return false;
            seen.add(base);
            return true;
        });
    }

    function extractBackendPayloadRows(payload) {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== "object") return [];
        const fields = ["items", "data", "records", "bookings", "rows", "results", "list"];
        for (const field of fields) {
            if (Array.isArray(payload[field])) return payload[field];
        }
        return [];
    }

    function mapBackendBookingRow(row, sourceKey) {
        const reviewStatus = cleanText(row.adminReviewStatus || "").toLowerCase();
        const rawStatus = cleanText(row.status || "").toLowerCase();
        let status = rawStatus;
        if (!status || status === "created") {
            if (reviewStatus === "approved") {
                status = cleanText(row.driverId || row.driverName || row.driver?.id || "") ? "driver_assigned" : "approved";
            } else if (reviewStatus === "rejected") {
                status = "rejected";
            } else {
                status = "pending_admin_review";
            }
        }
        const bookingId = cleanText(row.bookingId || row.id || row._id || "");
        return {
            ...row,
            id: bookingId || getBookingIdentity(row) || makeSyntheticBookingId(row, sourceKey),
            bookingId: bookingId || getBookingIdentity(row) || makeSyntheticBookingId(row, sourceKey),
            status,
            adminReviewStatus: reviewStatus || (status === "rejected" ? "rejected" : status === "approved" || status === "driver_assigned" ? "approved" : "pending"),
            fare: row.fare || row.amount || row.totalFare || 0,
            totalFare: row.totalFare || row.amount || row.fare || 0,
            pickup: row.pickup || row.pickupLocation || row.from || "",
            dropoff: row.dropoff || row.dropLocation || row.drop || row.to || "",
            customerName: row.customerName || row.customerSnapshot?.name || row.customer?.name || "",
            customerEmail: row.customerEmail || row.customerSnapshot?.email || row.customer?.email || "",
            customerPhone: row.customerPhone || row.customerSnapshot?.phone || row.customer?.phone || "",
            sourceKey,
            syncedFromBackendAt: row.syncedFromBackendAt || new Date().toISOString()
        };
    }

    async function fetchBackendBookingRows({ apiBase, token, endpoint, sourceKey }) {
        try {
            const response = await fetch(`${apiBase}${endpoint}`, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${token}`
                },
                credentials: "include",
                cache: "no-store"
            });
            if (!response.ok) {
                return {
                    ok: false,
                    rows: [],
                    status: Number(response.status || 0),
                    unauthorized: response.status === 401 || response.status === 403
                };
            }
            const payload = await response.json().catch(() => ({}));
            const rows = extractBackendPayloadRows(payload)
                .map((row) => mapBackendBookingRow(row, sourceKey))
                .filter((row) => cleanText(row.bookingId || row.id));
            return { ok: true, rows, status: Number(response.status || 200), unauthorized: false };
        } catch (_error) {
            return { ok: false, rows: [], status: 0, unauthorized: false };
        }
    }

    async function fetchPublicFallbackBookingRows({ apiBase }) {
        try {
            const response = await fetch(`${apiBase}/api/bookings/fallback/admin-review-queue?limit=500`, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    "x-booking-client": "goindiaride-web"
                },
                credentials: "include",
                cache: "no-store"
            });
            if (!response.ok) return { ok: false, rows: [] };
            const payload = await response.json().catch(() => ({}));
            const rows = extractBackendPayloadRows(payload)
                .map((row) => mapBackendBookingRow(row, "backend_fallback_admin_review_queue"))
                .filter((row) => cleanText(row.bookingId || row.id));
            return { ok: true, rows };
        } catch (_error) {
            return { ok: false, rows: [] };
        }
    }

    function normalizeBooking(row, sourceKey) {
        const customer = isPlainObject(row.customer) ? row.customer : {};
        const customerSnapshot = isPlainObject(row.customerSnapshot) ? row.customerSnapshot : {};
        const id = getBookingIdentity(row) || makeSyntheticBookingId(row, sourceKey);
        const pickup = firstText(row.pickup, row.pickupLocation, row.from, row.origin) || "Pickup pending";
        const dropoff = firstText(row.dropoff, row.drop, row.dropLocation, row.to, row.destination) || "Drop pending";
        const fare = toAmount(row.totalFare || row.amount || row.finalFare || row.fare || row.fareQuote?.amount || row.fareBreakdown?.totalFare);
        const status = cleanText(row.status || "pending_admin_review").toLowerCase();
        const adminReviewStatus = cleanText(row.adminReviewStatus || row.reviewStatus || "").toLowerCase();
        const createdAt = cleanText(row.createdAt || row.timestamp || row.date || "");
        const customerName = firstText(row.customerName, customerSnapshot.name, customer.name, row.fullname, row.name) || "Customer";
        const returnTrip = isPlainObject(row.returnTrip) ? row.returnTrip : {};

        return {
            ...row,
            id,
            bookingId: id,
            pickup,
            dropoff,
            fare,
            customerName,
            customerPhone: firstUsableAdminPhone(row.customerPhone, customerSnapshot.phone, customer.phone, row.phone, row.mobile, row.contact),
            customerEmail: firstText(row.customerEmail, customerSnapshot.email, customer.email, row.email, row.userEmail),
            status,
            adminReviewStatus,
            adminBookingScope: "customer",
            sourceKey,
            createdAt,
            rideDate: cleanText(row.rideDate || ""),
            rideTime: cleanText(row.rideTime || ""),
            returnDate: cleanText(row.returnDate || returnTrip.returnDate || ""),
            returnTime: cleanText(row.returnTime || returnTrip.returnTime || ""),
            vehicleType: cleanText(row.vehicleType || row.rideType || row.vehicleModel || ""),
            paymentMethod: cleanText(row.paymentMethod || row.payment?.method || row.paymentMode || ""),
            distanceKm: toAmount(row.distanceKm || row.distance || row.fareQuote?.distanceKm || row.fareBreakdown?.distanceKm),
            pickupLocation: firstText(row.pickupLocation, row.pickup, row.from, row.origin),
            dropLocation: firstText(row.dropLocation, row.dropoff, row.drop, row.to, row.destination),
            totalFare: toAmount(row.totalFare || row.amount || row.finalFare || row.fare || row.fareQuote?.amount || row.fareBreakdown?.totalFare),
            customerId: firstText(row.customerId, row.userId, row.backendUserId, customer.id, customer._id, customer.email, customer.phone)
        };
    }

    function normalizeDriverBooking(row, sourceKey) {
        const driver = isPlainObject(row.driver) ? row.driver : {};
        const vehicle = isPlainObject(row.vehicle) ? row.vehicle : {};
        const id = firstText(
            row.driverBookingId,
            row.requestId,
            row.bookingRequestId,
            row.driverRequestId,
            row.bookingId,
            row.id,
            row._id,
            row.driverId,
            driver.id,
            driver._id
        ) || makeSyntheticBookingId(row, sourceKey);
        const pickup = firstText(row.pickup, row.pickupLocation, row.from, row.origin);
        const dropoff = firstText(row.dropoff, row.drop, row.dropLocation, row.to, row.destination);
        const status = cleanText(row.driverStatus || row.requestStatus || row.status || row.approvalStatus || "pending").toLowerCase();
        const createdAt = cleanText(row.createdAt || row.timestamp || row.date || row.updatedAt || "");

        return {
            ...row,
            id,
            bookingId: id,
            driverBookingId: id,
            adminBookingScope: "driver",
            sourceKey,
            driverId: firstText(row.driverId, driver.id, driver._id, row.id),
            driverName: firstText(row.driverName, driver.name, row.name, row.fullName, row.fullname) || "Driver",
            driverPhone: firstUsableAdminPhone(row.driverPhone, driver.phone, row.phone, row.mobile, row.contact),
            vehicleType: firstText(row.vehicleType, row.rideType, vehicle.type, row.vehicleModel, vehicle.model) || "Vehicle not set",
            vehicleNumber: firstText(row.vehicleNumber, vehicle.number, row.registrationNumber),
            pickup: pickup || "Driver side request",
            dropoff: dropoff || "No customer route",
            fare: toAmount(row.totalFare || row.amount || row.finalFare || row.fare || row.fareQuote?.amount || row.fareBreakdown?.totalFare),
            distanceKm: toAmount(row.distanceKm || row.distance || row.fareQuote?.distanceKm || row.fareBreakdown?.distanceKm),
            status,
            requestStatus: status,
            createdAt
        };
    }

    function normalizeDriver(row, sourceKey) {
        const id = cleanText(row.id || row.driverId || row._id || `driver_${Date.now()}`);
        const name = cleanText(row.name || row.fullname || row.driverName || "Driver");
        return {
            ...row,
            id,
            name,
            sourceKey,
            phone: cleanText(row.phone || row.mobile || ""),
            vehicle: cleanText(row.vehicle?.type || row.vehicleType || row.vehicleModel || "Vehicle not set"),
            status: cleanText(row.status || row.approvalStatus || "pending").toLowerCase(),
            rating: Number(row.rating || 0)
        };
    }

    function normalizeUser(row, sourceKey) {
        const id = cleanText(row.id || row.userId || row._id || `user_${Date.now()}`);
        return {
            ...row,
            id,
            sourceKey,
            name: cleanText(row.name || row.fullname || row.customerName || "Customer"),
            email: cleanText(row.email || row.customerEmail || ""),
            phone: cleanText(row.phone || row.mobile || row.customerPhone || "")
        };
    }

    function mergeById(items) {
        const map = new Map();
        items.forEach((item) => {
            if (!item || !item.id) return;
            const existing = map.get(item.id) || {};
            map.set(item.id, mergeBookingRowsByQuality(existing, item));
        });
        return Array.from(map.values()).filter((row) => !isInternalDiagnosticBooking(row));
    }

    function mergeDriverBookingsById(items) {
        const map = new Map();
        items.forEach((item) => {
            if (!item || !item.id) return;
            const existing = map.get(item.id) || {};
            map.set(item.id, { ...existing, ...item });
        });
        return Array.from(map.values()).filter((row) => !isInternalDiagnosticBooking(row));
    }

    function sortRowsByCreatedAt(rows) {
        return rows.sort((a, b) => {
            const at = Date.parse(b.createdAt || b.updatedAt || "") || 0;
            const bt = Date.parse(a.createdAt || a.updatedAt || "") || 0;
            return at - bt;
        });
    }

    function persistBookingSplitViews(customerBookings, driverBookings) {
        const updatedAt = new Date().toISOString();
        const customerRows = Array.isArray(customerBookings) ? customerBookings : [];
        const driverRows = Array.isArray(driverBookings) ? driverBookings : [];
        try {
            writeArray(CUSTOMER_BOOKING_SPLIT_KEY, customerRows.map((row) => ({ ...row, adminBookingScope: "customer", adminSplitSavedAt: updatedAt })));
            writeArray(DRIVER_BOOKING_SPLIT_KEY, driverRows.map((row) => ({ ...row, adminBookingScope: "driver", adminSplitSavedAt: updatedAt })));
            localStorage.setItem(BOOKING_SPLIT_VIEW_KEY, JSON.stringify({
                updatedAt,
                customerCount: customerRows.length,
                driverCount: driverRows.length,
                customerKey: CUSTOMER_BOOKING_SPLIT_KEY,
                driverKey: DRIVER_BOOKING_SPLIT_KEY
            }));
        } catch (_error) {
            // Split snapshots are a view cache; original booking and driver rows remain untouched.
        }
    }

    function pushScopedBookingRow(item, sourceKey, customerRows, driverRows) {
        const scope = getAdminBookingRecordScope(item, sourceKey);
        if (scope === "driver") {
            driverRows.push(normalizeDriverBooking(item, sourceKey));
            return;
        }
        if (scope === "customer") {
            customerRows.push(normalizeBooking(item, sourceKey));
        }
    }

    function loadBookingSplit() {
        const customerRows = [];
        const driverRows = [];
        BOOKING_KEYS.forEach((key) => {
            readArray(key).forEach((item) => {
                pushScopedBookingRow(item, key, customerRows, driverRows);
            });
        });
        scanAllStorageForBookingRows().forEach((item) => {
            pushScopedBookingRow(item, item.sourceKey || "storage_scan", customerRows, driverRows);
        });

        const customerBookings = sortRowsByCreatedAt(mergeById(customerRows));
        const driverBookings = sortRowsByCreatedAt(mergeDriverBookingsById(driverRows));
        persistBookingSplitViews(customerBookings, driverBookings);

        return { customerBookings, driverBookings };
    }

    function loadBookings() {
        return loadBookingSplit().customerBookings;
    }

    function getBackendAccessToken() {
        return cleanText(
            localStorage.getItem("accessToken")
            || localStorage.getItem("authToken")
            || localStorage.getItem("token")
            || ""
        );
    }

    function createAdminIdempotencyKey(prefix, bookingId) {
        const safePrefix = cleanText(prefix || "gir-admin-booking").replace(/[^A-Za-z0-9:_-]/g, "_") || "gir-admin-booking";
        const safeBookingId = cleanText(bookingId || "").replace(/[^A-Za-z0-9:_-]/g, "_") || "booking";
        return `${safePrefix}:${safeBookingId}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
    }

    function parseJwtPayload(token) {
        const parts = cleanText(token).split(".");
        if (parts.length !== 3) return null;
        try {
            const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
            return JSON.parse(atob(padded));
        } catch (_error) {
            return null;
        }
    }

    function isBackendAccessTokenUsable(token) {
        const safeToken = cleanText(token);
        if (!safeToken) return false;
        const payload = parseJwtPayload(safeToken);
        if (!payload || !payload.exp) return true;
        return Number(payload.exp) * 1000 > Date.now() + 30 * 1000;
    }

    function mergeBookingsIntoStore(key, incomingRows) {
        if (!Array.isArray(incomingRows) || !incomingRows.length) return false;
        const existing = readArray(key);
        const byId = new Map();
        existing.forEach((row) => {
            const id = cleanText(row.bookingId || row.id || row._id);
            if (id) byId.set(id, row);
        });

        let changed = false;
        incomingRows.forEach((row) => {
            if (!row || typeof row !== "object") return;
            const id = cleanText(row.bookingId || row.id || row._id);
            if (!id) return;
            if (isInternalDiagnosticBooking({ ...row, id, bookingId: id })) return;
            const current = byId.get(id) || {};
            const merged = {
                ...mergeBookingRowsByQuality(current, row),
                id,
                bookingId: id,
                ...(/^backend_/i.test(cleanText(row.sourceKey || "")) ? { syncedFromBackendAt: row.syncedFromBackendAt || new Date().toISOString() } : {})
            };
            byId.set(id, merged);
            if (JSON.stringify(current) !== JSON.stringify(merged)) changed = true;
        });

        if (!changed) return false;
        writeArray(key, Array.from(byId.values()));
        return true;
    }

    async function syncBackendBookings() {
        const rawToken = getBackendAccessToken();
        const token = isBackendAccessTokenUsable(rawToken) ? rawToken : "";
        if (state.backendBookingSyncing) return false;
        state.backendBookingSyncing = true;
        try {
            const apiBases = buildBackendApiCandidates();
            for (const apiBase of apiBases) {
                const publicFallbackResult = await fetchPublicFallbackBookingRows({ apiBase });
                let pendingResult = { ok: false, rows: [] };
                let allBookingsResult = { ok: false, rows: [] };
                const shouldRunAuthenticatedSync = Boolean(
                    token
                    && Date.now() >= state.authBookingSyncCooldownUntil
                    && Date.now() - state.lastAuthenticatedBookingSyncAt >= ADMIN_AUTH_BOOKING_SYNC_INTERVAL_MS
                );

                if (shouldRunAuthenticatedSync) {
                    state.lastAuthenticatedBookingSyncAt = Date.now();
                    pendingResult = await fetchBackendBookingRows({
                        apiBase,
                        token,
                        endpoint: "/api/bookings/admin/pending?limit=500",
                        sourceKey: "backend_admin_pending"
                    });
                    allBookingsResult = await fetchBackendBookingRows({
                        apiBase,
                        token,
                        endpoint: "/api/bookings/my?limit=500",
                        sourceKey: "backend_admin_all"
                    });
                    if (pendingResult.unauthorized || allBookingsResult.unauthorized) {
                        state.authBookingSyncCooldownUntil = Date.now() + ADMIN_AUTH_BOOKING_SYNC_INTERVAL_MS;
                    }
                }

                if (!publicFallbackResult.ok && !pendingResult.ok && !allBookingsResult.ok) continue;
                const mapped = mergeById([
                    ...(publicFallbackResult.rows || []),
                    ...(pendingResult.rows || []),
                    ...(allBookingsResult.rows || [])
                ]);

                if (mapped.length) {
                    const inboxChanged = mergeBookingsIntoStore(ADMIN_REVIEW_INBOX_KEY, mapped);
                    const activeChanged = mergeBookingsIntoStore("goindiaride_active_bookings", mapped);
                    if (inboxChanged || activeChanged) {
                        state.connection = {
                            ...state.connection,
                            apiBase,
                            updatedAt: new Date().toISOString()
                        };
                        localStorage.setItem(ADMIN_CONNECTION_KEY, JSON.stringify(state.connection));
                    }
                    return inboxChanged || activeChanged;
                }
            }
            return false;
        } catch (_error) {
            return false;
        } finally {
            state.backendBookingSyncing = false;
        }
    }

    async function reviewBackendBooking(bookingId, decision, reason) {
        const token = getBackendAccessToken();
        const safeBookingId = cleanText(bookingId);
        if (!token || !safeBookingId) return { ok: false, reason: "missing_backend_token_or_booking" };
        const backendDecision = decision === "approve" ? "approved" : "rejected";
        const apiBases = buildBackendApiCandidates();
        for (const apiBase of apiBases) {
            try {
                const response = await fetch(`${apiBase}/api/bookings/${encodeURIComponent(safeBookingId)}/admin/review`, {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                        "x-booking-client": "goindiaride-web",
                        "x-idempotency-key": createAdminIdempotencyKey("gir-admin-booking-review", safeBookingId)
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        decision: backendDecision,
                        reason: cleanText(reason || `Admin marked booking ${backendDecision}.`)
                    })
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) continue;
                if (payload && payload.bookingId) {
                    mergeBookingsIntoStore(ADMIN_REVIEW_INBOX_KEY, [mapBackendBookingRow(payload, "backend_admin_review")]);
                    mergeBookingsIntoStore("goindiaride_active_bookings", [mapBackendBookingRow(payload, "backend_admin_review")]);
                }
                state.connection = {
                    ...state.connection,
                    apiBase,
                    updatedAt: new Date().toISOString()
                };
                localStorage.setItem(ADMIN_CONNECTION_KEY, JSON.stringify(state.connection));
                return { ok: true, apiBase, payload };
            } catch (_error) {
                // Try the next configured API base.
            }
        }
        return { ok: false, reason: "backend_review_failed" };
    }

    async function syncBackendBookingEdit(bookingId, booking, changedFields = [], reason = "") {
        const rawToken = getBackendAccessToken();
        const token = isBackendAccessTokenUsable(rawToken) ? rawToken : "";
        const safeBookingId = cleanText(bookingId);
        if (!token || !safeBookingId) return { ok: false, reason: "missing_backend_token_or_booking" };

        const payload = {
            ...booking,
            reason: cleanText(reason || booking?.adminEditReason || "Updated by admin portal."),
            changedFields: Array.isArray(changedFields) ? changedFields : []
        };
        const apiBases = buildBackendApiCandidates();
        for (const apiBase of apiBases) {
            try {
                const response = await fetch(`${apiBase}/api/bookings/${encodeURIComponent(safeBookingId)}/admin/edit`, {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                        "x-booking-client": "goindiaride-web",
                        "x-idempotency-key": createAdminIdempotencyKey("gir-admin-booking-edit", safeBookingId)
                    },
                    credentials: "include",
                    body: JSON.stringify(payload)
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) continue;
                if (data && data.booking) {
                    const mapped = mapBackendBookingRow(data.booking, data.sourceKey || "backend_admin_edit");
                    mergeBookingsIntoStore(ADMIN_REVIEW_INBOX_KEY, [mapped]);
                    mergeBookingsIntoStore("goindiaride_active_bookings", [mapped]);
                    CUSTOMER_BOOKING_SYNC_KEYS.forEach((key) => upsertBookingIntoStore(key, buildSharedBookingUpdate(safeBookingId, booking, mapped)));
                }
                return { ok: true, apiBase, data };
            } catch (_error) {
                // Try next API base.
            }
        }
        return { ok: false, reason: "backend_edit_failed" };
    }

    function loadDrivers() {
        const rows = [];
        DRIVER_KEYS.forEach((key) => {
            readArray(key).forEach((item) => rows.push(normalizeDriver(item, key)));
        });
        return mergeById(rows);
    }

    function loadUsers() {
        const rows = [];
        USER_KEYS.forEach((key) => {
            readArray(key).forEach((item) => rows.push(normalizeUser(item, key)));
        });
        return mergeById(rows);
    }

    function loadNotifications() {
        return readArray(NOTIFICATION_KEY).sort((a, b) => {
            return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
        });
    }

    function loadAdminControls() {
        if (window.AdminControlBridge && typeof window.AdminControlBridge.readControls === "function") {
            return window.AdminControlBridge.readControls();
        }
        return {
            portals: {
                customer: { enabled: true, status: "active" },
                driver: { enabled: true, status: "active" }
            },
            customers: {},
            drivers: {},
            bookings: {}
        };
    }

    function writeAdminControls(controls) {
        if (window.AdminControlBridge && typeof window.AdminControlBridge.writeControls === "function") {
            return window.AdminControlBridge.writeControls(controls);
        }
        const key = window.AdminControlBridge && window.AdminControlBridge.keys
            ? window.AdminControlBridge.keys.CONTROL_KEY
            : "goindiaride_admin_portal_controls_v1";
        localStorage.setItem(key, JSON.stringify(controls));
        return controls;
    }

    function connectAllPortalFeatures(options = {}) {
        const now = new Date().toISOString();
        const apiBase = resolveAdminApiBase(state.settings.apiBase || localStorage.getItem("goindiaride_api_base"));
        const controls = loadAdminControls();
        const nextControls = {
            ...controls,
            connectedByAdminApp: true,
            adminAppLastSyncAt: now,
            appConnections: {
                ...(controls.appConnections || {}),
                admin: {
                    connected: true,
                    apiBase,
                    features: PORTAL_FEATURES,
                    updatedAt: now
                }
            },
            featureControls: {
                ...(controls.featureControls || {}),
                bookings: { enabled: true, sourceKeys: BOOKING_KEYS, updatedAt: now },
                customers: { enabled: true, sourceKeys: USER_KEYS, updatedAt: now },
                drivers: { enabled: true, sourceKeys: DRIVER_KEYS, updatedAt: now },
                finance: { enabled: true, sourceKeys: BOOKING_KEYS, updatedAt: now },
                safety: { enabled: true, sourceKeys: [NOTIFICATION_KEY], updatedAt: now }
            },
            portalFeatures: {
                ...(controls.portalFeatures || {}),
                customer: {
                    ...CUSTOMER_FEATURES.reduce((acc, feature) => {
                        acc[feature[0]] = { enabled: true, status: "active", reason: "", label: feature[1], updatedAt: now };
                        return acc;
                    }, {}),
                    ...(((controls.portalFeatures || {}).customer) || {})
                },
                driver: {
                    ...DRIVER_FEATURES.reduce((acc, feature) => {
                        acc[feature[0]] = { enabled: true, status: "active", reason: "", label: feature[1], updatedAt: now };
                        return acc;
                    }, {}),
                    ...(((controls.portalFeatures || {}).driver) || {})
                }
            },
            portals: {
                ...(controls.portals || {}),
                customer: {
                    ...((controls.portals || {}).customer || {}),
                    connected: true,
                    controlledByAdminApp: true,
                    controlledFeatures: CUSTOMER_FEATURES.map((feature) => feature[0]),
                    lastAdminSyncAt: now
                },
                driver: {
                    ...((controls.portals || {}).driver || {}),
                    connected: true,
                    controlledByAdminApp: true,
                    controlledFeatures: DRIVER_FEATURES.map((feature) => feature[0]),
                    lastAdminSyncAt: now
                }
            }
        };

        state.settings.apiBase = apiBase;
        localStorage.setItem("goindiaride_api_base", apiBase);
        localStorage.setItem("goindiaride_admin_api_base", apiBase);
        state.controls = writeAdminControls(nextControls);
        state.connection = {
            connected: true,
            apiBase,
            features: PORTAL_FEATURES,
            customerFeatures: CUSTOMER_FEATURES.map((feature) => feature[0]),
            driverFeatures: DRIVER_FEATURES.map((feature) => feature[0]),
            bookingKeys: BOOKING_KEYS,
            driverKeys: DRIVER_KEYS,
            customerKeys: USER_KEYS,
            updatedAt: now
        };
        localStorage.setItem(ADMIN_CONNECTION_KEY, JSON.stringify(state.connection));

        if (options.audit) {
            addAudit("ADMIN_PORTALS_CONNECTED", "Admin app connected customer, driver, booking, finance and safety controls.");
        }
        return state.connection;
    }

    function isPending(booking) {
        return [
            "pending",
            "pending_admin_review",
            "created",
            "new",
            "queued_local_fallback"
        ].includes(booking.status) || booking.adminReviewStatus === "pending";
    }

    function isApproved(booking) {
        return booking.adminReviewStatus === "approved" || ["approved", "confirmed", "driver_assigned"].includes(booking.status);
    }

    function isRejected(booking) {
        return booking.adminReviewStatus === "rejected" || ["rejected", "cancelled", "cancelled_by_admin"].includes(booking.status);
    }

    function getStatusLabel(booking) {
        if (isApproved(booking)) return "Approved";
        if (isRejected(booking)) return "Rejected";
        if (booking.status === "completed") return "Completed";
        if (isPending(booking)) return "Pending";
        return cleanText(booking.status, "Open").replace(/_/g, " ");
    }

    function getStatusClass(booking) {
        if (isApproved(booking)) return "approved";
        if (isRejected(booking)) return "rejected";
        if (booking.status === "completed") return "completed";
        return "pending";
    }

    function refreshData(options = {}) {
        const bookingSplit = loadBookingSplit();
        state.bookings = bookingSplit.customerBookings;
        state.driverBookings = bookingSplit.driverBookings;
        state.drivers = loadDrivers();
        state.users = loadUsers();
        state.notifications = loadNotifications();
        state.controls = loadAdminControls();
        state.connection = loadConnectionState();
        renderAll();
        if (!options.skipBackendSync) {
            syncBackendBookings().then((changed) => {
                if (changed) refreshData({ skipBackendSync: true });
            });
        }
    }

    function collectBookingSearchTokens(value, tokens = [], depth = 0, visited = new Set()) {
        if (value === null || value === undefined || depth > 6) return tokens;
        const type = typeof value;
        if (type === "string" || type === "number" || type === "boolean") {
            const text = cleanText(value);
            if (text) tokens.push(text);
            return tokens;
        }
        if (value instanceof Date) {
            tokens.push(value.toISOString(), value.toLocaleString("en-IN"));
            return tokens;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => collectBookingSearchTokens(item, tokens, depth + 1, visited));
            return tokens;
        }
        if (type === "object") {
            if (visited.has(value)) return tokens;
            visited.add(value);
            Object.entries(value).forEach(([key, item]) => {
                if (item === true) {
                    const label = humanizeKey(key);
                    if (label) tokens.push(label);
                }
                collectBookingSearchTokens(item, tokens, depth + 1, visited);
            });
        }
        return tokens;
    }

    function normalizeBookingSearchQuery(value) {
        return cleanText(value).toLowerCase();
    }

    function bookingMatchesSearch(booking, query) {
        const terms = normalizeBookingSearchQuery(query).split(/\s+/).filter(Boolean);
        if (!terms.length) return true;
        const searchableText = collectBookingSearchTokens(booking).join(" ").toLowerCase();
        const compactText = searchableText.replace(/\s+/g, "");
        const digitsText = searchableText.replace(/\D/g, "");
        return terms.every((term) => {
            const compactTerm = term.replace(/\s+/g, "");
            const digitsTerm = term.replace(/\D/g, "");
            return searchableText.includes(term)
                || (compactTerm && compactText.includes(compactTerm))
                || (digitsTerm && digitsText.includes(digitsTerm));
        });
    }

    function getFilteredBookings(filter = state.bookingFilter) {
        const globalQuery = state.query;
        const bookingQuery = state.bookingQuery;
        return state.bookings.filter((booking) => {
            if (globalQuery && !bookingMatchesSearch(booking, globalQuery)) return false;
            if (bookingQuery && !bookingMatchesSearch(booking, bookingQuery)) return false;
            if (filter === "pending") return isPending(booking);
            if (filter === "approved") return isApproved(booking);
            if (filter === "rejected") return isRejected(booking);
            if (filter === "completed") return booking.status === "completed";
            return true;
        });
    }

    function getControlEntityKey(entity) {
        if (window.AdminControlBridge && typeof window.AdminControlBridge.entityKey === "function") {
            return window.AdminControlBridge.entityKey(entity);
        }
        return cleanText(entity.id || entity.userId || entity.driverId || entity.customerId || entity.email || entity.phone).toLowerCase();
    }

    function getCustomerRows() {
        const map = new Map();
        state.users.forEach((user) => {
            if (adminRowLooksDriver(user) || !adminRowLooksCustomer(user)) return;
            const phone = firstUsableAdminPhone(user.phone, user.mobile, user.customerPhone);
            const key = getCustomerEntityKey({ ...user, phone });
            if (key) map.set(key, { ...user, phone, type: "stored_customer" });
        });

        state.bookings.forEach((booking) => {
            const phone = firstUsableAdminPhone(booking.customerPhone, booking.phone, booking.mobile);
            const email = normalizeAdminEmailValue(booking.customerEmail || booking.email || "");
            if (!phone && !email) return;
            const customer = {
                id: booking.customerId || booking.userId || booking.backendUserId || "",
                name: booking.customerName || "Customer",
                email,
                phone,
                type: "booking_customer"
            };
            if (adminRowLooksDriver(customer)) return;
            const key = getCustomerEntityKey(customer);
            if (key && !map.has(key)) map.set(key, customer);
        });

        const query = state.query.toLowerCase();
        return Array.from(map.values()).filter((customer) => {
            if (!query) return true;
            return [
                customer.name,
                customer.fullname,
                customer.email,
                customer.phone,
                customer.id,
                customer.userId,
                customer.customerId
            ].join(" ").toLowerCase().includes(query);
        });
    }

    function renderMetrics() {
        const pending = state.bookings.filter(isPending).length;
        const approved = state.bookings.filter(isApproved).length;
        const actionNeeded = state.bookings.filter((booking) => isPending(booking) && String(booking.adminEmailDispatch?.state || "").toLowerCase() !== "sent").length;
        const farePipeline = state.bookings.reduce((sum, booking) => sum + booking.fare, 0);

        setText("#metricPending", pending);
        setText("#metricApproved", approved);
        setText("#metricRevenue", formatMoney(farePipeline));
        setText("#metricAction", actionNeeded);
        setText("#navPendingCount", pending);
        const controlCount = Object.keys((state.controls && state.controls.customers) || {}).length
            + Object.keys((state.controls && state.controls.drivers) || {}).length;
        setText("#navPortalCount", Math.max(2, controlCount));
    }

    function setText(selector, value) {
        const node = $(selector);
        if (node) node.textContent = String(value);
    }

    function renderQueue() {
        const host = $("#overviewQueue");
        if (!host) return;
        const rows = getFilteredBookings(state.queueFilter).slice(0, 8);
        if (!rows.length) {
            host.innerHTML = `<div class="empty-state">No bookings match this view.</div>`;
            return;
        }

        host.innerHTML = rows.map((booking) => `
            <article class="queue-item">
                <div>
                    <div class="queue-title">
                        <strong>${escapeHtml(booking.bookingId)}</strong>
                        <span class="status-pill ${getStatusClass(booking)}">${escapeHtml(getStatusLabel(booking))}</span>
                        <span class="source-pill">${escapeHtml(booking.sourceKey)}</span>
                    </div>
                    <div class="queue-route">${escapeHtml(booking.pickup)} -> ${escapeHtml(booking.dropoff)}</div>
                    <div class="queue-meta">${escapeHtml(booking.customerName)} | ${formatMoney(booking.fare)} | ${formatDate(booking.createdAt)}</div>
                    ${renderBookingCompactDetails(booking)}
                </div>
                <div class="queue-actions">
                    <button class="secondary-action" data-booking-edit="${escapeHtml(booking.bookingId)}" type="button"><i class="fas fa-pen-to-square"></i><span>Edit</span></button>
                    <button class="row-action" data-action="approve" data-booking-id="${escapeHtml(booking.bookingId)}" type="button"><i class="fas fa-check"></i></button>
                    <button class="danger-action" data-action="reject" data-booking-id="${escapeHtml(booking.bookingId)}" type="button"><i class="fas fa-xmark"></i></button>
                </div>
            </article>
        `).join("");
    }

    function renderPulse() {
        const host = $("#pulseList");
        if (!host) return;
        const localStores = BOOKING_KEYS.filter((key) => readArray(key).length > 0).length;
        const unreadAdmin = window.PortalConnector && typeof window.PortalConnector.getUnreadCount === "function"
            ? window.PortalConnector.getUnreadCount("admin")
            : 0;
        const apiBase = state.settings.apiBase || "Local only";
        const connection = state.connection && state.connection.connected
            ? `${PORTAL_FEATURES.length} feature groups connected`
            : "Waiting for admin sync";
        const rows = [
            ["fa-database", "Booking sources", `${localStores} active local stores`],
            ["fa-bell", "Admin notifications", `${unreadAdmin} unread portal alerts`],
            ["fa-cloud", "API base", apiBase],
            ["fa-link", "Portal bridge", connection],
            ["fa-clock", "Auto refresh", state.settings.autoRefresh ? "Every 10 seconds" : "Manual"]
        ];
        host.innerHTML = rows.map((row) => `
            <div class="pulse-item">
                <i class="fas ${row[0]}"></i>
                <strong>${escapeHtml(row[1])}</strong>
                <span>${escapeHtml(row[2])}</span>
            </div>
        `).join("");
    }

    function renderFareAudit() {
        const host = $("#fareAuditGrid");
        if (!host) return;
        const withToll = state.bookings.filter((booking) => toAmount(booking.fareBreakdown?.tollCharge) > 0).length;
        const mappedToll = state.bookings.filter((booking) => cleanText(booking.fareBreakdown?.tollSource).includes("mapped")).length;
        const missingFare = state.bookings.filter((booking) => booking.fare <= 0).length;
        host.innerHTML = [
            ["Mapped toll rows", mappedToll, "Bookings with route-plaza toll metadata."],
            ["Toll charged", withToll, "Bookings where toll is part of fare."],
            ["Fare missing", missingFare, "Needs manual review before approval."]
        ].map((item) => `
            <article class="fare-audit-item">
                <strong>${escapeHtml(item[0])}</strong>
                <h3>${escapeHtml(item[1])}</h3>
                <span>${escapeHtml(item[2])}</span>
            </article>
        `).join("");
    }

    function renderActivity() {
        const host = $("#activityFeed");
        if (!host) return;
        const logs = readArray(AUDIT_KEY).slice(0, state.hideOldActivity ? 4 : 10);
        const feed = logs.length ? logs : state.notifications.slice(0, state.hideOldActivity ? 4 : 10);
        if (!feed.length) {
            host.innerHTML = `<div class="empty-state">No admin activity yet.</div>`;
            return;
        }

        host.innerHTML = feed.map((item) => {
            const title = cleanText(item.action || item.title || item.type || "Activity");
            const detail = cleanText(item.details || item.message || item.description || "");
            return `
                <div class="activity-item">
                    <strong>${escapeHtml(title)}</strong>
                    <div>${escapeHtml(detail)}</div>
                    <small>${escapeHtml(formatDate(item.timestamp || item.createdAt))}</small>
                </div>
            `;
        }).join("");
    }

    function renderBookingTable() {
        const host = $("#bookingTableBody");
        if (!host) return;
        const rows = getFilteredBookings(state.bookingFilter);
        if (!rows.length) {
            const query = cleanText(state.bookingQuery || state.query);
            const message = query ? `No booking rows found for "${query}".` : "No booking rows found.";
            host.innerHTML = `<tr><td colspan="6"><div class="empty-state">${escapeHtml(message)}</div></td></tr>`;
            return;
        }

        host.innerHTML = rows.map((booking) => `
            <tr class="booking-summary-row">
                <td><strong>${escapeHtml(booking.bookingId)}</strong><br><small>${escapeHtml(formatDate(booking.createdAt))}</small></td>
                <td>${escapeHtml(booking.customerName)}<br><small>${escapeHtml(booking.customerPhone || booking.customerEmail || "No contact")}</small></td>
                <td><strong>${escapeHtml(booking.pickup)}</strong><br><small>${escapeHtml(booking.dropoff)}</small></td>
                <td>${formatMoney(booking.fare)}<br><small>${escapeHtml(booking.distanceKm ? `${Math.round(booking.distanceKm)} km` : "Distance pending")}</small></td>
                <td><span class="status-pill ${getStatusClass(booking)}">${escapeHtml(getStatusLabel(booking))}</span></td>
                <td>
                    <button class="secondary-action" data-booking-edit="${escapeHtml(booking.bookingId)}" type="button"><i class="fas fa-pen-to-square"></i> Edit</button>
                    <button class="row-action" data-action="approve" data-booking-id="${escapeHtml(booking.bookingId)}" type="button"><i class="fas fa-check"></i></button>
                    <button class="danger-action" data-action="reject" data-booking-id="${escapeHtml(booking.bookingId)}" type="button"><i class="fas fa-xmark"></i></button>
                </td>
            </tr>
            <tr class="booking-detail-row">
                <td colspan="6">
                    ${renderBookingCompactDetails(booking)}
                </td>
            </tr>
        `).join("");
    }

    function renderBookingSplitSummary() {
        setText("#customerBookingCount", getFilteredBookings("all").length);
        setText("#driverBookingCount", getFilteredDriverBookings().length);
        setText("#navDriverBookingCount", getFilteredDriverBookings().length);
        setText("#bookingSplitSavedAt", formatDate(new Date().toISOString()));
    }

    function getFilteredDriverBookings() {
        const globalQuery = state.query;
        const bookingQuery = state.bookingQuery;
        return state.driverBookings.filter((booking) => {
            if (globalQuery && !bookingMatchesSearch(booking, globalQuery)) return false;
            if (bookingQuery && !bookingMatchesSearch(booking, bookingQuery)) return false;
            return true;
        });
    }

    function getDriverBookingStatusClass(row) {
        const status = cleanText(row.requestStatus || row.status || "").toLowerCase();
        if (/(approved|accepted|active|assigned|available|verified)/.test(status)) return "approved";
        if (/(rejected|cancelled|suspended|blocked|offline)/.test(status)) return "rejected";
        if (/completed/.test(status)) return "completed";
        return "pending";
    }

    function getDriverBookingStatusLabel(row) {
        const status = cleanText(row.requestStatus || row.status || "pending");
        return status.replace(/_/g, " ");
    }

    function renderDriverBookingRequests() {
        const host = $("#driverBookingTableBody");
        if (!host) return;
        const rows = getFilteredDriverBookings();
        if (!rows.length) {
            const query = cleanText(state.bookingQuery || state.query);
            const message = query ? `No driver booking rows found for "${query}".` : "No driver booking rows found.";
            host.innerHTML = `<tr><td colspan="6"><div class="empty-state">${escapeHtml(message)}</div></td></tr>`;
            return;
        }

        host.innerHTML = rows.map((row) => {
            const hasRoute = hasUsableBookingRoute(row);
            const routeText = hasRoute ? `${row.pickup} -> ${row.dropoff}` : "Driver profile / request";
            const routeSubtext = hasRoute
                ? (row.distanceKm ? `${Math.round(row.distanceKm)} km` : "Distance pending")
                : (row.vehicleNumber || formatSourceInline(row.sourceKey, 64) || "Driver-side data");
            const sourceHint = formatSourceInline(row.sourceKey || "driver split", 58);
            return `
                <tr>
                    <td><strong>${escapeHtml(row.driverBookingId || row.bookingId || row.id)}</strong><br><small>${escapeHtml(formatDate(row.createdAt || row.updatedAt))}</small></td>
                    <td>${escapeHtml(row.driverName || "Driver")}<br><small>${escapeHtml(row.driverPhone || row.driverId || "No driver contact")}</small></td>
                    <td>${escapeHtml(row.vehicleType || "Vehicle not set")}<br><small>${escapeHtml(row.vehicleNumber || row.sourceKey || "No vehicle number")}</small></td>
                    <td><strong>${escapeHtml(routeText)}</strong><br><small>${escapeHtml(routeSubtext)}</small></td>
                    <td><span class="status-pill ${getDriverBookingStatusClass(row)}">${escapeHtml(getDriverBookingStatusLabel(row))}</span></td>
                    <td><span class="source-pill">Driver</span><br><small class="source-inline-code" title="${escapeHtml(cleanText(row.sourceKey || "driver split"))}">${escapeHtml(sourceHint)}</small></td>
                </tr>
            `;
        }).join("");
    }

    function renderDrivers() {
        const host = $("#driverGrid");
        if (!host) return;
        if (!state.drivers.length) {
            host.innerHTML = `<div class="empty-state">No driver records found. Existing driver data will appear here automatically.</div>`;
            return;
        }

        host.innerHTML = state.drivers.slice(0, 12).map((driver) => `
            <article class="driver-card">
                <header>
                    <div class="driver-avatar">${escapeHtml(driver.name.slice(0, 2).toUpperCase())}</div>
                    <div><strong>${escapeHtml(driver.name)}</strong><br><small>${escapeHtml(driver.phone || "No phone")}</small></div>
                </header>
                <div>${escapeHtml(driver.vehicle)}</div>
                <span class="status-pill ${driver.status === "approved" || driver.status === "available" ? "approved" : "pending"}">${escapeHtml(driver.status.replace(/_/g, " "))}</span>
            </article>
        `).join("");
    }

    function renderFinance() {
        const host = $("#financeGrid");
        if (!host) return;
        const pendingFare = state.bookings.filter(isPending).reduce((sum, booking) => sum + booking.fare, 0);
        const approvedFare = state.bookings.filter(isApproved).reduce((sum, booking) => sum + booking.fare, 0);
        const tollTotal = state.bookings.reduce((sum, booking) => sum + toAmount(booking.fareBreakdown?.tollCharge), 0);
        const gstTotal = state.bookings.reduce((sum, booking) => sum + toAmount(booking.fareBreakdown?.taxesFare), 0);
        const rows = [
            ["Pending fare pipeline", pendingFare, "Awaiting admin decision."],
            ["Approved fare", approvedFare, "Ready for dispatch/payment follow-up."],
            ["Toll captured", tollTotal, "From saved fare breakdown."],
            ["GST/service tax", gstTotal, "From saved fare breakdown."],
            ["Payment modes", new Set(state.bookings.map((item) => item.paymentMethod).filter(Boolean)).size, "Unique modes in booking data."],
            ["Zero fare rows", state.bookings.filter((item) => item.fare <= 0).length, "Review before driver assignment."]
        ];
        host.innerHTML = rows.map((item) => `
            <article class="finance-card">
                <small>${escapeHtml(item[0])}</small>
                <strong>${typeof item[1] === "number" && item[1] > 20 ? formatMoney(item[1]) : escapeHtml(item[1])}</strong>
                <span>${escapeHtml(item[2])}</span>
            </article>
        `).join("");
    }

    function renderSafety() {
        const host = $("#safetyGrid");
        if (!host) return;
        const nightRows = state.bookings.filter((booking) => {
            const hour = Number(String(booking.rideTime || "").slice(0, 2));
            return Number.isFinite(hour) && (hour >= 22 || hour < 5);
        }).length;
        const longRoutes = state.bookings.filter((booking) => booking.distanceKm >= 250).length;
        const missingPhone = state.bookings.filter((booking) => !booking.customerPhone).length;
        const rows = [
            ["Night trips", nightRows, "Needs extra monitoring and driver confirmation."],
            ["Long routes", longRoutes, "Review toll, night bhatta, and vehicle fit."],
            ["Missing contact", missingPhone, "Customer phone/email should be completed."],
            ["Pending drivers", state.drivers.filter((driver) => driver.status.includes("pending")).length, "KYC or approval may be required."],
            ["Portal alerts", state.notifications.length, "Cross-portal messages retained locally."],
            ["Rejected bookings", state.bookings.filter(isRejected).length, "Kept for audit, not deleted."]
        ];
        host.innerHTML = rows.map((item) => `
            <article class="safety-card">
                <small>${escapeHtml(item[0])}</small>
                <strong>${escapeHtml(item[1])}</strong>
                <span>${escapeHtml(item[2])}</span>
            </article>
        `).join("");
    }

    function renderPortalControls() {
        const portalHost = $("#portalControlGrid");
        const featureFolderHost = $("#portalFeatureFolderGrid");
        const customerHost = $("#customerControlList");
        const driverHost = $("#driverControlList");
        const controls = state.controls || loadAdminControls();

        if (portalHost) {
            const portals = [
                ["customer", "Customer Portal", "Bookings, ride history, wallet, profile and customer alerts."],
                ["driver", "Driver Portal", "Online status, booking requests, KYC, wallet and ride operations."]
            ];
            const portalCards = portals.map((item) => {
                const portal = controls.portals[item[0]] || {};
                const enabled = portal.enabled !== false;
                const featureCount = item[0] === "driver" ? DRIVER_FEATURES.length : CUSTOMER_FEATURES.length;
                return `
                    <article class="portal-control-card">
                        <header>
                            <div>
                                <strong>${escapeHtml(item[1])}</strong>
                                <p>${escapeHtml(item[2])}</p>
                                <small>${featureCount} feature controls connected</small>
                            </div>
                            <span class="status-pill ${enabled ? "approved" : "rejected"}">${enabled ? "Active" : "Paused"}</span>
                        </header>
                        <div class="control-actions">
                            <button class="row-action" data-control-action="enable-portal" data-portal="${escapeHtml(item[0])}" type="button"><i class="fas fa-play"></i> Enable</button>
                            <button class="danger-action" data-control-action="disable-portal" data-portal="${escapeHtml(item[0])}" type="button"><i class="fas fa-pause"></i> Pause</button>
                        </div>
                    </article>
                `;
            }).join("");

            portalHost.innerHTML = portalCards;
        }

        if (featureFolderHost) {
            featureFolderHost.innerHTML = [
                renderPortalFeatureFolder(
                    "customer",
                    "Customer Portal Feature Folder",
                    "Open this separate folder only when customer portal features need control.",
                    CUSTOMER_FEATURES,
                    controls
                ),
                renderPortalFeatureFolder(
                    "driver",
                    "Driver Portal Feature Folder",
                    "Open this separate folder only when driver portal features need control.",
                    DRIVER_FEATURES,
                    controls
                )
            ].join("");
        }

        if (customerHost) {
            const customers = getCustomerRows().slice(0, 20);
            if (!customers.length) {
                customerHost.innerHTML = `<div class="empty-state">No customer records found yet. Booking customers will appear here automatically.</div>`;
            } else {
                const customerRows = customers.map((customer) => {
                    const key = getControlEntityKey(customer);
                    const control = (controls.customers || {})[key] || {};
                    const status = cleanText(control.status || customer.adminControlStatus || "active").toLowerCase();
                    const blocked = ["suspended", "blocked", "disabled"].includes(status) || control.enabled === false;
                    return `
                        <article class="access-control-row">
                            <div>
                                <strong>${escapeHtml(customer.name || customer.fullname || "Customer")}</strong>
                                <small>${escapeHtml(customer.phone || customer.email || key || "No contact")} | ${escapeHtml(customer.type || "customer")}</small>
                            </div>
                            <div class="control-actions">
                                <span class="status-pill ${blocked ? "rejected" : "approved"}">${blocked ? "Suspended" : "Active"}</span>
                                <button class="row-action" data-control-action="activate-customer" data-subject-key="${escapeHtml(key)}" type="button"><i class="fas fa-unlock"></i> Activate</button>
                                <button class="danger-action" data-control-action="suspend-customer" data-subject-key="${escapeHtml(key)}" type="button"><i class="fas fa-ban"></i> Suspend</button>
                            </div>
                        </article>
                    `;
                }).join("");
                customerHost.innerHTML = customerRows;
            }
        }

        if (driverHost) {
            const query = state.query.toLowerCase();
            const drivers = state.drivers.filter((driver) => {
                if (!query) return true;
                return [driver.name, driver.phone, driver.vehicle, driver.status, driver.id].join(" ").toLowerCase().includes(query);
            }).slice(0, 24);
            if (!drivers.length) {
                driverHost.innerHTML = `<div class="empty-state">No driver records found. Existing driver data will appear here automatically.</div>`;
            } else {
                const driverRows = drivers.map((driver) => {
                    const key = getControlEntityKey(driver);
                    const control = (controls.drivers || {})[key] || {};
                    const status = cleanText(control.status || driver.adminControlStatus || driver.status || "pending").toLowerCase();
                    const blocked = ["suspended", "blocked", "offline_forced", "disabled"].includes(status) || control.enabled === false;
                    return `
                        <article class="access-control-row">
                            <div>
                                <strong>${escapeHtml(driver.name)}</strong>
                                <small>${escapeHtml(driver.phone || "No phone")} | ${escapeHtml(driver.vehicle)} | ${escapeHtml(driver.sourceKey)}</small>
                            </div>
                            <div class="control-actions">
                                <span class="status-pill ${blocked ? "rejected" : status === "approved" ? "approved" : "pending"}">${escapeHtml(status.replace(/_/g, " "))}</span>
                                <button class="row-action" data-control-action="approve-driver" data-subject-key="${escapeHtml(key)}" type="button"><i class="fas fa-check"></i> Approve</button>
                                <button class="row-action" data-control-action="activate-driver" data-subject-key="${escapeHtml(key)}" type="button"><i class="fas fa-unlock"></i> Activate</button>
                                <button class="danger-action" data-control-action="offline-driver" data-subject-key="${escapeHtml(key)}" type="button"><i class="fas fa-power-off"></i> Force offline</button>
                                <button class="danger-action" data-control-action="suspend-driver" data-subject-key="${escapeHtml(key)}" type="button"><i class="fas fa-ban"></i> Suspend</button>
                            </div>
                        </article>
                    `;
                }).join("");
                driverHost.innerHTML = driverRows;
            }
        }
    }

    function renderSettings() {
        const auto = $("#autoRefreshToggle");
        const compact = $("#compactRowsToggle");
        const popup = $("#portalPopupToggle");
        const apiBase = $("#apiBaseInput");
        const connectionText = $("#portalConnectionText");
        if (auto) auto.checked = state.settings.autoRefresh;
        if (compact) compact.checked = state.settings.compactRows;
        if (popup) popup.checked = state.settings.portalPopupAlerts;
        if (apiBase) apiBase.value = state.settings.apiBase;
        if (connectionText) {
            const status = state.connection && state.connection.connected ? "Connected" : "Not connected";
            const updated = state.connection && state.connection.updatedAt ? formatDate(state.connection.updatedAt) : "Not synced yet";
            connectionText.textContent = `${status}: customer, driver, booking, finance and safety controls. Last sync: ${updated}.`;
        }
        document.body.classList.toggle("compact-rows", state.settings.compactRows);
    }

    function renderAll() {
        renderMetrics();
        renderQueue();
        renderPulse();
        renderFareAudit();
        renderActivity();
        renderBookingSplitSummary();
        renderBookingTable();
        renderDriverBookingRequests();
        renderDrivers();
        renderFinance();
        renderSafety();
        renderPortalControls();
        renderSettings();
    }

    function buildSharedBookingUpdate(bookingId, baseBooking = {}, updates = {}, updatedAt = new Date().toISOString()) {
        const merged = {
            ...(baseBooking && typeof baseBooking === "object" ? baseBooking : {}),
            ...(updates && typeof updates === "object" ? updates : {})
        };
        const pickup = firstText(merged.pickup, merged.pickupLocation, merged.from, merged.origin);
        const dropoff = firstText(merged.dropoff, merged.dropLocation, merged.drop, merged.to, merged.destination);
        const amount = toAmount(merged.totalFare || merged.amount || merged.finalFare || merged.fare);
        const distanceKm = toAmount(merged.distanceKm || merged.distance || merged.fareQuote?.distanceKm || merged.fareBreakdown?.distanceKm);
        return {
            ...merged,
            id: bookingId,
            bookingId,
            pickup,
            pickupLocation: pickup,
            from: pickup,
            dropoff,
            drop: dropoff,
            dropLocation: dropoff,
            to: dropoff,
            fare: amount,
            totalFare: amount,
            amount,
            finalFare: amount,
            distanceKm,
            distance: distanceKm,
            outboundDateTime: firstText(merged.outboundDateTime, buildOutboundDateTime(merged.rideDate, merged.rideTime)),
            customerSnapshot: {
                ...(isPlainObject(merged.customerSnapshot) ? merged.customerSnapshot : {}),
                name: merged.customerName || merged.customerSnapshot?.name || "",
                phone: merged.customerPhone || merged.customerSnapshot?.phone || "",
                email: merged.customerEmail || merged.customerSnapshot?.email || ""
            },
            sourceKey: merged.sourceKey || "admin_booking_sync",
            adminCustomerSyncStatus: "synced",
            adminCustomerSyncedAt: updatedAt,
            backendSyncStatus: "retry",
            backendSyncQueuedAt: updatedAt,
            updatedAt
        };
    }

    function upsertBookingIntoStore(key, booking) {
        if (!key || !booking || !booking.bookingId) return false;
        const rows = readArray(key);
        const index = rows.findIndex((row) => cleanText(row.bookingId || row.id || row._id) === booking.bookingId);
        const nextRows = rows.slice();
        if (index >= 0) {
            const current = nextRows[index] || {};
            const merged = { ...current, ...booking };
            if (JSON.stringify(current) === JSON.stringify(merged)) return false;
            nextRows[index] = merged;
        } else {
            nextRows.unshift(booking);
        }
        writeArray(key, nextRows);
        return true;
    }

    function broadcastAdminBookingCustomerSync(booking, action, changedFields = [], reason = "") {
        const bookingId = cleanText(booking?.bookingId || booking?.id || "");
        if (!bookingId) return;
        const payload = {
            bookingId,
            action: cleanText(action || "admin_booking_updated", 80),
            changedFields: Array.isArray(changedFields) ? changedFields.slice(0, 40) : [],
            reason: cleanText(reason || "Updated by admin portal.", 180),
            booking,
            updatedAt: new Date().toISOString()
        };
        try {
            localStorage.setItem(ADMIN_BOOKING_EDIT_SIGNAL_KEY, JSON.stringify(payload));
        } catch (_error) {
            // Storage can be unavailable in private browser modes.
        }
        try {
            if (typeof BroadcastChannel === "function") {
                const channel = new BroadcastChannel("goindiaride-admin-booking-sync");
                channel.postMessage(payload);
                channel.close();
            }
        } catch (_error) {
            // BroadcastChannel is optional; storage event still carries the update.
        }
    }

    function updateBookingAcrossStores(bookingId, updates, sourceBooking = {}) {
        const updatedAt = new Date().toISOString();
        const sharedBooking = buildSharedBookingUpdate(bookingId, sourceBooking, updates, updatedAt);
        let touched = false;
        BOOKING_KEYS.forEach((key) => {
            const rows = readArray(key);
            let changed = false;
            const nextRows = rows.map((row) => {
                const rowId = cleanText(row.bookingId || row.id || row._id);
                if (rowId !== bookingId) return row;
                changed = true;
                touched = true;
                return {
                    ...row,
                    ...sharedBooking,
                    id: bookingId,
                    bookingId,
                    updatedAt
                };
            });
            if (changed) writeArray(key, nextRows);
        });

        CUSTOMER_BOOKING_SYNC_KEYS.forEach((key) => {
            if (upsertBookingIntoStore(key, sharedBooking)) touched = true;
        });
        return { touched, booking: sharedBooking };
    }

    function upsertAdminCustomerAccount(booking) {
        const id = cleanText(booking.customerId || booking.backendUserId || booking.userId || booking.customerEmail || booking.customerPhone);
        const phone = normalizeAdminPhoneValue(booking.customerPhone || "");
        const email = normalizeAdminEmailValue(booking.customerEmail || "");
        const name = cleanText(booking.customerName || "Customer");
        if (!id && !phone && !email) return false;

        const customerRow = {
            id: id || email || phone,
            userId: id || email || phone,
            customerId: id || email || phone,
            role: "customer",
            type: "customer",
            name,
            fullname: name,
            email,
            phone,
            mobile: phone,
            updatedAt: new Date().toISOString(),
            sourceKey: "admin_portal_customer_booking"
        };

        let touched = false;
        USER_KEYS.forEach((key) => {
            const rows = readArray(key);
            const index = rows.findIndex((row) => {
                return cleanText(row.id || row.userId || row.customerId) === customerRow.id
                    || (!!email && normalizeAdminEmailValue(row.email || row.customerEmail || "") === email)
                    || (!!phone && normalizeAdminPhoneValue(row.phone || row.mobile || row.customerPhone || "") === phone);
            });
            const nextRows = rows.slice();
            if (index >= 0) {
                nextRows[index] = { ...nextRows[index], ...customerRow };
            } else {
                nextRows.unshift(customerRow);
            }
            writeArray(key, nextRows);
            touched = true;
        });
        return touched;
    }

    function persistAdminCreatedBooking(booking) {
        if (!booking || !booking.bookingId) return { touched: false, booking: null };
        const sharedBooking = buildSharedBookingUpdate(booking.bookingId, booking, booking, booking.updatedAt || new Date().toISOString());
        let touched = false;
        BOOKING_KEYS.forEach((key) => {
            if (upsertBookingIntoStore(key, sharedBooking)) touched = true;
        });
        CUSTOMER_BOOKING_SYNC_KEYS.forEach((key) => {
            if (upsertBookingIntoStore(key, sharedBooking)) touched = true;
        });
        if (upsertAdminCustomerAccount(sharedBooking)) touched = true;
        return { touched, booking: sharedBooking };
    }

    async function syncAdminCreatedBookingToFallbackQueue(booking) {
        if (!booking || !booking.bookingId) return { ok: false, reason: "missing_booking" };
        const apiBases = buildBackendApiCandidates();
        const payload = {
            ...booking,
            source: "admin_portal_customer_booking",
            sourceKey: "admin_portal_customer_booking",
            mode: "admin_created_for_customer"
        };
        for (const apiBase of apiBases) {
            try {
                const response = await fetch(`${apiBase}/api/bookings/fallback/admin-review-queue`, {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                        "x-booking-client": "goindiaride-web",
                        "x-idempotency-key": createAdminIdempotencyKey("gir-admin-create-customer-booking", booking.bookingId)
                    },
                    credentials: "include",
                    body: JSON.stringify(payload)
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) continue;
                return { ok: true, apiBase, data };
            } catch (_error) {
                // Try the next configured API base.
            }
        }
        return { ok: false, reason: "fallback_queue_sync_failed" };
    }

    async function syncAdminBookingUpdateToFallbackQueue(booking, mode = "admin_edit", reason = "", changedFields = []) {
        if (!booking || !booking.bookingId) return { ok: false, reason: "missing_booking" };
        const apiBases = buildBackendApiCandidates();
        const payload = {
            ...booking,
            source: "admin_portal_customer_booking",
            sourceKey: "admin_portal_customer_booking",
            mode: cleanText(mode || "admin_edit", 80) || "admin_edit",
            reason: cleanText(reason || booking.adminEditReason || "Updated by admin portal.", 180),
            changedFields: Array.isArray(changedFields) ? changedFields.slice(0, 40) : []
        };
        for (const apiBase of apiBases) {
            try {
                const response = await fetch(`${apiBase}/api/bookings/fallback/admin-review-queue`, {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                        "x-booking-client": "goindiaride-web",
                        "x-idempotency-key": createAdminIdempotencyKey("gir-admin-booking-update-fallback", booking.bookingId)
                    },
                    credentials: "include",
                    body: JSON.stringify(payload)
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) continue;
                return { ok: true, apiBase, data };
            } catch (_error) {
                // Try the next configured API base.
            }
        }
        return { ok: false, reason: "fallback_queue_sync_failed" };
    }

    function addAudit(action, details) {
        const rows = readArray(AUDIT_KEY);
        rows.unshift({
            action,
            details,
            timestamp: new Date().toISOString()
        });
        writeArray(AUDIT_KEY, rows);
    }

    function notifyPortal(type, booking, message, targetPortals = ["customer", "driver", "admin"], metadata = {}) {
        if (window.PortalConnector && typeof window.PortalConnector.createNotification === "function") {
            window.PortalConnector.createNotification({
                type,
                title: "Admin booking update",
                message,
                sourcePortal: "admin",
                targetPortals,
                booking,
                metadata
            });
        }
    }

    function getNotificationToastKey(notification) {
        if (!notification || typeof notification !== "object") return "";
        return cleanText(notification.id || [
            notification.createdAt,
            notification.type,
            notification.title,
            notification.message,
            notification.sourcePortal
        ].join("|"));
    }

    function isQuietPortalNotification(notification) {
        const text = [
            notification?.type,
            notification?.title,
            notification?.message,
            notification?.metadata?.action
        ].join(" ").toLowerCase();
        return QUIET_NOTIFICATION_TEXT.some((pattern) => text.includes(pattern));
    }

    function isHistoricalPortalNotification(notification) {
        const createdAt = Date.parse(notification?.createdAt || "");
        return Number.isFinite(createdAt) && createdAt + 1500 < state.startupAt;
    }

    function shouldShowPortalToast(notification) {
        if (!notification) return false;
        if (!state.settings.portalPopupAlerts) return false;
        if (isQuietPortalNotification(notification)) return false;
        const key = getNotificationToastKey(notification);
        if (key && state.seenToasts.has(key)) return false;
        if (isHistoricalPortalNotification(notification)) return false;
        return true;
    }

    function rememberPortalToast(notification) {
        const key = getNotificationToastKey(notification);
        if (!key) return;
        state.seenToasts.add(key);
        saveSeenToasts();
    }

    function handleIncomingPortalNotification(notification) {
        state.notifications = loadNotifications();
        const isHistorical = isHistoricalPortalNotification(notification);
        if (isHistorical) {
            rememberPortalToast(notification);
            return;
        }

        if (notification && notification.booking) {
            refreshData();
        } else {
            renderPulse();
            renderActivity();
            renderSafety();
        }

        if (shouldShowPortalToast(notification)) {
            showToast(cleanText(notification?.message || notification?.title || "New admin notification"));
        }
        rememberPortalToast(notification);
    }

    function controlReason(defaultReason) {
        return cleanText($("#controlReasonInput")?.value || defaultReason || "Updated by admin portal.");
    }

    function findCustomerByKey(key) {
        const target = cleanText(key).toLowerCase();
        return getCustomerRows().find((customer) => getControlEntityKey(customer) === target) || null;
    }

    function findDriverByKey(key) {
        const target = cleanText(key).toLowerCase();
        return state.drivers.find((driver) => getControlEntityKey(driver) === target) || null;
    }

    function getFeatureLabel(portal, featureId) {
        const features = portal === "driver" ? DRIVER_FEATURES : CUSTOMER_FEATURES;
        const match = features.find((feature) => feature[0] === featureId);
        return match ? match[1] : cleanText(featureId, "Feature").replace(/_/g, " ");
    }

    function handlePortalControlAction(button) {
        if (!window.AdminControlBridge) {
            showToast("Admin control bridge is not loaded.");
            return;
        }

        const action = button.dataset.controlAction || "";
        const portal = button.dataset.portal || "";
        const feature = button.dataset.feature || "";
        const key = button.dataset.subjectKey || "";
        let result = { ok: true };

        if (action === "enable-portal" || action === "disable-portal") {
            const enabled = action === "enable-portal";
            window.AdminControlBridge.setPortalEnabled(portal, enabled, controlReason(enabled ? "Portal enabled by admin." : "Portal paused by admin."));
            showToast(`${portal} portal ${enabled ? "enabled" : "paused"}.`);
        } else if (action === "enable-feature" || action === "disable-feature") {
            const enabled = action === "enable-feature";
            if (typeof window.AdminControlBridge.setFeatureEnabled !== "function") {
                showToast("Feature bridge is not loaded.");
                return;
            }
            result = window.AdminControlBridge.setFeatureEnabled(
                portal,
                feature,
                enabled,
                controlReason(`${getFeatureLabel(portal, feature)} ${enabled ? "enabled" : "paused"} by admin.`)
            );
            showToast(result.ok ? `${getFeatureLabel(portal, feature)} ${enabled ? "enabled" : "paused"}.` : "Feature action failed.");
        } else if (action === "edit-feature") {
            if (typeof window.AdminControlBridge.setFeatureCorrection !== "function") {
                showToast("Feature correction bridge is not loaded.");
                return;
            }
            const controls = state.controls || loadAdminControls();
            const current = ((((controls.portalFeatures || {})[portal]) || {})[feature]) || {};
            const featureLabel = getFeatureLabel(portal, feature);
            const note = window.prompt(`${featureLabel} correction / admin note`, cleanText(current.correction || ""));
            if (note === null) return;
            const correction = cleanText(note);
            result = window.AdminControlBridge.setFeatureCorrection(portal, feature, correction, {
                reason: correction || cleanText(current.reason || `${featureLabel} correction cleared by admin.`)
            });
            showToast(result.ok ? `${featureLabel} correction ${correction ? "saved" : "cleared"}.` : "Feature correction failed.");
        } else if (action === "activate-customer" || action === "suspend-customer") {
            const customer = findCustomerByKey(key);
            if (!customer) {
                showToast("Customer record not found.");
                return;
            }
            const status = action === "activate-customer" ? "active" : "suspended";
            result = window.AdminControlBridge.setSubjectStatus("customer", customer, status, controlReason(`Customer ${status} by admin.`));
            showToast(result.ok ? `Customer ${status}.` : "Customer action failed.");
        } else if (action === "approve-driver" || action === "activate-driver" || action === "offline-driver" || action === "suspend-driver") {
            const driver = findDriverByKey(key);
            if (!driver) {
                showToast("Driver record not found.");
                return;
            }
            if (action === "approve-driver") {
                result = window.AdminControlBridge.approveDriver(driver, controlReason("Driver approved by admin."));
                showToast(result.ok ? "Driver approved." : "Driver approval failed.");
            } else if (action === "activate-driver") {
                result = window.AdminControlBridge.setSubjectStatus("driver", driver, "active", controlReason("Driver portal access restored by admin."));
                showToast(result.ok ? "Driver activated." : "Driver action failed.");
            } else if (action === "offline-driver") {
                result = window.AdminControlBridge.forceDriverOffline(driver, controlReason("Driver forced offline by admin."));
                showToast(result.ok ? "Driver forced offline." : "Driver action failed.");
            } else {
                result = window.AdminControlBridge.setSubjectStatus("driver", driver, "suspended", controlReason("Driver suspended by admin."));
                showToast(result.ok ? "Driver suspended." : "Driver action failed.");
            }
        }

        refreshData();
    }

    async function handleAdminCreateBookingSubmit(form) {
        const data = collectAdminCreateBookingForm(form);
        const validationError = validateAdminCreateBooking(data);
        if (validationError) {
            showToast(validationError);
            return;
        }
        saveFormAutofillMemory(form);

        const booking = buildAdminCreatedBooking(data);
        const syncResult = persistAdminCreatedBooking(booking);
        const savedBooking = syncResult.booking || booking;
        const customerMessage = `Booking ${savedBooking.bookingId} created by admin for ${savedBooking.customerName}.`;
        addAudit("BOOKING_CREATED_BY_ADMIN", `Admin created booking ${savedBooking.bookingId} for ${savedBooking.customerName}.`);
        notifyPortal("booking_created_by_admin", savedBooking, customerMessage, ["customer", "admin"], {
            bookingId: savedBooking.bookingId,
            status: savedBooking.status,
            adminReviewStatus: savedBooking.adminReviewStatus,
            source: "admin_portal_customer_booking"
        });
        broadcastAdminBookingCustomerSync(savedBooking, "admin_create", ["booking_created_for_customer"], data.adminEditReason);
        const backendQueue = await syncAdminCreatedBookingToFallbackQueue(savedBooking);
        closeAdminCreateBookingModal();
        refreshData();
        showToast(
            backendQueue.ok
                ? `Booking ${savedBooking.bookingId} added for customer and queued for admin/customer sync.`
                : `Booking ${savedBooking.bookingId} added locally and sent to customer portal. Backend queue sync pending.`
        );
    }

    async function handleBookingEditSubmit(form) {
        const data = collectBookingEditForm(form);
        const booking = state.bookings.find((item) => item.bookingId === data.bookingId);
        if (!booking) {
            showToast("Booking not found.");
            return;
        }
        saveFormAutofillMemory(form);

        const patch = buildBookingEditPatch(booking, data);
        if (!patch.changedFields.length) {
            showToast("No booking changes detected.");
            return;
        }

        const syncResult = updateBookingAcrossStores(data.bookingId, patch.updates, booking);
        const updatedBooking = syncResult.booking || { ...booking, ...patch.updates, bookingId: data.bookingId, id: data.bookingId };
        const changedLabel = patch.changedFields.map(humanizeKey).join(", ");
        const customerMessage = `Booking ${data.bookingId} details updated by admin: ${changedLabel}.`;

        addAudit("BOOKING_EDITED_BY_ADMIN", `Booking ${data.bookingId} edited by admin. Fields: ${changedLabel}.`);
        notifyPortal("booking_admin_edited", updatedBooking, customerMessage, ["customer", "admin"], {
            bookingId: data.bookingId,
            status: updatedBooking.status,
            adminReviewStatus: updatedBooking.adminReviewStatus,
            changedFields: patch.changedFields,
            reason: patch.reason
        });
        broadcastAdminBookingCustomerSync(updatedBooking, "admin_edit", patch.changedFields, patch.reason);
        const backendEdit = await syncBackendBookingEdit(data.bookingId, updatedBooking, patch.changedFields, patch.reason);
        const fallbackEdit = await syncAdminBookingUpdateToFallbackQueue(updatedBooking, "admin_edit", patch.reason, patch.changedFields);
        closeBookingEditor();
        refreshData();
        showToast(
            backendEdit.ok
                ? "Booking details updated in admin, customer portal, and backend."
                : (fallbackEdit.ok
                    ? "Booking details updated and synced through admin fallback queue."
                    : (syncResult.touched ? "Booking details updated and synced to customer portal." : "Edit saved in notification/audit only."))
        );
    }

    async function handleBookingDecision(bookingId, decision) {
        const booking = state.bookings.find((item) => item.bookingId === bookingId);
        if (!booking) {
            showToast("Booking not found.");
            return;
        }
        const approved = decision === "approve";
        const updates = {
            adminReviewStatus: approved ? "approved" : "rejected",
            status: approved ? "approved" : "rejected",
            adminDecision: approved ? "approved_from_admin_app" : "rejected_from_admin_app",
            adminDecisionAt: new Date().toISOString()
        };

        const syncResult = updateBookingAcrossStores(bookingId, updates, booking);
        const customerMessage = approved
            ? `Booking ${bookingId} approved by admin. Driver assignment will start shortly.`
            : `Booking ${bookingId} was not approved by admin. Please check booking details or contact support.`;
        let bridgeNotified = false;
        if (window.AdminControlBridge && typeof window.AdminControlBridge.setBookingStatus === "function") {
            const bridgeResult = window.AdminControlBridge.setBookingStatus(bookingId, approved ? "approved" : "rejected", {
                reason: customerMessage,
                decision: updates.adminDecision
            });
            bridgeNotified = Boolean(bridgeResult && bridgeResult.ok);
        }
        const message = `${bookingId} ${approved ? "approved" : "rejected"} from standalone admin app.`;
        const backendReview = await reviewBackendBooking(bookingId, decision, customerMessage);
        addAudit(approved ? "BOOKING_APPROVED" : "BOOKING_REJECTED", message);
        if (!bridgeNotified) {
            notifyPortal(approved ? "booking_approved" : "booking_rejected", syncResult.booking || { ...booking, ...updates }, customerMessage, ["customer", "driver", "admin"]);
        }
        broadcastAdminBookingCustomerSync(syncResult.booking || { ...booking, ...updates }, approved ? "admin_approve" : "admin_reject", ["adminReviewStatus", "status"], customerMessage);
        const fallbackDecision = await syncAdminBookingUpdateToFallbackQueue(
            syncResult.booking || { ...booking, ...updates, bookingId },
            approved ? "admin_approve" : "admin_reject",
            customerMessage,
            ["adminReviewStatus", "status"]
        );
        refreshData();
        showToast(backendReview.ok || fallbackDecision.ok || syncResult.touched ? message : "Decision recorded locally; backend review sync is still pending.");
    }

    function seedDriver() {
        const key = "drivers";
        const rows = readArray(key);
        const id = `DRV${Date.now()}`;
        rows.unshift({
            id,
            name: "New Verified Driver",
            phone: "+91",
            vehicleType: "Sedan",
            status: "pending",
            approvalStatus: "pending",
            createdAt: new Date().toISOString()
        });
        writeArray(key, rows);
        addAudit("DRIVER_SAMPLE_ADDED", `Driver ${id} added from admin app.`);
        refreshData();
        showToast("Driver row added without changing old driver records.");
    }

    function exportBookings() {
        const payload = {
            exportedAt: new Date().toISOString(),
            source: "GOindiaRIDE standalone admin app",
            bookings: getFilteredBookings("all"),
            customerBookings: getFilteredBookings("all"),
            driverBookings: getFilteredDriverBookings(),
            splitKeys: {
                customer: CUSTOMER_BOOKING_SPLIT_KEY,
                driver: DRIVER_BOOKING_SPLIT_KEY
            }
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `goindiaride-bookings-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        addAudit("BOOKING_EXPORT", "Booking export generated from standalone admin app.");
        showToast("Booking export generated.");
    }

    function clearStorageKeys(storage, keys) {
        if (!storage || !Array.isArray(keys)) return;
        keys.forEach((key) => {
            try {
                storage.removeItem(key);
            } catch (_error) {
                // Storage can be unavailable in restricted browser modes.
            }
        });
    }

    function logoutAdminSession() {
        if (!window.confirm("Logout admin session?")) return;
        addAudit("ADMIN_LOGOUT", "Admin logged out from standalone admin app.");
        clearStorageKeys(localStorage, ADMIN_LOGOUT_KEYS);
        clearStorageKeys(sessionStorage, ADMIN_LOGOUT_KEYS);
        showToast("Admin logout successful.");
        window.location.replace("./login.html?next=%2Fadmin%2Fapp.html");
    }

    function showToast(message) {
        const host = $("#toastRegion");
        if (!host) return;
        const node = document.createElement("div");
        node.className = "toast";
        node.textContent = message;
        host.appendChild(node);
        setTimeout(() => node.remove(), 3200);
    }

    function resolveInitialView() {
        try {
            const params = new URLSearchParams(window.location.search || "");
            const fromQuery = cleanText(params.get("view")).toLowerCase();
            const fromHash = cleanText((window.location.hash || "").replace(/^#/, "")).toLowerCase();
            const candidate = fromQuery || fromHash;
            return Object.prototype.hasOwnProperty.call(viewTitles, candidate) ? candidate : "overview";
        } catch (_error) {
            return "overview";
        }
    }

    function syncViewIntoUrl(view) {
        try {
            const safeView = cleanText(view).toLowerCase();
            if (!Object.prototype.hasOwnProperty.call(viewTitles, safeView)) return;
            const url = new URL(window.location.href);
            url.searchParams.set("view", safeView);
            window.history.replaceState({}, "", url.toString());
        } catch (_error) {
            // URL sync can fail in restricted browser sessions.
        }
    }

    function switchView(view) {
        state.view = view;
        $all(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
        $all(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `view-${view}`));
        setText("#viewTitle", viewTitles[view] || "Admin App");
        $("#appSidebar")?.classList.remove("open");
        syncViewIntoUrl(view);
    }

    function setupEvents() {
        $all(".nav-item").forEach((item) => {
            item.addEventListener("click", () => switchView(item.dataset.view || "overview"));
        });

        $all("[data-admin-logout]").forEach((button) => {
            button.addEventListener("click", logoutAdminSession);
        });

        $("#mobileMenuBtn")?.addEventListener("click", () => $("#appSidebar")?.classList.toggle("open"));
        $("#refreshBtn")?.addEventListener("click", () => {
            refreshData();
            showToast("Admin app refreshed.");
        });

        $("#themeBtn")?.addEventListener("click", () => {
            const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("adminAppTheme", next);
        });

        $("#globalSearch")?.addEventListener("input", (event) => {
            state.query = event.target.value || "";
            renderQueue();
            renderBookingTable();
            renderDriverBookingRequests();
            renderBookingSplitSummary();
            renderPortalControls();
        });

        $("#bookingSearchInput")?.addEventListener("input", (event) => {
            state.bookingQuery = event.target.value || "";
            renderBookingTable();
            renderDriverBookingRequests();
            renderBookingSplitSummary();
        });

        $all(".segment").forEach((button) => {
            button.addEventListener("click", () => {
                $all(".segment").forEach((item) => item.classList.remove("active"));
                button.classList.add("active");
                state.queueFilter = button.dataset.filter || "all";
                renderQueue();
            });
        });

        $("#bookingStatusFilter")?.addEventListener("change", (event) => {
            state.bookingFilter = event.target.value || "all";
            renderBookingTable();
            renderBookingSplitSummary();
        });

        document.addEventListener("click", (event) => {
            const closeEditorButton = event.target.closest("[data-close-booking-editor]");
            if (closeEditorButton) {
                closeBookingEditor();
                return;
            }

            const closeAdminCreateButton = event.target.closest("[data-close-admin-create-booking]");
            if (closeAdminCreateButton) {
                closeAdminCreateBookingModal();
                return;
            }

            if (event.target && event.target.id === "bookingEditModal") {
                closeBookingEditor();
                return;
            }

            if (event.target && event.target.id === "adminCreateBookingModal") {
                closeAdminCreateBookingModal();
                return;
            }

            const createAutofillButton = event.target.closest("[data-admin-create-autofill]");
            if (createAutofillButton) {
                const form = createAutofillButton.closest("#adminCreateBookingForm");
                const result = applyCreateFormAutofill(form, { fillMissingOnly: false });
                showToast(result.changed ? "Auto fill applied from recent booking data." : "No recent template found for auto fill.");
                return;
            }

            const editAutofillButton = event.target.closest("[data-booking-edit-autofill]");
            if (editAutofillButton) {
                const form = editAutofillButton.closest("#bookingEditForm");
                const bookingId = cleanText(form?.elements?.bookingId?.value || "");
                const booking = state.bookings.find((item) => item.bookingId === bookingId);
                const result = applyEditFormAutofill(form, booking, { fillMissingOnly: false });
                showToast(result.changed ? "Full booking form auto-filled from recent data." : "Booking form is already fully auto-filled.");
                return;
            }

            const controlButton = event.target.closest("[data-control-action]");
            if (controlButton) {
                handlePortalControlAction(controlButton);
                return;
            }

            const editButton = event.target.closest("[data-booking-edit]");
            if (editButton) {
                openBookingEditor(editButton.dataset.bookingEdit || "");
                return;
            }

            const actionButton = event.target.closest("[data-action][data-booking-id]");
            if (!actionButton) return;
            handleBookingDecision(actionButton.dataset.bookingId, actionButton.dataset.action);
        });

        document.addEventListener("submit", (event) => {
            const createForm = event.target.closest("#adminCreateBookingForm");
            if (createForm) {
                event.preventDefault();
                handleAdminCreateBookingSubmit(createForm);
                return;
            }

            const form = event.target.closest("#bookingEditForm");
            if (!form) return;
            event.preventDefault();
            handleBookingEditSubmit(form);
        });

        document.addEventListener("change", (event) => {
            const select = event.target.closest("#adminCreateCustomerSelect");
            if (!select) return;
            const form = select.closest("#adminCreateBookingForm");
            const customer = findAdminCreateCustomer(select.value || "");
            hydrateAdminCreateCustomerFields(form, customer);
            applyCreateFormAutofill(form, { fillMissingOnly: false });
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && $("#adminCreateBookingModal")?.classList.contains("open")) {
                closeAdminCreateBookingModal();
                return;
            }
            if (event.key === "Escape" && $("#bookingEditModal")?.classList.contains("open")) {
                closeBookingEditor();
            }
        });

        $("#exportBookingsBtn")?.addEventListener("click", exportBookings);
        $("#addBookingForCustomerBtn")?.addEventListener("click", openAdminCreateBookingModal);
        $("#seedDriverBtn")?.addEventListener("click", seedDriver);
        $("#clearLogViewBtn")?.addEventListener("click", () => {
            state.hideOldActivity = !state.hideOldActivity;
            $("#clearLogViewBtn").textContent = state.hideOldActivity ? "Show more" : "Hide old";
            renderActivity();
        });

        $("#saveSettingsBtn")?.addEventListener("click", () => {
            state.settings.autoRefresh = Boolean($("#autoRefreshToggle")?.checked);
            state.settings.compactRows = Boolean($("#compactRowsToggle")?.checked);
            state.settings.portalPopupAlerts = Boolean($("#portalPopupToggle")?.checked);
            state.settings.apiBase = cleanText($("#apiBaseInput")?.value || "");
            saveSettings();
            connectAllPortalFeatures({ audit: true });
            applySettings();
            renderAll();
            showToast("Settings saved locally.");
        });

        $("#connectPortalsBtn")?.addEventListener("click", () => {
            state.settings.apiBase = cleanText($("#apiBaseInput")?.value || state.settings.apiBase || DEFAULT_API_BASE);
            saveSettings();
            connectAllPortalFeatures({ audit: true });
            renderAll();
            showToast("All admin portal controls connected.");
        });

        window.addEventListener("storage", (event) => {
            const controlKey = window.AdminControlBridge && window.AdminControlBridge.keys ? window.AdminControlBridge.keys.CONTROL_KEY : "";
            if ([...BOOKING_KEYS, ...DRIVER_KEYS, ...USER_KEYS, NOTIFICATION_KEY, AUDIT_KEY, ADMIN_CONNECTION_KEY, ADMIN_QUEUE_SYNC_SIGNAL_KEY, ADMIN_BOOKING_EDIT_SIGNAL_KEY, controlKey].includes(event.key)
                || sourceLooksBookingRelated(event.key || "")) {
                refreshData();
            }
        });
    }

    function applySettings() {
        document.body.classList.toggle("compact-rows", state.settings.compactRows);
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
            state.refreshTimer = null;
        }
        if (state.settings.autoRefresh) {
            state.refreshTimer = setInterval(refreshData, ADMIN_AUTO_REFRESH_INTERVAL_MS);
        }
    }

    function hydrateOperator() {
        const admin = parseJson(localStorage.getItem("currentAdmin"), null) || {};
        const name = cleanText(admin.name || admin.fullname || admin.email || "Admin");
        setText("#operatorName", name);
        setText("#operatorInitials", name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AD");
    }

    function setupPortalListener() {
        if (window.PortalConnector && typeof window.PortalConnector.setActivePortal === "function") {
            window.PortalConnector.setActivePortal("admin");
        }
        if (window.PortalConnector && typeof window.PortalConnector.listen === "function") {
            window.PortalConnector.listen("admin", (notification) => {
                handleIncomingPortalNotification(notification);
                return true;
            });
        }
    }

    window.GoIndiaAdminBookingSplit = {
        keys: {
            customer: CUSTOMER_BOOKING_SPLIT_KEY,
            driver: DRIVER_BOOKING_SPLIT_KEY,
            summary: BOOKING_SPLIT_VIEW_KEY
        },
        refresh: loadBookingSplit,
        getCustomerBookings() {
            return loadBookingSplit().customerBookings;
        },
        getDriverBookings() {
            return loadBookingSplit().driverBookings;
        },
        helpers: {
            cleanText,
            escapeHtml,
            formatDate,
            formatMoney,
            getStatusClass,
            getStatusLabel,
            getDriverBookingStatusClass,
            getDriverBookingStatusLabel
        }
    };

    function init() {
        const today = new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
        setText("#todayLabel", today);
        const theme = localStorage.getItem("adminAppTheme");
        if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
        state.view = resolveInitialView();
        hydrateOperator();
        setupEvents();
        switchView(state.view);
        connectAllPortalFeatures();
        setupPortalListener();
        applySettings();
        refreshData();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
