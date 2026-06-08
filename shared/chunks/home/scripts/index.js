// Live homepage booking handoff
        function cleanBookingValue(value) {
            return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
        }

        function buildBookingUrl(params = {}) {
            const query = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                const clean = cleanBookingValue(value);
                if (clean) query.set(key, clean);
            });
            const suffix = query.toString() ? `?${query.toString()}` : '';
            return `./book-cab.html${suffix}#quickBookingForm`;
        }

        function goToBooking(params = {}) {
            window.location.href = buildBookingUrl({
                source: 'home_button',
                tripPlan: 'city',
                serviceMode: 'local_point',
                ...params
            });
        }

        window.goToBooking = goToBooking;

        function datasetBookingParams(element) {
            if (!element) return {};
            const data = element.dataset || {};
            return {
                source: data.source || 'home_live_link',
                tripPlan: data.tripPlan || data.homeTripPlan,
                journey: data.journey || data.homeJourney,
                serviceMode: data.serviceMode || data.homeServiceMode,
                vehicleType: data.vehicleType,
                vehicleModel: data.vehicleModel,
                pickup: data.pickup,
                drop: data.drop,
                phone: data.phone,
                notes: data.notes
            };
        }

        function wireHomeQuickBookingForm() {
            const form = document.getElementById('homeQuickBookingForm');
            if (!form) return;

            const tripPlanInput = document.getElementById('homeTripPlanInput');
            const journeyInput = document.getElementById('homeJourneyInput');
            const serviceModeInput = document.getElementById('homeServiceModeInput');

            form.querySelectorAll('[data-home-trip-plan]').forEach((button) => {
                button.addEventListener('click', () => {
                    form.querySelectorAll('[data-home-trip-plan]').forEach((item) => {
                        const active = item === button;
                        item.classList.toggle('is-active', active);
                        item.setAttribute('aria-selected', active ? 'true' : 'false');
                    });
                    if (tripPlanInput) tripPlanInput.value = button.dataset.homeTripPlan || 'city';
                    if (journeyInput) journeyInput.value = button.dataset.homeJourney || 'one_way';
                    if (serviceModeInput) serviceModeInput.value = button.dataset.homeServiceMode || 'local_point';
                });
            });

            form.addEventListener('submit', (event) => {
                event.preventDefault();
                if (!form.reportValidity()) return;
                const params = {};
                new FormData(form).forEach((value, key) => {
                    params[key] = value;
                });
                window.location.href = buildBookingUrl(params);
            });
        }

        function wireLiveBookingLinks() {
            document.querySelectorAll('[data-home-booking-link]').forEach((link) => {
                link.addEventListener('click', (event) => {
                    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    event.preventDefault();
                    window.location.href = buildBookingUrl(datasetBookingParams(link));
                });
            });
        }

        wireHomeQuickBookingForm();
        wireLiveBookingLinks();

        // Smooth scrolling
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        let deferredInstallPrompt = null;
        const installAppBtn = document.getElementById('installAppBtn');
        const isStandaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        const refreshInstallAppButton = () => {
            if (!installAppBtn) return;
            if (isStandaloneMode()) {
                installAppBtn.style.display = 'none';
                return;
            }
            installAppBtn.style.display = 'inline-flex';
            const label = installAppBtn.querySelector('span');
            if (label) {
                label.textContent = deferredInstallPrompt ? 'Install App' : 'Open / Install App';
            }
        };

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredInstallPrompt = event;
            refreshInstallAppButton();
        });

        if (installAppBtn) {
            installAppBtn.addEventListener('click', async () => {
                if (!deferredInstallPrompt) {
                    alert('Agar address bar me "Open in app" button dikh raha hai to uspar click karein. Warna browser menu se "Install app / Add to Home Screen" use karein.');
                    return;
                }

                deferredInstallPrompt.prompt();
                const choice = await deferredInstallPrompt.userChoice;
                deferredInstallPrompt = null;
                refreshInstallAppButton();
            });
        }

        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            refreshInstallAppButton();
        });
        refreshInstallAppButton();

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                const swVersion = '20260522-booking-back-guard1';
                navigator.serviceWorker
                    .register(`./sw.js?v=${swVersion}`)
                    .then((registration) => {
                        registration.update().catch(() => {});
                    })
                    .catch((error) => {
                        console.warn('Service worker registration failed:', error);
                    });
            });
        }

        // Admin entry is visible but always protected by admin login/2FA.
        (function wireAdminEntry() {
            const adminBtn = document.getElementById('adminPortalBtn');
            if (!adminBtn) return;

            try {
                const role = String(localStorage.getItem('userRole') || localStorage.getItem('role') || '').toLowerCase();
                const accountType = String(localStorage.getItem('accountType') || '').toLowerCase();
                const currentAdmin = localStorage.getItem('currentAdmin');
                const isAdmin = role === 'admin' || accountType === 'admin' || Boolean(currentAdmin);

                if (isAdmin) {
                    adminBtn.href = './admin/app.html';
                    adminBtn.title = 'Open Admin App';
                }
            } catch (error) {
                // Keep login gate if storage cannot be read.
            }
        })();

        console.log('✅ Homepage loaded successfully!');
