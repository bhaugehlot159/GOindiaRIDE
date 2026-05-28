        // LOAD DASHBOARD
        // ----------------------------------------====

        async function loadDashboard() {
            if (typeof isSecureWalletMode === 'function' && isSecureWalletMode()) {
                await refreshSecureWalletSnapshot(false);
            }

            const customerBookings = getCustomerBookingsFromStore();
            const donations = readCustomerScopedStorage('customerDonations_', []);

            const totalDonationAmount = donations.reduce((sum, d) => sum + d.amount, 0);
            const walletSnapshot = getWalletSnapshotForDashboard();

            document.getElementById('totalRides').textContent = customerBookings.length;
            document.getElementById('walletBalance').textContent = formatInr(walletSnapshot.customerBalance);
            document.getElementById('donationContributed').textContent = `₹${totalDonationAmount}`;
            document.getElementById('welcomeMsg').textContent = `Welcome, ${currentUser.fullname}!`;
            document.getElementById('userName').textContent = currentUser.fullname;

            const initials = currentUser.fullname.split(' ').map(n => n[0]).join('').toUpperCase();
            document.getElementById('userAvatar').textContent = initials;
        }

        // ----------------------------------------====
