(function initAdminLiveManagementSections() {
    "use strict";

    const ADMIN_SERVICE_ALERTS_KEY = "goindiaride_admin_service_alerts_v1";
    const ADMIN_PROMO_OFFERS_KEY = "goindiaride_admin_promotional_offers_v1";
    const ADMIN_SYSTEM_CONFIG_KEY = "goindiaride_admin_system_config_v1";
    const SUPPORT_TICKET_KEYS = [
        "goindiaride_customer_support_tickets_v1",
        "goindiaride_support_tickets_v1",
        "supportTickets"
    ];

    function escapeSafetyHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function readSafetyJson(key, fallback) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || "");
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (_error) {
            return fallback;
        }
    }

    function writeAdminRows(key, rows) {
        localStorage.setItem(key, JSON.stringify(Array.isArray(rows) ? rows : []));
    }

    function readAdminRows(key) {
        const parsed = readSafetyJson(key, []);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) return parsed.items;
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.supportTickets)) return parsed.supportTickets;
        return [];
    }

    function readAdminObject(key, fallback) {
        const parsed = readSafetyJson(key, fallback);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
    }

    function writeAdminObject(key, value) {
        localStorage.setItem(key, JSON.stringify(value && typeof value === "object" ? value : {}));
    }

    function getCurrentAdminName() {
        const admin = readSafetyJson("currentAdmin", {});
        return admin.name || admin.email || "Admin User";
    }

    function recordAction(action, details) {
        if (typeof window.logAdminAction === "function") {
            window.logAdminAction(action, details);
            return;
        }

        const logs = readAdminRows("adminAuditLogs");
        logs.unshift({
            timestamp: new Date().toISOString(),
            action,
            details,
            admin: getCurrentAdminName()
        });
        writeAdminRows("adminAuditLogs", logs.slice(0, 1000));
    }

    function toast(message, type) {
        if (typeof window.showToast === "function") window.showToast(message, type || "info");
    }

    function notifyAllPortals(payload) {
        if (!window.PortalConnector) return;

        if (typeof window.PortalConnector.broadcastToAll === "function") {
            window.PortalConnector.broadcastToAll(payload);
            return;
        }

        if (typeof window.PortalConnector.createNotification === "function") {
            window.PortalConnector.createNotification({
                ...(payload || {}),
                targetPortals: payload && payload.targetPortals ? payload.targetPortals : ["customer", "driver", "admin"]
            });
        }
    }

    function normalizeAlertTargets(recipient) {
        const value = String(recipient || "all").toLowerCase();
        if (value === "drivers") return ["driver"];
        if (value === "customers") return ["customer"];
        return ["customer", "driver", "admin"];
    }

    function getServiceAlerts() {
        return readAdminRows(ADMIN_SERVICE_ALERTS_KEY)
            .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
    }

    function renderServiceAlertRows(rows) {
        if (!rows.length) return '<tr><td colspan="5">No service alerts sent yet.</td></tr>';

        return rows.slice(0, 30).map((alert) => `
            <tr>
                <td>${escapeSafetyHtml(new Date(alert.createdAt || Date.now()).toLocaleString())}</td>
                <td>${escapeSafetyHtml(alert.recipient || "all")}</td>
                <td><span class="status-badge status-active">${escapeSafetyHtml(alert.priority || "normal")}</span></td>
                <td>${escapeSafetyHtml(alert.message || "")}</td>
                <td>${escapeSafetyHtml(alert.status || "sent")}</td>
            </tr>
        `).join("");
    }

    function saveServiceAlertFromForm() {
        const recipient = String(document.getElementById("serviceAlertRecipient")?.value || "all").trim();
        const priority = String(document.getElementById("serviceAlertPriority")?.value || "normal").trim();
        const message = String(document.getElementById("serviceAlertMessage")?.value || "").trim();

        if (!message) {
            toast("Alert message is required", "error");
            return;
        }

        const alert = {
            id: "alert_" + Date.now(),
            recipient,
            priority,
            message,
            createdAt: new Date().toISOString(),
            createdBy: getCurrentAdminName(),
            status: "sent"
        };
        const rows = getServiceAlerts();
        rows.unshift(alert);
        writeAdminRows(ADMIN_SERVICE_ALERTS_KEY, rows.slice(0, 200));

        notifyAllPortals({
            type: "service_alert",
            title: "Service Alert",
            message,
            priority,
            sourcePortal: "admin",
            targetPortals: normalizeAlertTargets(recipient),
            metadata: { alertId: alert.id, recipient }
        });

        recordAction("SERVICE_ALERT_SENT", `${recipient} - ${message}`);
        toast("Service alert sent and saved", "success");
        refreshServiceAlertsSection();
    }

    function refreshServiceAlertsSection() {
        const section = document.getElementById("section-service-alerts");
        if (!section || !section.classList.contains("active")) return;
        section.innerHTML = window.createServiceAlertsContent();
        initializeServiceAlertsSection();
    }

    function initializeServiceAlertsSection() {
        document.getElementById("sendServiceAlertBtn")?.addEventListener("click", saveServiceAlertFromForm);
    }

    function getCustomerSupportTickets() {
        const directTickets = SUPPORT_TICKET_KEYS.flatMap((key) => readAdminRows(key));
        const businessStore = readAdminObject("goindiaride.runtime.business-store.v1", {});
        const businessTickets = Array.isArray(businessStore.supportTickets) ? businessStore.supportTickets : [];
        const seen = new Set();

        return [...directTickets, ...businessTickets]
            .filter((ticket) => ticket && typeof ticket === "object")
            .filter((ticket) => {
                const id = String(ticket.ticketCode || ticket.id || ticket.requestId || JSON.stringify(ticket)).trim();
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    }

    function updateTicketListStatus(rows, ticketId, nextStatus) {
        return rows.map((ticket) => {
            const id = String(ticket.ticketCode || ticket.id || ticket.requestId || "").trim();
            if (id !== String(ticketId)) return ticket;
            return {
                ...ticket,
                status: nextStatus,
                updatedAt: new Date().toISOString(),
                handledBy: getCurrentAdminName()
            };
        });
    }

    function updateSupportTicketStatus(ticketId, nextStatus) {
        if (!ticketId) return;

        SUPPORT_TICKET_KEYS.forEach((key) => {
            const raw = readSafetyJson(key, []);
            if (Array.isArray(raw)) {
                writeAdminRows(key, updateTicketListStatus(raw, ticketId, nextStatus));
                return;
            }
            if (raw && typeof raw === "object" && Array.isArray(raw.items)) {
                localStorage.setItem(key, JSON.stringify({ ...raw, items: updateTicketListStatus(raw.items, ticketId, nextStatus) }));
                return;
            }
            if (raw && typeof raw === "object" && Array.isArray(raw.supportTickets)) {
                localStorage.setItem(key, JSON.stringify({ ...raw, supportTickets: updateTicketListStatus(raw.supportTickets, ticketId, nextStatus) }));
            }
        });

        const businessStore = readAdminObject("goindiaride.runtime.business-store.v1", {});
        if (Array.isArray(businessStore.supportTickets)) {
            writeAdminObject("goindiaride.runtime.business-store.v1", {
                ...businessStore,
                supportTickets: updateTicketListStatus(businessStore.supportTickets, ticketId, nextStatus)
            });
        }

        notifyAllPortals({
            type: "support_ticket_status_updated",
            title: "Support Ticket Updated",
            message: `Ticket ${ticketId} marked ${nextStatus}`,
            sourcePortal: "admin",
            targetPortals: ["customer", "admin"],
            metadata: { ticketId, status: nextStatus }
        });
        recordAction("SUPPORT_TICKET_STATUS", `${ticketId} -> ${nextStatus}`);
        toast("Support ticket updated", "success");
        refreshSupportDashboardSection();
    }

    function renderSupportTicketRows(tickets) {
        if (!tickets.length) return '<tr><td colspan="5">No live customer support tickets found.</td></tr>';

        return tickets.slice(0, 30).map((ticket) => {
            const id = String(ticket.ticketCode || ticket.id || ticket.requestId || "N/A");
            const status = String(ticket.status || "open");
            return `
                <tr>
                    <td>${escapeSafetyHtml(id)}</td>
                    <td>${escapeSafetyHtml(ticket.customerName || ticket.name || ticket.userKey || "Customer")}</td>
                    <td>${escapeSafetyHtml(ticket.category || ticket.issue || ticket.subject || "Support request")}</td>
                    <td><span class="status-badge status-pending">${escapeSafetyHtml(status)}</span></td>
                    <td>
                        <button class="btn btn-secondary" type="button" data-support-ticket="${escapeSafetyHtml(id)}" data-support-status="resolved">Resolve</button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function refreshSupportDashboardSection() {
        const section = document.getElementById("section-support-dashboard");
        if (!section || !section.classList.contains("active")) return;
        section.innerHTML = window.createSupportDashboardContent();
        initializeSupportDashboardSection();
    }

    function initializeSupportDashboardSection() {
        document.querySelectorAll("[data-support-ticket][data-support-status]").forEach((button) => {
            button.addEventListener("click", () => {
                updateSupportTicketStatus(button.dataset.supportTicket, button.dataset.supportStatus || "resolved");
            });
        });
    }

    function getPromoOffers() {
        return readAdminRows(ADMIN_PROMO_OFFERS_KEY)
            .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime());
    }

    function isPromoActive(offer) {
        const status = String(offer.status || "active").toLowerCase();
        const expiry = offer.expiresAt ? new Date(offer.expiresAt).getTime() : 0;
        return status === "active" && (!expiry || expiry >= Date.now());
    }

    function renderPromoOfferRows(rows) {
        if (!rows.length) return '<tr><td colspan="6">No live promotional offers created yet.</td></tr>';

        return rows.slice(0, 40).map((offer) => {
            const statusClass = isPromoActive(offer) ? "status-active" : "status-pending";
            return `
                <tr>
                    <td>${escapeSafetyHtml(offer.code || "-")}</td>
                    <td>${escapeSafetyHtml(offer.discount || "-")}</td>
                    <td>${escapeSafetyHtml(offer.audience || "customers")}</td>
                    <td>${escapeSafetyHtml(offer.expiresAt || "No expiry")}</td>
                    <td><span class="status-badge ${statusClass}">${escapeSafetyHtml(offer.status || "active")}</span></td>
                    <td><button class="btn btn-secondary" type="button" onclick="pausePromoOffer('${escapeSafetyHtml(offer.id)}')">Pause</button></td>
                </tr>
            `;
        }).join("");
    }

    function savePromoOfferFromForm() {
        const code = String(document.getElementById("promoOfferCode")?.value || "").trim().toUpperCase();
        const discount = String(document.getElementById("promoOfferDiscount")?.value || "").trim();
        const audience = String(document.getElementById("promoOfferAudience")?.value || "customers").trim();
        const expiresAt = String(document.getElementById("promoOfferExpiry")?.value || "").trim();

        if (!code || !discount) {
            toast("Offer code and discount are required", "error");
            return;
        }

        const rows = getPromoOffers();
        const existingIndex = rows.findIndex((offer) => String(offer.code || "").toUpperCase() === code);
        const offer = {
            ...(existingIndex >= 0 ? rows[existingIndex] : {}),
            id: existingIndex >= 0 ? rows[existingIndex].id : "offer_" + Date.now(),
            code,
            discount,
            audience,
            expiresAt,
            status: "active",
            updatedAt: new Date().toISOString(),
            createdAt: existingIndex >= 0 ? rows[existingIndex].createdAt : new Date().toISOString(),
            updatedBy: getCurrentAdminName()
        };

        if (existingIndex >= 0) rows[existingIndex] = offer;
        else rows.unshift(offer);
        writeAdminRows(ADMIN_PROMO_OFFERS_KEY, rows.slice(0, 200));

        notifyAllPortals({
            type: "promo_offer_updated",
            title: "Promotional Offer Updated",
            message: `${code} offer is active`,
            sourcePortal: "admin",
            targetPortals: audience === "drivers" ? ["driver"] : ["customer"],
            metadata: { offerId: offer.id, code, discount, audience, expiresAt }
        });
        recordAction("PROMO_OFFER_SAVED", `${code} - ${discount}`);
        toast("Promotional offer saved and connected", "success");
        refreshPromoOffersSection();
    }

    function pausePromoOffer(offerId) {
        const rows = getPromoOffers();
        const idx = rows.findIndex((offer) => String(offer.id) === String(offerId));
        if (idx === -1) return;

        rows[idx] = {
            ...rows[idx],
            status: "paused",
            updatedAt: new Date().toISOString(),
            updatedBy: getCurrentAdminName()
        };
        writeAdminRows(ADMIN_PROMO_OFFERS_KEY, rows);
        notifyAllPortals({
            type: "promo_offer_updated",
            title: "Promotional Offer Paused",
            message: `${rows[idx].code || offerId} offer is paused`,
            sourcePortal: "admin",
            targetPortals: rows[idx].audience === "drivers" ? ["driver"] : ["customer"],
            metadata: { offerId, status: "paused" }
        });
        recordAction("PROMO_OFFER_PAUSED", rows[idx].code || offerId);
        refreshPromoOffersSection();
    }

    function refreshPromoOffersSection() {
        const section = document.getElementById("section-promo-offers");
        if (!section || !section.classList.contains("active")) return;
        section.innerHTML = window.createPromoOffersContent();
        initializePromoOffersSection();
    }

    function initializePromoOffersSection() {
        document.getElementById("savePromoOfferBtn")?.addEventListener("click", savePromoOfferFromForm);
    }

    function getSystemConfig() {
        return readAdminObject(ADMIN_SYSTEM_CONFIG_KEY, {
            bookingIntake: true,
            surgePricing: false,
            customerPortalControl: true,
            bookingAlarm: localStorage.getItem("goindiaride_admin_booking_alarm_enabled") === "1",
            updatedAt: ""
        });
    }

    function saveSystemConfigFromForm() {
        const config = {
            bookingIntake: Boolean(document.getElementById("configBookingIntake")?.checked),
            surgePricing: Boolean(document.getElementById("configSurgePricing")?.checked),
            customerPortalControl: Boolean(document.getElementById("configCustomerPortalControl")?.checked),
            bookingAlarm: Boolean(document.getElementById("configBookingAlarm")?.checked),
            updatedAt: new Date().toISOString(),
            updatedBy: getCurrentAdminName()
        };
        writeAdminObject(ADMIN_SYSTEM_CONFIG_KEY, config);
        localStorage.setItem("goindiaride_admin_booking_alarm_enabled", config.bookingAlarm ? "1" : "0");

        notifyAllPortals({
            type: "admin_system_config_updated",
            title: "Admin Configuration Updated",
            message: "System configuration was updated by admin",
            sourcePortal: "admin",
            targetPortals: ["customer", "driver", "admin"],
            metadata: config
        });
        recordAction("SYSTEM_CONFIG_SAVED", JSON.stringify({
            bookingIntake: config.bookingIntake,
            surgePricing: config.surgePricing,
            customerPortalControl: config.customerPortalControl,
            bookingAlarm: config.bookingAlarm
        }));
        toast("System configuration saved", "success");
        refreshSystemConfigSection();
    }

    function refreshSystemConfigSection() {
        const section = document.getElementById("section-system-config");
        if (!section || !section.classList.contains("active")) return;
        section.innerHTML = window.createSystemConfigContent();
        initializeSystemConfigSection();
    }

    function initializeSystemConfigSection() {
        document.getElementById("saveSystemConfigBtn")?.addEventListener("click", saveSystemConfigFromForm);
    }

    function loadAuditLogs() {
        const logs = readAdminRows("adminAuditLogs");
        const tbody = document.getElementById("auditLogsList");
        if (!tbody) return;

        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="4">No admin audit logs yet.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.slice(0, 50).map((log) => `
            <tr>
                <td>${escapeSafetyHtml(new Date(log.timestamp || Date.now()).toLocaleString())}</td>
                <td>${escapeSafetyHtml(log.admin || "Admin User")}</td>
                <td><span class="status-badge status-active">${escapeSafetyHtml(log.action || "ACTION")}</span></td>
                <td>${escapeSafetyHtml(log.details || "")}</td>
            </tr>
        `).join("");
    }

    window.createServiceAlertsContent = function createServiceAlertsContent() {
        const alerts = getServiceAlerts();
        const activeAlerts = alerts.filter((alert) => String(alert.status || "sent").toLowerCase() === "sent");
        return `
            <div class="section-header">
                <h2>Service Alerts System</h2>
                <p>Send live service notices to customer and driver portals</p>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon" style="background:#080c12;"><i class="fas fa-bullhorn"></i></div>
                    <div class="stat-content"><div class="stat-label">Sent Alerts</div><div class="stat-value">${activeAlerts.length}</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:#43e97b;"><i class="fas fa-link"></i></div>
                    <div class="stat-content"><div class="stat-label">Portal Bridge</div><div class="stat-value">${window.PortalConnector ? "Live" : "Ready"}</div></div>
                </div>
            </div>
            <div class="card mt-20">
                <h3>Create Live Alert</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="serviceAlertRecipient">Recipient</label>
                        <select class="form-select" id="serviceAlertRecipient">
                            <option value="all">Customers + Drivers</option>
                            <option value="customers">Customers only</option>
                            <option value="drivers">Drivers only</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="serviceAlertPriority">Priority</label>
                        <select class="form-select" id="serviceAlertPriority">
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="serviceAlertMessage">Message</label>
                    <textarea class="form-textarea" id="serviceAlertMessage" rows="4" placeholder="Type the live service message"></textarea>
                </div>
                <button class="btn btn-primary" id="sendServiceAlertBtn" type="button"><i class="fas fa-paper-plane"></i> Send live alert</button>
            </div>
            <div class="card mt-20">
                <h3>Recent Live Alerts</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>Time</th><th>Recipient</th><th>Priority</th><th>Message</th><th>Status</th></tr></thead>
                        <tbody>${renderServiceAlertRows(alerts)}</tbody>
                    </table>
                </div>
            </div>
        `;
    };

    window.createSupportDashboardContent = function createSupportDashboardContent() {
        const tickets = getCustomerSupportTickets();
        const openTickets = tickets.filter((ticket) => !["closed", "resolved", "done"].includes(String(ticket.status || "").toLowerCase()));
        return `
            <div class="section-header">
                <h2>Customer Support Dashboard</h2>
                <p>Manage live customer support tickets</p>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon" style="background:#feca57;"><i class="fas fa-ticket-alt"></i></div>
                    <div class="stat-content"><div class="stat-label">Open Tickets</div><div class="stat-value">${openTickets.length}</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:#4facfe;"><i class="fas fa-database"></i></div>
                    <div class="stat-content"><div class="stat-label">Live Tickets</div><div class="stat-value">${tickets.length}</div></div>
                </div>
            </div>
            <div class="card mt-20">
                <h3>Recent Tickets</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>ID</th><th>Customer</th><th>Issue</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody>${renderSupportTicketRows(tickets)}</tbody>
                    </table>
                </div>
            </div>
        `;
    };

    window.createPromoOffersContent = function createPromoOffersContent() {
        const offers = getPromoOffers();
        const activeCount = offers.filter(isPromoActive).length;
        return `
            <div class="section-header">
                <h2>Promotional Offers</h2>
                <p>Create and control live offer records for connected portals</p>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon" style="background:#080c12;"><i class="fas fa-tags"></i></div>
                    <div class="stat-content"><div class="stat-label">Active Offers</div><div class="stat-value">${activeCount}</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:#4facfe;"><i class="fas fa-database"></i></div>
                    <div class="stat-content"><div class="stat-label">Stored Offers</div><div class="stat-value">${offers.length}</div></div>
                </div>
            </div>
            <div class="card mt-20">
                <h3>Create / Update Offer</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="promoOfferCode">Code</label>
                        <input id="promoOfferCode" class="form-input" type="text" placeholder="LIVE10">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="promoOfferDiscount">Discount</label>
                        <input id="promoOfferDiscount" class="form-input" type="text" placeholder="10% or INR 100">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="promoOfferAudience">Audience</label>
                        <select id="promoOfferAudience" class="form-select">
                            <option value="customers">Customers</option>
                            <option value="drivers">Drivers</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="promoOfferExpiry">Expiry</label>
                        <input id="promoOfferExpiry" class="form-input" type="date">
                    </div>
                </div>
                <button class="btn btn-primary" id="savePromoOfferBtn" type="button"><i class="fas fa-link"></i> Save live offer</button>
            </div>
            <div class="card mt-20">
                <h3>Live Offer Records</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>Code</th><th>Discount</th><th>Audience</th><th>Expiry</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody>${renderPromoOfferRows(offers)}</tbody>
                    </table>
                </div>
            </div>
        `;
    };

    window.createSystemConfigContent = function createSystemConfigContent() {
        const config = getSystemConfig();
        return `
            <div class="section-header">
                <h2>System Configuration</h2>
                <p>Configure live app settings and notify connected portals</p>
            </div>
            <div class="card">
                <h3>Feature Toggles</h3>
                <div class="form-group">
                    <label class="flex">
                        <label class="switch"><input id="configBookingIntake" type="checkbox" ${config.bookingIntake ? "checked" : ""}><span class="slider"></span></label>
                        <span>Accept new customer bookings</span>
                    </label>
                </div>
                <div class="form-group">
                    <label class="flex">
                        <label class="switch"><input id="configSurgePricing" type="checkbox" ${config.surgePricing ? "checked" : ""}><span class="slider"></span></label>
                        <span>Enable surge pricing controls</span>
                    </label>
                </div>
                <div class="form-group">
                    <label class="flex">
                        <label class="switch"><input id="configCustomerPortalControl" type="checkbox" ${config.customerPortalControl ? "checked" : ""}><span class="slider"></span></label>
                        <span>Keep customer portal features under admin control</span>
                    </label>
                </div>
                <div class="form-group">
                    <label class="flex">
                        <label class="switch"><input id="configBookingAlarm" type="checkbox" ${config.bookingAlarm ? "checked" : ""}><span class="slider"></span></label>
                        <span>Enable booking alarm after admin interaction</span>
                    </label>
                </div>
                <button class="btn btn-primary" id="saveSystemConfigBtn" type="button"><i class="fas fa-save"></i> Save live configuration</button>
            </div>
        `;
    };

    window.createAuditLogsContent = function createAuditLogsContent() {
        return `
            <div class="section-header">
                <h2>Audit Logs</h2>
                <p>Track real admin actions and live portal updates</p>
            </div>
            <div class="card">
                <h3>Activity Logs</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>Timestamp</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead>
                        <tbody id="auditLogsList"><tr><td colspan="4">No admin audit logs yet.</td></tr></tbody>
                    </table>
                </div>
            </div>
        `;
    };

    window.initializeSafetyFeatures = function initializeSafetyFeatures(sectionId) {
        if (sectionId === "service-alerts") window.setTimeout(initializeServiceAlertsSection, 50);
        if (sectionId === "support-dashboard") window.setTimeout(initializeSupportDashboardSection, 50);
        if (sectionId === "promo-offers") window.setTimeout(initializePromoOffersSection, 50);
        if (sectionId === "system-config") window.setTimeout(initializeSystemConfigSection, 50);
        if (sectionId === "audit-logs") window.setTimeout(loadAuditLogs, 100);
    };

    window.pausePromoOffer = pausePromoOffer;
    window.updateSupportTicketStatus = updateSupportTicketStatus;
})();
