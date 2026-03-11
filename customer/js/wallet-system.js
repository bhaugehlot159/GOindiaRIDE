/**
 * GO India RIDE - Wallet System
 * Handles dual wallet, payments, donations, cashback, and split fare
 */

const CUSTOMER_WALLET_KEY = 'goindiaride_wallet';
const CUSTOMER_TX_KEY = 'goindiaride_transactions';
const CUSTOMER_WITHDRAW_FALLBACK_KEY = 'goindiaride_customer_withdraw_requests';
const CUSTOMER_WITHDRAW_MIN = 100;
const CUSTOMER_WITHDRAW_MAX = 100000;
const CUSTOMER_WITHDRAW_COOLDOWN_MS = 5 * 60 * 1000;
let lastWithdrawRequestAt = 0;

// Initialize wallet system
document.addEventListener('DOMContentLoaded', function() {
    initializeWalletSystem();
    setupPaymentHandlers();
    setupDonationHandlers();
    setupSplitFareHandlers();
    setupTransferHandler();
    setupWithdrawalHandlers();
    renderPaymentMethodOptions();
    renderWithdrawalMethodOptions();
    loadTransactions();
    renderWithdrawalRequestHistory();
});

/**
 * Initialize wallet system
 */
function initializeWalletSystem() {
    console.log('Wallet system initialized');

    const ownerId = getCustomerWalletOwnerId();

    if (window.WalletCore) {
        WalletCore.getWallet('customer', ownerId);
        WalletCore.getWallet('donation', 'pool');
    }

    syncLegacyWalletSnapshot();

    // Update UI
    updateWalletUI();
}

/**
 * Update wallet UI
 */
function updateWalletUI() {
    const wallet = getWalletSnapshot();

    document.getElementById('paymentBalance').textContent = wallet.payment.toFixed(0);
    document.getElementById('donationBalance').textContent = wallet.donation.toFixed(0);
}

/**
 * Setup payment handlers
 */
function setupPaymentHandlers() {
    // Proceed payment button
    const proceedBtn = document.getElementById('proceedPayment');
    
    if (proceedBtn) {
        proceedBtn.addEventListener('click', handleAddMoney);
    }
    
    // Amount button handlers are set up in customer-portal.js
}

/**
 * Handle add money
 */
function handleAddMoney() {
    const customAmount = document.getElementById('customAmount').value;
    const amount = parseInt(customAmount, 10);

    if (!amount || amount < 10) {
        CustomerPortal.showToast('Please enter valid amount (minimum Rs 10)', 'error');
        return;
    }

    const paymentMethod = getSelectedPaymentMethod();
    if (!paymentMethod) {
        CustomerPortal.showToast('Please select payment method', 'error');
        return;
    }
    const walletType = document.getElementById('addMoneyModal').getAttribute('data-wallet-type');

    CustomerPortal.showLoading();

    // Simulate gateway processing
    setTimeout(() => {
        try {
            if (window.WalletCore) {
                const ownerId = getCustomerWalletOwnerId();

                if (walletType === 'payment') {
                    WalletCore.credit({
                        type: 'customer',
                        ownerId,
                        amount,
                        description: 'Wallet top-up via ' + paymentMethod,
                        actorRole: 'customer',
                        paymentMode: paymentMethod
                    });
                } else if (walletType === 'donation') {
                    WalletCore.credit({
                        type: 'donation',
                        ownerId: 'pool',
                        amount,
                        description: 'Donation pool funding via ' + paymentMethod,
                        actorRole: 'customer',
                        paymentMode: paymentMethod
                    });
                }
                if (typeof WalletCore.settlePaymentToAdmin === 'function') {
                    WalletCore.settlePaymentToAdmin({
                        amount,
                        sourceType: walletType === 'payment' ? 'customer' : 'donation',
                        sourceOwnerId: walletType === 'payment' ? ownerId : 'pool',
                        paymentMode: paymentMethod,
                        description: 'Auto settlement for ' + walletType + ' top-up',
                        actorId: ownerId
                    });
                }

                syncLegacyWalletSnapshot();
            } else {
                const wallet = JSON.parse(localStorage.getItem(CUSTOMER_WALLET_KEY) || '{"payment": 0, "donation": 0}');
                if (walletType === 'payment') {
                    wallet.payment = (wallet.payment || 0) + amount;
                } else if (walletType === 'donation') {
                    wallet.donation = (wallet.donation || 0) + amount;
                }
                localStorage.setItem(CUSTOMER_WALLET_KEY, JSON.stringify(wallet));
            }

            addTransaction({
                type: 'added',
                amount,
                description: 'Added to ' + walletType + ' wallet via ' + paymentMethod,
                date: new Date().toLocaleDateString()
            });

            updateWalletUI();
            CustomerPortal.hideLoading();
            CustomerPortal.closeModal('addMoneyModal');
            CustomerPortal.showToast('Rs ' + amount + ' added successfully!', 'success');

            document.getElementById('customAmount').value = '';
            document.querySelectorAll('.amount-btn').forEach(btn => btn.classList.remove('active'));
        } catch (error) {
            CustomerPortal.hideLoading();
            CustomerPortal.showToast(error.message || 'Wallet update failed', 'error');
        }
    }, 1200);
}
/**
 * Add transaction
 */
