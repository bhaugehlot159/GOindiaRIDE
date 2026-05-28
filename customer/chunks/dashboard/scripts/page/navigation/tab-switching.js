        // TAB SWITCHING
        // ----------------------------------------====

        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });

            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });

            const tabPanel = document.getElementById(tabName + 'Tab');
            if (tabPanel) {
                tabPanel.classList.add('active');
            }

            const activeButton = document.querySelector('.tab-button[data-tab="' + tabName + '"]');
            if (activeButton) {
                activeButton.classList.add('active');
            }

            if (tabName === 'messages') {
                loadMessages();
            }

            if (tabName === 'wallet') {
                renderWalletMethodOptions()
                    .then(() => renderWalletPanel({ forceSync: true }))
                    .catch((error) => console.warn('Wallet render failed:', error));
            }
        }

        function resolveDashboardTabFromNavigation() {
            const query = new URLSearchParams(window.location.search || '');
            const hashValue = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
            const requested = String(query.get('tab') || query.get('view') || hashValue || '').trim().toLowerCase();
            const tabAliases = {
                active: 'active',
                rides: 'active',
                history: 'history',
                'ride-history': 'history',
                'booking-history': 'history',
                ride_history: 'history',
                booking_history: 'history',
                wallet: 'wallet',
                messages: 'messages',
                donations: 'donations',
                profile: 'profile'
            };
            return tabAliases[requested] || '';
        }

        function openRequestedCustomerTabFromUrl() {
            const requestedTab = resolveDashboardTabFromNavigation();
            if (!requestedTab) return;
            switchTab(requestedTab);
        }

        // ============================================
