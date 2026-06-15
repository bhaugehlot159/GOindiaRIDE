(function registerFleetEnterpriseModules(window) {
    "use strict";

    const registry = window.GOINDIARIDE_ADMIN_ENTERPRISE;
    if (!registry || typeof registry.registerModules !== "function") return;

    registry.registerModules([
        {
            id: "fleet_vehicle_docs",
            title: "Fleet vehicles and document lifecycle",
            competitors: "Uber Fleet, Rapido Captain",
            area: "Fleet",
            detail: "Vehicle records, RC, insurance, permit, pollution and expiry review queue.",
            source: "driver records",
            sourceCheck: "drivers",
        },
        {
            id: "vehicle_inventory_assignment",
            title: "Vehicle inventory and driver assignment",
            competitors: "Uber Fleet",
            area: "Fleet",
            detail: "Vehicle inventory, driver assignment, utilization state and offline/online readiness.",
            source: "driver and vehicle records",
            sourceCheck: "drivers",
        },
        {
            id: "driver_onboarding_kyc",
            title: "Driver onboarding, KYC and training",
            competitors: "Rapido Captain, Uber Fleet",
            area: "Fleet",
            detail: "Driver intake, KYC, training, approval, rejection and recheck workflow.",
            source: "driver records",
            sourceCheck: "drivers",
        },
        {
            id: "driver_quality_payouts",
            title: "Driver quality, earnings and payout settlement",
            competitors: "Uber Fleet, Rapido Captain",
            area: "Fleet",
            detail: "Ratings, acceptance, cancellation, earnings, commission and payout settlement.",
            source: "driver records and booking status",
            sourceCheck: "drivers",
            backendRequired: true,
        },
        {
            id: "live_map_dispatch",
            title: "Fleet live map and dispatch status",
            competitors: "Uber Fleet, Rapido Corporate",
            area: "Live Ops",
            detail: "Live vehicle pins, stale location, active route, dispatch queue and status health.",
            source: "driver status and booking coordinates",
            sourceCheck: "locations",
        },
        {
            id: "trip_performance_utilization",
            title: "Trip performance and utilization",
            competitors: "Uber Fleet",
            area: "Fleet",
            detail: "Vehicle utilization, active trips, completed trips, idle time and demand heat signals.",
            source: "bookings and driver records",
            sourceCheck: "bookings",
        },
        {
            id: "earnings_bank_settlement",
            title: "Earnings, bank and settlement controls",
            competitors: "Uber Fleet, Rapido Captain",
            area: "Fleet",
            detail: "Bank details, payout review, wallet withdrawals and settlement audit controls.",
            source: "wallet admin payout endpoints",
            sourceCheck: "wallet",
            backendRequired: true,
        }
    ]);
})(window);
