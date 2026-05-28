(function registerEnterpriseBackendRoutes(window) {
    "use strict";

    const registry = window.GOINDIARIDE_ADMIN_ENTERPRISE;
    if (!registry || typeof registry.registerBackend !== "function") return;

    registry.registerBackend({
        travel_desk_api_booking: ["/api/bookings/fallback/admin-review-queue", "/api/bookings/:id/admin/review", "/api/bookings/:id/admin/edit"],
        guest_rides_central_booking: ["/api/bookings/fallback/admin-review-queue", "/api/bookings/admin/pending"],
        ride_edit_cancel_refund_controls: ["/api/bookings/:id/admin/edit", "/api/bookings/:id/admin/review", "/api/bookings/:id/refund", "/api/bookings/:id/cancel"],
        corporate_wallet_billing: ["/api/wallet/admin/overview", "/api/wallet/admin/topups", "/api/wallet/admin/withdrawals", "/api/wallet/admin/payment-modes"],
        monthly_billing_statements: ["/api/wallet/admin/overview", "/api/wallet/admin/commissions/summary"],
        reports_invoices: ["/api/bookings/admin/pending", "/api/wallet/admin/commissions/summary", "/api/wallet/admin/driver-commissions/summary"],
        custom_csv_reports: ["/api/bookings/admin/pending", "/api/future-runtime-business/history/ride/:userKey/export.csv"],
        tax_gst_invoice_pack: ["/api/bookings/admin/pending", "/api/wallet/admin/overview"],
        driver_quality_payouts: ["/api/wallet/admin/driver-commissions/summary", "/api/wallet/admin/withdrawals/:requestId/review"],
        earnings_bank_settlement: ["/api/wallet/admin/withdrawals", "/api/wallet/admin/withdrawals/:requestId/review"],
        safety_compliance_sos: ["/api/security/incidents", "/api/security/pulse", "/api/security/sos"],
        night_ride_safety_check: ["/api/security/pulse", "/api/bookings/admin/pending"],
        incident_dispute_escalation: ["/api/security/incidents", "/api/future-runtime-business/dispute/report", "/api/future-runtime-business/support/ticket"],
        fraud_abuse_detection: ["/api/wallet/runtime/security/incidents", "/api/wallet/runtime/security/risk/:userKey"],
        support_expense_integrations: ["/api/notifications", "/api/future-runtime-business/support/ticket", "/api/future-runtime-business/partner/webhook/logs"],
        api_access_tokens: ["/api/auth", "/api/bookings/admin/pending", "/api/wallet/admin/overview"],
        webhooks_partner_logs: ["/api/future-runtime-business/partner/webhook/log", "/api/future-runtime-business/partner/webhook/logs"],
        expense_provider_export: ["/api/bookings/admin/pending", "/api/future-runtime-business/history/ride/:userKey/export.csv"],
        audit_logs_privacy_exports: ["/api/wallet/runtime/audit/digest", "/api/wallet/runtime/audit/events"],
        notification_sla_center: ["/api/notifications", "/api/future-runtime-business/notifications/send", "/api/future-runtime-business/support/ticket"],
        backend_health_service_status: ["/api/webhook", "/api/wallet/gateway/status", "/api/security/pulse", "/api/future-runtime/status"]
    }, [
        "travel_desk_api_booking",
        "guest_rides_central_booking",
        "ride_edit_cancel_refund_controls",
        "corporate_wallet_billing",
        "monthly_billing_statements",
        "reports_invoices",
        "custom_csv_reports",
        "tax_gst_invoice_pack",
        "driver_quality_payouts",
        "earnings_bank_settlement",
        "safety_compliance_sos",
        "night_ride_safety_check",
        "incident_dispute_escalation",
        "fraud_abuse_detection",
        "support_expense_integrations",
        "api_access_tokens",
        "webhooks_partner_logs",
        "expense_provider_export",
        "audit_logs_privacy_exports",
        "notification_sla_center",
        "backend_health_service_status"
    ]);
})(window);
