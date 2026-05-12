(function initStandaloneAdminApp() {
    "use strict";

    const ADMIN_REVIEW_INBOX_KEY = "goindiaride_admin_review_inbox_v1";
    const SETTINGS_KEY = "goindiaride_admin_app_settings_v1";
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
    const TOAST_SEEN_KEY = "goindiaride_admin_app_seen_toasts_v1";
    const DEFAULT_API_BASE = "https://goindiaride.onrender.com";
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
        drivers: [],
        users: [],
        notifications: [],
        connection: loadConnectionState(),
        controls: null,
        query: "",
        view: "overview",
        bookingFilter: "all",
        queueFilter: "all",
        hideOldActivity: false,
        settings: loadSettings(),
        seenToasts: loadSeenToasts(),
        startupAt: Date.now(),
        editingBookingId: "",
        refreshTimer: null,
        backendBookingSyncing: false
    };

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
        return /booking|bookings|ride|rides|trip|trips|reservation|admin_review|portal_notifications/i.test(cleanText(sourceKey));
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

    function pushBookingCandidate(row, sourceKey, target) {
        if (!isBookingLikeRecord(row, sourceKey)) return;
        const bookingId = getBookingIdentity(row) || makeSyntheticBookingId(row, sourceKey);
        target.push({
            ...row,
            id: bookingId,
            bookingId,
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
                ${items.map(([icon, label, value]) => `
                    <span><i class="fas ${icon}"></i><strong>${escapeHtml(label)}</strong>${escapeHtml(formatPlainValue(value))}</span>
                `).join("")}
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

    function renderEditInput(name, label, value, attrs = "") {
        return `
            <label class="booking-edit-field">
                <span>${escapeHtml(label)}</span>
                <input name="${escapeHtml(name)}" value="${formValue(value)}" ${attrs}>
            </label>
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

    function buildBookingEditForm(booking) {
        const specialRequests = isPlainObject(booking.specialRequests)
            ? booking.specialRequests
            : booking.customerFeatures?.specialRequests;
        const safetyAccessibility = isPlainObject(booking.safetyAccessibility)
            ? booking.safetyAccessibility
            : booking.customerFeatures?.safetyAccessibility;
        return `
            <input type="hidden" name="bookingId" value="${escapeHtml(booking.bookingId)}">
            <div class="booking-edit-grid">
                ${renderEditInput("customerName", "Customer name", booking.customerName)}
                ${renderEditInput("customerPhone", "Customer phone", booking.customerPhone)}
                ${renderEditInput("customerEmail", "Customer email", booking.customerEmail, 'type="email"')}
                ${renderEditInput("pickup", "Pickup", booking.pickup || booking.pickupLocation)}
                ${renderEditInput("dropoff", "Drop", booking.dropoff || booking.dropLocation)}
                ${renderEditInput("rideDate", "Ride date", booking.rideDate, 'type="date"')}
                ${renderEditInput("rideTime", "Ride time", booking.rideTime, 'type="time"')}
                ${renderEditInput("returnDate", "Return date", booking.returnDate || booking.returnTrip?.returnDate, 'type="date"')}
                ${renderEditInput("returnTime", "Return time", booking.returnTime || booking.returnTrip?.returnTime, 'type="time"')}
                ${renderEditInput("tripPlan", "Trip plan", booking.tripPlan || booking.bookingMode || booking.mode)}
                ${renderEditInput("vehicleType", "Vehicle type", booking.vehicleType || booking.rideType)}
                ${renderEditInput("vehicleModel", "Vehicle model", booking.vehicleModel)}
                ${renderEditInput("passengers", "Passengers", booking.passengers || 1, 'type="number" min="1" max="20"')}
                ${renderEditInput("luggage", "Luggage", booking.luggage)}
                ${renderEditInput("paymentMethod", "Payment method", booking.paymentMethod || booking.payment?.method || booking.paymentMode)}
                ${renderEditInput("fare", "Fare / amount", booking.fare || booking.totalFare || booking.amount || booking.finalFare, 'type="number" min="0" step="1"')}
                ${renderEditInput("distanceKm", "Distance KM", booking.distanceKm || booking.distance, 'type="number" min="0" step="0.1"')}
                ${renderEditInput("driverId", "Driver ID", booking.driverId)}
                ${renderEditInput("driverName", "Driver name", booking.driverName)}
                <label class="booking-edit-field">
                    <span>Booking status</span>
                    <select name="status">${renderSelectOptions(BOOKING_STATUS_OPTIONS, booking.status)}</select>
                </label>
                <label class="booking-edit-field">
                    <span>Admin review</span>
                    <select name="adminReviewStatus">${renderSelectOptions(ADMIN_REVIEW_OPTIONS, booking.adminReviewStatus || "pending")}</select>
                </label>
                ${renderEditTextarea("stops", "Stops", serializeList(booking.stops), 'placeholder="One stop per line"')}
                ${renderEditTextarea("notes", "Notes", booking.notes)}
                ${renderEditTextarea("specialRequests", "Special requests", serializeMap(specialRequests), 'placeholder=\'JSON or comma list: pet=true, extra_waiting=true\'')}
                ${renderEditTextarea("safetyAccessibility", "Safety and accessibility", serializeMap(safetyAccessibility), 'placeholder=\'JSON or comma list: wheelchair=true, child_seat=true\'')}
                ${renderEditTextarea("adminEditReason", "Admin edit note", "", 'placeholder="Reason shown in audit/customer notification"')}
            </div>
            <div class="booking-edit-actions">
                <button class="text-button" data-close-booking-editor type="button">Cancel</button>
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
        if (form) form.innerHTML = buildBookingEditForm(booking);
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        modal.querySelector("input[name='pickup']")?.focus();
    }

    function closeBookingEditor() {
        const modal = $("#bookingEditModal");
        state.editingBookingId = "";
        if (!modal) return;
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
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
            returnDate: data.returnDate,
            returnTime: data.returnTime,
            returnTrip: { returnDate: data.returnDate, returnTime: data.returnTime },
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
        return {
            autoRefresh: parsed.autoRefresh !== false,
            compactRows: parsed.compactRows === true,
            portalPopupAlerts: parsed.portalPopupAlerts === true,
            apiBase: cleanText(
                parsed.apiBase
                || localStorage.getItem("goindiaride_admin_api_base")
                || localStorage.getItem("goindiaride_api_base")
                || DEFAULT_API_BASE
            )
        };
    }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
        if (state.settings.apiBase) {
            localStorage.setItem("goindiaride_api_base", state.settings.apiBase.replace(/\/$/, ""));
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

    function buildBackendApiCandidates() {
        const host = cleanText(window.location?.hostname || "").toLowerCase();
        const sameOriginBase = cleanText(window.location?.origin || "").replace(/\/$/, "");
        const preferredConfigured = cleanText(
            state.settings.apiBase
            || localStorage.getItem("goindiaride_admin_api_base")
            || localStorage.getItem("goindiaride_api_base")
            || ""
        ).replace(/\/$/, "");
        const explicitWindowBase = cleanText(
            window.GOINDIARIDE_API_BASE
            || window.__GOINDIARIDE_RUNTIME_API_ORIGIN__
            || window.__GOINDIARIDE_API_ORIGIN__
            || ""
        ).replace(/\/$/, "");
        const primaryCloudBase = normalizeApiBase(DEFAULT_API_BASE);
        const primaryWebsiteHost = host === "goindiaride.in" || host === "www.goindiaride.in";
        const ordered = primaryWebsiteHost
            ? [sameOriginBase, preferredConfigured, explicitWindowBase, primaryCloudBase]
            : [preferredConfigured, explicitWindowBase, sameOriginBase, primaryCloudBase];
        const seen = new Set();
        return ordered.filter((base) => {
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
                credentials: "include"
            });
            if (!response.ok) return { ok: false, rows: [] };
            const payload = await response.json().catch(() => ({}));
            const rows = extractBackendPayloadRows(payload)
                .map((row) => mapBackendBookingRow(row, sourceKey))
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
            customerPhone: firstText(row.customerPhone, customerSnapshot.phone, customer.phone, row.phone, row.mobile, row.contact),
            customerEmail: firstText(row.customerEmail, customerSnapshot.email, customer.email, row.email, row.userEmail),
            status,
            adminReviewStatus,
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
            map.set(item.id, { ...existing, ...item });
        });
        return Array.from(map.values());
    }

    function loadBookings() {
        const rows = [];
        BOOKING_KEYS.forEach((key) => {
            readArray(key).forEach((item) => rows.push(normalizeBooking(item, key)));
        });
        const discovered = scanAllStorageForBookingRows()
            .map((item) => normalizeBooking(item, item.sourceKey || "storage_scan"));
        discovered.forEach((item) => rows.push(item));
        if (discovered.length) {
            mergeBookingsIntoStore(ADMIN_REVIEW_INBOX_KEY, discovered);
            mergeBookingsIntoStore("goindiaride_active_bookings", discovered);
        }

        return mergeById(rows).sort((a, b) => {
            const at = Date.parse(b.createdAt || "") || 0;
            const bt = Date.parse(a.createdAt || "") || 0;
            return at - bt;
        });
    }

    function getBackendAccessToken() {
        return cleanText(
            localStorage.getItem("accessToken")
            || localStorage.getItem("authToken")
            || localStorage.getItem("token")
            || ""
        );
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
            const current = byId.get(id) || {};
            const merged = {
                ...current,
                ...row,
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
        const token = getBackendAccessToken();
        if (!token || state.backendBookingSyncing) return false;
        state.backendBookingSyncing = true;
        try {
            const apiBases = buildBackendApiCandidates();
            for (const apiBase of apiBases) {
                const pendingResult = await fetchBackendBookingRows({
                    apiBase,
                    token,
                    endpoint: "/api/bookings/admin/pending?limit=500",
                    sourceKey: "backend_admin_pending"
                });
                const allBookingsResult = await fetchBackendBookingRows({
                    apiBase,
                    token,
                    endpoint: "/api/bookings/my?limit=500",
                    sourceKey: "backend_admin_all"
                });

                if (!pendingResult.ok && !allBookingsResult.ok) continue;
                const mapped = mergeById([...(pendingResult.rows || []), ...(allBookingsResult.rows || [])]);

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
                        "x-booking-client": "goindiaride-web"
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
        const apiBase = normalizeApiBase(state.settings.apiBase || localStorage.getItem("goindiaride_api_base"));
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
        state.bookings = loadBookings();
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

    function getFilteredBookings(filter = state.bookingFilter) {
        const query = state.query.toLowerCase();
        return state.bookings.filter((booking) => {
            const text = [
                booking.bookingId,
                booking.customerName,
                booking.customerPhone,
                booking.customerEmail,
                booking.pickup,
                booking.dropoff,
                booking.vehicleType,
                booking.rideDate,
                booking.rideTime,
                booking.notes,
                booking.stops,
                booking.paymentMethod,
                booking.status,
                booking.adminReviewStatus
            ].join(" ").toLowerCase();

            if (query && !text.includes(query)) return false;
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
            const key = getControlEntityKey(user);
            if (key) map.set(key, { ...user, type: "stored_user" });
        });

        state.bookings.forEach((booking) => {
            const customer = {
                id: booking.customerId || booking.userId || booking.backendUserId || "",
                name: booking.customerName || "Customer",
                email: booking.customerEmail || "",
                phone: booking.customerPhone || "",
                type: "booking_customer"
            };
            const key = getControlEntityKey(customer);
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
                    ${renderBookingHighlights(booking)}
                    ${renderBookingFullDetails(booking)}
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
            ["fa-clock", "Auto refresh", state.settings.autoRefresh ? "Every 20 seconds" : "Manual"]
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
            host.innerHTML = `<tr><td colspan="6"><div class="empty-state">No booking rows found.</div></td></tr>`;
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
                    ${renderBookingHighlights(booking)}
                    ${renderBookingFullDetails(booking, { open: true })}
                </td>
            </tr>
        `).join("");
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

            const featurePanels = [
                ["customer", "Customer Feature Control", CUSTOMER_FEATURES],
                ["driver", "Driver Feature Control", DRIVER_FEATURES]
            ].map((group) => {
                const portal = group[0];
                const portalFeatures = ((controls.portalFeatures || {})[portal]) || {};
                return `
                    <article class="portal-control-card feature-control-panel">
                        <header>
                            <div>
                                <strong>${escapeHtml(group[1])}</strong>
                                <p>Feature-level control is shared with the live ${escapeHtml(portal)} portal.</p>
                            </div>
                            <span class="status-pill good">${group[2].length} linked</span>
                        </header>
                        <div class="portal-feature-list">
                            ${group[2].map((feature) => {
                                const control = portalFeatures[feature[0]] || {};
                                const enabled = control.enabled !== false && !["disabled", "paused", "blocked"].includes(cleanText(control.status || "active").toLowerCase());
                                const featureLabel = cleanText(control.labelOverride || feature[1]);
                                const correction = cleanText(control.correction || "");
                                return `
                                    <div class="feature-control-row">
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
                            }).join("")}
                        </div>
                    </article>
                `;
            }).join("");

            portalHost.innerHTML = portalCards + featurePanels;
        }

        if (customerHost) {
            const customers = getCustomerRows().slice(0, 20);
            if (!customers.length) {
                customerHost.innerHTML = `<div class="empty-state">No customer records found yet. Booking customers will appear here automatically.</div>`;
            } else {
                customerHost.innerHTML = customers.map((customer) => {
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
                driverHost.innerHTML = drivers.map((driver) => {
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
        renderBookingTable();
        renderDrivers();
        renderFinance();
        renderSafety();
        renderPortalControls();
        renderSettings();
    }

    function updateBookingAcrossStores(bookingId, updates) {
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
                    ...updates,
                    id: row.id || bookingId,
                    bookingId,
                    updatedAt: new Date().toISOString()
                };
            });
            if (changed) writeArray(key, nextRows);
        });
        return touched;
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

    function handleBookingEditSubmit(form) {
        const data = collectBookingEditForm(form);
        const booking = state.bookings.find((item) => item.bookingId === data.bookingId);
        if (!booking) {
            showToast("Booking not found.");
            return;
        }

        const patch = buildBookingEditPatch(booking, data);
        if (!patch.changedFields.length) {
            showToast("No booking changes detected.");
            return;
        }

        const touched = updateBookingAcrossStores(data.bookingId, patch.updates);
        const updatedBooking = { ...booking, ...patch.updates, bookingId: data.bookingId, id: data.bookingId };
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
        closeBookingEditor();
        refreshData();
        showToast(touched ? "Booking details updated." : "Edit saved in notification/audit only.");
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

        const touched = updateBookingAcrossStores(bookingId, updates);
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
            notifyPortal(approved ? "booking_approved" : "booking_rejected", { ...booking, ...updates }, customerMessage, ["customer", "driver", "admin"]);
        }
        refreshData();
        showToast(backendReview.ok || touched ? message : "Decision recorded locally; backend review sync is still pending.");
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
            bookings: getFilteredBookings("all")
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

    function switchView(view) {
        state.view = view;
        $all(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
        $all(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `view-${view}`));
        setText("#viewTitle", viewTitles[view] || "Admin App");
        $("#appSidebar")?.classList.remove("open");
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
            renderPortalControls();
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
        });

        document.addEventListener("click", (event) => {
            const closeEditorButton = event.target.closest("[data-close-booking-editor]");
            if (closeEditorButton) {
                closeBookingEditor();
                return;
            }

            if (event.target && event.target.id === "bookingEditModal") {
                closeBookingEditor();
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
            const form = event.target.closest("#bookingEditForm");
            if (!form) return;
            event.preventDefault();
            handleBookingEditSubmit(form);
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && $("#bookingEditModal")?.classList.contains("open")) {
                closeBookingEditor();
            }
        });

        $("#exportBookingsBtn")?.addEventListener("click", exportBookings);
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
            if ([...BOOKING_KEYS, ...DRIVER_KEYS, ...USER_KEYS, NOTIFICATION_KEY, AUDIT_KEY, ADMIN_CONNECTION_KEY, controlKey].includes(event.key)
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
            state.refreshTimer = setInterval(refreshData, 20000);
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
        hydrateOperator();
        setupEvents();
        connectAllPortalFeatures();
        setupPortalListener();
        applySettings();
        refreshData();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
