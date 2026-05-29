function openTaxes() {
    const modal = createModal('Tax Summary', getTaxesContent());
    document.getElementById('modalsContainer').appendChild(modal);
}

// Get Taxes Content
function getTaxesContent() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    
    // Indian financial year: April to March
    let fyStart, fyEnd;
    if (currentMonth >= 3) { // April (3) to December (11)
        fyStart = currentYear;
        fyEnd = currentYear + 1;
    } else { // January (0) to March (2)
        fyStart = currentYear - 1;
        fyEnd = currentYear;
    }
    
    const earnings = calculateEarnings('month');
    const annualEarnings = earnings.total * 12; // Estimate
    
    return `
        <div class="tax-container">
            <div class="tax-year">
                <h3>Financial Year ${fyStart}-${fyEnd}</h3>
            </div>
            
            <div class="tax-summary">
                <div class="tax-row">
                    <span>Total Earnings:</span>
                    <span>₹${annualEarnings.toFixed(2)}</span>
                </div>
                <div class="tax-row">
                    <span>TDS Deducted:</span>
                    <span>₹${(annualEarnings * 0.01).toFixed(2)}</span>
                </div>
                <div class="tax-row">
                    <span>Commission:</span>
                    <span>₹${(annualEarnings * 0.15).toFixed(2)}</span>
                </div>
                <div class="tax-row total">
                    <span><strong>Net Income:</strong></span>
                    <span><strong>₹${(annualEarnings * 0.84).toFixed(2)}</strong></span>
                </div>
            </div>
            
            <button class="btn-primary" onclick="downloadTaxStatement()">
                <i class="fas fa-download"></i> Download Tax Statement
            </button>
            
            <p class="info-text">
                <i class="fas fa-info-circle"></i>
                Tax statement can be used for ITR filing
            </p>
        </div>
    `;
}

// Download Tax Statement
function downloadTaxStatement() {
    showToast('Tax statement downloaded!', 'success');
}

// Open Languages
function openLanguages() {
    openLanguagesModal();
}

// Open Profile
function openProfile() {
    const modal = createModal('Driver Profile', getProfileContent());
    document.getElementById('modalsContainer').appendChild(modal);
    
    updateBottomNav(3);
}

// Get Profile Content
function getProfileContent() {
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    const driverProfile = getLiveDriverProfile();
    
    return `
        <div class="profile-container">
            <div class="profile-header">
                <div class="profile-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <h2>${driverProfile.name}</h2>
                <p>Driver ID: ${driverProfile.id || 'Pending live sync'}</p>
                ${kycData.verified ? '<span class="badge badge-success">✓ Verified Driver</span>' : ''}
            </div>
            
            <div class="profile-stats">
                <div class="stat-item">
                    <p class="stat-value">${driverState.rating.toFixed(1)}</p>
                    <p class="stat-label">Rating</p>
                </div>
                <div class="stat-item">
                    <p class="stat-value">${driverState.todayTrips}</p>
                    <p class="stat-label">Trips</p>
                </div>
                <div class="stat-item">
                    <p class="stat-value">${telematicsData.drivingScore}</p>
                    <p class="stat-label">Score</p>
                </div>
            </div>
            
            <div class="profile-menu">
                <button class="profile-menu-item" onclick="openKYC()">
                    <i class="fas fa-id-card"></i>
                    <span>KYC & Documents</span>
                </button>
                <button class="profile-menu-item" onclick="openLanguages()">
                    <i class="fas fa-language"></i>
                    <span>Language Skills</span>
                </button>
                <button class="profile-menu-item" onclick="openDeposit()">
                    <i class="fas fa-shield"></i>
                    <span>Security Deposit</span>
                </button>
                <button class="profile-menu-item" onclick="logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Logout</span>
                </button>
            </div>
        </div>
    `;
}

function getLiveDriverProfile() {
    try {
        const currentDriver = JSON.parse(localStorage.getItem('currentDriver') || 'null');
        const driverData = JSON.parse(localStorage.getItem('driver_data') || '{}');
        const driver = currentDriver && typeof currentDriver === 'object'
            ? { ...driverData, ...currentDriver }
            : driverData;
        return {
            name: driver.name || driver.fullName || 'Driver',
            id: driver.id || driver.driverId || ''
        };
    } catch (_error) {
        return { name: 'Driver', id: '' };
    }
}

