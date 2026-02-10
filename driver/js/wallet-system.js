// Digital Wallet System
// Wallet transaction types
const TRANSACTION_TYPES = {
    EARNING: 'earning',
    ADD_MONEY: 'add_money',
    WITHDRAWAL: 'withdrawal',
    DEPOSIT: 'deposit',
    REFUND: 'refund',
    BONUS: 'bonus',
    DEDUCTION: 'deduction'
};

// Open Wallet Modal
function openWallet() {
    const modal = createModal('Digital Wallet', getWalletContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Wallet Content
function getWalletContent() {
    const walletData = JSON.parse(localStorage.getItem('wallet_data') || '{"balance": 0, "transactions": []}');
    
    let html = '<div class="wallet-container">';
    
    // Wallet Balance
    html += `
        <div class="wallet-balance-card">
            <div class="balance-icon">
                <i class="fas fa-wallet"></i>
            </div>
            <div class="balance-info">
                <p class="balance-label">Available Balance</p>
                <h1 class="balance-amount">₹${walletData.balance.toFixed(2)}</h1>
            </div>
        </div>
    `;
    
    // Quick Actions
    html += `
        <div class="wallet-actions">
            <button class="wallet-action-btn" onclick="openAddMoney()">
                <i class="fas fa-plus-circle"></i>
                <span>Add Money</span>
            </button>
            <button class="wallet-action-btn" onclick="openWithdraw()">
                <i class="fas fa-arrow-up"></i>
                <span>Withdraw</span>
            </button>
            <button class="wallet-action-btn" onclick="openTransactions()">
                <i class="fas fa-list"></i>
                <span>History</span>
            </button>
        </div>
    `;
    
    // Recent Transactions
    html += '<div class="recent-transactions">';
    html += '<h3><i class="fas fa-history"></i> Recent Transactions</h3>';
    
    if (walletData.transactions && walletData.transactions.length > 0) {
        html += '<div class="transactions-list">';
        walletData.transactions.slice(0, 5).forEach(txn => {
            const isCredit = ['earning', 'add_money', 'refund', 'bonus'].includes(txn.type);
            html += `
                <div class="transaction-item">
                    <div class="txn-icon ${isCredit ? 'credit' : 'debit'}">
                        <i class="fas ${getTransactionIcon(txn.type)}"></i>
                    </div>
                    <div class="txn-details">
                        <p class="txn-title">${txn.description || getTransactionTitle(txn.type)}</p>
                        <p class="txn-date">${new Date(txn.timestamp).toLocaleString()}</p>
                    </div>
                    <div class="txn-amount ${isCredit ? 'credit' : 'debit'}">
                        ${isCredit ? '+' : '-'}₹${Math.abs(txn.amount).toFixed(2)}
                    </div>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += '<p class="empty-state">No transactions yet</p>';
    }
    
    html += '</div>';
    html += '</div>';
    
    return html;
}

// Get Transaction Icon
function getTransactionIcon(type) {
    const icons = {
        earning: 'fa-route',
        add_money: 'fa-plus',
        withdrawal: 'fa-arrow-up',
        deposit: 'fa-shield',
        refund: 'fa-undo',
        bonus: 'fa-gift',
        deduction: 'fa-minus'
    };
    return icons[type] || 'fa-exchange-alt';
}

// Get Transaction Title
function getTransactionTitle(type) {
    const titles = {
        earning: 'Trip Earning',
        add_money: 'Money Added',
        withdrawal: 'Withdrawal',
        deposit: 'Security Deposit',
        refund: 'Refund',
        bonus: 'Bonus/Incentive',
        deduction: 'Deduction'
    };
    return titles[type] || 'Transaction';
}

// Open Add Money
function openAddMoney() {
    const modal = createModal('Add Money to Wallet', getAddMoneyContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Add Money Content
function getAddMoneyContent() {
    return `
        <form id="addMoneyForm" onsubmit="processAddMoney(event)">
            <div class="form-group">
                <label class="form-label">Amount</label>
                <input type="number" name="amount" class="form-input" placeholder="Enter amount" 
                    min="100" max="50000" step="1" required>
            </div>
            
            <div class="quick-amounts">
                <button type="button" class="quick-amount-btn" onclick="setAmount(500)">₹500</button>
                <button type="button" class="quick-amount-btn" onclick="setAmount(1000)">₹1000</button>
                <button type="button" class="quick-amount-btn" onclick="setAmount(2000)">₹2000</button>
                <button type="button" class="quick-amount-btn" onclick="setAmount(5000)">₹5000</button>
            </div>
            
            <div class="form-group">
                <label class="form-label">Payment Method</label>
                <select name="paymentMethod" class="form-select" required>
                    <option value="">Select payment method</option>
                    <option value="upi">UPI</option>
                    <option value="card">Credit/Debit Card</option>
                    <option value="netbanking">Net Banking</option>
                </select>
            </div>
            
            <button type="submit" class="btn-primary">
                <i class="fas fa-lock"></i> Proceed to Payment
            </button>
        </form>
    `;
}

// Set Quick Amount
function setAmount(amount) {
    const input = document.querySelector('input[name="amount"]');
    if (input) {
        input.value = amount;
    }
}

// Process Add Money
function processAddMoney(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const amount = parseFloat(formData.get('amount'));
    const paymentMethod = formData.get('paymentMethod');
    
    // Simulate payment processing
    showToast('Processing payment...', 'info');
    
    setTimeout(() => {
        // Add money to wallet
        addTransaction(TRANSACTION_TYPES.ADD_MONEY, amount, `Added via ${paymentMethod.toUpperCase()}`);
        
        showToast(`₹${amount} added to wallet successfully!`, 'success');
        
        closeAllModals();
        
        // Update UI
        updateWalletBalance();
        
        // Reopen wallet to show updated balance
        setTimeout(() => openWallet(), 300);
    }, 2000);
}

// Open Withdraw
function openWithdraw() {
    const modal = createModal('Withdraw to Bank', getWithdrawContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Withdraw Content
function getWithdrawContent() {
    const walletData = JSON.parse(localStorage.getItem('wallet_data') || '{"balance": 0}');
    
    return `
        <div class="available-balance">
            <p>Available Balance</p>
            <h2>₹${walletData.balance.toFixed(2)}</h2>
        </div>
        
        <form id="withdrawForm" onsubmit="processWithdraw(event)">
            <div class="form-group">
                <label class="form-label">Withdrawal Amount</label>
                <input type="number" name="amount" class="form-input" placeholder="Enter amount" 
                    min="100" max="${walletData.balance}" step="1" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">Bank Account Number</label>
                <input type="text" name="accountNumber" class="form-input" 
                    placeholder="Enter account number" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">IFSC Code</label>
                <input type="text" name="ifscCode" class="form-input" 
                    placeholder="Enter IFSC code" required>
            </div>
            
            <div class="form-group">
                <label class="form-label">Account Holder Name</label>
                <input type="text" name="accountHolder" class="form-input" 
                    placeholder="Enter account holder name" required>
            </div>
            
            <p class="info-text">
                <i class="fas fa-info-circle"></i>
                Withdrawal will be processed within 1-2 business days
            </p>
            
            <button type="submit" class="btn-primary">Request Withdrawal</button>
        </form>
    `;
}

// Process Withdraw
function processWithdraw(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const amount = parseFloat(formData.get('amount'));
    const walletData = JSON.parse(localStorage.getItem('wallet_data') || '{"balance": 0}');
    
    if (amount > walletData.balance) {
        showToast('Insufficient balance!', 'error');
        return;
    }
    
    // Process withdrawal
    addTransaction(TRANSACTION_TYPES.WITHDRAWAL, -amount, 'Withdrawal to bank account');
    
    showToast('Withdrawal request submitted successfully!', 'success');
    
    closeAllModals();
    updateWalletBalance();
    
    setTimeout(() => openWallet(), 300);
}

// Open Transactions
function openTransactions() {
    const modal = createModal('Transaction History', getTransactionsContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Transactions Content
function getTransactionsContent() {
    const walletData = JSON.parse(localStorage.getItem('wallet_data') || '{"transactions": []}');
    
    let html = '<div class="transactions-container">';
    
    if (walletData.transactions && walletData.transactions.length > 0) {
        // Filter options
        html += `
            <div class="filter-options">
                <select id="txnFilter" class="form-select" onchange="filterTransactions()">
                    <option value="all">All Transactions</option>
                    <option value="credit">Credits Only</option>
                    <option value="debit">Debits Only</option>
                </select>
            </div>
        `;
        
        html += '<div class="transactions-list" id="transactionsList">';
        
        walletData.transactions.forEach(txn => {
            const isCredit = ['earning', 'add_money', 'refund', 'bonus'].includes(txn.type);
            html += `
                <div class="transaction-item" data-type="${isCredit ? 'credit' : 'debit'}">
                    <div class="txn-icon ${isCredit ? 'credit' : 'debit'}">
                        <i class="fas ${getTransactionIcon(txn.type)}"></i>
                    </div>
                    <div class="txn-details">
                        <p class="txn-title">${txn.description || getTransactionTitle(txn.type)}</p>
                        <p class="txn-date">${new Date(txn.timestamp).toLocaleString()}</p>
                        ${txn.referenceId ? `<p class="txn-ref">Ref: ${txn.referenceId}</p>` : ''}
                    </div>
                    <div class="txn-amount ${isCredit ? 'credit' : 'debit'}">
                        ${isCredit ? '+' : '-'}₹${Math.abs(txn.amount).toFixed(2)}
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // Download button
        html += `
            <button class="btn-secondary" onclick="downloadTransactionHistory()">
                <i class="fas fa-download"></i> Download Statement
            </button>
        `;
    } else {
        html += '<p class="empty-state">No transactions yet</p>';
    }
    
    html += '</div>';
    
    return html;
}

// Filter Transactions
function filterTransactions() {
    const filter = document.getElementById('txnFilter').value;
    const items = document.querySelectorAll('.transaction-item');
    
    items.forEach(item => {
        if (filter === 'all') {
            item.style.display = 'flex';
        } else {
            item.style.display = item.dataset.type === filter ? 'flex' : 'none';
        }
    });
}

// Download Transaction History
function downloadTransactionHistory() {
    const walletData = JSON.parse(localStorage.getItem('wallet_data') || '{"transactions": []}');
    
    let csv = 'Date,Type,Description,Amount,Balance\n';
    
    walletData.transactions.forEach(txn => {
        csv += `${new Date(txn.timestamp).toLocaleString()},`;
        csv += `${txn.type},`;
        csv += `${txn.description || ''},`;
        csv += `${txn.amount},`;
        csv += `${txn.balanceAfter || ''}\n`;
    });
    
    // Create download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-statement-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('Transaction history downloaded!', 'success');
}

// Add Transaction
function addTransaction(type, amount, description, referenceId = null) {
    const walletData = JSON.parse(localStorage.getItem('wallet_data') || '{"balance": 0, "transactions": []}');
    
    // Update balance
    walletData.balance += amount;
    
    // Add transaction
    const transaction = {
        id: Date.now(),
        type: type,
        amount: amount,
        description: description,
        timestamp: Date.now(),
        balanceAfter: walletData.balance
    };
    
    if (referenceId) {
        transaction.referenceId = referenceId;
    }
    
    if (!walletData.transactions) {
        walletData.transactions = [];
    }
    
    walletData.transactions.unshift(transaction);
    
    // Keep last 100 transactions
    if (walletData.transactions.length > 100) {
        walletData.transactions = walletData.transactions.slice(0, 100);
    }
    
    localStorage.setItem('wallet_data', JSON.stringify(walletData));
    
    return transaction;
}

// Open Earnings Dashboard
function openEarnings() {
    const modal = createModal('Earnings Dashboard', getEarningsContent());
    document.getElementById('modalsContainer').appendChild(modal);
    
    // Update nav
    updateBottomNav(1);
}

// Get Earnings Content
function getEarningsContent() {
    const earningsData = calculateEarnings();
    
    let html = '<div class="earnings-container">';
    
    // Period selector
    html += `
        <div class="period-selector">
            <button class="period-btn active" onclick="switchPeriod('today')">Today</button>
            <button class="period-btn" onclick="switchPeriod('week')">Week</button>
            <button class="period-btn" onclick="switchPeriod('month')">Month</button>
        </div>
    `;
    
    // Earnings summary
    html += `
        <div class="earnings-summary" id="earningsSummary">
            <div class="earning-card">
                <i class="fas fa-rupee-sign"></i>
                <div>
                    <p class="earning-label">Total Earnings</p>
                    <h2 class="earning-value">₹${earningsData.total.toFixed(2)}</h2>
                </div>
            </div>
            
            <div class="earning-card">
                <i class="fas fa-route"></i>
                <div>
                    <p class="earning-label">Total Trips</p>
                    <h2 class="earning-value">${earningsData.trips}</h2>
                </div>
            </div>
            
            <div class="earning-card">
                <i class="fas fa-chart-line"></i>
                <div>
                    <p class="earning-label">Avg per Trip</p>
                    <h2 class="earning-value">₹${earningsData.avgPerTrip.toFixed(2)}</h2>
                </div>
            </div>
        </div>
    `;
    
    // Breakdown
    html += `
        <div class="earnings-breakdown">
            <h3>Earnings Breakdown</h3>
            <div class="breakdown-item">
                <span>Trip Fares</span>
                <span>₹${earningsData.fares.toFixed(2)}</span>
            </div>
            <div class="breakdown-item">
                <span>Bonuses</span>
                <span class="credit">+₹${earningsData.bonuses.toFixed(2)}</span>
            </div>
            <div class="breakdown-item">
                <span>Deductions</span>
                <span class="debit">-₹${earningsData.deductions.toFixed(2)}</span>
            </div>
            <div class="breakdown-item total">
                <span><strong>Net Earnings</strong></span>
                <span><strong>₹${earningsData.total.toFixed(2)}</strong></span>
            </div>
        </div>
    `;
    
    // Download report button
    html += `
        <button class="btn-secondary" onclick="downloadEarningsReport()">
            <i class="fas fa-download"></i> Download Report
        </button>
    `;
    
    html += '</div>';
    
    return html;
}

// Calculate Earnings
function calculateEarnings(period = 'today') {
    const trips = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRIPS) || '[]');
    const walletData = JSON.parse(localStorage.getItem('wallet_data') || '{"transactions": []}');
    
    let startDate;
    const now = new Date();
    
    if (period === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const relevantTrips = trips.filter(t => t.completedAt >= startDate.getTime());
    
    let fares = 0;
    relevantTrips.forEach(trip => {
        fares += parseFloat(trip.fare.replace('₹', ''));
    });
    
    // Get bonuses and deductions
    const transactions = walletData.transactions || [];
    const relevantTxns = transactions.filter(t => t.timestamp >= startDate.getTime());
    
    const bonuses = relevantTxns
        .filter(t => t.type === 'bonus')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const deductions = Math.abs(relevantTxns
        .filter(t => t.type === 'deduction')
        .reduce((sum, t) => sum + t.amount, 0));
    
    const total = fares + bonuses - deductions;
    
    return {
        total: total,
        fares: fares,
        bonuses: bonuses,
        deductions: deductions,
        trips: relevantTrips.length,
        avgPerTrip: relevantTrips.length > 0 ? total / relevantTrips.length : 0
    };
}

// Download Earnings Report
function downloadEarningsReport() {
    const earningsData = calculateEarnings();
    
    showToast('Earnings report downloaded!', 'success');
}

// Update Bottom Nav
function updateBottomNav(index) {
    document.querySelectorAll('.nav-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
}

// Add wallet styles
const walletStyles = document.createElement('style');
walletStyles.textContent = `
    .wallet-balance-card {
        background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
        color: white;
        padding: 2rem;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 1.5rem;
        margin-bottom: 1.5rem;
    }
    
    .balance-icon i {
        font-size: 3rem;
    }
    
    .balance-label {
        font-size: 0.9rem;
        opacity: 0.9;
        margin-bottom: 0.25rem;
    }
    
    .balance-amount {
        font-size: 2.5rem;
        font-weight: bold;
    }
    
    .wallet-actions {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .wallet-action-btn {
        background: var(--bg-color);
        border: 2px solid var(--border-color);
        padding: 1rem;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .wallet-action-btn:active {
        transform: scale(0.95);
    }
    
    .wallet-action-btn i {
        font-size: 1.5rem;
        color: var(--primary-color);
    }
    
    .recent-transactions h3 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
    
    .transaction-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background: var(--bg-color);
        border-radius: 8px;
        margin-bottom: 0.5rem;
    }
    
    .txn-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
    }
    
    .txn-icon.credit {
        background: #d1fae5;
        color: #065f46;
    }
    
    .txn-icon.debit {
        background: #fee2e2;
        color: #991b1b;
    }
    
    .txn-details {
        flex: 1;
    }
    
    .txn-title {
        font-weight: 600;
        margin-bottom: 0.25rem;
    }
    
    .txn-date {
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
    
    .txn-ref {
        font-size: 0.75rem;
        color: var(--text-secondary);
    }
    
    .txn-amount {
        font-weight: bold;
        font-size: 1.1rem;
    }
    
    .txn-amount.credit {
        color: var(--success-color);
    }
    
    .txn-amount.debit {
        color: var(--danger-color);
    }
    
    .quick-amounts {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
    
    .quick-amount-btn {
        padding: 0.75rem;
        border: 2px solid var(--primary-color);
        background: transparent;
        color: var(--primary-color);
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .quick-amount-btn:active {
        background: var(--primary-color);
        color: white;
    }
    
    .available-balance {
        text-align: center;
        padding: 1.5rem;
        background: var(--bg-color);
        border-radius: 8px;
        margin-bottom: 1.5rem;
    }
    
    .available-balance h2 {
        color: var(--primary-color);
        font-size: 2rem;
    }
    
    .info-text {
        background: #dbeafe;
        color: #1e40af;
        padding: 0.75rem;
        border-radius: 8px;
        font-size: 0.85rem;
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .filter-options {
        margin-bottom: 1rem;
    }
    
    .empty-state {
        text-align: center;
        padding: 3rem;
        color: var(--text-secondary);
    }
    
    .period-selector {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
    }
    
    .period-btn {
        flex: 1;
        padding: 0.75rem;
        border: 2px solid var(--border-color);
        background: var(--card-bg);
        color: var(--text-primary);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .period-btn.active {
        background: var(--primary-color);
        color: white;
        border-color: var(--primary-color);
    }
    
    .earnings-summary {
        display: grid;
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .earning-card {
        background: var(--bg-color);
        padding: 1.5rem;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    
    .earning-card i {
        font-size: 2rem;
        color: var(--primary-color);
    }
    
    .earning-label {
        font-size: 0.9rem;
        color: var(--text-secondary);
        margin-bottom: 0.25rem;
    }
    
    .earning-value {
        font-size: 1.8rem;
        font-weight: bold;
        color: var(--text-primary);
    }
    
    .earnings-breakdown {
        background: var(--bg-color);
        padding: 1.5rem;
        border-radius: 12px;
        margin-bottom: 1rem;
    }
    
    .earnings-breakdown h3 {
        margin-bottom: 1rem;
    }
    
    .breakdown-item {
        display: flex;
        justify-content: space-between;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--border-color);
    }
    
    .breakdown-item:last-child {
        border-bottom: none;
    }
    
    .breakdown-item.total {
        margin-top: 0.5rem;
        padding-top: 1rem;
        border-top: 2px solid var(--border-color);
    }
    
    .breakdown-item .credit {
        color: var(--success-color);
    }
    
    .breakdown-item .debit {
        color: var(--danger-color);
    }
`;
document.head.appendChild(walletStyles);
