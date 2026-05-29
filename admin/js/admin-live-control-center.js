(function initAdminLiveControlCenter() {
    "use strict";

    const BOOKING_KEYS = [
        "goindiaride_active_bookings",
        "goindiaride_admin_review_inbox_v1",
        "goindiaride_live_customer_booking_queue_v1",
        "bookings",
        "goride_bookings",
        "customer_bookings",
        "customerBookings"
    ];
    const PAYMENT_KEY = "goindiaride_live_payment_records_v1";
    const SOS_KEY = "goindiaride_sos_logs";
    const DRIVER_WORKFLOW_KEY = "goindiaride_driver_live_workflow_v1";
    const DRIVER_PAYOUT_KEY = "goindiaride_driver_payouts_v1";
    const DRIVER_PENALTY_KEY = "goindiaride_driver_penalties_v1";
    const ADMIN_REPORT_KEY = "goindiaride_admin_unified_control_reports_v1";
    const ADMIN_CONNECTION_KEY = "goindiaride_admin_portal_connection_v1";
    const OFFER_MS = 5 * 60 * 1000;
    const ADMIN_LIVE_STARTUP_DELAY_MS = 4500;
    const ADMIN_LIVE_IDLE_TIMEOUT_MS = 12000;
    const ADMIN_LIVE_RENDER_INTERVAL_MS = 45000;
    const ADMIN_LIVE_MAX_BOOKINGS = 80;

    function scheduleIdle(callback, delayMs = 0) {
        const run = () => {
            if (typeof window.requestIdleCallback === "function") {
                window.requestIdleCallback(callback, { timeout: ADMIN_LIVE_IDLE_TIMEOUT_MS });
                return;
            }
            window.setTimeout(callback, 120);
        };
        window.setTimeout(run, delayMs);
    }

    function parseJson(key, fallback) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || "");
            return parsed == null ? fallback : parsed;
        } catch (_error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function cleanText(value, maxLen) {
        return String(value || "")
            .replace(/[<>]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, maxLen || 160);
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

    function firstUsablePhone(...values) {
        for (const value of values) {
            const raw = cleanText(value, 40);
            if (!raw) continue;
            const compact = raw.replace(/\s+/g, "");
            const digits = compact.replace(/\D/g, "");
            if (digits.length < 8 || digits.length > 15) continue;
            if (compact.startsWith("+")) return `+${digits}`;
            if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
            return `+${digits}`;
        }
        return "";
    }

    function firstEmail(...values) {
        return firstText(...values).toLowerCase();
    }

    function getBookingContact(booking = {}) {
        const customer = isPlainObject(booking.customer) ? booking.customer : {};
        const customerSnapshot = isPlainObject(booking.customerSnapshot) ? booking.customerSnapshot : {};
        return {
            phone: firstUsablePhone(
                booking.customerPhone,
                customerSnapshot.phone,
                customer.phone,
                booking.phone,
                booking.mobile,
                booking.contact,
                booking.contact1
            ),
            email: firstEmail(
                booking.customerEmail,
                customerSnapshot.email,
                customer.email,
                booking.email,
                booking.userEmail
            ),
            name: firstText(booking.customerName, customerSnapshot.name, customer.name, booking.name, booking.fullname)
        };
    }

    function isPlaceholderText(value) {
        const text = cleanText(value).toLowerCase();
        return !text
            || text === "pickup pending"
            || text === "drop pending"
            || text === "not set"
            || text === "distance pending"
            || text === "unknown";
    }

    function isInternalDiagnosticBooking(row = {}) {
        const text = [
            row.bookingId,
            row.id,
            row.sourceKey,
            row.customerEmail,
            row.customerName,
            row.notes,
            row.mode
        ].join(" ").toLowerCase();
        return /(bkttest|bktest|ridpublic|codex_live_test|codex test)/i.test(text);
    }

    function isIncompleteLocalOnlyBooking(row = {}) {
        const id = cleanText(row.bookingId || row.id || row._id, 120);
        if (!id.startsWith("LOCAL-")) return false;
        const contact = getBookingContact(row);
        if (contact.phone || contact.email) return false;
        const source = cleanText(row.sourceKey || row.source || row.backendStatus, 160).toLowerCase();
        return source.includes("localstorage")
            || source.includes("sessionstorage")
            || source.includes("discoveredbyadminscanner")
            || source.includes("fallback_admin_review_queue")
            || Boolean(row.discoveredByAdminScanner);
    }

    function hasActionableBookingShape(row = {}) {
        const pickup = firstText(row.pickup, row.pickupLocation, row.from, row.origin);
        const dropoff = firstText(row.dropoff, row.drop, row.dropLocation, row.to, row.destination);
        const amount = Number(row.finalFare || row.totalFare || row.amount || row.fare || 0);
        const contact = getBookingContact(row);
        return Boolean(
            (contact.phone || contact.email)
            || (!isPlaceholderText(pickup) && !isPlaceholderText(dropoff))
            || amount > 0
        );
    }

    function mergeBookingRow(existing = {}, incoming = {}) {
        const merged = { ...existing, ...incoming };
        const existingContact = getBookingContact(existing);
        const incomingContact = getBookingContact(incoming);
        const contact = {
            phone: incomingContact.phone || existingContact.phone,
            email: incomingContact.email || existingContact.email,
            name: incomingContact.name || existingContact.name
        };
        if (contact.phone) merged.customerPhone = contact.phone;
        if (contact.email) merged.customerEmail = contact.email;
        if (contact.name) merged.customerName = contact.name;
        merged.customerSnapshot = {
            ...(isPlainObject(existing.customerSnapshot) ? existing.customerSnapshot : {}),
            ...(isPlainObject(incoming.customerSnapshot) ? incoming.customerSnapshot : {}),
            ...(contact.name ? { name: contact.name } : {}),
            ...(contact.phone ? { phone: contact.phone } : {}),
            ...(contact.email ? { email: contact.email } : {})
        };
        ["pickup", "pickupLocation", "dropoff", "drop", "dropLocation"].forEach((field) => {
            if (isPlaceholderText(merged[field]) && !isPlaceholderText(existing[field])) {
                merged[field] = existing[field];
            }
        });
        return merged;
    }

    function money(value) {
        return `INR ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    }

    function readBookings() {
        const byId = new Map();
        BOOKING_KEYS.forEach((key) => {
            const rows = parseJson(key, []);
            if (!Array.isArray(rows)) return;
            rows.forEach((row) => {
                if (!row || typeof row !== "object") return;
                const id = cleanText(row.bookingId || row.id || row._id || "", 120);
                if (!id) return;
                const normalized = mergeBookingRow(byId.get(id) || {}, { ...row, id, bookingId: id });
                if (isInternalDiagnosticBooking(normalized)) return;
                if (isIncompleteLocalOnlyBooking(normalized)) return;
                if (!hasActionableBookingShape(normalized)) return;
                byId.set(id, normalized);
            });
        });
        return Array.from(byId.values()).slice(0, ADMIN_LIVE_MAX_BOOKINGS);
    }

    function patchBooking(bookingId, patch) {
        const id = cleanText(bookingId, 120);
        BOOKING_KEYS.forEach((key) => {
            const rows = parseJson(key, []);
            if (!Array.isArray(rows)) return;
            let changed = false;
            const next = rows.map((row) => {
                const rowId = cleanText(row && (row.bookingId || row.id || row._id), 120);
                if (rowId !== id) return row;
                changed = true;
                return { ...row, ...patch, id, bookingId: id, updatedAt: new Date().toISOString() };
            });
            if (!changed) {
                next.unshift({ ...patch, id, bookingId: id, updatedAt: new Date().toISOString() });
                changed = true;
            }
            if (changed) writeJson(key, next.slice(0, 400));
        });
        window.dispatchEvent(new CustomEvent("goindiaride:admin-live-control-updated", {
            detail: { bookingId: id, patch }
        }));
    }

    function readKycEntries() {
        const entries = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key || !key.startsWith("kyc_data")) continue;
            const kyc = parseJson(key, null);
            if (!kyc || typeof kyc !== "object") continue;
            entries.push({ key, kyc });
        }
        if (!entries.length) entries.push({ key: "kyc_data", kyc: parseJson("kyc_data", {}) });
        return entries;
    }

    function approveKyc(key) {
        const kyc = parseJson(key, {});
        const docs = { ...(kyc.documents || {}) };
        ["DL", "RC", "INSURANCE", "AADHAAR", "PAN"].forEach((docType) => {
            docs[docType] = {
                ...(docs[docType] || {}),
                uploaded: true,
                status: "verified",
                adminDecision: "approved",
                reviewedAt: new Date().toISOString()
            };
        });
        const next = {
            ...kyc,
            documents: docs,
            verified: true,
            trustScore: 98,
            requiredVerifiedCount: 5,
            requiredTotalCount: 5,
            adminApprovedAt: new Date().toISOString()
        };
        writeJson(key, next);
        if (key !== "kyc_data") writeJson("kyc_data", next);
        if (window.PortalConnector && typeof PortalConnector.broadcastToAll === "function") {
            PortalConnector.broadcastToAll({
                type: "driver_kyc_approved",
                title: "Driver KYC Approved",
                message: "Admin approved required driver KYC documents.",
                sourcePortal: "admin",
                metadata: { key, verified: true }
            });
        }
        showToast("Driver KYC approved.", "success");
        render();
    }

    function approveBooking(id) {
        const now = Date.now();
        patchBooking(id, {
            status: "driver_queue",
            adminReviewStatus: "approved",
            approvedAt: new Date(now).toISOString(),
            driverOfferCreatedAt: new Date(now).toISOString(),
            driverOfferExpiresAt: new Date(now + OFFER_MS).toISOString()
        });
        notify("booking_approved", id, "Booking approved and sent to driver inbox.");
        render();
    }

    function cancelBooking(id) {
        patchBooking(id, {
            status: "cancelled_by_admin",
            adminReviewStatus: "rejected",
            cancelledAt: new Date().toISOString(),
            cancellationReason: "Admin cancelled from unified control center"
        });
        notify("booking_rejected", id, "Booking cancelled by admin.");
        render();
    }

    function refundBooking(id) {
        const payments = parseJson(PAYMENT_KEY, []);
        const now = new Date().toISOString();
        const nextPayments = Array.isArray(payments) ? payments.map((payment) => {
            if (cleanText(payment.bookingId, 120) !== cleanText(id, 120)) return payment;
            return { ...payment, status: "refund_initiated", refundInitiatedAt: now };
        }) : [];
        writeJson(PAYMENT_KEY, nextPayments);
        patchBooking(id, { status: "refund_initiated", refundInitiatedAt: now });
        notify("booking_refund_initiated", id, "Refund initiated by admin.");
        render();
    }

    function approvePayout(payoutId) {
        const id = cleanText(payoutId, 120);
        const payouts = parseJson(DRIVER_PAYOUT_KEY, []);
        const next = Array.isArray(payouts) ? payouts.map((payout) => {
            if (cleanText(payout.id, 120) !== id) return payout;
            return {
                ...payout,
                status: "processed",
                processedAt: new Date().toISOString(),
                processedBy: "admin_portal"
            };
        }) : [];
        writeJson(DRIVER_PAYOUT_KEY, next);
        if (window.PortalConnector && typeof PortalConnector.broadcastToAll === "function") {
            PortalConnector.broadcastToAll({
                type: "driver_payout_processed",
                title: "Driver Payout Processed",
                message: `Admin processed payout ${id}.`,
                sourcePortal: "admin",
                metadata: { payoutId: id }
            });
        }
        showToast("Driver payout processed.", "success");
        render();
    }

    function notify(type, bookingId, message) {
        if (!window.PortalConnector || typeof PortalConnector.broadcastToAll !== "function") return;
        const booking = readBookings().find((row) => cleanText(row.bookingId || row.id, 120) === cleanText(bookingId, 120)) || { bookingId };
        PortalConnector.broadcastToAll({
            type,
            title: "Admin Booking Control",
            message,
            booking,
            sourcePortal: "admin",
            metadata: { bookingId, stage: type }
        });
    }

    function fraudFlags(bookings, payments, sosLogs) {
        const flags = [];
        const phoneCounts = {};
        bookings.forEach((booking) => {
            const contact = getBookingContact(booking);
            const phone = contact.phone;
            if (phone) phoneCounts[phone] = (phoneCounts[phone] || 0) + 1;
            const amount = Number(booking.finalFare || booking.totalFare || booking.amount || booking.fare || 0);
            if (amount <= 0) flags.push({ severity: "high", label: `${booking.bookingId}: missing fare` });
            if (amount > 50000) flags.push({ severity: "medium", label: `${booking.bookingId}: high fare ${money(amount)}` });
            if (!phone && !contact.email) flags.push({ severity: "medium", label: `${booking.bookingId}: no customer contact` });
        });
        Object.entries(phoneCounts).forEach(([phone, count]) => {
            if (count > 3) flags.push({ severity: "medium", label: `${phone}: ${count} active bookings` });
        });
        payments.forEach((payment) => {
            if (payment.status === "refund_initiated") flags.push({ severity: "medium", label: `${payment.bookingId}: refund in progress` });
        });
        sosLogs.filter((item) => item.status === "active").forEach((item) => {
            flags.push({ severity: "critical", label: `${item.id || "SOS"}: active customer SOS` });
        });
        return flags.slice(0, 8);
    }

    function demandSummary(bookings) {
        const counts = {};
        bookings.forEach((booking) => {
            const pickup = cleanText(booking.pickup || booking.pickupLocation || "", 40);
            if (isPlaceholderText(pickup)) return;
            counts[pickup] = (counts[pickup] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((left, right) => right[1] - left[1])
            .slice(0, 5);
    }

    function exportReport() {
        const report = buildReport();
        const rows = parseJson(ADMIN_REPORT_KEY, []);
        rows.unshift(report);
        writeJson(ADMIN_REPORT_KEY, rows.slice(0, 30));
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `goindiaride-unified-control-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast("Unified control report exported.", "success");
    }

    function buildReport() {
        const bookings = readBookings();
        const payments = parseJson(PAYMENT_KEY, []);
        const payouts = parseJson(DRIVER_PAYOUT_KEY, []);
        const penalties = parseJson(DRIVER_PENALTY_KEY, []);
        const sosLogs = parseJson(SOS_KEY, []);
        const gross = bookings.reduce((sum, booking) => sum + Number(booking.finalFare || booking.totalFare || booking.amount || booking.fare || 0), 0);
        const commission = Number((gross * 0.18).toFixed(2));
        return {
            generatedAt: new Date().toISOString(),
            bookings,
            payments,
            payouts,
            penalties,
            sosLogs,
            summary: {
                bookingCount: bookings.length,
                pendingCount: bookings.filter((booking) => cleanText(booking.adminReviewStatus, 40).toLowerCase() !== "approved").length,
                gross,
                commission
            }
        };
    }

    function card(title, value, note) {
        return `<article class="admin-live-card"><small>${title}</small><strong>${value}</strong><span>${note || ""}</span></article>`;
    }

    function renderBookingRows(bookings) {
        const rows = bookings.slice(0, 8);
        if (!rows.length) return '<div class="admin-live-empty">No live bookings available yet.</div>';
        return rows.map((booking) => {
            const id = cleanText(booking.bookingId || booking.id, 120);
            const amount = Number(booking.finalFare || booking.totalFare || booking.amount || booking.fare || 0);
            const status = cleanText(booking.status || booking.adminReviewStatus || "pending", 80).replace(/_/g, " ");
            return `
                <article class="admin-live-row">
                    <div>
                        <strong>${id}</strong>
                        <span>${cleanText(booking.pickup || booking.pickupLocation, 70)} to ${cleanText(booking.drop || booking.dropLocation, 70)}</span>
                        <small>${money(amount)} | ${status} | ${cleanText(booking.paymentMethod || "payment pending", 40)}</small>
                    </div>
                    <div class="admin-live-actions">
                        <button type="button" data-admin-live-approve="${id}">Approve/Dispatch</button>
                        <button type="button" data-admin-live-refund="${id}">Refund</button>
                        <button type="button" data-admin-live-cancel="${id}">Cancel</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    function renderFlags(flags) {
        if (!flags.length) return '<div class="admin-live-empty">No fraud or SOS flags currently active.</div>';
        return flags.map((flag) => `<li class="admin-live-flag ${cleanText(flag.severity, 20)}">${cleanText(flag.label, 140)}</li>`).join("");
    }

    function renderKyc(entries) {
        return entries.slice(0, 4).map((entry) => {
            const kyc = entry.kyc || {};
            const verified = Boolean(kyc.verified);
            const count = Number(kyc.requiredVerifiedCount || 0);
            const total = Number(kyc.requiredTotalCount || 5);
            return `
                <article class="admin-live-kyc">
                    <div>
                        <strong>${cleanText(entry.key, 80)}</strong>
                        <span>${verified ? "Verified" : `${count}/${total} verified`}</span>
                    </div>
                    <button type="button" data-admin-live-approve-kyc="${entry.key}" ${verified ? "disabled" : ""}>Approve KYC</button>
                </article>
            `;
        }).join("") || '<div class="admin-live-empty">No driver KYC record found.</div>';
    }

    function renderPayoutRows(payouts) {
        if (!Array.isArray(payouts) || !payouts.length) {
            return '<div class="admin-live-empty">No driver payout requests yet.</div>';
        }
        return payouts.slice(0, 5).map((payout) => {
            const id = cleanText(payout.id, 120);
            const processed = cleanText(payout.status, 40).toLowerCase() === "processed";
            return `
                <article class="admin-live-kyc">
                    <div>
                        <strong>${id}</strong>
                        <span>${cleanText(payout.driverName || payout.driverId, 80)} | ${money(payout.net || payout.amount || 0)} | ${cleanText(payout.status || "requested", 40)}</span>
                    </div>
                    <button type="button" data-admin-live-approve-payout="${id}" ${processed ? "disabled" : ""}>Process Payout</button>
                </article>
            `;
        }).join("");
    }

    function syncAdminConnectionState(summary) {
        const now = new Date().toISOString();
        const previous = parseJson(ADMIN_CONNECTION_KEY, {});
        writeJson(ADMIN_CONNECTION_KEY, {
            ...previous,
            status: "connected",
            mode: "real_live",
            updatedAt: now,
            liveControlCenter: {
                bookings: true,
                customerBookingFlow: true,
                driverKyc: true,
                driverDeposit: true,
                driverPayouts: true,
                fraudAlerts: true,
                sosAlerts: true,
                aiDispatch: true,
                reports: true,
                summary,
                verifiedAt: now
            }
        });
    }

    function render() {
        const overview = document.getElementById("view-overview")
            || document.getElementById("section-dashboard")
            || document.getElementById("contentArea")
            || document.querySelector(".main-content")
            || document.body;
        if (!overview) return;
        let host = document.getElementById("adminLiveControlCenter");
        if (!host) {
            host = document.createElement("section");
            host.id = "adminLiveControlCenter";
            host.className = "admin-live-control";
            overview.insertBefore(host, overview.firstElementChild || null);
        }

        const bookings = readBookings();
        const payments = parseJson(PAYMENT_KEY, []);
        const payouts = parseJson(DRIVER_PAYOUT_KEY, []);
        const penalties = parseJson(DRIVER_PENALTY_KEY, []);
        const sosLogs = parseJson(SOS_KEY, []);
        const workflow = parseJson(DRIVER_WORKFLOW_KEY, {});
        const gross = bookings.reduce((sum, booking) => sum + Number(booking.finalFare || booking.totalFare || booking.amount || booking.fare || 0), 0);
        const flags = fraudFlags(bookings, Array.isArray(payments) ? payments : [], Array.isArray(sosLogs) ? sosLogs : []);
        const demand = demandSummary(bookings);
        syncAdminConnectionState({
            bookingCount: bookings.length,
            paymentCount: Array.isArray(payments) ? payments.length : 0,
            payoutCount: Array.isArray(payouts) ? payouts.length : 0,
            alertCount: flags.length
        });

        host.innerHTML = `
            <div class="admin-live-title">
                <div>
                    <span>Unified Admin Control Center</span>
                    <h2>Bookings, alerts, fraud, dispatch and reports</h2>
                </div>
                <button type="button" data-admin-live-export><i class="fas fa-file-export"></i> Export Report</button>
            </div>
            <div class="admin-live-metrics">
                ${card("Bookings", bookings.length, "Customer + driver queues")}
                ${card("Income Pipeline", money(gross), "Gross ride value")}
                ${card("Alerts", flags.length, "Fraud/SOS/compliance")}
                ${card("Payout Requests", Array.isArray(payouts) ? payouts.length : 0, `${Array.isArray(penalties) ? penalties.length : 0} penalties`)}
                ${card("Deposit", workflow.securityDeposit?.status || "required", workflow.securityDeposit?.amount ? money(workflow.securityDeposit.amount) : "Driver security")}
            </div>
            <div class="admin-live-columns">
                <section>
                    <h3>Booking Orchestration</h3>
                    ${renderBookingRows(bookings)}
                </section>
                <section>
                    <h3>Fraud & SOS Flags</h3>
                    <ul class="admin-live-flags">${renderFlags(flags)}</ul>
                    <h3>Demand Prediction</h3>
                    <div class="admin-live-demand">
                        ${demand.length ? demand.map(([place, count]) => `<span>${cleanText(place, 40)} <strong>${count}</strong></span>`).join("") : "No booking demand yet."}
                    </div>
                    <h3>Driver KYC Approval</h3>
                    ${renderKyc(readKycEntries())}
                    <h3>Driver Payout Processing</h3>
                    ${renderPayoutRows(Array.isArray(payouts) ? payouts : [])}
                </section>
            </div>
        `;
    }

    function showToast(message, type) {
        const region = document.getElementById("toastRegion");
        const legacyToast = document.getElementById("toast");
        if (!region && !legacyToast) {
            window.alert(message);
            return;
        }
        if (legacyToast) {
            legacyToast.textContent = message;
            legacyToast.className = `toast show ${type || "info"}`;
            setTimeout(() => legacyToast.classList.remove("show"), 3000);
            return;
        }
        const toast = document.createElement("div");
        toast.className = `toast ${type || "info"}`;
        toast.textContent = message;
        region.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function bind() {
        document.addEventListener("click", (event) => {
            const approve = event.target.closest("[data-admin-live-approve]");
            const cancel = event.target.closest("[data-admin-live-cancel]");
            const refund = event.target.closest("[data-admin-live-refund]");
            const approveKycButton = event.target.closest("[data-admin-live-approve-kyc]");
            const approvePayoutButton = event.target.closest("[data-admin-live-approve-payout]");
            if (approve) approveBooking(approve.getAttribute("data-admin-live-approve"));
            if (cancel) cancelBooking(cancel.getAttribute("data-admin-live-cancel"));
            if (refund) refundBooking(refund.getAttribute("data-admin-live-refund"));
            if (approveKycButton) approveKyc(approveKycButton.getAttribute("data-admin-live-approve-kyc"));
            if (approvePayoutButton) approvePayout(approvePayoutButton.getAttribute("data-admin-live-approve-payout"));
            if (event.target.closest("[data-admin-live-export]")) exportReport();
        });
        window.addEventListener("storage", (event) => {
            const watched = [...BOOKING_KEYS, PAYMENT_KEY, SOS_KEY, DRIVER_WORKFLOW_KEY, DRIVER_PAYOUT_KEY, DRIVER_PENALTY_KEY];
            if (watched.includes(event.key) || String(event.key || "").startsWith("kyc_data")) render();
        });
        window.addEventListener("goindiaride:admin-live-control-updated", render);
    }

    function installStyles() {
        if (document.getElementById("adminLiveControlStyles")) return;
        const style = document.createElement("style");
        style.id = "adminLiveControlStyles";
        style.textContent = `
            .admin-live-control { margin-bottom: 1rem; padding: 1rem; border: 1px solid #d8e1ef; border-radius: 8px; background: #fff; box-shadow: 0 14px 34px rgba(15,23,42,0.08); }
            .admin-live-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
            .admin-live-title span { color: #667085; font-weight: 800; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0; }
            .admin-live-title h2 { margin: 0.15rem 0 0; font-size: 1.25rem; }
            .admin-live-title button, .admin-live-actions button, .admin-live-kyc button { border: 0; border-radius: 7px; padding: 0.55rem 0.7rem; background: #0f766e; color: #fff; font-weight: 800; cursor: pointer; }
            .admin-live-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.65rem; margin-bottom: 1rem; }
            .admin-live-card, .admin-live-row, .admin-live-kyc { border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fbff; padding: 0.75rem; }
            .admin-live-card small, .admin-live-card span, .admin-live-row small, .admin-live-row span, .admin-live-kyc span { display: block; color: #667085; }
            .admin-live-card strong { display: block; margin: 0.2rem 0; font-size: 1.1rem; }
            .admin-live-columns { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 1rem; }
            .admin-live-columns h3 { margin: 0.5rem 0; font-size: 1rem; }
            .admin-live-row, .admin-live-kyc { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; margin-bottom: 0.55rem; }
            .admin-live-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; }
            .admin-live-actions button:nth-child(2) { background: #b7791f; }
            .admin-live-actions button:nth-child(3) { background: #be123c; }
            .admin-live-flags { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
            .admin-live-flag { border-radius: 7px; padding: 0.55rem; background: #eef6ff; color: #173b67; }
            .admin-live-flag.critical { background: #ffe4e6; color: #9f1239; }
            .admin-live-flag.high, .admin-live-flag.medium { background: #fff3d0; color: #92400e; }
            .admin-live-demand { display: flex; flex-wrap: wrap; gap: 0.4rem; color: #475467; }
            .admin-live-demand span { border: 1px solid #d8e1ef; border-radius: 999px; padding: 0.35rem 0.55rem; background: #fff; }
            .admin-live-empty { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 0.75rem; color: #667085; }
            @media (max-width: 1100px) { .admin-live-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .admin-live-columns { grid-template-columns: 1fr; } .admin-live-row, .admin-live-title { flex-direction: column; } }
        `;
        document.head.appendChild(style);
    }

    function init() {
        installStyles();
        bind();
        scheduleIdle(render, ADMIN_LIVE_STARTUP_DELAY_MS);
        setInterval(() => scheduleIdle(render), ADMIN_LIVE_RENDER_INTERVAL_MS);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.AdminLiveControlCenter = {
        render,
        approveBooking,
        cancelBooking,
        refundBooking,
        approveKyc,
        approvePayout,
        buildReport,
        keys: { BOOKING_KEYS, PAYMENT_KEY, SOS_KEY, DRIVER_WORKFLOW_KEY, DRIVER_PAYOUT_KEY, DRIVER_PENALTY_KEY }
    };
})();
