(function registerCorporateEnterpriseModules(window) {
    "use strict";

    const registry = window.GOINDIARIDE_ADMIN_ENTERPRISE;
    if (!registry || typeof registry.registerModules !== "function") return;

    registry.registerModules([
        {
            id: "corporate_accounts",
            title: "Corporate accounts and cost centers",
            competitors: "Ola Corporate, Uber Business",
            area: "Corporate",
            detail: "Company profile, branch, department, billing owner and cost center controls.",
            source: "customer records and booking customers",
            sourceCheck: "customers",
        },
        {
            id: "company_profile_billing_contacts",
            title: "Company profile and billing contacts",
            competitors: "Ola Corporate, Rapido Corporate",
            area: "Corporate",
            detail: "Legal entity, GST details, billing email, finance owner and escalation contacts.",
            source: "enterprise control store",
            sourceCheck: "controls",
        },
        {
            id: "cost_centers_entities_gst",
            title: "Cost centers, entities and GST mapping",
            competitors: "Ola Corporate, Uber Business",
            area: "Corporate",
            detail: "Department budgets, entity-level GST, branch tags and invoice grouping.",
            source: "booking metadata and policy store",
            sourceCheck: "policy",
        },
        {
            id: "employees_groups_roles",
            title: "Employees, groups and travel desk roles",
            competitors: "Ola Corporate, Uber Business",
            area: "Corporate",
            detail: "Employee roster, default group, travel desk permissions and export-ready rows.",
            source: "stored users and booking customers",
            sourceCheck: "customers",
        },
        {
            id: "employee_bulk_api_lifecycle",
            title: "Employee bulk add, update and deactivate",
            competitors: "Ola Corporate API, Uber Business",
            area: "Corporate",
            detail: "CSV/API-ready add, update, deactivate and reassign lifecycle controls.",
            source: "user records and control store",
            sourceCheck: "customers",
        },
        {
            id: "roles_access_privileges",
            title: "Admin roles, privileges and approvals",
            competitors: "Uber Business, Ola Corporate",
            area: "Corporate",
            detail: "Owner admin, finance admin, travel desk, approver and read-only auditor permissions.",
            source: "admin bridge controls",
            sourceCheck: "controls",
        },
        {
            id: "travel_policies_budget",
            title: "Travel policies, approvals and budgets",
            competitors: "Ola Corporate, Uber Business",
            area: "Policy",
            detail: "Monthly budget, ride type, city, time-window, spend cap and night-trip rules.",
            source: "admin policy store",
            sourceCheck: "policy",
        },
        {
            id: "approval_workflow_overrides",
            title: "Approval workflow and override rules",
            competitors: "Ola Corporate, Uber Business",
            area: "Policy",
            detail: "Auto-approve, manager approval, finance override and exception audit trail.",
            source: "booking review and policy store",
            sourceCheck: "bookings",
        }
    ]);
})(window);
