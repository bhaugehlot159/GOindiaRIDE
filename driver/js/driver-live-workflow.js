(function initDriverLiveWorkflow() {
    "use strict";

    const BOOKING_KEYS = [
        "goindiaride_active_bookings",
        "goindiaride_admin_review_inbox_v1",
        "goindiaride_live_customer_booking_queue_v1",
        "bookings",
        "goride_bookings"
    ];
    const WORKFLOW_KEY = "goindiaride_driver_live_workflow_v1";
    const PENALTY_KEY = "goindiaride_driver_penalties_v1";
    const PAYOUT_KEY = "goindiaride_driver_payouts_v1";
    const OFFER_MS = 5 * 60 * 1000;

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

    function money(value) {
        return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    }

    function driverProfile() {
        const currentDriver = parseJson("currentDriver", null);
        const savedDriver = parseJson("driver_data", {});
        const profile = currentDriver && typeof currentDriver === "object"
            ? { ...savedDriver, ...currentDriver }
            : savedDriver;
        const id = cleanText(profile.id || profile.driverId || profile.email || profile.phone || "driver-self", 80);
        return {
            id,
            name: cleanText(profile.name || profile.fullName || profile.driverName || "Driver Account", 90),
            phone: cleanText(profile.phone || profile.mobile || "", 30),
            email: cleanText(profile.email || "", 120)
        };
    }

    function readWorkflow() {
        const workflow = parseJson(WORKFLOW_KEY, {});
        return workflow && typeof workflow === "object" ? workflow : {};
    }

    function saveWorkflow(patch) {
        const now = new Date().toISOString();
        const next = { ...readWorkflow(), ...patch, updatedAt: now };
        writeJson(WORKFLOW_KEY, next);
        return next;
    }

    function loadKyc() {
        const profile = driverProfile();
        return parseJson(`kyc_data_${profile.id}`, null) || parseJson("kyc_data", {});
    }

    function kycSummary() {
        const kyc = loadKyc();
        const docs = kyc.documents || {};
        const required = ["DL", "RC", "INSURANCE", "AADHAAR", "PAN"];
        const verified = required.filter((docType) => {
            const doc = docs[docType] || {};
            return doc.status === "verified" || doc.adminDecision === "approved";
        });
        return {
            ok: Boolean(kyc.verified) || verified.length === required.length,
            verified: verified.length,
            total: required.length,
            pending: required.filter((docType) => !verified.includes(docType))
        };
    }

    function depositSummary() {
        const workflow = readWorkflow();
        const deposit = workflow.securityDeposit || {};
        const paid = deposit.status === "paid" || deposit.status === "locked";
        return {
            paid,
            amount: Number(deposit.amount || 0),
            status: paid ? "Locked" : "Required",
            paidAt: deposit.paidAt || "",
            lockedUntil: deposit.lockedUntil || ""
        };
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
                byId.set(id, { ...(byId.get(id) || {}), ...row, id, bookingId: id });
            });
        });
        return Array.from(byId.values());
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
            if (!changed && patch && patch.status) {
                next.unshift({ ...patch, id, bookingId: id, updatedAt: new Date().toISOString() });
                changed = true;
            }
            if (changed) writeJson(key, next.slice(0, 300));
        });
        window.dispatchEvent(new CustomEvent("goindiaride:driver-live-booking-updated", {
            detail: { bookingId: id, patch }
        }));
    }

    function driverInboxRows() {
        const profile = driverProfile();
        const now = Date.now();
        return readBookings()
            .filter((booking) => {
                const status = cleanText(booking.status || booking.backendStatus, 80).toLowerCase();
                const adminStatus = cleanText(booking.adminReviewStatus, 80).toLowerCase();
                const driverId = cleanText(booking.driverId || booking.assignedDriverId, 80);
                if (driverId && driverId !== profile.id) return false;
                if (["driver_assigned", "accepted", "in_progress"].includes(status)) return true;
                return adminStatus === "approved" || ["approved_waiting_driver", "driver_queue", "pending_reassignment", "created", "pending_admin_review"].includes(status);
            })
            .map((booking) => {
                const storedOfferAt = Date.parse(booking.driverOfferCreatedAt || "");
                const offerCreatedAt = Number.isFinite(storedOfferAt) && storedOfferAt > 0 ? storedOfferAt : now;
                const expiresAt = Date.parse(booking.driverOfferExpiresAt || "") || (offerCreatedAt + OFFER_MS);
                return { ...booking, driverOfferCreatedAt: new Date(offerCreatedAt).toISOString(), driverOfferExpiresAt: new Date(expiresAt).toISOString() };
            })
            .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0));
    }

    function addPenalty(booking, reason) {
        const profile = driverProfile();
        const rows = parseJson(PENALTY_KEY, []);
        rows.unshift({
            id: `PEN-${Date.now().toString(36).toUpperCase()}`,
            driverId: profile.id,
            bookingId: cleanText(booking.bookingId || booking.id, 120),
            amount: 50,
            reason: cleanText(reason, 120),
            status: "recorded",
            createdAt: new Date().toISOString()
        });
        writeJson(PENALTY_KEY, rows.slice(0, 200));
    }

    function broadcast(type, booking, message) {
        if (!window.PortalConnector || typeof PortalConnector.broadcastToAll !== "function") return;
        PortalConnector.broadcastToAll({
            type,
            title: type === "driver_assigned" ? "Driver Assigned" : "Driver Booking Update",
            message,
            booking,
            sourcePortal: "driver",
            metadata: { bookingId: booking.bookingId || booking.id, driver: driverProfile() }
        });
    }

    function eligibility() {
        const kyc = kycSummary();
        const deposit = depositSummary();
        return {
            ok: kyc.ok && deposit.paid,
            kyc,
            deposit,
            reason: !kyc.ok ? "KYC approval pending" : (!deposit.paid ? "Security deposit required" : "")
        };
    }

    function acceptBooking(bookingId) {
        const booking = driverInboxRows().find((item) => cleanText(item.bookingId || item.id, 120) === cleanText(bookingId, 120));
        if (!booking) return;
        const allowed = eligibility();
        if (!allowed.ok) {
            showMessage(`Cannot accept: ${allowed.reason}`, "error");
            render();
            return;
        }

        const profile = driverProfile();
        const acceptedAt = new Date().toISOString();
        const patch = {
            status: "driver_assigned",
            adminReviewStatus: "approved",
            driverId: profile.id,
            driverName: profile.name,
            driverPhone: profile.phone,
            acceptedAt,
            driverAcceptedAt: acceptedAt
        };
        patchBooking(bookingId, patch);
        broadcast("driver_assigned", { ...booking, ...patch }, `Driver accepted booking ${bookingId}.`);
        showMessage("Booking accepted and customer/admin updated.", "success");
        render();
    }

    function rejectBooking(bookingId, reason) {
        const booking = driverInboxRows().find((item) => cleanText(item.bookingId || item.id, 120) === cleanText(bookingId, 120));
        if (!booking) return;
        const rejectedAt = new Date().toISOString();
        const patch = {
            status: "pending_reassignment",
            driverRejectedAt: rejectedAt,
            rejectionReason: cleanText(reason || "Driver rejected booking", 140)
        };
        patchBooking(bookingId, patch);
        addPenalty(booking, reason || "Driver rejected booking");
        broadcast("booking_rejected", { ...booking, ...patch }, `Driver rejected booking ${bookingId}.`);
        showMessage("Booking rejected and reassignment logged.", "warning");
        render();
    }

    function recordDeposit() {
        const amountInput = document.getElementById("driverLiveDepositAmount");
        const refInput = document.getElementById("driverLiveDepositReference");
        const methodInput = document.getElementById("driverLiveDepositMethod");
        const amount = Number(amountInput && amountInput.value ? amountInput.value : 5000);
        if (amount < 5000) {
            showMessage("Security deposit must be at least ₹5,000.", "error");
            return;
        }
        const paidAt = new Date();
        const lockedUntil = new Date(paidAt.getTime() + 90 * 24 * 60 * 60 * 1000);
        saveWorkflow({
            securityDeposit: {
                amount,
                method: cleanText(methodInput && methodInput.value, 40) || "upi_intent",
                reference: cleanText(refInput && refInput.value, 120),
                status: "locked",
                paidAt: paidAt.toISOString(),
                lockedUntil: lockedUntil.toISOString()
            }
        });
        showMessage("Security deposit recorded with 3-month lock.", "success");
        render();
    }

    function requestPayout() {
        const profile = driverProfile();
        const completed = readBookings().filter((booking) => {
            const driverId = cleanText(booking.driverId || booking.assignedDriverId, 80);
            const status = cleanText(booking.status, 80).toLowerCase();
            return driverId === profile.id && ["completed", "ride_completed"].includes(status);
        });
        const gross = completed.reduce((sum, booking) => sum + Number(booking.finalFare || booking.totalFare || booking.amount || booking.fare || 0), 0);
        const commission = Number((gross * 0.18).toFixed(2));
        const net = Number(Math.max(0, gross - commission).toFixed(2));
        const rows = parseJson(PAYOUT_KEY, []);
        const payout = {
            id: `POUT-${Date.now().toString(36).toUpperCase()}`,
            driverId: profile.id,
            driverName: profile.name,
            gross,
            commission,
            net,
            tripCount: completed.length,
            status: "requested",
            period: "current",
            requestedAt: new Date().toISOString()
        };
        rows.unshift(payout);
        writeJson(PAYOUT_KEY, rows.slice(0, 200));
        showMessage(`Payout request saved: ${money(net)}.`, "success");
        render();
    }

    function autoRejectExpiredOffers() {
        const rows = driverInboxRows();
        const now = Date.now();
        rows.forEach((booking) => {
            const status = cleanText(booking.status, 80).toLowerCase();
            if (["driver_assigned", "accepted", "in_progress", "completed", "pending_reassignment"].includes(status)) return;
            const expiresAt = Date.parse(booking.driverOfferExpiresAt || "");
            if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= now) {
                rejectBooking(booking.bookingId || booking.id, "Auto-rejected after 5-minute timeout");
            } else if (!booking.driverOfferExpiresAt) {
                patchBooking(booking.bookingId || booking.id, {
                    driverOfferCreatedAt: booking.driverOfferCreatedAt,
                    driverOfferExpiresAt: booking.driverOfferExpiresAt
                });
            }
        });
    }

    function statusClass(ok) {
        return ok ? "driver-live-good" : "driver-live-warn";
    }

    function renderInbox(rows, allowed) {
        if (!rows.length) {
            return '<div class="driver-live-empty">No customer bookings are waiting in your live inbox.</div>';
        }
        return rows.slice(0, 8).map((booking) => {
            const id = cleanText(booking.bookingId || booking.id, 120);
            const amount = Number(booking.finalFare || booking.totalFare || booking.amount || booking.fare || 0);
            const expiresAt = Date.parse(booking.driverOfferExpiresAt || "");
            const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
            const status = cleanText(booking.status || "pending", 80).replace(/_/g, " ");
            const canAct = allowed.ok && !["driver assigned", "completed", "pending reassignment"].includes(status.toLowerCase());
            return `
                <article class="driver-live-booking">
                    <div>
                        <strong>${id}</strong>
                        <span>${cleanText(booking.pickup || booking.pickupLocation, 80)} to ${cleanText(booking.drop || booking.dropLocation, 80)}</span>
                        <small>${cleanText(booking.vehicleType || "vehicle", 40)} | ${money(amount)} | ${status}</small>
                    </div>
                    <div class="driver-live-actions">
                        <small>${seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left` : "Timed out"}</small>
                        <button type="button" data-driver-live-accept="${id}" ${canAct ? "" : "disabled"}>Accept</button>
                        <button type="button" data-driver-live-reject="${id}">Reject</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    function render() {
        const main = document.querySelector(".main-content");
        if (!main) return;
        let host = document.getElementById("driverLiveWorkflowPanel");
        if (!host) {
            host = document.createElement("section");
            host.id = "driverLiveWorkflowPanel";
            host.className = "driver-live-panel";
            const features = Array.from(main.children).find((child) => child.classList && child.classList.contains("features-grid"));
            if (features && features.parentNode === main) {
                main.insertBefore(host, features);
            } else {
                main.appendChild(host);
            }
        }
        const profile = driverProfile();
        const kyc = kycSummary();
        const deposit = depositSummary();
        const allowed = eligibility();
        const inbox = driverInboxRows();
        const payouts = parseJson(PAYOUT_KEY, []).filter((row) => cleanText(row.driverId, 80) === profile.id);
        const penalties = parseJson(PENALTY_KEY, []).filter((row) => cleanText(row.driverId, 80) === profile.id);

        host.innerHTML = `
            <div class="driver-live-title">
                <div>
                    <span>Live Driver Workflow</span>
                    <h2>KYC, deposit, booking inbox and payouts</h2>
                </div>
                <strong class="${statusClass(allowed.ok)}">${allowed.ok ? "Ready for bookings" : allowed.reason}</strong>
            </div>
            <div class="driver-live-grid">
                <article>
                    <h3>KYC</h3>
                    <p>${kyc.verified}/${kyc.total} required documents verified.</p>
                    <small class="${statusClass(kyc.ok)}">${kyc.ok ? "Admin approved" : `Pending: ${kyc.pending.join(", ")}`}</small>
                    <button type="button" data-driver-live-open-kyc>Open KYC</button>
                </article>
                <article>
                    <h3>Security Deposit</h3>
                    <p>${deposit.paid ? `${money(deposit.amount)} locked until ${new Date(deposit.lockedUntil).toLocaleDateString()}` : "₹5,000 deposit required before accepting bookings."}</p>
                    <div class="driver-live-inline">
                        <input id="driverLiveDepositAmount" type="number" min="5000" value="5000">
                        <select id="driverLiveDepositMethod">
                            <option value="upi_intent">UPI</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="card">Card</option>
                        </select>
                        <input id="driverLiveDepositReference" type="text" placeholder="Payment reference">
                    </div>
                    <button type="button" data-driver-live-deposit>Record Deposit</button>
                </article>
                <article>
                    <h3>Payouts</h3>
                    <p>${payouts.length} payout requests, ${penalties.length} penalties.</p>
                    <small>Weekly/monthly earnings are calculated from completed assigned rides.</small>
                    <button type="button" data-driver-live-payout>Request Payout</button>
                </article>
            </div>
            <div class="driver-live-inbox">
                <h3>Booking Inbox</h3>
                ${renderInbox(inbox, allowed)}
            </div>
        `;
    }

    function showMessage(message, type) {
        if (typeof window.showToast === "function") {
            window.showToast(message, type || "info");
            return;
        }
        window.alert(message);
    }

    function installStyles() {
        if (document.getElementById("driverLiveWorkflowStyles")) return;
        const style = document.createElement("style");
        style.id = "driverLiveWorkflowStyles";
        style.textContent = `
            .driver-live-panel { margin: 1rem 0; padding: 1rem; border: 1px solid #d9e2f2; border-radius: 8px; background: #fff; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08); }
            .driver-live-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
            .driver-live-title span { color: #667085; font-weight: 700; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0; }
            .driver-live-title h2 { margin: 0.15rem 0 0; font-size: 1.2rem; }
            .driver-live-title strong { border-radius: 999px; padding: 0.45rem 0.75rem; font-size: 0.82rem; white-space: nowrap; }
            .driver-live-good { background: #dff7ea; color: #080c12; }
            .driver-live-warn { background: #fff3d0; color: #92400e; }
            .driver-live-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
            .driver-live-grid article, .driver-live-booking { border: 1px solid #e4e9f2; border-radius: 8px; padding: 0.85rem; background: #fbf7ef; }
            .driver-live-grid h3, .driver-live-inbox h3 { margin: 0 0 0.45rem; font-size: 1rem; }
            .driver-live-grid p, .driver-live-grid small { margin: 0 0 0.55rem; display: block; }
            .driver-live-grid button, .driver-live-actions button { border: 0; border-radius: 7px; padding: 0.55rem 0.7rem; background: #080c12; color: #fff; font-weight: 800; cursor: pointer; }
            .driver-live-grid button:disabled, .driver-live-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
            .driver-live-inline { display: grid; grid-template-columns: 0.7fr 0.9fr 1fr; gap: 0.4rem; margin-bottom: 0.55rem; }
            .driver-live-inline input, .driver-live-inline select { min-width: 0; border: 1px solid #cfd8e8; border-radius: 7px; padding: 0.5rem; }
            .driver-live-inbox { margin-top: 1rem; }
            .driver-live-booking { display: flex; justify-content: space-between; gap: 0.75rem; margin-top: 0.55rem; }
            .driver-live-booking strong, .driver-live-booking span, .driver-live-booking small { display: block; }
            .driver-live-actions { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; justify-content: flex-end; }
            .driver-live-actions button:last-child { background: #be123c; }
            .driver-live-empty { padding: 0.9rem; border: 1px dashed #cfd8e8; border-radius: 8px; color: #667085; }
            @media (max-width: 820px) { .driver-live-grid { grid-template-columns: 1fr; } .driver-live-booking, .driver-live-title { flex-direction: column; } .driver-live-inline { grid-template-columns: 1fr; } }
        `;
        document.head.appendChild(style);
    }

    function bind() {
        document.addEventListener("click", (event) => {
            const accept = event.target.closest("[data-driver-live-accept]");
            const reject = event.target.closest("[data-driver-live-reject]");
            if (accept) acceptBooking(accept.getAttribute("data-driver-live-accept"));
            if (reject) rejectBooking(reject.getAttribute("data-driver-live-reject"), "Driver rejected booking");
            if (event.target.closest("[data-driver-live-deposit]")) recordDeposit();
            if (event.target.closest("[data-driver-live-payout]")) requestPayout();
            if (event.target.closest("[data-driver-live-open-kyc]") && typeof window.openKYC === "function") window.openKYC();
        });

        window.addEventListener("storage", (event) => {
            if (BOOKING_KEYS.includes(event.key) || [WORKFLOW_KEY, PAYOUT_KEY, PENALTY_KEY, "kyc_data"].includes(event.key)) render();
        });
        window.addEventListener("goindiaride:driver-live-booking-updated", render);
    }

    function init() {
        installStyles();
        render();
        bind();
        setInterval(() => {
            autoRejectExpiredOffers();
            render();
        }, 15000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.DriverLiveWorkflow = {
        render,
        acceptBooking,
        rejectBooking,
        recordDeposit,
        requestPayout,
        eligibility,
        keys: { WORKFLOW_KEY, PENALTY_KEY, PAYOUT_KEY, BOOKING_KEYS }
    };
})();
