(function registerEnterpriseOfficialSources(window) {
    "use strict";

    const registry = window.GOINDIARIDE_ADMIN_ENTERPRISE;
    if (!registry || typeof registry.registerSources !== "function") return;

    registry.registerSources([
        {
            brand: "Uber for Business programs",
            url: "https://www.uber.com/us/en/business/products/",
            finding: "Business product set covers central rides, vouchers, employee programs, meal/ride policy controls, reporting and integrations."
        },
        {
            brand: "Uber for Business dashboard",
            url: "https://www.uber.com/us/en/business/products/business-hub/",
            finding: "Business Hub exposes spend, users, programs, billing, policy and reporting controls from a single dashboard."
        },
        {
            brand: "Uber Fleet Hub",
            url: "https://help.uber.com/en/fleet/article/fleet-hub-portal--managing-your-fleet-faq?nodeId=5f9fab81-ea42-4251-9d8f-d33cdec7aae6",
            finding: "Fleet Hub covers vehicles, drivers, trip activity, payments, earnings, document status and real-time fleet visibility."
        },
        {
            brand: "Ola Corporate travel desk",
            url: "https://corporate.olacabs.com/tutorial.html",
            finding: "Ola Corporate shows company, employee, group, travel desk, approval, invoice, report and spend analytics workflows."
        },
        {
            brand: "Ola Corporate ride APIs",
            url: "https://corporate.olacabs.com/docs/view-rides",
            finding: "Ride APIs expose user, group, payment, approval, fare breakup, trip timing and report fields."
        },
        {
            brand: "Rapido Corporate",
            url: "https://www.rapido.bike/CorporatePartners",
            finding: "Rapido Corporate covers employee onboarding, app/API booking, corporate wallet, invoices, statements and expense tracking."
        },
        {
            brand: "Rapido Captain and safety terms",
            url: "https://rapido.bike/CaptainTerms",
            finding: "Captain workflows include document collection, police/background checks, training, conduct, duty-hour and safety compliance rules."
        }
    ]);
})(window);
