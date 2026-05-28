        (function connectDriverPortalNotifications() {
            if (window.AdminControlBridge && typeof AdminControlBridge.initPortalRuntime === 'function') {
                AdminControlBridge.initPortalRuntime('driver', {
                    getSubject: function () {
                        try {
                            return JSON.parse(localStorage.getItem('currentDriver') || localStorage.getItem('driver_data') || '{}') || {};
                        } catch (_error) {
                            return {};
                        }
                    },
                    onBlocked: function () {
                        document.querySelectorAll('button, a').forEach(function (node) {
                            var text = String(node.textContent || node.getAttribute('aria-label') || '').toLowerCase();
                            if (node.closest('#goindiarideAdminControlBanner')) return;
                            if (text.includes('online') || text.includes('accept') || text.includes('ride') || text.includes('booking')) {
                                node.classList.add('admin-lock-sensitive');
                            }
                        });
                    },
                    onAllowed: function () {
                        document.querySelectorAll('.admin-lock-sensitive').forEach(function (node) {
                            node.classList.remove('admin-lock-sensitive');
                        });
                    }
                });
            }

            if (!window.PortalConnector) return;

            PortalConnector.setActivePortal('driver');
            PortalConnector.listen('driver', (notification) => {
                if (!notification) return;

                if (window.PortalAlerts && typeof PortalAlerts.pushAlert === 'function') {
                    PortalAlerts.pushAlert({
                        title: notification.title || 'Driver Update',
                        message: notification.message || 'New update available',
                        type: notification.type === 'error' ? 'danger' : (notification.type || 'info'),
                        rideId: notification.booking && notification.booking.id ? notification.booking.id : null,
                        roles: ['driver']
                    });
                }

                if (typeof renderDriverAlerts === 'function') {
                    renderDriverAlerts();
                }
            });
        })();