function addTransaction(transaction) {
    const transactions = JSON.parse(localStorage.getItem(CUSTOMER_TX_KEY) || '[]');
    transactions.unshift(transaction); // Add to beginning
    
    // Keep only last 50 transactions
    if (transactions.length > 50) {
        transactions.splice(50);
    }
    
    localStorage.setItem(CUSTOMER_TX_KEY, JSON.stringify(transactions));
    
    // Reload transactions in UI if on wallet page
    if (document.getElementById('transactionList')) {
        loadTransactions();
    }
}

/**
 * Load transactions
 */
function loadTransactions() {
    const transactions = JSON.parse(localStorage.getItem(CUSTOMER_TX_KEY) || '[]');
    const transactionList = document.getElementById('transactionList');
    
    if (!transactionList) return;
    
    if (transactions.length === 0) {
        transactionList.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">No transactions yet</p>';
        return;
    }
    
    transactionList.innerHTML = transactions.slice(0, 20).map(txn => `
        <div class="transaction-item">
            <div>
                <i class="fas ${getTransactionIcon(txn.type)}"></i>
                <div>
                    <strong>${txn.description}</strong><br>
                    <small style="color: var(--text-light);">${txn.date}</small>
                </div>
            </div>
            <div style="font-weight: bold; ${txn.amount > 0 ? 'color: #06A77D' : 'color: #E63946'}">
                ${txn.amount > 0 ? '+' : ''}₹${Math.abs(txn.amount)}
            </div>
        </div>
    `).join('');
}

/**
 * Get transaction icon
 */
function getTransactionIcon(type) {
    const icons = {
        'ride': 'fa-car',
        'added': 'fa-plus-circle',
        'cashback': 'fa-gift',
        'donation': 'fa-hands-helping',
        'transfer': 'fa-exchange-alt',
        'refund': 'fa-undo'
    };
    return icons[type] || 'fa-circle';
}

/**
 * Setup donation handlers
 */
function setupDonationHandlers() {
    const proceedBtn = document.getElementById('proceedDonation');
    
    if (proceedBtn) {
        proceedBtn.addEventListener('click', handleDonation);
    }
}

/**
 * Handle donation
 */
