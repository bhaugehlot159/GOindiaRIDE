        // ============================================
        // DRIVER ACTIONS
        // ============================================

        function callDriver() {
            const phoneText = sanitizeInput(document.getElementById('driverPhone')?.textContent || '').replace(/[^\d+]/g, '');
            if (!phoneText) {
                showError('Driver phone is not available yet.');
                return;
            }
            window.location.href = `tel:${phoneText}`;
        }

        function trackDriver() {
            const pickup = sanitizeInput(document.getElementById('pickup')?.value || '').trim();
            const dropoff = sanitizeInput(document.getElementById('dropoff')?.value || '').trim();
            if (!pickup || !dropoff) {
                showError('Pickup/drop missing for live route tracking.');
                return;
            }
            const origin = getBookingMapQueryValue('pickup') || pickup;
            const destination = getBookingMapQueryValue('dropoff') || dropoff;
            const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
            window.open(url, '_blank', 'noopener');
        }

        // ============================================
        // UTILITY
        // ============================================

        const BOOKING_BACK_GUARD_STATE_KEY = '__goindiaRideBookingBackGuard';
        let bookingBackGuardBound = false;
        let bookingBackGuardRestoring = false;

        function createBookingBackGuardState(role = 'guard') {
            const currentState = history.state && typeof history.state === 'object' ? history.state : {};
            return {
                ...currentState,
                [BOOKING_BACK_GUARD_STATE_KEY]: true,
                bookingBackRole: role,
                bookingBackFlow: typeof getActiveCabFlow === 'function' ? getActiveCabFlow() : 'airport',
                bookingBackStep: Date.now()
            };
        }

        function pushBookingBackGuardState(role = 'guard') {
            if (!window.history || typeof window.history.pushState !== 'function') return false;
            try {
                window.history.pushState(createBookingBackGuardState(role), '', window.location.href);
                return true;
            } catch (_error) {
                return false;
            }
        }

        function replaceBookingBackGuardState(role = 'base') {
            if (!window.history || typeof window.history.replaceState !== 'function') return false;
            try {
                window.history.replaceState(createBookingBackGuardState(role), '', window.location.href);
                return true;
            } catch (_error) {
                return false;
            }
        }

        function stepBackInsideBooking() {
            const moved = typeof handleCabStepBack === 'function' ? handleCabStepBack() : false;
            if (moved) return true;
            resetBookingConsoleHome();
            return false;
        }

        function handleBookingBrowserBack() {
            if (bookingBackGuardRestoring) return;
            bookingBackGuardRestoring = true;

            pushBookingBackGuardState('guard');
            stepBackInsideBooking();
            window.setTimeout(() => {
                bookingBackGuardRestoring = false;
            }, 0);
        }

        function initBookingBackGuard() {
            if (bookingBackGuardBound) return;
            if (!replaceBookingBackGuardState('base')) return;
            if (!pushBookingBackGuardState('guard')) return;

            window.addEventListener('popstate', handleBookingBrowserBack);
            bookingBackGuardBound = true;
        }

        function goBack() {
            stepBackInsideBooking();
        }

        function goCustomerDashboard() {
            window.location.href = './customer-dashboard.html';
        }

        function goHome() {
            resetBookingConsoleHome();
        }

        function resetBookingConsoleHome() {
            const flow = typeof getActiveCabFlow === 'function' ? getActiveCabFlow() : 'airport';
            if (document.body) {
                document.body.classList.remove('booking-advanced-ready');
            }

            const drawer = document.getElementById('advancedBookingDrawer');
            if (drawer) drawer.open = false;

            if (typeof resetCabLayerProgress === 'function') resetCabLayerProgress(flow);
            if (typeof resetServiceFolderProgress === 'function') resetServiceFolderProgress(flow);
            if (typeof syncCabScopedSelectOptions === 'function') syncCabScopedSelectOptions(flow);
            if (typeof syncCabLayerFlow === 'function') syncCabLayerFlow(flow);
            if (typeof syncCabStageLayout === 'function') syncCabStageLayout();
            if (typeof updateBookingExperience === 'function') updateBookingExperience();

            const shell = document.getElementById('cabBookingConsole') || document.querySelector('.container');
            if (shell && typeof shell.scrollIntoView === 'function') {
                shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            const firstField = document.getElementById('cabQuickPickupInput') || document.getElementById('pickup');
            if (firstField && typeof firstField.focus === 'function') {
                window.setTimeout(() => firstField.focus({ preventScroll: true }), 80);
            }
        }

        const BOOKING_HISTORY_REDIRECT_URL = './customer-dashboard.html?tab=history#history';
        let bookingSuccessRedirectIssued = false;

        function redirectToBookingHistory() {
            if (bookingSuccessRedirectIssued) return;
            bookingSuccessRedirectIssued = true;
            window.location.href = BOOKING_HISTORY_REDIRECT_URL;
        }

        function closeSuccessModal() {
            document.getElementById('successModal').classList.remove('active');
            redirectToBookingHistory();
        }

        window.GOINDIARIDE_FORCE_STATIC_FIREBASE_CONFIG = 'false';
        console.log('🚀 Booking page loaded');
