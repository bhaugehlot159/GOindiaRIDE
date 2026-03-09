(function initAdminAIAutoSystem() {
    "use strict";

    function boot() {
        if (!window.GoIndiaAIAutoCore) {
            return;
        }

        const path = String(window.location.pathname || "").toLowerCase();
        if (!path.includes("admin")) {
            return;
        }

        window.GoIndiaAIAutoCore.mount({
            id: "admin-ai-auto",
            mode: "admin",
            title: "Admin AI Auto Generative System",
            selectors: [".main-content", ".content-area"],
            insertPosition: "afterbegin",
            intervalMs: 12000,
            moduleFactory: (summary) => {
                const criticalWave = summary.criticalIncidents >= 2;
                const fraudStatus = criticalWave ? "critical" : summary.status;
                const policyStatus = summary.cancelledBookings >= 10 ? "elevated" : "healthy";

                return [
                    {
                        title: "Fraud Command AI",
                        status: fraudStatus,
                        detail: "Combines anomaly spikes, booking abuse, and device mismatch into one command lane.",
                        action: criticalWave ? "Action: Auto-ban workflow armed" : "Action: Fraud watch stable",
                    },
                    {
                        title: "Policy Auto Enforcer",
                        status: policyStatus,
                        detail: "Applies dynamic rate limits and stricter verification in suspicious windows.",
                        action: "Action: Policy profile synchronized",
                    },
                    {
                        title: "Compliance Radar",
                        status: summary.expiredLicenses > 0 ? "elevated" : "healthy",
                        detail: "Tracks driver document and security compliance across all active portals.",
                        action: "Action: Compliance digest generated",
                    },
                    {
                        title: "Ops Stability AI",
                        status: summary.activeDrivers < 2 && summary.totalDrivers > 0 ? "elevated" : "healthy",
                        detail: "Monitors live driver availability and escalates low-capacity operating zones.",
                        action: "Action: Capacity alert engine refreshed",
                    },
                    {
                        title: "Fake vs Real Session AI",
                        status: summary.authenticityStatus || "elevated",
                        detail: "Flags fake admin sessions and raises inspection priority.",
                        action: "Action: " + String(summary.authenticityLabel || "review").replace(/_/g, " "),
                    },
                ];
            },
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
