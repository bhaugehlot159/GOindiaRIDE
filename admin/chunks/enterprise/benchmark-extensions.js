(function registerEnterpriseBenchmarkExtensions(window) {
    "use strict";

    const registry = window.GOINDIARIDE_ADMIN_ENTERPRISE;
    if (!registry || typeof registry.registerBenchmark !== "function") return;

    registry.registerBenchmark([
        {
            id: "guest_central_booking",
            title: "Guest and central booking",
            competitors: "Uber Central, Rapido Corporate",
            current: "Dedicated enterprise module covers admin-created guest rides and fallback queue sync.",
            next: "Use protected booking endpoints with an active admin token for cloud verification.",
            enterpriseModuleId: "guest_rides_central_booking",
            statusType: "gap"
        },
        {
            id: "bulk_employee_lifecycle",
            title: "Bulk employee lifecycle",
            competitors: "Ola Corporate API, Uber Business",
            current: "Employee add/update/deactivate controls are split into a corporate module.",
            next: "Attach real corporate CSV/API upload when company onboarding starts.",
            enterpriseModuleId: "employee_bulk_api_lifecycle",
            statusType: "gap"
        },
        {
            id: "monthly_billing_statements",
            title: "Monthly billing statements",
            competitors: "Uber Business, Rapido Corporate",
            current: "Monthly statement and payment profile controls are now separated from wallet setup.",
            next: "Confirm wallet admin endpoints after login before exporting production statements.",
            enterpriseModuleId: "monthly_billing_statements",
            statusType: "gap"
        },
        {
            id: "driver_kyc_training",
            title: "Driver KYC, documents and training",
            competitors: "Rapido Captain, Uber Fleet",
            current: "Fleet modules now split vehicle documents, driver KYC and training readiness.",
            next: "Load real uploaded document expiry values from driver onboarding records.",
            enterpriseModuleId: "driver_onboarding_kyc",
            statusType: "partial"
        },
        {
            id: "fraud_risk_safety",
            title: "Fraud, risk and safety escalation",
            competitors: "Uber Safety, Rapido Safety",
            current: "Safety modules now include incident, dispute, fraud and abuse checks.",
            next: "Keep security endpoints connected with admin auth for live incident review.",
            enterpriseModuleId: "fraud_abuse_detection",
            statusType: "gap"
        },
        {
            id: "integration_webhooks_audit",
            title: "Webhooks, audit and expense integrations",
            competitors: "Uber Business, Ola Corporate",
            current: "Integration modules now cover partner webhooks, audit logs, expense exports and SLA notifications.",
            next: "Verify provider webhook logs with protected backend calls after partner setup.",
            enterpriseModuleId: "webhooks_partner_logs",
            statusType: "gap"
        }
    ]);
})(window);
