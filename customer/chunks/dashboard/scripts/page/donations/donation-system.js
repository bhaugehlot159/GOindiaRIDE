        // DONATION SYSTEM
        // ----------------------------------------====

        function openDonations() {
            window.location.href = './donations.html';
        }

        function openDonationModal(rideId) {
            currentRideForDonation = rideId;
            selectedDonationAmount = 50;
            document.getElementById('donationModal').classList.add('active');
        }

        function closeDonationModal() {
            document.getElementById('donationModal').classList.remove('active');
        }

        function selectDonation(amount) {
            selectedDonationAmount = amount;
            document.querySelectorAll('.donation-btn-option').forEach(btn => {
                btn.classList.remove('selected');
            });
            event.target.classList.add('selected');
            document.getElementById('customDonationAmount').value = '';
        }

        document.getElementById('customDonationAmount')?.addEventListener('input', function() {
            if (this.value) {
                selectedDonationAmount = parseInt(this.value);
                document.querySelectorAll('.donation-btn-option').forEach(btn => {
                    btn.classList.remove('selected');
                });
            }
        });

        async function submitDonation() {
            const customAmount = document.getElementById('customDonationAmount').value;
            const amount = customAmount ? parseInt(customAmount) : selectedDonationAmount;

            if (!amount || amount < 1) {
                alert('Please select a valid amount');
                return;
            }

            // Create donation record
            const donation = {
                id: 'DON' + Date.now(),
                rideId: currentRideForDonation,
                amount: amount,
                beneficiary: 'Underprivileged Driver Fund',
                createdAt: new Date().toISOString()
            };

            let donations = readCustomerScopedStorage('customerDonations_', []);
            donations.push(donation);
            writeCustomerScopedStorage('customerDonations_', donations);

            // Deduct from wallet
            let wallet = readCustomerScopedStorage('wallet_', { balance: 0, transactions: [] });
            wallet.balance -= amount;
            wallet.transactions = wallet.transactions || [];
            wallet.transactions.unshift({
                type: 'donation',
                amount: amount,
                description: 'Donation to help drivers',
                date: new Date().toISOString()
            });
            writeCustomerScopedStorage('wallet_', wallet);

            // Get ride details for receipt
            if (typeof isSecureWalletMode === 'function' && isSecureWalletMode()) {
                await refreshSecureWalletSnapshot(false);
            }

            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const ride = bookings.find(b => b.id === currentRideForDonation);

            // Show receipt
            showDonationReceipt(ride, amount, donation.id);
        }

        function showDonationReceipt(ride, donationAmount, donationId) {
            if (!ride) {
                alert('❌ Ride not found');
                return;
            }

            const totalAmount = ride.totalFare + donationAmount;

            document.getElementById('receiptPickup').textContent = ride.pickup;
            document.getElementById('receiptDropoff').textContent = ride.dropoff;
            document.getElementById('receiptFare').textContent = `₹${ride.totalFare}`;
            document.getElementById('receiptDonation').textContent = `₹${donationAmount}`;
            document.getElementById('receiptRefId').textContent = donationId;
            document.getElementById('receiptRideAmount').textContent = `₹${ride.totalFare}`;
            document.getElementById('receiptDonationAmount').textContent = `₹${donationAmount}`;
            document.getElementById('receiptTotal').textContent = `₹${totalAmount}`;
            document.getElementById('receiptImpact').textContent = `provide meals/help to one person for a day`;

            closeDonationModal();
            document.getElementById('receiptModal').classList.add('active');

            // Reload data
            loadDashboard();
            loadDonations();
        }

        function closeReceiptModal() {
            document.getElementById('receiptModal').classList.remove('active');
        }

        function downloadReceipt() {
            const receiptText = `
GO INDIA RIDE - DONATION RECEIPT

------------------------
RIDE DETAILS
------------------------
Pickup: ${document.getElementById('receiptPickup').textContent}
Dropoff: ${document.getElementById('receiptDropoff').textContent}
Ride Fare: ${document.getElementById('receiptFare').textContent}

------------------------
DONATION DETAILS
------------------------
Donation Amount: ${document.getElementById('receiptDonation').textContent}
Beneficiary: ${document.getElementById('receiptBeneficiary').textContent}
Reference ID: ${document.getElementById('receiptRefId').textContent}
Date: ${new Date().toLocaleString()}

------------------------
SUMMARY
------------------------
Ride Amount: ${document.getElementById('receiptRideAmount').textContent}
+ Donation: ${document.getElementById('receiptDonationAmount').textContent}
Total Paid: ${document.getElementById('receiptTotal').textContent}

Thank you for your generosity! ❤️
            `;

            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(receiptText));
            element.setAttribute('download', 'donation_receipt_' + new Date().getTime() + '.txt');
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);

            alert('✅ Receipt downloaded!');
        }

        function shareReceipt() {
            const receiptText = `I just donated ₹${document.getElementById('receiptDonation').textContent} through GO India RIDE to help underprivileged drivers! 🙏❤️ #GoIndiaRide #HelpingDrivers`;

            if (navigator.share) {
                navigator.share({
                    title: 'GO India RIDE Donation',
                    text: receiptText,
                    url: window.location.href
                });
            } else {
                alert('Share: ' + receiptText);
            }
        }

        function viewDonationReceipt(donationId) {
            const donations = readCustomerScopedStorage('customerDonations_', []);
            const donation = donations.find(d => d.id === donationId);
            if (donation) {
                alert(`
Donation Receipt
----------------
Amount: ₹${donation.amount}
Beneficiary: ${donation.beneficiary}
Date: ${new Date(donation.createdAt).toLocaleString()}
Reference: ${donation.id}

Thank you for helping! ❤️
                `);
            }
        }

        // ----------------------------------------====
