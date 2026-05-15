(function initCustomerBookingFolder() {
    "use strict";

    let query = "";

    function splitApi() {
        return window.GoIndiaAdminBookingSplit || null;
    }

    function helpers() {
        return (splitApi() && splitApi().helpers) || {};
    }

    function cleanText(value) {
        const helper = helpers().cleanText;
        return helper ? helper(value) : String(value ?? "").replace(/\s+/g, " ").trim();
    }

    function escapeHtml(value) {
        const helper = helpers().escapeHtml;
        if (helper) return helper(value);
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatDate(value) {
        const helper = helpers().formatDate;
        return helper ? helper(value) : cleanText(value, "Not set");
    }

    function formatMoney(value) {
        const helper = helpers().formatMoney;
        return helper ? helper(value) : `INR ${Number(value || 0).toLocaleString("en-IN")}`;
    }

    function $(selector) {
        return document.querySelector(selector);
    }

    function bookingStatusClass(row) {
        const helper = helpers().getStatusClass;
        return helper ? helper(row) : "pending";
    }

    function bookingStatusLabel(row) {
        const helper = helpers().getStatusLabel;
        return helper ? helper(row) : cleanText(row.status || "Pending").replace(/_/g, " ");
    }

    function rowMatches(row) {
        const term = query.toLowerCase();
        if (!term) return true;
        return JSON.stringify(row || {}).toLowerCase().includes(term);
    }

    function payload(row) {
        return escapeHtml(JSON.stringify(row, null, 2));
    }

    function formatSourceInline(value, maxLength = 56) {
        const raw = cleanText(value);
        if (!raw) return "split_store";
        const normalized = raw
            .replace(/^localStorage:/i, "")
            .replace(/^sessionStorage:/i, "")
            .replace(/\s+/g, " ");
        if (normalized.length <= maxLength) return normalized;
        return `${normalized.slice(0, Math.max(12, maxLength - 1)).trimEnd()}…`;
    }

    function refreshSplit() {
        const api = splitApi();
        if (!api || typeof api.refresh !== "function") return { customerBookings: [], driverBookings: [] };
        return api.refresh();
    }

    function render() {
        const split = refreshSplit();
        const rows = (split.customerBookings || []).filter(rowMatches);
        const host = $("#customerFolderTableBody");
        if (!host) return;

        const driverCount = (split.driverBookings || []).length;
        const customerCount = (split.customerBookings || []).length;
        const filteredCount = rows.length;
        const now = new Date().toISOString();

        const customerCountNode = $("#customerFolderCount");
        const customerMetricNode = $("#customerFolderMetric");
        const driverCountNode = $("#driverFolderCount");
        const savedNode = $("#customerFolderSavedAt");
        if (customerCountNode) customerCountNode.textContent = String(customerCount);
        if (customerMetricNode) customerMetricNode.textContent = String(filteredCount);
        if (driverCountNode) driverCountNode.textContent = String(driverCount);
        if (savedNode) savedNode.textContent = `Saved ${formatDate(now)}`;

        if (!rows.length) {
            host.innerHTML = `<tr><td colspan="6"><div class="empty-state">No customer booking rows found.</div></td></tr>`;
            return;
        }

        host.innerHTML = rows.map((row) => `
            <tr class="booking-summary-row">
                <td><strong>${escapeHtml(row.bookingId || row.id)}</strong><br><small>${escapeHtml(formatDate(row.createdAt || row.updatedAt))}</small></td>
                <td>${escapeHtml(row.customerName || "Customer")}<br><small>${escapeHtml(row.customerPhone || row.customerEmail || "No contact")}</small></td>
                <td><strong>${escapeHtml(row.pickup || row.pickupLocation || "Pickup pending")}</strong><br><small>${escapeHtml(row.dropoff || row.dropLocation || "Drop pending")}</small></td>
                <td>${formatMoney(row.fare || row.totalFare || row.amount)}<br><small>${escapeHtml(row.distanceKm ? `${Math.round(Number(row.distanceKm))} km` : "Distance pending")}</small></td>
                <td><span class="status-pill ${bookingStatusClass(row)}">${escapeHtml(bookingStatusLabel(row))}</span></td>
                <td><span class="source-pill">Customer</span><br><small class="source-inline-code" title="${escapeHtml(cleanText(row.sourceKey || "customer split"))}">${escapeHtml(formatSourceInline(row.sourceKey || "customer split", 58))}</small></td>
            </tr>
            <tr class="booking-detail-row">
                <td colspan="6">
                    <details class="booking-full-details">
                        <summary><i class="fas fa-circle-info"></i><span>Customer full saved payload</span></summary>
                        <div class="booking-detail-content">
                            <pre>${payload(row)}</pre>
                        </div>
                    </details>
                </td>
            </tr>
        `).join("");
    }

    function init() {
        $("#mobileMenuBtn")?.addEventListener("click", () => $("#appSidebar")?.classList.toggle("open"));
        $("#folderRefreshBtn")?.addEventListener("click", render);
        $("#folderSearchInput")?.addEventListener("input", (event) => {
            query = event.target.value || "";
            render();
        });
        render();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