function handleDonation() {
    const amount = parseInt(document.getElementById('donationAmount').value, 10);
    const destination = document.getElementById('donationDestination');
    const destinationName = destination.options[destination.selectedIndex].text;

    if (!amount || amount < 10) {
        CustomerPortal.showToast('Please enter valid amount (minimum Rs 10)', 'error');
        return;
    }

    const wallet = getWalletSnapshot();

    if (wallet.payment < amount) {
        CustomerPortal.showToast('Insufficient customer wallet balance. Please add money first.', 'error');
        return;
    }

    CustomerPortal.showLoading();

    setTimeout(() => {
        try {
            if (window.WalletCore) {
                const ownerId = getCustomerWalletOwnerId();

                WalletCore.transfer({
                    fromType: 'customer',
                    fromOwnerId: ownerId,
                    toType: 'donation',
                    toOwnerId: 'pool',
                    amount,
                    description: 'Donation to ' + destinationName,
                    actorRole: 'customer'
                });

                syncLegacyWalletSnapshot();
            } else {
                const legacy = JSON.parse(localStorage.getItem(CUSTOMER_WALLET_KEY) || '{"payment": 0, "donation": 0}');
                legacy.payment -= amount;
                legacy.donation += amount;
                localStorage.setItem(CUSTOMER_WALLET_KEY, JSON.stringify(legacy));
            }

            addTransaction({
                type: 'donation',
                amount: -amount,
                description: 'Donated to ' + destinationName,
                date: new Date().toLocaleDateString()
            });

            saveDonationRecord({
                amount,
                destination: destinationName,
                date: new Date().toISOString(),
                receiptId: 'DON' + Date.now()
            });

            updateWalletUI();
            CustomerPortal.hideLoading();
            CustomerPortal.closeModal('donationModal');
            showDonationSuccess(amount, destinationName);
            document.getElementById('donationAmount').value = '';
        } catch (error) {
            CustomerPortal.hideLoading();
            CustomerPortal.showToast(error.message || 'Donation failed', 'error');
        }
    }, 1200);
}
/**
 * Save donation record
 */
function saveDonationRecord(donation) {
    const donations = JSON.parse(localStorage.getItem('goindiaride_donations') || '[]');
    donations.unshift(donation);
    localStorage.setItem('goindiaride_donations', JSON.stringify(donations));
}

/**
 * Show donation success
 */
function showDonationSuccess(amount, destination) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <div style="text-align: center;">
                <i class="fas fa-check-circle" style="font-size: 4rem; color: #06A77D; margin-bottom: 1rem;"></i>
                <h2>Donation Successful!</h2>
                <p style="font-size: 1.5rem; font-weight: bold; margin: 1rem 0;">₹${amount}</p>
                <p>donated to ${destination}</p>
                <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin: 1.5rem 0;">
                    <small><i class="fas fa-info-circle"></i> Tax deduction certificate will be sent to your registered email within 24 hours.</small>
                </div>
                <button class="btn-primary" onclick="this.closest('.modal').remove()">Done</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Setup split fare handlers
 */
function setupSplitFareHandlers() {
    // Calculate per person fare on input change
    const totalFareInput = document.getElementById('totalFare');
    const numberOfPeopleInput = document.getElementById('numberOfPeople');
    
    if (totalFareInput && numberOfPeopleInput) {
        [totalFareInput, numberOfPeopleInput].forEach(input => {
            input.addEventListener('input', calculateSplitFare);
        });
    }
    
    // Invite via WhatsApp
    const inviteBtn = document.getElementById('inviteWhatsApp');
    if (inviteBtn) {
        inviteBtn.addEventListener('click', sendSplitFareInvite);
    }
}

/**
 * Calculate split fare
 */
function calculateSplitFare() {
    const totalFare = parseFloat(document.getElementById('totalFare').value) || 0;
    const numberOfPeople = parseInt(document.getElementById('numberOfPeople').value) || 2;
    
    if (totalFare <= 0 || numberOfPeople < 2) {
        document.getElementById('perPersonFare').innerHTML = '';
        return;
    }
    
    const perPerson = totalFare / numberOfPeople;
    
    document.getElementById('perPersonFare').innerHTML = `
        <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; text-align: center; margin: 1rem 0;">
            <h3 style="margin-bottom: 0.5rem;">Per Person</h3>
            <p style="font-size: 2rem; font-weight: bold; color: var(--primary-color);">
                ₹${perPerson.toFixed(2)}
            </p>
            <small style="color: var(--text-light);">Total: ₹${totalFare} ÷ ${numberOfPeople} people</small>
        </div>
    `;
}

/**
 * Send split fare invite
 */
