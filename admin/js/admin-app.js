(function initStandaloneAdminApp() {
    "use strict";

    const ADMIN_REVIEW_INBOX_KEY = "goindiaride_admin_review_inbox_v1";
    const SETTINGS_KEY = "goindiaride_admin_app_settings_v1";
    const AUDIT_KEY = "adminAuditLogs";
    const BOOKING_KEYS = ["bookings", "goride_bookings", ADMIN_REVIEW_INBOX_KEY, "adminDemoBookings"];
    const DRIVER_KEYS = ["drivers", "goride_drivers", "adminDemoDrivers"];
    const USER_KEYS = ["users", "goride_users", "adminDemoUsers"];
    const NOTIFICATION_KEY = "goindiaride_portal_notifications";

    const state = {
        bookings: [],
        drivers: [],
        users: [],
        notifications: [],
        controls: null,
        query: "",
        view: "overview",
        bookingFilter: "all",
        queueFilter: "all",
        hideOldActivity: false,
        settings: loadSettings(),
        refreshTimer: null
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
        return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
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
        const number = Number(value);
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

    function loadSettings() {
        const parsed = parseJson(localStorage.getItem(SETTINGS_KEY), {});
        return {
            autoRefresh: parsed.autoRefresh !== false,
            compactRows: parsed.compactRows === true,
            apiBase: cleanText(parsed.apiBase || localStorage.getItem("goindiaride_api_base") || "")
        };
    }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
        if (state.settings.apiBase) {
            localStorage.setItem("goindiaride_api_base", state.settings.apiBase.replace(/\/$/, ""));
        }
    }

    function normalizeBooking(row, sourceKey) {
        const id = cleanText(row.bookingId || row.id || row._id || `RID${Date.now()}`);
        const pickup = cleanText(row.pickup || row.pickupLocation || row.from || row.origin, "Pickup pending");
        const dropoff = cleanText(row.dropoff || row.drop || row.dropLocation || row.to || row.destination, "Drop pending");
        const fare = toAmount(row.totalFare || row.amount || row.finalFare || row.fare || row.fareQuote?.amount || row.fareBreakdown?.totalFare);
        const status = cleanText(row.status || "pending_admin_review").toLowerCase();
        const adminReviewStatus = cleanText(row.adminReviewStatus || row.reviewStatus || "").toLowerCase();
        const createdAt = cleanText(row.createdAt || row.timestamp || row.date || "");
        const customerName = cleanText(row.customerName || row.customerSnapshot?.name || row.name || row.customer || "Customer");

        return {
            ...row,
            id,
            bookingId: id,
            pickup,
            dropoff,
            fare,
            customerName,
            customerPhone: cleanText(row.customerPhone || row.customerSnapshot?.phone || row.phone || ""),
            customerEmail: cleanText(row.customerEmail || row.customerSnapshot?.email || row.email || ""),
            status,
            adminReviewStatus,
            sourceKey,
            createdAt,
            rideDate: cleanText(row.rideDate || ""),
            rideTime: cleanText(row.rideTime || ""),
            vehicleType: cleanText(row.vehicleType || row.rideType || row.vehicleModel || ""),
            paymentMethod: cleanText(row.paymentMethod || ""),
            distanceKm: toAmount(row.distanceKm || row.distance || row.fareBreakdown?.distanceKm)
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

        return mergeById(rows).sort((a, b) => {
            const at = Date.parse(b.createdAt || "") || 0;
            const bt = Date.parse(a.createdAt || "") || 0;
            return at - bt;
        });
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

    function refreshData() {
        state.bookings = loadBookings();
        state.drivers = loadDrivers();
        state.users = loadUsers();
        state.notifications = loadNotifications();
        state.controls = loadAdminControls();
        renderAll();
    }

    function getFilteredBookings(filter = state.bookingFilter) {
        const query = state.query.toLowerCase();
        return state.bookings.filter((booking) => {
            const text = [
                booking.bookingId,
                booking.customerName,
                booking.customerPhone,
                booking.pickup,
                booking.dropoff,
                booking.vehicleType,
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
                </div>
                <div class="queue-actions">
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
        const rows = [
            ["fa-database", "Booking sources", `${localStores} active local stores`],
            ["fa-bell", "Admin notifications", `${unreadAdmin} unread portal alerts`],
            ["fa-cloud", "API base", apiBase],
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
            <tr>
                <td><strong>${escapeHtml(booking.bookingId)}</strong><br><small>${escapeHtml(formatDate(booking.createdAt))}</small></td>
                <td>${escapeHtml(booking.customerName)}<br><small>${escapeHtml(booking.customerPhone || booking.customerEmail || "No contact")}</small></td>
                <td><strong>${escapeHtml(booking.pickup)}</strong><br><small>${escapeHtml(booking.dropoff)}</small></td>
                <td>${formatMoney(booking.fare)}<br><small>${escapeHtml(booking.distanceKm ? `${Math.round(booking.distanceKm)} km` : "Distance pending")}</small></td>
                <td><span class="status-pill ${getStatusClass(booking)}">${escapeHtml(getStatusLabel(booking))}</span></td>
                <td>
                    <button class="row-action" data-action="approve" data-booking-id="${escapeHtml(booking.bookingId)}" type="button"><i class="fas fa-check"></i></button>
                    <button class="danger-action" data-action="reject" data-booking-id="${escapeHtml(booking.bookingId)}" type="button"><i class="fas fa-xmark"></i></button>
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
            portalHost.innerHTML = portals.map((item) => {
                const portal = controls.portals[item[0]] || {};
                const enabled = portal.enabled !== false;
                return `
                    <article class="portal-control-card">
                        <header>
                            <div>
                                <strong>${escapeHtml(item[1])}</strong>
                                <p>${escapeHtml(item[2])}</p>
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
        const apiBase = $("#apiBaseInput");
        if (auto) auto.checked = state.settings.autoRefresh;
        if (compact) compact.checked = state.settings.compactRows;
        if (apiBase) apiBase.value = state.settings.apiBase;
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

    function notifyPortal(type, booking, message) {
        if (window.PortalConnector && typeof window.PortalConnector.createNotification === "function") {
            window.PortalConnector.createNotification({
                type,
                title: "Admin booking update",
                message,
                sourcePortal: "admin",
                targetPortals: ["customer", "driver", "admin"],
                booking
            });
        }
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

    function handlePortalControlAction(button) {
        if (!window.AdminControlBridge) {
            showToast("Admin control bridge is not loaded.");
            return;
        }

        const action = button.dataset.controlAction || "";
        const portal = button.dataset.portal || "";
        const key = button.dataset.subjectKey || "";
        let result = { ok: true };

        if (action === "enable-portal" || action === "disable-portal") {
            const enabled = action === "enable-portal";
            window.AdminControlBridge.setPortalEnabled(portal, enabled, controlReason(enabled ? "Portal enabled by admin." : "Portal paused by admin."));
            showToast(`${portal} portal ${enabled ? "enabled" : "paused"}.`);
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

    function handleBookingDecision(bookingId, decision) {
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
        if (window.AdminControlBridge && typeof window.AdminControlBridge.setBookingStatus === "function") {
            window.AdminControlBridge.setBookingStatus(bookingId, approved ? "approved" : "rejected", {
                reason: approved ? "Approved from admin app." : "Rejected from admin app.",
                decision: updates.adminDecision
            });
        }
        const message = `${bookingId} ${approved ? "approved" : "rejected"} from standalone admin app.`;
        addAudit(approved ? "BOOKING_APPROVED" : "BOOKING_REJECTED", message);
        notifyPortal(approved ? "booking_approved" : "booking_rejected", { ...booking, ...updates }, message);
        refreshData();
        showToast(touched ? message : "Decision recorded in audit only.");
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
            const controlButton = event.target.closest("[data-control-action]");
            if (controlButton) {
                handlePortalControlAction(controlButton);
                return;
            }

            const actionButton = event.target.closest("[data-action][data-booking-id]");
            if (!actionButton) return;
            handleBookingDecision(actionButton.dataset.bookingId, actionButton.dataset.action);
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
            state.settings.apiBase = cleanText($("#apiBaseInput")?.value || "");
            saveSettings();
            applySettings();
            renderAll();
            showToast("Settings saved locally.");
        });

        window.addEventListener("storage", (event) => {
            const controlKey = window.AdminControlBridge && window.AdminControlBridge.keys ? window.AdminControlBridge.keys.CONTROL_KEY : "";
            if ([...BOOKING_KEYS, ...DRIVER_KEYS, ...USER_KEYS, NOTIFICATION_KEY, AUDIT_KEY, controlKey].includes(event.key)) {
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
                state.notifications = loadNotifications();
                if (notification && notification.booking) refreshData();
                showToast(cleanText(notification?.message || notification?.title || "New admin notification"));
                return false;
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
        setupPortalListener();
        applySettings();
        refreshData();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
