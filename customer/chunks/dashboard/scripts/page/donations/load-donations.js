        // LOAD DONATIONS
        // ----------------------------------------====

        function loadDonations() {
            const donations = readCustomerScopedStorage('customerDonations_', []);

            const donationsList = document.getElementById('donationsList');
            if (donations.length === 0) {
                donationsList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-heart"></i>
                        <p>No donations yet. Help someone in need!</p>
                    </div>
                `;
            } else {
                donationsList.innerHTML = donations.map(d => `
                    <div class="ride-card" style="border-left-color: #f0b44f;">
                        <div class="ride-info">
                            <div class="ride-route">
                                <i class="fas fa-heart" style="color: #f0b44f;"></i> Donation to ${d.beneficiary}
                            </div>
                            <div class="ride-details">
                                <span><i class="fas fa-calendar"></i> ${new Date(d.createdAt).toLocaleDateString()}</span>
                                <span><strong style="color: #f0b44f;">₹${d.amount}</strong></span>
                                <span><i class="fas fa-check-circle" style="color: #080c12;"></i> Completed</span>
                            </div>
                        </div>
                        <div class="ride-actions">
                            <button class="ride-btn" onclick="viewDonationReceipt('${d.id}')">
                                <i class="fas fa-receipt"></i> Receipt
                            </button>
                        </div>
                    </div>
                `).join('');
            }
        }

        // ----------------------------------------====
