(function initDriverAIAutoSystem() {
    "use strict";

    function boot() {
        if (!window.GoIndiaAIAutoCore) {
            return;
        }

        const path = String(window.location.pathname || "").toLowerCase();
        if (!path.includes("driver")) {
            return;
        }

        window.GoIndiaAIAutoCore.mount({
            id: "driver-ai-auto",
            mode: "driver",
            title: "Driver AI Auto Generative System",
            selectors: [".container", ".main-content"],
            insertPosition: "afterbegin",
            intervalMs: 14000,
            moduleFactory: (summary) => {
                const docStatus = summary.expiredLicenses > 0 ? "critical" : summary.unverifiedLicenses > 0 ? "elevated" : "healthy";
                const tripStatus = summary.pendingBookings > 7 ? "elevated" : "healthy";

                return [
                    {
                        title: "Trip Match Autopilot",
                        status: tripStatus,
                        detail: "Balances ride allocation by proximity, trust score, and shift continuity.",
                        action:
                            tripStatus === "elevated"
                                ? "Action: High-load matching mode active"
                                : "Action: Matching load stable",
                    },
                    {
                        title: "Document Guardian AI",
                        status: docStatus,
                        detail: "Monitors driving license validity and verification state for compliance.",
                        action:
                            docStatus === "critical"
                                ? "Action: Expiry protection lock queued"
                                : "Action: License compliance synced",
                    },
                    {
                        title: "Earnings Auto Coach",
                        status: summary.status,
                        detail: "Suggests profitable time windows and low-risk route clusters.",
                        action: "Action: Earnings plan regenerated",
                    },
                    {
                        title: "Fatigue Safety AI",
                        status: summary.pendingBookings >= 9 ? "elevated" : "healthy",
                        detail: "Flags overload windows and auto suggests break intervals.",
                        action: "Action: Shift safety window updated",
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
