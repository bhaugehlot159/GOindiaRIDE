(function registerSafetyEnterpriseModules(window) {
    "use strict";

    const registry = window.GOINDIARIDE_ADMIN_ENTERPRISE;
    if (!registry || typeof registry.registerModules !== "function") return;

    registry.registerModules([
        {
            id: "safety_compliance_sos",
            title: "Safety, SOS and compliance rules",
            competitors: "Rapido Safety, Ola Safety, Uber Fleet",
            area: "Safety",
            detail: "SOS inbox, incident status, night rides, duty rules and compliance snapshots.",
            source: "safety inbox and notifications",
            sourceCheck: "safety",
            backendRequired: true,
        },
        {
            id: "background_police_verification",
            title: "Background and police verification",
            competitors: "Rapido Captain, Uber Fleet",
            area: "Safety",
            detail: "Police verification, background check, document proof and approval expiry controls.",
            source: "driver compliance records",
            sourceCheck: "drivers",
        },
        {
            id: "duty_hours_break_medical",
            title: "Duty hours, breaks and medical checks",
            competitors: "Rapido Captain, Uber Fleet",
            area: "Safety",
            detail: "Duty-hour caps, mandatory break, medical expiry and fatigue risk controls.",
            source: "driver status and safety policy",
            sourceCheck: "drivers",
        },
        {
            id: "night_ride_safety_check",
            title: "Night ride and route safety checks",
            competitors: "Rapido Safety, Ola Safety",
            area: "Safety",
            detail: "Night ride approvals, route-risk flag, emergency contact and trip monitor rules.",
            source: "booking safety fields",
            sourceCheck: "bookings",
            backendRequired: true,
        },
        {
            id: "trip_sharing_masking_privacy",
            title: "Trip sharing, masking and privacy",
            competitors: "Uber, Rapido Safety",
            area: "Safety",
            detail: "Live trip share, phone masking readiness, location privacy and audit-safe exports.",
            source: "booking and profile controls",
            sourceCheck: "bookings",
        },
        {
            id: "incident_dispute_escalation",
            title: "Incident, dispute and escalation center",
            competitors: "Uber Support, Rapido Safety",
            area: "Safety",
            detail: "Incident creation, dispute tracking, escalation owner and resolution SLA controls.",
            source: "support and security endpoints",
            sourceCheck: "notifications",
            backendRequired: true,
        },
        {
            id: "fraud_abuse_detection",
            title: "Fraud, abuse and risk detection",
            competitors: "Uber Safety, Rapido Safety",
            area: "Safety",
            detail: "Fake booking, suspicious payout, repeated cancellation and risky actor checks.",
            source: "security and wallet audit endpoints",
            sourceCheck: "safety",
            backendRequired: true,
        }
    ]);
})(window);
