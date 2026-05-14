(function initDriverBookingFolder() {
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
        return helper ? helper(value) : cleanText(value);
    }

    function $(selector) {
        return document.querySelector(selector);
    }

    function statusClass(row) {
        const helper = helpers().getDriverBookingStatusClass;
        return helper ? helper(row) : "pending";
    }

    function statusLabel(row) {
        const helper = helpers().getDriverBookingStatusLabel;
        return helper ? helper(row) : cleanText(row.status || row.requestStatus || "Pending").replace(/_/g, " ");
    }

    function rowMatches(row) {
        const term = query.toLowerCase();
        if (!term) return true;
        return JSON.stringify(row || {}).toLowerCase().includes(term);
    }

    function payload(row) {
        return escapeHtml(JSON.stringify(row, null, 2));
    }

    function refreshSplit() {
        const api = splitApi();
        if (!api || typeof api.refresh !== "function") return { customerBookings: [], driverBookings: [] };
        return api.refresh();
    }

    function routeText(row) {
        const pickup = cleanText(row.pickup || row.pickupLocation || row.from);
        const dropoff = cleanText(row.dropoff || row.dropLocation || row.drop || row.to);
        if (pickup && dropoff && pickup !== "Driver side request" && dropoff !== "No customer route") {
            return `${pickup} -> ${dropoff}`;
        }
        return "Driver profile / request";
    }

    function routeSubtext(row) {
        return cleanText(row.vehicleNumber || row.sourceKey || row.distanceKm && `${Math.round(Number(row.distanceKm))} km` || "Driver-side data");
    }

    function render() {
        const split = refreshSplit();
        const rows = (split.driverBookings || []).filter(rowMatches);
        const host = $("#driverFolderTableBody");
        if (!host) return;

        const customerCount = (split.customerBookings || []).length;
        const driverCount = (split.driverBookings || []).length;
        const filteredCount = rows.length;
        const now = new Date().toISOString();

        const customerCountNode = $("#customerFolderCount");
        const driverCountNode = $("#driverFolderCount");
        const driverMetricNode = $("#driverFolderMetric");
        const savedNode = $("#driverFolderSavedAt");
        if (customerCountNode) customerCountNode.textContent = String(customerCount);
        if (driverCountNode) driverCountNode.textContent = String(driverCount);
        if (driverMetricNode) driverMetricNode.textContent = String(filteredCount);
        if (savedNode) savedNode.textContent = `Saved ${formatDate(now)}`;

        if (!rows.length) {
            host.innerHTML = `<tr><td colspan="6"><div class="empty-state">No driver booking rows found.</div></td></tr>`;
            return;
        }

        host.innerHTML = rows.map((row) => `
            <tr class="booking-summary-row">
                <td><strong>${escapeHtml(row.driverBookingId || row.bookingId || row.id)}</strong><br><small>${escapeHtml(formatDate(row.createdAt || row.updatedAt))}</small></td>
                <td>${escapeHtml(row.driverName || row.name || "Driver")}<br><small>${escapeHtml(row.driverPhone || row.driverId || "No driver contact")}</small></td>
                <td>${escapeHtml(row.vehicleType || row.vehicleModel || "Vehicle not set")}<br><small>${escapeHtml(row.vehicleNumber || "No vehicle number")}</small></td>
                <td><strong>${escapeHtml(routeText(row))}</strong><br><small>${escapeHtml(routeSubtext(row))}</small></td>
                <td><span class="status-pill ${statusClass(row)}">${escapeHtml(statusLabel(row))}</span></td>
                <td><span class="source-pill">Driver</span><br><small>${escapeHtml(row.sourceKey || "driver split")}</small></td>
            </tr>
            <tr class="booking-detail-row">
                <td colspan="6">
                    <details class="booking-full-details">
                        <summary><i class="fas fa-circle-info"></i><span>Driver full saved payload</span></summary>
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
