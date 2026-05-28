        // ============================================
        // DONATION SYSTEM
        // ============================================

        function closeDonationModal() {
            document.getElementById('donationModal').classList.remove('active');
            window.location.href = './customer-dashboard.html';
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

        function submitDonation() {
            const customAmount = document.getElementById('customDonationAmount').value;
            const amount = customAmount ? parseInt(customAmount) : selectedDonationAmount;

            if (!amount || amount < 1) {
                alert('Please select a valid amount');
                return;
            }

            const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
            const ride = bookings.find(b => b.id === currentRideForDonation);

            if (!ride) {
                alert('Ride not found');
                return;
            }

            // Create donation
            const donation = {
                id: 'DON' + Date.now(),
                rideId: currentRideForDonation,
                amount: amount,
                beneficiary: 'Underprivileged Driver Fund',
                createdAt: new Date().toISOString()
            };

            let donations = JSON.parse(localStorage.getItem('customerDonations_' + currentUser.id)) || [];
            donations.push(donation);
            localStorage.setItem('customerDonations_' + currentUser.id, JSON.stringify(donations));

            // Deduct from wallet
            let wallet = JSON.parse(localStorage.getItem(`wallet_${currentUser.id}`)) || { balance: 0, transactions: [] };
            wallet.balance -= amount;
            wallet.transactions = wallet.transactions || [];
            wallet.transactions.unshift({
                type: 'donation',
                amount: amount,
                description: 'Donation to help drivers',
                date: new Date().toISOString()
            });
            localStorage.setItem(`wallet_${currentUser.id}`, JSON.stringify(wallet));

            // Show receipt
            const totalAmount = ride.totalFare + amount;

            document.getElementById('receiptPickup').textContent = ride.pickup;
            document.getElementById('receiptDropoff').textContent = ride.dropoff;
            document.getElementById('receiptFare').textContent = `₹${ride.totalFare}`;
            document.getElementById('receiptDonation').textContent = `₹${amount}`;
            document.getElementById('receiptRefId').textContent = donation.id;
            document.getElementById('receiptRideAmount').textContent = `₹${ride.totalFare}`;
            document.getElementById('receiptDonationAmount').textContent = `₹${amount}`;
            document.getElementById('receiptTotal').textContent = `₹${totalAmount}`;

            document.getElementById('donationModal').classList.remove('active');
            document.getElementById('receiptModal').classList.add('active');
        }

        function closeReceiptModal() {
            document.getElementById('receiptModal').classList.remove('active');
            window.location.href = './customer-dashboard.html';
        }

        function downloadReceipt() {
            const receiptText = `
GO INDIA RIDE - RECEIPT

========================
RIDE DETAILS
========================
Pickup: ${document.getElementById('receiptPickup').textContent}
Dropoff: ${document.getElementById('receiptDropoff').textContent}
Ride Fare: ${document.getElementById('receiptFare').textContent}

========================
DONATION DETAILS
========================
Donation Amount: ${document.getElementById('receiptDonation').textContent}
Beneficiary: Underprivileged Driver Fund
Reference ID: ${document.getElementById('receiptRefId').textContent}
Date: ${new Date().toLocaleString()}

========================
SUMMARY
========================
Ride Amount: ${document.getElementById('receiptRideAmount').textContent}
+ Donation: ${document.getElementById('receiptDonationAmount').textContent}
Total Paid: ${document.getElementById('receiptTotal').textContent}

Thank you for your generosity! ❤️
            `;

            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(receiptText));
            element.setAttribute('download', 'receipt_' + new Date().getTime() + '.txt');
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);

            alert('✅ Receipt downloaded!');
        }

        function shareReceipt() {
            const donationAmount = document.getElementById('receiptDonation').textContent;
            const shareText = `I just donated ${donationAmount} through GO India RIDE to help underprivileged drivers! 🙏❤️ #GoIndiaRide`;
            
            if (navigator.share) {
                navigator.share({
                    title: 'GO India RIDE Donation',
                    text: shareText
                });
            } else {
                alert('Share: ' + shareText);
            }
        }

        // ============================================
        // MESSAGES
        // ============================================

        function showError(message) {
            document.getElementById('errorText').textContent = message;
            document.getElementById('errorMessage').classList.add('show');
            setTimeout(() => document.getElementById('errorMessage').classList.remove('show'), 5000);
        }

        function showSuccess(message) {
            document.getElementById('successText').textContent = message;
            document.getElementById('successMessage').classList.add('show');
            setTimeout(() => document.getElementById('successMessage').classList.remove('show'), 5000);
        }