// Logout
function logout() {
    const confirmed = confirm('Are you sure you want to logout?');
    if (confirmed) {
        window.location.href = '../pages/login.html';
    }
}

// Add safety styles
const safetyStyles = document.createElement('style');
safetyStyles.textContent = `
    .safety-score-card {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .score-circle, .score-circle-large {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        border: 8px solid var(--success-color);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin: 0 auto;
    }
    
    .score-circle-large {
        width: 150px;
        height: 150px;
    }
    
    .score-value, .score-value-large {
        font-size: 2.5rem;
        font-weight: bold;
        color: var(--text-primary);
    }
    
    .score-value-large {
        font-size: 3rem;
    }
    
    .score-label {
        font-size: 0.9rem;
        color: var(--text-secondary);
    }
    
    .safety-features {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
    }
    
    .safety-feature-card {
        background: var(--bg-color);
        padding: 1.5rem;
        border-radius: 12px;
        text-align: center;
        cursor: pointer;
        border: 2px solid var(--border-color);
        transition: all 0.2s;
    }
    
    .safety-feature-card:active {
        transform: scale(0.95);
    }
    
    .safety-feature-card i {
        font-size: 2rem;
        color: var(--primary-color);
        margin-bottom: 0.5rem;
    }
    
    .safety-feature-card h4 {
        margin-bottom: 0.5rem;
    }
    
    .safety-feature-card p {
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
    
    .speed-display {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 12px;
        margin-bottom: 1rem;
    }
    
    .speed-meter {
        margin-bottom: 1rem;
    }
    
    .speed-number {
        font-size: 4rem;
        font-weight: bold;
        color: var(--primary-color);
    }
    
    .speed-unit {
        font-size: 1.2rem;
        color: var(--text-secondary);
    }
    
    .speed-status {
        padding: 1rem;
        border-radius: 8px;
        text-align: center;
        font-size: 1.2rem;
        font-weight: bold;
        margin-bottom: 1.5rem;
    }
    
    .speed-status.good {
        background: var(--success-color);
        color: white;
    }
    
    .speed-status.danger {
        background: var(--danger-color);
        color: white;
        animation: pulse 1s infinite;
    }
    
    .violations-list {
        max-height: 300px;
        overflow-y: auto;
    }
    
    .violation-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background: var(--bg-color);
        border-radius: 8px;
        margin-bottom: 0.5rem;
    }
    
    .violation-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #fee2e2;
        color: #991b1b;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .violation-details {
        flex: 1;
    }
    
    .violation-speed {
        font-weight: bold;
        color: var(--danger-color);
    }
    
    .violation-date {
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
    
    .violation-penalty {
        font-weight: bold;
        color: var(--danger-color);
    }
    
    .camera-preview {
        background: #000;
        border-radius: 8px;
        margin: 1rem 0;
        min-height: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .camera-actions {
        display: flex;
        gap: 1rem;
    }
    
    .uniform-status {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 8px;
        margin: 1rem 0;
    }
    
    .telematics-metrics {
        display: grid;
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .metric-card {
        background: var(--bg-color);
        padding: 1rem;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 1rem;
        border-left: 4px solid var(--success-color);
    }
    
    .metric-card.warning {
        border-left-color: var(--warning-color);
    }
    
    .metric-card i {
        font-size: 2rem;
        color: var(--primary-color);
    }
    
    .metric-label {
        font-size: 0.9rem;
        color: var(--text-secondary);
    }
    
    .metric-value {
        font-size: 1.5rem;
        font-weight: bold;
    }
    
    .driving-tips {
        background: #dbeafe;
        padding: 1.5rem;
        border-radius: 8px;
    }
    
    .driving-tips h3 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
        color: #1e40af;
    }
    
    .driving-tips ul {
        list-style: none;
        padding: 0;
    }
    
    .driving-tips li {
        padding: 0.5rem 0;
        padding-left: 1.5rem;
        position: relative;
    }
    
    .driving-tips li:before {
        content: "✓";
        position: absolute;
        left: 0;
        color: #1e40af;
        font-weight: bold;
    }
    
    .fatigue-progress {
        margin: 2rem 0;
    }
    
    .progress-bar {
        width: 100%;
        height: 30px;
        background: var(--border-color);
        border-radius: 15px;
        overflow: hidden;
        margin-bottom: 0.5rem;
    }
    
    .progress-fill {
        height: 100%;
        transition: width 0.3s;
    }
    
    .health-status, .fatigue-status {
        text-align: center;
        padding: 2rem;
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .health-status.good, .fatigue-status.good {
        background: #d1fae5;
        color: #065f46;
    }
    
    .health-status.warning, .fatigue-status.warning {
        background: #fef3c7;
        color: #92400e;
    }
    
    .health-status.danger, .fatigue-status.danger {
        background: #fee2e2;
        color: #991b1b;
    }
    
    .health-status i, .fatigue-status i {
        font-size: 3rem;
        margin-bottom: 1rem;
    }
    
    .sos-alert-container {
        text-align: center;
    }
    
    .sos-status {
        padding: 2rem;
        margin-bottom: 2rem;
    }
    
    .sos-location, .sos-contacts {
        background: var(--bg-color);
        padding: 1.5rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }
    
    .sos-contacts button {
        width: 100%;
        margin-bottom: 0.5rem;
    }
    
    .deposit-status {
        text-align: center;
        padding: 2rem;
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .deposit-info {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .deposit-amount {
        font-size: 3rem;
        font-weight: bold;
        color: var(--primary-color);
        margin: 1rem 0;
    }
    
    .deposit-benefits {
        background: #dbeafe;
        padding: 1.5rem;
        border-radius: 8px;
        margin-bottom: 2rem;
    }
    
    .deposit-benefits ul {
        list-style: none;
        padding: 0;
    }
    
    .deposit-benefits li {
        padding: 0.5rem 0;
        padding-left: 1.5rem;
        position: relative;
    }
    
    .deposit-benefits li:before {
        content: "✓";
        position: absolute;
        left: 0;
        color: #1e40af;
        font-weight: bold;
    }
    
    .trip-card {
        background: var(--bg-color);
        padding: 1rem;
        border-radius: 8px;
        margin-bottom: 1rem;
    }
    
    .trip-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 1rem;
    }
    
    .trip-id {
        font-weight: bold;
        color: var(--primary-color);
    }
    
    .trip-fare {
        font-weight: bold;
        color: var(--success-color);
    }
    
    .trip-route {
        margin-bottom: 1rem;
    }
    
    .route-point {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    
    .trip-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 1rem;
        border-top: 1px solid var(--border-color);
    }
    
    .btn-receipt {
        background: var(--primary-color);
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
    }
    
    .receipt-container {
        background: white;
        color: #000;
    }
    
    .receipt-header {
        text-align: center;
        padding: 2rem;
        background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
        color: white;
        border-radius: 12px 12px 0 0;
        margin: -1.5rem -1.5rem 1.5rem -1.5rem;
    }
    
    .receipt-details {
        margin-bottom: 2rem;
    }
    
    .receipt-row {
        display: flex;
        justify-content: space-between;
        padding: 0.75rem 0;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .receipt-row.total {
        border-top: 2px solid #e5e7eb;
        margin-top: 1rem;
        padding-top: 1rem;
    }
    
    .receipt-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }
    
    .profile-header {
        text-align: center;
        padding: 2rem;
        background: var(--bg-color);
        border-radius: 12px;
        margin-bottom: 2rem;
    }
    
    .profile-avatar i {
        font-size: 5rem;
        color: var(--primary-color);
    }
    
    .profile-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        margin-bottom: 2rem;
    }
    
    .stat-item {
        text-align: center;
        padding: 1rem;
        background: var(--bg-color);
        border-radius: 8px;
    }
    
    .profile-menu {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .profile-menu-item {
        background: var(--bg-color);
        border: none;
        padding: 1rem;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 1rem;
        cursor: pointer;
        text-align: left;
        transition: background 0.2s;
    }
    
    .profile-menu-item:active {
        background: var(--border-color);
    }
    
    .profile-menu-item i {
        font-size: 1.5rem;
        color: var(--primary-color);
        width: 30px;
    }
`;
document.head.appendChild(safetyStyles);
