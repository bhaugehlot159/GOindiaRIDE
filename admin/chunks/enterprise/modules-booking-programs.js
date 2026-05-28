(function registerBookingProgramEnterpriseModules(window) {
    "use strict";

    const registry = window.GOINDIARIDE_ADMIN_ENTERPRISE;
    if (!registry || typeof registry.registerModules !== "function") return;

    registry.registerModules([
        {
            id: "travel_desk_api_booking",
            title: "Travel desk booking and API queue",
            competitors: "Ola TravelDesk, Uber Central, Rapido API",
            area: "Booking",
            detail: "Admin-created rides, fallback queue sync, employee handoff and protected booking APIs.",
            source: "admin booking creator and fallback API",
            sourceCheck: "bookings",
            backendRequired: true,
            statusType: "partial"
        },
        {
            id: "guest_rides_central_booking",
            title: "Guest rides and central booking",
            competitors: "Uber Central, Rapido Corporate",
            area: "Booking",
            detail: "Book rides for guests, employees, customers and non-login riders from admin.",
            source: "admin booking creator",
            sourceCheck: "bookings",
            backendRequired: true,
            statusType: "gap"
        },
        {
            id: "scheduled_commute_programs",
            title: "Scheduled commute and recurring rides",
            competitors: "Uber Business, Rapido Corporate",
            area: "Programs",
            detail: "Office commute, recurring trip, shift ride and employee eligibility controls.",
            source: "scheduled ride stores",
            sourceCheck: "bookings",
            statusType: "gap"
        },
        {
            id: "vouchers_programs",
            title: "Vouchers, commute and guest programs",
            competitors: "Uber Vouchers, Rapido Corporate",
            area: "Programs",
            detail: "Voucher campaign, commute pass, field visit and guest ride program builder.",
            source: "admin program store",
            sourceCheck: "controls",
            statusType: "gap"
        },
        {
            id: "candidate_customer_vouchers",
            title: "Customer and candidate voucher campaigns",
            competitors: "Uber Vouchers",
            area: "Programs",
            detail: "Hiring drive, event, customer support and limited-use campaign credits.",
            source: "voucher control store",
            sourceCheck: "controls",
            statusType: "gap"
        },
        {
            id: "field_visit_project_tracking",
            title: "Field visit and project ride tracking",
            competitors: "Ola Corporate, Uber Business",
            area: "Programs",
            detail: "Project code, site visit, purpose, memo and cost-center ride tracking.",
            source: "booking metadata",
            sourceCheck: "bookings",
            statusType: "gap"
        },
        {
            id: "ride_edit_cancel_refund_controls",
            title: "Ride edit, cancel and refund controls",
            competitors: "Ola Corporate, Uber Business",
            area: "Booking",
            detail: "Admin edit, approval, cancellation, refund review and customer sync controls.",
            source: "booking admin endpoints",
            sourceCheck: "bookings",
            backendRequired: true,
            statusType: "partial"
        }
    ]);
})(window);
