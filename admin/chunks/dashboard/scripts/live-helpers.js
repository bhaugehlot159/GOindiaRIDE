        (function connectAdminPortalNotifications() {
            if (!window.PortalConnector) return;

            PortalConnector.setActivePortal('admin');
            PortalConnector.listen('admin', (notification) => {
                if (!notification) return;

                if (window.PortalAlerts && typeof PortalAlerts.pushAlert === 'function') {
                    PortalAlerts.pushAlert({
                        title: notification.title || 'Admin Update',
                        message: notification.message || 'New update available',
                        type: notification.type === 'error' ? 'danger' : (notification.type || 'info'),
                        rideId: notification.booking && notification.booking.id ? notification.booking.id : null,
                        roles: ['admin']
                    });
                }

                if (typeof renderAdminAlerts === 'function') {
                    renderAdminAlerts();
                }

                if (typeof renderAdminReviewInbox === 'function') {
                    renderAdminReviewInbox();
                }

                if (typeof loadDashboardData === 'function') {
                    loadDashboardData();
                }

                if (typeof flushAdminReviewInboxEmailDispatch === 'function') {
                    flushAdminReviewInboxEmailDispatch();
                }
            });
        })();
