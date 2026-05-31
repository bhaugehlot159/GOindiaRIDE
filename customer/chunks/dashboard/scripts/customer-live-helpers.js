        (function connectCustomerPortalNotifications() {
            function getCustomerSubject() {
                try {
                    return window.currentUser || JSON.parse(localStorage.getItem('currentUser') || '{}') || {};
                } catch (_error) {
                    return window.currentUser || {};
                }
            }

            const customerAdminTabFeatures = {
                active: 'active_rides',
                history: 'ride_history',
                wallet: 'wallet',
                messages: 'messages',
                donations: 'donations',
                profile: 'profile'
            };
            const CUSTOMER_DASHBOARD_SYNC_MAX_ROWS = 140;
            const CUSTOMER_DASHBOARD_SYNC_MAX_CHARS = 360000;
            const customerAdminFeatureMap = {
                home_dashboard: ['.header-section', '.quick-actions', '.stats-grid'],
                booking: ['button[onclick*="goToBooking"]', 'a[href*="booking.html"]', '.quick-action-btn[onclick*="goToBooking"]', '#rideEditModal', '.ride-edit-modal-content', 'button[onclick*="submitRideEdit"]'],
                quick_booking: ['button[onclick*="goToBooking"]', 'a[href*="booking.html"]', '.quick-actions'],
                saved_places: ['#ff-runtime-card-saved-locations', '#ffx-location-label', '#ffx-location-address', '#ffx-location-district', '#ffx-location-save', '#ffx-location-refresh'],
                fare_estimator: ['#ff-runtime-card-fare-estimator', '#rideEditRuleStatus', '.ride-edit-rule-panel', '.ride-edit-field[data-edit-field="paymentMethod"]'],
                active_rides: ['.tab-button[data-tab="active"]', '#activeTab', '#activeRidesList', 'button[onclick*="trackRide"]'],
                scheduled_rides: ['#customerRuntimeActiveMount', 'button[onclick*="openRideEditModal"]', '.ride-edit-field[data-edit-field="rideDate"]', '.ride-edit-field[data-edit-field="rideTime"]', '#rideEditReturnFieldsRow'],
                airport_transfers: ['.ride-edit-field[data-edit-field="tripPlan"]', '#rideEditTripPlan option[value="airport"]'],
                outstation_rides: ['.ride-edit-field[data-edit-field="tripPlan"]', '#rideEditTripPlan option[value="outstation"]'],
                hourly_rentals: ['.ride-edit-field[data-edit-field="tripPlan"]', '#rideEditTripPlan option[value="rental"]'],
                trip_modes: ['.ride-edit-field[data-edit-field="tripPlan"]', '#rideEditTripPlan'],
                ride_history: ['.tab-button[data-tab="history"]', '#historyTab', '#historyRidesList', 'button[onclick*="viewReceipt"]', 'button[onclick*="rateRide"]', '#ff-runtime-card-ride-history', '#ff-runtime-card-rating', '#ff-runtime-card-reviews'],
                wallet: ['.tab-button[data-tab="wallet"]', '#walletTab', '#walletBalance', '#customerWalletTabBalance', '.wallet-grid', '.wallet-ledger-card', '#ff-runtime-card-payment'],
                wallet_topup: ['#walletAddAmount', '#walletAddMethod', 'button[onclick*="handleWalletAddMoney"]', '.wallet-form-card:first-child', '#ffx-payment-wallet', '#ffx-payment-wallet-add'],
                wallet_withdrawal: ['#walletWithdrawAmount', '#walletWithdrawMethod', '#walletWithdrawDestination', '#walletWithdrawNote', 'button[onclick*="handleWalletWithdrawalRequest"]', '#walletWithdrawalList'],
                wallet_transfer: ['#walletTransferAmount', '#walletTransferTarget', 'button[onclick*="handleWalletTransfer"]', '#ff-runtime-card-referral'],
                rewards: ['#totalDonations', '#donationAmount', '#ffx-payment-coupon', '#ffx-payment-apply', '#ff-runtime-card-referral'],
                messages: ['.tab-button[data-tab="messages"]', '#messagesTab', '#conversationsList', '#chatWindow', '#messageInput', '.send-btn', 'button[onclick*="sendMessage"]'],
                donations: ['.tab-button[data-tab="donations"]', '#donationsTab', '#donationsList', '#donationModal', '#customDonationAmount', '#donateBtn', '.donation-btn-option', 'button[onclick*="openDonations"]', 'a[href^="javascript:openDonations"]'],
                split_fare: ['#rideEditPaymentMethod option[value="wallet"]', '.payment-method-btn', '#ff-runtime-card-payment'],
                tourism: ['#ff-runtime-card-tourism', '#ffx-tourism-district', '#ffx-tourism-load', '#ffx-tourism-place', '#ffx-tourism-add', '#ffx-tourism-list', '#ffx-tourism-search-auto'],
                travel_card: ['#ff-runtime-card-travel-card', '[id^="ffx-travel"]'],
                temple_timings: ['#ff-runtime-card-tourism', '#ffx-tourism-list'],
                cultural_guide: ['#ff-runtime-card-tourism', '#ff-runtime-card-translator', '#ffx-translator-text', '#ffx-translate'],
                local_events: ['#ff-runtime-card-notifications', '#ff-runtime-card-tourism'],
                tour_packages: ['#ff-runtime-card-packages', '[id^="ffx-package"]'],
                heritage_walks: ['#ff-runtime-card-tourism', '#ffx-tourism-list'],
                food_guide: ['#ff-runtime-card-listing', '[id^="ffx-listing"]'],
                shopping_guide: ['#ff-runtime-card-listing', '[id^="ffx-listing"]'],
                profile: ['.tab-button[data-tab="profile"]', '#profileTab', '#profileNameInput', '#profileEmailInput', '#profilePhoneInput', 'button[onclick*="saveProfileDetails"]', '#ff-runtime-card-profile', '#ffx-profile-save'],
                ride_preferences: ['#rideEditSpecialRequestsGroup', '#rideEditSafetyAccessibilityGroup', '.ride-edit-checkbox-card', '#ff-runtime-card-policy-rules', '#ff-runtime-card-booking-policy'],
                emergency_contacts: ['#profilePhoneInput', '#profilePhoneVerificationBadge', '#ffx-profile-contact1', '#ffx-profile-contact2', '#ffx-profile-contact3'],
                notifications: ['#customerAlertsPanel', '.portal-alerts-panel', '#ff-runtime-card-notifications', '[id^="ffx-notification"]'],
                customer_support: ['.tab-button[data-tab="messages"]', '#messagesTab', '#messageInput', '.send-btn', '#ff-runtime-card-support-helpdesk', '#ff-runtime-card-chatbot', '#ff-runtime-card-translator', '#ffx-chat-question', '#ffx-chat-send'],
                emergency: ['.emergency-panel', '.emergency-btn', '#ff-runtime-card-emergency', '#ffx-emergency-sos']
            };
            const customerAdminActionMap = {
                goToBooking: 'booking',
                openRideEditModal: 'scheduled_rides',
                submitRideEdit: 'booking',
                trackRide: 'active_rides',
                viewReceipt: 'ride_history',
                rateRide: 'ride_history',
                handleWalletAddMoney: 'wallet_topup',
                handleWalletWithdrawalRequest: 'wallet_withdrawal',
                openDonations: 'donations',
                openDonationModal: 'donations',
                selectDonation: 'donations',
                submitDonation: 'donations',
                viewDonationReceipt: 'donations',
                saveProfileDetails: 'profile',
                handleProfilePhoneInputChange: 'profile',
                sendProfilePhoneOtp: 'emergency_contacts',
                verifyAndSaveProfilePhone: 'emergency_contacts',
                openChat: 'messages',
                sendMessage: 'customer_support',
                handleMessageKeyPress: 'customer_support',
                triggerEmergencyHelp: 'emergency',
                switchTab: function (tabName) {
                    return customerAdminTabFeatures[String(tabName || '').toLowerCase()] || 'home_dashboard';
                }
            };

            function runCustomerIdle(callback, delayMs) {
                const run = function () {
                    if (typeof window.requestIdleCallback === 'function') {
                        window.requestIdleCallback(callback, { timeout: 9000 });
                        return;
                    }
                    window.setTimeout(callback, 160);
                };
                window.setTimeout(run, delayMs || 0);
            }

            function connectCustomerAdminControls() {
                if (window.AdminControlBridge && typeof AdminControlBridge.initPortalRuntime === 'function') {
                    AdminControlBridge.initPortalRuntime('customer', {
                        getSubject: getCustomerSubject,
                        onBlocked: function () {
                            document.querySelectorAll('.container, a[href*="booking"], button[onclick*="Booking"], button[onclick*="booking"], form button[type="submit"]').forEach(function (node) {
                                if (!node.closest('#goindiarideAdminControlBanner')) node.classList.add('admin-lock-sensitive');
                            });
                        },
                        onAllowed: function () {
                            document.querySelectorAll('.admin-lock-sensitive').forEach(function (node) {
                                node.classList.remove('admin-lock-sensitive');
                            });
                        }
                    });
                }

                if (window.AdminControlBridge && typeof AdminControlBridge.initFeatureRuntime === 'function') {
                    AdminControlBridge.initFeatureRuntime('customer', customerAdminFeatureMap, {
                        getSubject: getCustomerSubject
                    });
                }

                if (window.AdminControlBridge && typeof AdminControlBridge.wrapFeatureActions === 'function') {
                    AdminControlBridge.wrapFeatureActions('customer', customerAdminActionMap, {
                        getSubject: getCustomerSubject
                    });
                }
            }
            runCustomerIdle(connectCustomerAdminControls, 3500);

            let lastAdminBookingSyncSignal = '';
            let customerBookingViewRefreshTimer = null;
            function invalidateCustomerRuntimeBookingCache() {
                if (!window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__) return;
                window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__.cachedBookings = null;
                window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__.cachedBookingsAt = 0;
            }

            function readDashboardSyncRows(key) {
                try {
                    const raw = localStorage.getItem(key) || '[]';
                    if (raw.length > CUSTOMER_DASHBOARD_SYNC_MAX_CHARS) return [];
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object').slice(0, CUSTOMER_DASHBOARD_SYNC_MAX_ROWS) : [];
                } catch (_error) {
                    return [];
                }
            }

            function writeDashboardSyncRows(key, rows) {
                try {
                    const raw = JSON.stringify((Array.isArray(rows) ? rows : []).slice(0, CUSTOMER_DASHBOARD_SYNC_MAX_ROWS));
                    if (localStorage.getItem(key) === raw) return;
                    localStorage.setItem(key, raw);
                } catch (_error) {
                    // Ignore local storage pressure.
                }
            }

            function upsertDashboardBookingFromAdminPayload(booking, fallbackBookingId) {
                const bookingId = String(booking?.id || booking?.bookingId || fallbackBookingId || '').trim();
                if (!bookingId) return;

                DASHBOARD_BOOKING_SYNC_KEYS.forEach(function (key) {
                    let rows = readDashboardSyncRows(key);

                    const idx = rows.findIndex(function (item) {
                        return String(item.id || item.bookingId || '').trim() === bookingId;
                    });
                    const existing = idx >= 0 ? rows[idx] : {};
                    const updated = {
                        ...existing,
                        ...booking,
                        id: bookingId,
                        bookingId: bookingId,
                        pickup: booking.pickup || booking.pickupLocation || existing.pickup || existing.pickupLocation || '',
                        pickupLocation: booking.pickupLocation || booking.pickup || existing.pickupLocation || existing.pickup || '',
                        dropoff: booking.dropoff || booking.drop || booking.dropLocation || existing.dropoff || existing.dropLocation || '',
                        drop: booking.drop || booking.dropoff || booking.dropLocation || existing.drop || existing.dropoff || '',
                        dropLocation: booking.dropLocation || booking.dropoff || booking.drop || existing.dropLocation || existing.dropoff || '',
                        totalFare: Number(booking.totalFare || booking.fare || booking.amount || booking.finalFare || existing.totalFare || existing.fare || 0),
                        amount: Number(booking.amount || booking.fare || booking.totalFare || booking.finalFare || existing.amount || existing.fare || 0),
                        updatedAt: booking.updatedAt || new Date().toISOString()
                    };

                    if (idx >= 0) {
                        rows[idx] = updated;
                    } else {
                        rows.unshift(updated);
                    }
                    writeDashboardSyncRows(key, rows);
                });
                invalidateCustomerRuntimeBookingCache();
            }

            function upsertDashboardBookingFromAdminNotification(notification) {
                const booking = notification && notification.booking && typeof notification.booking === 'object'
                    ? notification.booking
                    : {};
                const bookingId = String(booking.id || booking.bookingId || notification?.metadata?.bookingId || '').trim();
                upsertDashboardBookingFromAdminPayload(booking, bookingId);
            }

            function refreshCustomerBookingViewsFromAdminSync() {
                invalidateCustomerRuntimeBookingCache();
                if (customerBookingViewRefreshTimer) return;
                customerBookingViewRefreshTimer = window.setTimeout(function () {
                    customerBookingViewRefreshTimer = null;
                    if (typeof loadRides === 'function') loadRides();
                    if (typeof loadDashboard === 'function') loadDashboard();
                    if (typeof checkForCompletedRides === 'function') checkForCompletedRides();
                    if (typeof renderCustomerAlerts === 'function') renderCustomerAlerts();
                }, 300);
            }

            function handleAdminBookingSyncSignal(rawSignal) {
                const raw = typeof rawSignal === 'string'
                    ? rawSignal
                    : JSON.stringify(rawSignal || {});
                if (!raw || raw === '{}' || raw === lastAdminBookingSyncSignal) return false;
                lastAdminBookingSyncSignal = raw;
                try {
                    const signal = typeof rawSignal === 'string' ? JSON.parse(rawSignal) : rawSignal;
                    if (signal && signal.booking && typeof signal.booking === 'object') {
                        upsertDashboardBookingFromAdminPayload(signal.booking, signal.bookingId);
                    }
                } catch (_error) {
                    // Ignore malformed admin sync signals.
                }
                refreshCustomerBookingViewsFromAdminSync();
                return true;
            }

            window.addEventListener('storage', function(event) {
                if (!event || !event.key) return;
                if (event.key === ADMIN_BOOKING_EDIT_SIGNAL_KEY && event.newValue) {
                    handleAdminBookingSyncSignal(event.newValue);
                    return;
                }

                if (DASHBOARD_BOOKING_SYNC_KEYS.includes(event.key)) {
                    refreshCustomerBookingViewsFromAdminSync();
                }
            });

            try {
                if (typeof BroadcastChannel === 'function') {
                    const adminBookingChannel = new BroadcastChannel('goindiaride-admin-booking-sync');
                    adminBookingChannel.onmessage = function (event) {
                        handleAdminBookingSyncSignal(event && event.data);
                    };
                    window.__goindiarideAdminBookingSyncChannel = adminBookingChannel;
                }
            } catch (_error) {
                // Storage polling below still catches admin sync updates.
            }

            window.setInterval(function () {
                try {
                    const rawSignal = localStorage.getItem(ADMIN_BOOKING_EDIT_SIGNAL_KEY) || '';
                    if (rawSignal) handleAdminBookingSyncSignal(rawSignal);
                } catch (_error) {
                    // Ignore storage read failures.
                }
            }, 15000);

            try {
                const rawSignal = localStorage.getItem(ADMIN_BOOKING_EDIT_SIGNAL_KEY) || '';
                if (rawSignal) handleAdminBookingSyncSignal(rawSignal);
            } catch (_error) {
                // Ignore startup storage read failures.
            }

            if (!window.PortalConnector) return;

            PortalConnector.setActivePortal('customer');
            PortalConnector.listen('customer', (notification) => {
                if (!notification) return;
                const booking = notification.booking || {};
                const bookingId = String(booking.id || booking.bookingId || notification.metadata?.bookingId || '').trim();
                const status = String(notification.metadata?.status || booking.adminReviewStatus || booking.status || '').toLowerCase();
                const isAdminApproval = notification.type === 'booking_approved'
                    || (notification.type === 'booking_admin_status_update' && status === 'approved');
                const isAdminRejection = notification.type === 'booking_rejected'
                    || (notification.type === 'booking_admin_status_update' && status === 'rejected');
                const isAdminEdit = notification.type === 'booking_admin_edited';
                const isAdminCreate = notification.type === 'booking_created_by_admin';

                if (typeof showToast === 'function' && isAdminApproval) {
                    showToast(notification.message || `Booking ${bookingId} approved by admin. Driver assignment will start shortly.`, 'success');
                } else if (typeof showToast === 'function' && isAdminRejection) {
                    showToast(notification.message || `Booking ${bookingId} was not approved by admin.`, 'warning');
                } else if (typeof showToast === 'function' && isAdminCreate) {
                    showToast(notification.message || `Booking ${bookingId} created by admin.`, 'success');
                } else if (typeof showToast === 'function' && isAdminEdit) {
                    showToast(notification.message || `Booking ${bookingId} details updated by admin.`, 'info');
                }

                if (isAdminApproval || isAdminRejection || isAdminEdit || isAdminCreate) {
                    upsertDashboardBookingFromAdminNotification(notification);
                    refreshCustomerBookingViewsFromAdminSync();
                }

                if (window.PortalAlerts && typeof PortalAlerts.pushAlert === 'function') {
                    PortalAlerts.pushAlert({
                        title: notification.title || 'Customer Update',
                        message: notification.message || 'New update available',
                        type: notification.type === 'error' ? 'danger' : (notification.type || 'info'),
                        rideId: bookingId || null,
                        roles: ['customer']
                    });
                }

                if (typeof renderCustomerAlerts === 'function') {
                    renderCustomerAlerts();
                }
            });
        })();
