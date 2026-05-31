        // PAYMENT SYSTEM
        // ----------------------------------------====

        let currentRideForPayment = null;

        function showPaymentModal(rideId) {
            const rides = JSON.parse(localStorage.getItem('bookings')) || [];
            const ride = rides.find(r => r.id === rideId);

            if (!ride) return;

            currentRideForPayment = rideId;

            document.getElementById('paymentPickup').textContent = ride.pickup;
            document.getElementById('paymentDropoff').textContent = ride.dropoff;
            document.getElementById('paymentDistance').textContent = (ride.distance || 15) + ' km';
            document.getElementById('paymentFare').textContent = '₹' + ride.totalFare;

            document.getElementById('paymentModal').style.display = 'flex';
            document.getElementById('paymentModal').classList.add('active');
        }

        function selectPaymentMethod(method) {
            if (!currentRideForPayment) return;

            const rides = JSON.parse(localStorage.getItem('bookings')) || [];
            const rideIdx = rides.findIndex(r => r.id === currentRideForPayment);

            if (rideIdx !== -1) {
                rides[rideIdx].paymentMethod = method;
                rides[rideIdx].paymentStatus = 'paid';
                rides[rideIdx].paidAt = new Date().toISOString();
                localStorage.setItem('bookings', JSON.stringify(rides));

                // Hide payment modal
                document.getElementById('paymentModal').style.display = 'none';
                document.getElementById('paymentModal').classList.remove('active');

                // Show success toast
                if (typeof showSuccessToast === 'function') {
                    showSuccessToast(`Payment of ₹${rides[rideIdx].totalFare} completed successfully!`, 'Payment Successful');
                }

                // Show optional donation suggestion after 1 second
                setTimeout(() => {
                    // Show donation modal instead of confirm dialog
                    openDonationModal(currentRideForPayment);
                }, 1000);

                // Reload rides to update display
                loadRides();
            }
        }

        function closePaymentModal() {
            document.getElementById('paymentModal').style.display = 'none';
            document.getElementById('paymentModal').classList.remove('active');
        }

        // Check for newly completed rides and show payment
        function checkForCompletedRides() {
            const myRides = getCustomerBookingsFromStore();

            const unpaidRide = myRides.find(ride => ride.status === 'completed' && !ride.paymentStatus);
            if (unpaidRide) showPaymentModal(unpaidRide.id);
        }

        // Real-time sync - poll for updates every 30 seconds
        function startRealTimeSync() {
            if (customerRealtimeSyncTimer) return;
            customerRealtimeSyncTimer = setInterval(() => {
                loadRides();
                checkForCompletedRides();
                renderCustomerAlerts();
            }, 30000); // Poll every 30 seconds to keep dashboard responsive.
        }

        function renderCustomerAlerts() {
            const host = document.getElementById('customerAlertsPanel');
            if (!host || typeof PortalAlerts === 'undefined') return;

            const alerts = PortalAlerts.getAlertsForRole('customer').slice(0, 5);
            const panel = host.closest('.portal-alerts-panel');
            if (panel) {
                panel.classList.toggle('portal-alerts-empty', !alerts.length);
            }
            host.innerHTML = alerts.length
                ? alerts.map((a) => `
                    <div class="portal-alert-item">
                        <strong>${a.title}</strong><div>${a.message}</div>
                        <div class="portal-alert-meta">${PortalAlerts.timeAgo(a.createdAt)}${a.rideId ? ` • Ride ${a.rideId}` : ''}</div>
                    </div>
                `).join('')
                : '<div class="portal-alert-item">No customer alerts right now.</div>';
        }

        function ensureCustomerAlertsPanel() {
            if (document.getElementById('customerAlertsPanel')) return;
            const header = document.querySelector('.header-section');
            if (!header) return;

            const panel = document.createElement('div');
            panel.className = 'portal-alerts-panel';
            panel.innerHTML = '<div class="portal-alerts-title">🔔 Live Ride Alerts</div><div id="customerAlertsPanel"></div>';
            header.appendChild(panel);
            renderCustomerAlerts();
        }

        // ----------------------------------------====
