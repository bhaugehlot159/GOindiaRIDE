        (function connectBookingPageToAdminControl() {
            if (!window.AdminControlBridge || typeof AdminControlBridge.initPortalRuntime !== 'function') return;

            function getBookingCustomerSubject() {
                try {
                    return window.currentUser || JSON.parse(localStorage.getItem('currentUser') || '{}') || {};
                } catch (_error) {
                    return window.currentUser || {};
                }
            }

            var bookingPageFeatureMap = {
                booking: ['#bookingForm', '.booking-btn', 'button[type="submit"]', '#pickup', '#dropoff', '#rideType', '#rideDate', '#rideTime'],
                quick_booking: ['#bookingForm', '#pickup', '#dropoff', '.swap-btn'],
                saved_places: ['#pickup', '#dropoff', '#ff-runtime-card-saved-locations', '#ffx-location-save', '#ffx-location-refresh'],
                fare_estimator: ['#fareEstimate', '#fareBreakdown', '#ff-runtime-card-fare-estimator', '[id*="fare" i]'],
                scheduled_rides: ['#rideDate', '#rideTime', '#returnDate', '#returnTime'],
                airport_transfers: ['#tripFlowPills [data-flow="airport"]', '#tripPlan option[value="airport"]', '#tripServiceType option[value="airport_transfer"]'],
                outstation_rides: ['#tripFlowPills [data-flow="outstation"]', '#tripPlan option[value="outstation"]'],
                hourly_rentals: ['#tripFlowPills [data-flow="day_trips"]', '#tripPlan option[value="rental"]'],
                trip_modes: ['input[name="journeyMode"]', '.journey-mode-chip'],
                wallet: ['#paymentMethod', '#ff-runtime-card-payment', '#ffx-payment-wallet', '#ffx-payment-wallet-add'],
                wallet_topup: ['#ff-runtime-card-payment', '#ffx-payment-wallet', '#ffx-payment-wallet-add'],
                rewards: ['#promoCode', 'button[onclick*="applyPromoCode"]', '#ffx-payment-coupon', '#ffx-payment-apply'],
                donations: ['#donationModal', '#customDonationAmount', '.donation-btn-option', '.donation-action-btn'],
                split_fare: ['#paymentMethod option[value="wallet"]', '.payment-method-btn'],
                tourism: ['#ff-runtime-card-tourism', '#ffx-tourism-district', '#ffx-tourism-load', '#ffx-tourism-place', '#ffx-tourism-add', '#ffx-tourism-list', '#ffx-tourism-search-auto'],
                travel_card: ['#ff-runtime-card-travel-card', '[id^="ffx-travel"]'],
                temple_timings: ['#ff-runtime-card-tourism', '#ffx-tourism-list'],
                cultural_guide: ['#ff-runtime-card-tourism', '#ff-runtime-card-translator', '#ffx-translator-text', '#ffx-translate'],
                local_events: ['#ff-runtime-card-notifications', '#ff-runtime-card-tourism'],
                tour_packages: ['#ff-runtime-card-packages', '[id^="ffx-package"]'],
                heritage_walks: ['#ff-runtime-card-tourism', '#ffx-tourism-list'],
                food_guide: ['#ff-runtime-card-listing', '[id^="ffx-listing"]'],
                shopping_guide: ['#ff-runtime-card-listing', '[id^="ffx-listing"]'],
                profile: ['#bookingCustomerPhone', '#ff-runtime-card-profile', '#ffx-profile-save'],
                ride_preferences: ['#specialRequests', '#safetyAccessibility', '[id*="Request" i]', '[id*="Safety" i]'],
                emergency_contacts: ['#bookingCustomerPhone', '#ffx-profile-contact1', '#ffx-profile-contact2', '#ffx-profile-contact3'],
                notifications: ['#ff-runtime-card-notifications', '[id^="ffx-notification"]'],
                customer_support: ['#ff-runtime-card-support-helpdesk', '#ff-runtime-card-chatbot', '#ff-runtime-card-translator', '#ffx-chat-question', '#ffx-chat-send'],
                emergency: ['#ff-runtime-card-emergency', '#ffx-emergency-sos'],
                active_rides: ['#driverAssignment', 'button[onclick*="callDriver"]', 'button[onclick*="trackDriver"]'],
                ride_history: ['#successModal', '.receipt-btn']
            };

            var bookingPageActionMap = {
                handleBookingFormSubmit: 'booking',
                swapLocations: 'quick_booking',
                applyPromoCode: 'rewards',
                selectDonation: 'donations',
                submitDonation: 'donations',
                openDonationModal: 'donations',
                sendBookingPhoneOtp: 'emergency_contacts',
                verifyBookingPhoneOtp: 'emergency_contacts',
                selectPaymentMethod: 'split_fare',
                callDriver: 'active_rides',
                trackDriver: 'active_rides',
                downloadReceipt: 'ride_history',
                shareReceipt: 'ride_history'
            };

            AdminControlBridge.initPortalRuntime('customer', {
                getSubject: getBookingCustomerSubject,
                onBlocked: function () {
                    var form = document.getElementById('bookingForm');
                    if (form) form.classList.add('admin-lock-sensitive');
                },
                onAllowed: function () {
                    var form = document.getElementById('bookingForm');
                    if (form) form.classList.remove('admin-lock-sensitive');
                }
            });

            if (typeof AdminControlBridge.initFeatureRuntime === 'function') {
                AdminControlBridge.initFeatureRuntime('customer', bookingPageFeatureMap, {
                    getSubject: getBookingCustomerSubject
                });
            }
            if (typeof AdminControlBridge.wrapFeatureActions === 'function') {
                AdminControlBridge.wrapFeatureActions('customer', bookingPageActionMap, {
                    getSubject: getBookingCustomerSubject
                });
            }
        })();
