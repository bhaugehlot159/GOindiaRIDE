(function registerFinanceReportEnterpriseModules(window) {
    "use strict";

    const registry = window.GOINDIARIDE_ADMIN_ENTERPRISE;
    if (!registry || typeof registry.registerModules !== "function") return;

    registry.registerModules([
        {
            id: "corporate_wallet_billing",
            title: "Corporate wallet, billing and payment modes",
            competitors: "Rapido Corporate, Uber Business",
            area: "Finance",
            detail: "Corporate wallet, monthly billing, payment modes and statement readiness.",
            source: "wallet admin endpoints",
            sourceCheck: "wallet",
            backendRequired: true,
        },
        {
            id: "monthly_billing_statements",
            title: "Monthly billing and statements",
            competitors: "Uber Business, Rapido Corporate",
            area: "Finance",
            detail: "Monthly ledger, consolidated statement, outstanding dues and payment profile controls.",
            source: "wallet and booking fare pipeline",
            sourceCheck: "wallet",
            backendRequired: true,
        },
        {
            id: "reports_invoices",
            title: "Ride reports, invoices and exports",
            competitors: "Ola Corporate, Uber Business",
            area: "Reports",
            detail: "Ride report, invoice pack, fare breakup, employee/group filters and export readiness.",
            source: "booking export and fare audit",
            sourceCheck: "reports",
            backendRequired: true,
        },
        {
            id: "custom_csv_reports",
            title: "Custom CSV and dashboard reports",
            competitors: "Ola Corporate, Uber Business",
            area: "Reports",
            detail: "Date, city, ride type, status, payment, employee, group and memo filters.",
            source: "booking report templates",
            sourceCheck: "reports",
            backendRequired: true,
        },
        {
            id: "expense_codes_cost_allocation",
            title: "Expense codes and cost allocation",
            competitors: "Uber Business, Ola Corporate",
            area: "Finance",
            detail: "Expense code, memo, department, project and cost-center export controls.",
            source: "booking metadata",
            sourceCheck: "bookings",
        },
        {
            id: "tax_gst_invoice_pack",
            title: "GST invoice pack and tax audit",
            competitors: "Ola Corporate, Rapido Corporate",
            area: "Finance",
            detail: "GSTIN, tax breakup, invoice sequence, PDF/CSV pack and finance audit trail.",
            source: "fare audit and invoice templates",
            sourceCheck: "reports",
            backendRequired: true,
        },
        {
            id: "carbon_low_emission_reporting",
            title: "Carbon and low-emission reporting",
            competitors: "Uber Business",
            area: "Reports",
            detail: "EV/low-emission tags, estimated carbon summary and sustainability export.",
            source: "fleet and booking metadata",
            sourceCheck: "fleet",
        }
    ]);
})(window);
