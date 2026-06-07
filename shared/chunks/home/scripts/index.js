// Go to booking page
        function goToBooking() {
            window.location.href = './book-cab.html';
        }

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