function sendSplitFareInvite() {
    const totalFare = parseFloat(document.getElementById('totalFare').value) || 0;
    const numberOfPeople = parseInt(document.getElementById('numberOfPeople').value) || 2;
    
    if (totalFare <= 0 || numberOfPeople < 2) {
        CustomerPortal.showToast('Please enter valid fare and number of people', 'error');
        return;
    }
    
    const perPerson = (totalFare / numberOfPeople).toFixed(2);
    const splitId = 'SPLIT' + Date.now();
    
    const message = `
🚗 Split Fare Request - GO India RIDE

Total Fare: ₹${totalFare}
Your Share: ₹${perPerson}

Pay now: https://goindiaride.com/split/${splitId}

Quick, easy & secure payment!
    `.trim();
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    
    CustomerPortal.showToast('Split fare invite sent!', 'success');
}

/**
 * Setup transfer handler
 */
function setupTransferHandler() {
    const transferBtn = document.getElementById('transferWalletBtn');
    
    if (transferBtn) {
        transferBtn.addEventListener('click', showTransferModal);
    }
}

/**
 * Show transfer modal
 */
function showTransferModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Transfer Between Wallets</h2>
            <div class="form-group">
                <label>From Wallet</label>
                <select id="fromWallet">
                    <option value="payment">Payment Wallet</option>
                    <option value="donation">Donation Wallet</option>
                </select>
            </div>
            <div class="form-group">
                <label>To Wallet</label>
                <select id="toWallet">
                    <option value="donation">Donation Wallet</option>
                    <option value="payment">Payment Wallet</option>
                </select>
            </div>
            <div class="form-group">
                <label>Amount</label>
                <input type="number" id="transferAmount" placeholder="Enter amount">
            </div>
            <button class="btn-primary" id="proceedTransfer">Transfer</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Setup close
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    // Update "To Wallet" when "From Wallet" changes
    const fromWallet = modal.querySelector('#fromWallet');
    const toWallet = modal.querySelector('#toWallet');
    
    fromWallet.addEventListener('change', function() {
        toWallet.value = this.value === 'payment' ? 'donation' : 'payment';
    });
    
    // Setup transfer button
    modal.querySelector('#proceedTransfer').addEventListener('click', function() {
        const from = fromWallet.value;
        const to = toWallet.value;
        const amount = parseFloat(document.getElementById('transferAmount').value);
        
        if (!amount || amount <= 0) {
            CustomerPortal.showToast('Please enter valid amount', 'error');
            return;
        }
        
        const wallet = JSON.parse(localStorage.getItem(CUSTOMER_WALLET_KEY) || '{"payment": 0, "donation": 0}');
        
        if (wallet[from] < amount) {
            CustomerPortal.showToast(`Insufficient balance in ${from} wallet`, 'error');
            return;
        }
        
        CustomerPortal.showLoading();
        
        setTimeout(() => {
            // Transfer amount
            wallet[from] -= amount;
            wallet[to] += amount;
            
            localStorage.setItem(CUSTOMER_WALLET_KEY, JSON.stringify(wallet));
            
            // Add transaction
            addTransaction({
                type: 'transfer',
                amount: 0,
                description: `Transferred ₹${amount} from ${from} to ${to} wallet`,
                date: new Date().toLocaleDateString()
            });
            
            // Update UI
            updateWalletUI();
            
            CustomerPortal.hideLoading();
            modal.remove();
            CustomerPortal.showToast('Transfer successful!', 'success');
        }, 1500);
    });
}

/**
 * Setup rewards button
 */
document.getElementById('rewardsBtn')?.addEventListener('click', showRewardsModal);

/**
 * Show rewards modal
 */
