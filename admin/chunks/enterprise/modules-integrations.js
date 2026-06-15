(function registerIntegrationEnterpriseModules(window) {
    "use strict";

    const registry = window.GOINDIARIDE_ADMIN_ENTERPRISE;
    if (!registry || typeof registry.registerModules !== "function") return;

    registry.registerModules([
        {
            id: "support_expense_integrations",
            title: "Support, expense codes and sustainability",
            competitors: "Uber Business, Ola Corporate",
            area: "Integrations",
            detail: "Support SLA, expense export, provider webhook log and sustainability controls.",
            source: "support notifications and booking metadata",
            sourceCheck: "notifications",
            backendRequired: true,
        },
        {
            id: "api_access_tokens",
            title: "API access, token and sync readiness",
            competitors: "Ola Corporate API, Uber Business",
            area: "Integrations",
            detail: "Admin token readiness, API base, protected endpoint map and sync health.",
            source: "admin backend token",
            sourceCheck: "backend",
            backendRequired: true,
        },
        {
            id: "webhooks_partner_logs",
            title: "Partner webhooks and integration logs",
            competitors: "Uber Business, Rapido Corporate",
            area: "Integrations",
            detail: "Webhook delivery, partner event logs, retry state and payload audit readiness.",
            source: "future business webhook endpoints",
            sourceCheck: "backend",
            backendRequired: true,
        },
        {
            id: "expense_provider_export",
            title: "Expense provider export adapters",
            competitors: "Uber Business",
            area: "Integrations",
            detail: "Expense CSV/provider export, memo, employee, project and cost-code mapping.",
            source: "booking report templates",
            sourceCheck: "reports",
            backendRequired: true,
        },
        {
            id: "audit_logs_privacy_exports",
            title: "Audit logs and privacy exports",
            competitors: "Uber Business, Ola Corporate",
            area: "Integrations",
            detail: "Admin activity audit, privacy-safe export, role trace and data retention controls.",
            source: "admin audit store",
            sourceCheck: "controls",
            backendRequired: true,
        },
        {
            id: "notification_sla_center",
            title: "Notification and SLA center",
            competitors: "Uber Support, Rapido Safety",
            area: "Integrations",
            detail: "Support ticket, customer alert, driver alert, escalation SLA and read status controls.",
            source: "notification endpoints",
            sourceCheck: "notifications",
            backendRequired: true,
        },
        {
            id: "backend_health_service_status",
            title: "Backend health and service status",
            competitors: "Uber Business, Ola Corporate",
            area: "Integrations",
            detail: "API base health, gateway status, security pulse, future runtime and service checks.",
            source: "protected and public backend endpoints",
            sourceCheck: "backend",
            backendRequired: true,
        }
    ]);
})(window);
