(function initCustomerAIAutoSystem() {
    "use strict";

    function boot() {
        if (!window.GoIndiaAIAutoCore) {
            return;
        }

        const path = String(window.location.pathname || "").toLowerCase();
        if (!path.includes("customer")) {
            return;
        }

        window.GoIndiaAIAutoCore.mount({
            id: "customer-ai-auto",
            mode: "customer",
            title: "Customer AI Auto Generative System",
            selectors: [".container", ".main-container"],
            insertPosition: "afterbegin",
            intervalMs: 14000,
            moduleFactory: (summary) => {
                const pickupStatus = summary.pendingBookings > 5 ? "elevated" : "healthy";
                const safetyStatus = summary.criticalIncidents > 0 ? "elevated" : "healthy";

                return [
                    {
                        title: "Pickup Predictor AI",
                        status: pickupStatus,
                        detail: "Auto re-orders nearby drivers for faster pickup and lower wait time.",
                        action:
                            pickupStatus === "elevated"
                                ? "Action: Fast-lane assignment enabled"
                                : "Action: Queue remains balanced",
                    },
                    {
                        title: "Fare Transparency AI",
                        status: summary.status,
                        detail: "Continuously validates fare breakdown and surge integrity before confirmation.",
                        action: "Action: Fare integrity lock active",
                    },
                    {
                        title: "Safety SOS Router",
                        status: safetyStatus,
                        detail: "Auto routes SOS and anomaly events to admin and nearest verified driver.",
                        action:
                            safetyStatus === "elevated"
                                ? "Action: Priority emergency route set"
                                : "Action: Emergency path healthy",
                    },
                    {
                        title: "Retention Autopilot",
                        status: summary.cancelledBookings >= 6 ? "elevated" : "healthy",
                        detail: "Auto generates coupon and support nudges for customers at cancellation risk.",
                        action: "Action: Retention suggestions refreshed",
                    },
                    {
                        title: "Fake vs Real Session AI",
                        status: summary.authenticityStatus || "elevated",
                        detail: "Detects fake scripted usage and keeps genuine customer sessions trusted.",
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