function showRewardsModal() {
    const rewards = JSON.parse(localStorage.getItem('goindiaride_rewards') || '{"points": 0, "cashback": 0}');
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Cashback & Rewards</h2>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin: 1.5rem 0;">
                <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; text-align: center;">
                    <i class="fas fa-coins" style="font-size: 2rem; color: var(--accent-color);"></i>
                    <p style="font-size: 2rem; font-weight: bold; margin: 0.5rem 0;">${rewards.points}</p>
                    <small>Reward Points</small>
                </div>
                <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; text-align: center;">
                    <i class="fas fa-rupee-sign" style="font-size: 2rem; color: var(--success-color);"></i>
                    <p style="font-size: 2rem; font-weight: bold; margin: 0.5rem 0;">₹${rewards.cashback}</p>
                    <small>Cashback Earned</small>
                </div>
            </div>
            
            <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <h4>How to Earn More?</h4>
                <ul style="margin: 0.5rem 0 0 1.5rem; color: var(--text-light);">
                    <li>Complete rides - Earn 10 points per ride</li>
                    <li>Refer friends - Earn 100 points + ₹50 cashback</li>
                    <li>Write reviews - Earn 5 points per review</li>
                    <li>Book during peak hours - Get 2% cashback</li>
                </ul>
            </div>
            
            <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <h4>Redeem Points</h4>
                <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">
                    100 points = ₹10 discount on your next ride
                </p>
                <button class="btn-primary" onclick="redeemPoints()" ${rewards.points < 100 ? 'disabled' : ''}>
                    Redeem ${Math.floor(rewards.points / 100) * 100} Points
                </button>
            </div>
            
            <button class="btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Redeem points
 */
function redeemPoints() {
    const rewards = JSON.parse(localStorage.getItem('goindiaride_rewards') || '{"points": 0, "cashback": 0}');
    
    if (rewards.points < 100) {
        CustomerPortal.showToast('You need at least 100 points to redeem', 'error');
        return;
    }
    
    const pointsToRedeem = Math.floor(rewards.points / 100) * 100;
    const cashbackAmount = pointsToRedeem / 10; // 100 points = ₹10
    
    CustomerPortal.showLoading();
    
    setTimeout(() => {
        // Deduct points
        rewards.points -= pointsToRedeem;
        
        // Add cashback to wallet
        const wallet = JSON.parse(localStorage.getItem(CUSTOMER_WALLET_KEY) || '{"payment": 0, "donation": 0}');
        wallet.payment += cashbackAmount;
        
        localStorage.setItem(CUSTOMER_WALLET_KEY, JSON.stringify(wallet));
        localStorage.setItem('goindiaride_rewards', JSON.stringify(rewards));
        
        // Add transaction
        addTransaction({
            type: 'cashback',
            amount: cashbackAmount,
            description: `Redeemed ${pointsToRedeem} points`,
            date: new Date().toLocaleDateString()
        });
        
        // Update UI
        updateWalletUI();
        
        CustomerPortal.hideLoading();
        
        // Close modal
        document.querySelectorAll('.modal').forEach(m => m.remove());
        
        CustomerPortal.showToast(`₹${cashbackAmount} added to your wallet!`, 'success');
    }, 1500);
}

// Export functions
window.WalletSystem = {
    updateWalletUI,
    addTransaction,
    redeemPoints,
    renderWithdrawalRequestHistory
};




function setupWithdrawalHandlers() {
    const withdrawBtn = document.getElementById('withdrawWalletBtn');
    if (withdrawBtn) {
        withdrawBtn.addEventListener('click', () => {
            CustomerPortal.openModal('withdrawModal');
        });
    }

    const requestBtn = document.getElementById('requestWithdrawalBtn');
    if (requestBtn) {
        requestBtn.addEventListener('click', handleWithdrawalRequest);
    }
}

function handleWithdrawalRequest() {
    const now = Date.now();
    if (now - lastWithdrawRequestAt < CUSTOMER_WITHDRAW_COOLDOWN_MS) {
        CustomerPortal.showToast('Please wait before sending another withdrawal request', 'error');
        return;
    }

    const amount = Number.parseFloat(document.getElementById('withdrawAmount')?.value || 0);
    const method = String(document.getElementById('withdrawMethod')?.value || '').trim();
    const destination = sanitizeField(document.getElementById('withdrawDestination')?.value || '', 160);
    const notes = sanitizeField(document.getElementById('withdrawNotes')?.value || '', 240);

    if (!Number.isFinite(amount) || amount < CUSTOMER_WITHDRAW_MIN || amount > CUSTOMER_WITHDRAW_MAX) {
        CustomerPortal.showToast(`Withdrawal amount must be between Rs ${CUSTOMER_WITHDRAW_MIN} and Rs ${CUSTOMER_WITHDRAW_MAX}`, 'error');
        return;
    }

    if (!method) {
        CustomerPortal.showToast('Please select withdrawal method', 'error');
        return;
    }

    if (!destination || destination.length < 4) {
        CustomerPortal.showToast('Please enter valid payout destination details', 'error');
        return;
    }

    const wallet = getWalletSnapshot();
    if (wallet.payment < amount) {
        CustomerPortal.showToast('Insufficient wallet balance', 'error');
        return;
    }

    CustomerPortal.showLoading();

    setTimeout(() => {
        try {
            const ownerId = getCustomerWalletOwnerId();
            let request;

            if (window.WalletCore && typeof WalletCore.createWithdrawalRequest === 'function') {
                request = WalletCore.createWithdrawalRequest({
                    walletType: 'customer',
                    ownerId,
                    amount,
                    method,
                    destination,
                    notes,
                    actorRole: 'customer',
                    actorId: ownerId,
                    metadata: {
                        source: 'customer_portal',
                        userAgent: navigator.userAgent,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    }
                });
            } else {
                request = {
                    id: 'WDR_' + Date.now(),
                    walletType: 'customer',
                    ownerId,
                    amount,
                    method,
                    destination,
                    notes,
                    status: 'pending_admin_approval',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const rows = readFallbackWithdrawalRequests();
                rows.unshift(request);
                writeFallbackWithdrawalRequests(rows);
            }

            addTransaction({
                type: 'withdraw_request',
                amount: 0,
                description: 'Withdrawal request submitted (' + method + ')',
                date: new Date().toLocaleString(),
                requestId: request.id
            });

            lastWithdrawRequestAt = now;
            renderWithdrawalRequestHistory();
            CustomerPortal.hideLoading();
            CustomerPortal.closeModal('withdrawModal');
            CustomerPortal.showToast('Withdrawal request submitted. Awaiting admin approval.', 'success');

            document.getElementById('withdrawAmount').value = '';
            document.getElementById('withdrawDestination').value = '';
            document.getElementById('withdrawNotes').value = '';
        } catch (error) {
            CustomerPortal.hideLoading();
            CustomerPortal.showToast(error.message || 'Withdrawal request failed', 'error');
        }
    }, 900);
}

function renderWithdrawalRequestHistory() {
    const container = document.getElementById('withdrawalRequestList');
    if (!container) return;

    const ownerId = getCustomerWalletOwnerId();
    let rows = [];

    if (window.WalletCore && typeof WalletCore.getWithdrawalRequests === 'function') {
        rows = WalletCore.getWithdrawalRequests({ walletType: 'customer', ownerId });
    } else {
        rows = readFallbackWithdrawalRequests().filter((row) => String(row.ownerId) === String(ownerId));
    }

    if (!rows.length) {
        container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 1rem;">No withdrawal requests yet.</p>';
        return;
    }

    container.innerHTML = rows.slice(0, 12).map((row) => {
        const status = String(row.status || 'pending_admin_approval');
        const statusColor = status === 'approved' ? '#06A77D' : status === 'rejected' ? '#E63946' : '#F77F00';
        const methodLabel = row.methodLabel || row.method || '-';

        return `
            <div class="transaction-item" style="align-items:flex-start;">
                <div>
                    <strong>Request ${row.id || '-'}</strong><br>
                    <small style="color: var(--text-light);">${new Date(row.createdAt).toLocaleString()}</small><br>
                    <small style="color: var(--text-light);">${methodLabel} - ${maskDestination(row.destination || '-')}</small>
                    ${row.remarks ? `<br><small style="color:#5f6b7a;">Admin Note: ${row.remarks}</small>` : ''}
                </div>
                <div style="text-align:right; min-width:120px;">
                    <strong>Rs ${Number(row.amount || 0).toFixed(2)}</strong><br>
                    <small style="font-weight:700; color:${statusColor}; text-transform:uppercase;">${status.replaceAll('_', ' ')}</small>
                </div>
            </div>
        `;
    }).join('');
}

function renderPaymentMethodOptions() {
    const container = document.getElementById('walletPaymentMethods');
    if (!container) return;

    const modes = getEnabledPaymentModes('add_money');
    if (!modes.length) {
        container.innerHTML = '<p style="color: var(--text-light);">No payment method is enabled by admin.</p>';
        return;
    }

    container.innerHTML = modes.map((mode, index) => {
        const checked = index === 0 ? 'checked' : '';
        return `
            <label class="radio-label">
                <input type="radio" name="paymentMethod" value="${mode.id}" ${checked}>
                <span>${mode.label} <small style="color: var(--text-light);">(${mode.regionLabel})</small></span>
            </label>
        `;
    }).join('');
}

function renderWithdrawalMethodOptions() {
    const select = document.getElementById('withdrawMethod');
    if (!select) return;

    const modes = getEnabledPaymentModes('withdrawal');
    if (!modes.length) {
        select.innerHTML = '<option value="">No withdrawal method enabled</option>';
        return;
    }

    select.innerHTML = modes.map((mode) => `<option value="${mode.id}">${mode.label} (${mode.regionLabel})</option>`).join('');
}

function getEnabledPaymentModes(flow) {
    const fallback = [
        { id: 'upi', label: 'UPI', regionLabel: 'India' },
        { id: 'upi_qr', label: 'UPI QR Scan', regionLabel: 'India' },
        { id: 'debit_card', label: 'Debit/Credit Card', regionLabel: 'India' },
        { id: 'netbanking', label: 'Net Banking', regionLabel: 'India' },
        { id: 'paypal', label: 'PayPal', regionLabel: 'International' },
        { id: 'stripe_cards', label: 'Stripe Cards', regionLabel: 'International' },
        { id: 'swift_wire', label: 'SWIFT Wire', regionLabel: 'International' }
    ];

    if (!window.WalletCore || typeof WalletCore.getEnabledPaymentModes !== 'function') {
        return fallback;
    }

    return WalletCore.getEnabledPaymentModes({ flow }).map((mode) => ({
        id: String(mode.id || ''),
        label: String(mode.label || mode.id || 'Payment Mode'),
        regionLabel: mode.region === 'india' ? 'India' : mode.region === 'international' ? 'International' : 'Global'
    }));
}

function getSelectedPaymentMethod() {
    const checked = document.querySelector('input[name="paymentMethod"]:checked');
    return checked ? String(checked.value) : '';
}

function getCustomerWalletOwnerId() {
    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        if (currentUser && (currentUser.id || currentUser.userId)) {
            return String(currentUser.id || currentUser.userId);
        }

        const legacyUser = JSON.parse(localStorage.getItem('goindiaride_user') || '{}');
        if (legacyUser && legacyUser.id) {
            return String(legacyUser.id);
        }

        if (legacyUser && legacyUser.phone) {
            return 'customer_' + String(legacyUser.phone).replace(/\D/g, '');
        }

        if (legacyUser && legacyUser.email) {
            return 'customer_' + String(legacyUser.email).toLowerCase();
        }
    } catch (error) {
        // ignore and fallback
    }

    return 'customer_default';
}

function getWalletSnapshot() {
    if (window.WalletCore) {
        const ownerId = getCustomerWalletOwnerId();
        const customerWallet = WalletCore.getWallet('customer', ownerId);
        const donationWallet = WalletCore.getWallet('donation', 'pool');

        return {
            payment: Number(customerWallet.balance || 0),
            donation: Number(donationWallet.balance || 0)
        };
    }

    const wallet = JSON.parse(localStorage.getItem(CUSTOMER_WALLET_KEY) || '{"payment":0,"donation":0}');
    return {
        payment: Number(wallet.payment || 0),
        donation: Number(wallet.donation || 0)
    };
}

function syncLegacyWalletSnapshot() {
    const wallet = getWalletSnapshot();
    localStorage.setItem(CUSTOMER_WALLET_KEY, JSON.stringify(wallet));
}

function sanitizeField(value, maxLen) {
    return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLen);
}

function maskDestination(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    if (text.length <= 6) return '***' + text.slice(-2);
    return text.slice(0, 2) + '***' + text.slice(-3);
}

function readFallbackWithdrawalRequests() {
    const rows = JSON.parse(localStorage.getItem(CUSTOMER_WITHDRAW_FALLBACK_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
}

function writeFallbackWithdrawalRequests(rows) {
    localStorage.setItem(CUSTOMER_WITHDRAW_FALLBACK_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
}


