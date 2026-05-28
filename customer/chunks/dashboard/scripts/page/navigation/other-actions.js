        // OTHER FUNCTIONS
        // ============================================

        function notifyEmergencyAction(message, title = 'Emergency') {
            if (typeof showWarningToast === 'function') {
                showWarningToast(message, title);
            } else {
                alert(message);
            }
        }

        function triggerEmergencyHelp(kind) {
            const emergencyMap = {
                police: { number: '112', label: 'Police', dialable: true },
                ambulance: { number: '108', label: 'Ambulance', dialable: true },
                sos: { number: null, label: 'SOS Alert', dialable: false }
            };

            const info = emergencyMap[kind] || emergencyMap.sos;
            const who = (currentUser && currentUser.fullname) ? currentUser.fullname : 'Customer';

            if (typeof PortalAlerts !== 'undefined') {
                PortalAlerts.pushAlert({
                    title: `Emergency: ${info.label}`,
                    message: `${who} triggered emergency support from customer dashboard.`,
                    type: 'danger',
                    roles: ['admin', 'driver', 'customer']
                });
                renderCustomerAlerts();
            }

            if (info.dialable && info.number) {
                notifyEmergencyAction(`${info.label} help requested. Dialing ${info.number}...`);
                window.location.href = `tel:${info.number}`;
                return;
            }

            notifyEmergencyAction('SOS alert sent to Admin & Driver network.', 'SOS Triggered');
        }

        function goToBooking() {
            window.location.href = './booking.html';
        }

        function trackRide(rideId) {
            alert('📍 Live tracking coming soon!');
        }

        async function viewReceipt(rideId) {
            if (typeof isSecureWalletMode === 'function' && isSecureWalletMode()) {
                await refreshSecureWalletSnapshot(false);
            }

            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const ride = bookings.find(b => b.id === rideId);
            if (ride) {
                alert(`
Ride Receipt
------------
From: ${ride.pickup}
To: ${ride.dropoff}
Type: ${ride.rideType}
Distance: ${ride.distance}km
Fare: ₹${ride.totalFare}
Date: ${new Date(ride.createdAt).toLocaleString()}

Thank you for riding with us! 🚗
                `);
            }
        }

        function rateRide(rideId) {
            const rating = prompt('Rate this ride (1-5 stars):');
            if (rating && rating >= 1 && rating <= 5) {
                alert(`✅ Thanks for rating! You gave ${rating} stars.`);
            }
        }

        // ----------------------------------------====
