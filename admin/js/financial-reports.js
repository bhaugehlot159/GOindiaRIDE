// ===== Financial Features =====

// 1. Affiliate Commission Tracking
function createAffiliateTrackingContent() {
    return `
        <div class="section-header">
            <h2>Affiliate Commission Tracking</h2>
            <p>Track affiliate referrals, commissions, and payouts</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #667eea;"><i class="fas fa-users"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Active Affiliates</div>
                    <div class="stat-value">45</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-rupee-sign"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Total Commissions</div>
                    <div class="stat-value">₹1,25,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-clock"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Pending Payouts</div>
                    <div class="stat-value">₹32,500</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-user-plus"></i></div>
                <div class="stat-content">
                    <div class="stat-label">New Referrals</div>
                    <div class="stat-value">156</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <h3>Top Affiliates</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Affiliate ID</th>
                        <th>Name</th>
                        <th>Referrals</th>
                        <th>Commission Earned</th>
                        <th>Pending Payout</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>#AFF001</td>
                        <td>Travel Agency XYZ</td>
                        <td>45</td>
                        <td>₹22,500</td>
                        <td>₹8,500</td>
                        <td><button class="btn btn-success" onclick="processAffiliatePayout('AFF001')">Process Payout</button></td>
                    </tr>
                    <tr>
                        <td>#AFF002</td>
                        <td>Hotel Paradise</td>
                        <td>38</td>
                        <td>₹19,000</td>
                        <td>₹6,200</td>
                        <td><button class="btn btn-success" onclick="processAffiliatePayout('AFF002')">Process Payout</button></td>
                    </tr>
                    <tr>
                        <td>#AFF003</td>
                        <td>Tourism Rajasthan</td>
                        <td>32</td>
                        <td>₹16,000</td>
                        <td>₹5,400</td>
                        <td><button class="btn btn-success" onclick="processAffiliatePayout('AFF003')">Process Payout</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="chart-card mt-20">
            <h3>Commission Trends</h3>
            <canvas id="commissionTrendsChart"></canvas>
        </div>
    `;
}

// 2. Donation Reports Dashboard
function createDonationReportsContent() {
    return `
        <div class="section-header">
            <h2>Donation Reports Dashboard</h2>
            <p>Track all donations and generate reports</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb, #f5576c);"><i class="fas fa-heart"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Total Donations</div>
                    <div class="stat-value">₹2,45,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b, #38f9d7);"><i class="fas fa-users"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Donors</div>
                    <div class="stat-value">523</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #667eea, #764ba2);"><i class="fas fa-hand-holding-heart"></i></div>
                <div class="stat-content">
                    <div class="stat-label">This Month</div>
                    <div class="stat-value">₹45,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe, #00f2fe);"><i class="fas fa-chart-line"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Avg Donation</div>
                    <div class="stat-value">₹468</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <div class="flex-between mb-20">
                <h3>Recent Donations</h3>
                <button class="btn btn-primary" onclick="exportDonationReport()"><i class="fas fa-download"></i> Export Report</button>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Donor Name</th>
                        <th>Amount</th>
                        <th>Category</th>
                        <th>Receipt</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>2024-12-10</td>
                        <td>Rajesh Kumar</td>
                        <td>₹1,000</td>
                        <td><span class="status-badge status-active">Driver Welfare</span></td>
                        <td><button class="btn btn-secondary" onclick="generateReceipt('D001')">Generate</button></td>
                    </tr>
                    <tr>
                        <td>2024-12-09</td>
                        <td>Priya Sharma</td>
                        <td>₹500</td>
                        <td><span class="status-badge status-pending">Education</span></td>
                        <td><button class="btn btn-secondary" onclick="generateReceipt('D002')">Generate</button></td>
                    </tr>
                    <tr>
                        <td>2024-12-08</td>
                        <td>Amit Patel</td>
                        <td>₹2,000</td>
                        <td><span class="status-badge status-active">Healthcare</span></td>
                        <td><button class="btn btn-secondary" onclick="generateReceipt('D003')">Generate</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="charts-grid mt-20">
            <div class="chart-card">
                <h3>Donation by Category</h3>
                <canvas id="donationCategoryChart"></canvas>
            </div>
            <div class="chart-card">
                <h3>Monthly Donation Trends</h3>
                <canvas id="donationTrendsChart"></canvas>
            </div>
        </div>
    `;
}

// 3. Cancellation Earnings Tracking
function createCancellationEarningsContent() {
    return `
        <div class="section-header">
            <h2>Cancellation Earnings Tracking</h2>
            <p>Track cancellation fees, refunds, and analytics</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-ban"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Total Cancellations</div>
                    <div class="stat-value">156</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-rupee-sign"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Fees Collected</div>
                    <div class="stat-value">₹23,400</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-undo"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Refunds Issued</div>
                    <div class="stat-value">₹8,500</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-percentage"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Cancellation Rate</div>
                    <div class="stat-value">12.3%</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <h3>Cancellation Details</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Booking ID</th>
                        <th>Customer</th>
                        <th>Cancelled By</th>
                        <th>Reason</th>
                        <th>Fee Charged</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>#B1234</td>
                        <td>Rajesh Kumar</td>
                        <td>Customer</td>
                        <td>Change of plans</td>
                        <td>₹150</td>
                        <td><span class="status-badge status-active">Collected</span></td>
                    </tr>
                    <tr>
                        <td>#B1235</td>
                        <td>Priya Sharma</td>
                        <td>Driver</td>
                        <td>Vehicle breakdown</td>
                        <td>₹0</td>
                        <td><span class="status-badge status-pending">Refunded</span></td>
                    </tr>
                    <tr>
                        <td>#B1236</td>
                        <td>Amit Patel</td>
                        <td>Customer</td>
                        <td>Late cancellation</td>
                        <td>₹200</td>
                        <td><span class="status-badge status-active">Collected</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="chart-card mt-20">
            <h3>Cancellation Reasons Analysis</h3>
            <canvas id="cancellationReasonsChart"></canvas>
        </div>
    `;
}

// 4. Tax/GST Reports
function createTaxReportsContent() {
    return `
        <div class="section-header">
            <h2>Tax/GST Reports</h2>
            <p>Generate GST-compliant reports and tax summaries</p>
        </div>
        
        <div class="card">
            <h3>Generate Tax Report</h3>
            <div class="form-group">
                <label class="form-label">Report Period</label>
                <select class="form-select" id="taxPeriod">
                    <option value="current-month">Current Month</option>
                    <option value="last-month">Last Month</option>
                    <option value="current-quarter">Current Quarter</option>
                    <option value="last-quarter">Last Quarter</option>
                    <option value="current-year">Current Financial Year</option>
                    <option value="custom">Custom Range</option>
                </select>
            </div>
            <div class="flex gap-10">
                <button class="btn btn-primary" onclick="generateTaxReport('pdf')"><i class="fas fa-file-pdf"></i> Export PDF</button>
                <button class="btn btn-success" onclick="generateTaxReport('excel')"><i class="fas fa-file-excel"></i> Export Excel</button>
            </div>
        </div>
        
        <div class="stats-grid mt-20">
            <div class="stat-card">
                <div class="stat-icon" style="background: #667eea;"><i class="fas fa-rupee-sign"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Total Revenue (This Month)</div>
                    <div class="stat-value">₹8,45,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-percentage"></i></div>
                <div class="stat-content">
                    <div class="stat-label">GST Collected (18%)</div>
                    <div class="stat-value">₹1,52,100</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-file-invoice"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Taxable Amount</div>
                    <div class="stat-value">₹6,92,900</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-calendar-alt"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Next Filing Date</div>
                    <div class="stat-value">Jan 20</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <h3>GST Summary</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Taxable Value</th>
                        <th>CGST (9%)</th>
                        <th>SGST (9%)</th>
                        <th>Total GST</th>
                        <th>Total Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Ride Services</td>
                        <td>₹6,92,900</td>
                        <td>₹62,361</td>
                        <td>₹62,361</td>
                        <td>₹1,24,722</td>
                        <td>₹8,17,622</td>
                    </tr>
                    <tr>
                        <td>Cancellation Fees</td>
                        <td>₹23,400</td>
                        <td>₹2,106</td>
                        <td>₹2,106</td>
                        <td>₹4,212</td>
                        <td>₹27,612</td>
                    </tr>
                    <tr>
                        <td><strong>Total</strong></td>
                        <td><strong>₹7,16,300</strong></td>
                        <td><strong>₹64,467</strong></td>
                        <td><strong>₹64,467</strong></td>
                        <td><strong>₹1,28,934</strong></td>
                        <td><strong>₹8,45,234</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// 5. Family Insurance Fund Management
function createInsuranceFundContent() {
    return `
        <div class="section-header">
            <h2>Family Insurance Fund Management</h2>
            <p>Track insurance fund contributions, claims, and balance</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-piggy-bank"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Fund Balance</div>
                    <div class="stat-value">₹5,45,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #667eea;"><i class="fas fa-hand-holding-usd"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Monthly Contributions</div>
                    <div class="stat-value">₹42,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-file-medical"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Active Claims</div>
                    <div class="stat-value">3</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-check-circle"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Claims Settled</div>
                    <div class="stat-value">45</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <h3>Recent Claims</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Claim ID</th>
                        <th>Driver Name</th>
                        <th>Claim Type</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>#CLM001</td>
                        <td>Ravi Kumar</td>
                        <td>Medical Emergency</td>
                        <td>₹25,000</td>
                        <td><span class="status-badge status-pending">Under Review</span></td>
                        <td><button class="btn btn-primary" onclick="reviewClaim('CLM001')">Review</button></td>
                    </tr>
                    <tr>
                        <td>#CLM002</td>
                        <td>Mohan Lal</td>
                        <td>Accident Support</td>
                        <td>₹35,000</td>
                        <td><span class="status-badge status-active">Approved</span></td>
                        <td><button class="btn btn-success" onclick="processClaim('CLM002')">Process Payment</button></td>
                    </tr>
                    <tr>
                        <td>#CLM003</td>
                        <td>Suresh Babu</td>
                        <td>Family Support</td>
                        <td>₹15,000</td>
                        <td><span class="status-badge status-pending">Under Review</span></td>
                        <td><button class="btn btn-primary" onclick="reviewClaim('CLM003')">Review</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="chart-card mt-20">
            <h3>Fund Balance Trend</h3>
            <canvas id="insuranceFundChart"></canvas>
        </div>
    `;
}

// 6. Revenue Analytics Dashboard
function createRevenueAnalyticsContent() {
    return `
        <div class="section-header">
            <h2>Revenue Analytics Dashboard</h2>
            <p>Comprehensive revenue analysis and growth metrics</p>
        </div>
        
        <div class="card">
            <div class="flex-between mb-20">
                <h3>Revenue Overview</h3>
                <select class="form-select" style="width: 200px;" id="revenueTimeframe" onchange="updateRevenueChart()">
                    <option value="daily">Daily</option>
                    <option value="weekly" selected>Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                </select>
            </div>
            <canvas id="revenueAnalyticsChart"></canvas>
        </div>
        
        <div class="stats-grid mt-20">
            <div class="stat-card">
                <div class="stat-icon" style="background: #667eea;"><i class="fas fa-rupee-sign"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Today's Revenue</div>
                    <div class="stat-value">₹28,450</div>
                    <small style="color: #43e97b;">↑ 12% vs yesterday</small>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-calendar-week"></i></div>
                <div class="stat-content">
                    <div class="stat-label">This Week</div>
                    <div class="stat-value">₹1,85,000</div>
                    <small style="color: #43e97b;">↑ 8% vs last week</small>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-calendar-alt"></i></div>
                <div class="stat-content">
                    <div class="stat-label">This Month</div>
                    <div class="stat-value">₹8,45,000</div>
                    <small style="color: #43e97b;">↑ 15% vs last month</small>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-chart-line"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Growth Rate</div>
                    <div class="stat-value">24.5%</div>
                    <small style="color: #43e97b;">YoY Growth</small>
                </div>
            </div>
        </div>
        
        <div class="charts-grid mt-20">
            <div class="chart-card">
                <h3>Revenue by Service Type</h3>
                <canvas id="revenueByTypeChart"></canvas>
            </div>
            <div class="chart-card">
                <h3>Revenue by Region</h3>
                <canvas id="revenueByRegionChart"></canvas>
            </div>
        </div>
    `;
}

// 7. Driver Payout Management
function createDriverPayoutContent() {
    return `
        <div class="section-header">
            <h2>Driver Payout Management</h2>
            <p>Calculate driver earnings, manage deductions, and process payouts</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #667eea;"><i class="fas fa-money-check-alt"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Pending Payouts</div>
                    <div class="stat-value">₹3,45,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-check-circle"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Processed This Month</div>
                    <div class="stat-value">₹12,45,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-users"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Drivers Awaiting Payment</div>
                    <div class="stat-value">28</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-calendar-alt"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Next Payout Date</div>
                    <div class="stat-value">Dec 15</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <div class="flex-between mb-20">
                <h3>Driver Earnings</h3>
                <button class="btn btn-success" onclick="processAllPayouts()"><i class="fas fa-money-bill-wave"></i> Process All Payouts</button>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Driver Name</th>
                        <th>Rides Completed</th>
                        <th>Gross Earnings</th>
                        <th>Platform Fee</th>
                        <th>Net Payout</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Ravi Kumar</td>
                        <td>45</td>
                        <td>₹22,500</td>
                        <td>₹2,250</td>
                        <td>₹20,250</td>
                        <td><button class="btn btn-primary" onclick="processDriverPayout('D001')">Process</button></td>
                    </tr>
                    <tr>
                        <td>Mohan Lal</td>
                        <td>38</td>
                        <td>₹19,000</td>
                        <td>₹1,900</td>
                        <td>₹17,100</td>
                        <td><button class="btn btn-primary" onclick="processDriverPayout('D002')">Process</button></td>
                    </tr>
                    <tr>
                        <td>Suresh Babu</td>
                        <td>32</td>
                        <td>₹16,000</td>
                        <td>₹1,600</td>
                        <td>₹14,400</td>
                        <td><button class="btn btn-primary" onclick="processDriverPayout('D003')">Process</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// 8. Expense Tracking
function createExpenseTrackingContent() {
    return `
        <div class="section-header">
            <h2>Expense Tracking</h2>
            <p>Track operational expenses with category-wise breakdown</p>
        </div>
        
        <div class="card">
            <div class="flex-between mb-20">
                <h3>Add New Expense</h3>
                <button class="btn btn-primary" onclick="showAddExpenseForm()"><i class="fas fa-plus"></i> Add Expense</button>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-rupee-sign"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Total Expenses (This Month)</div>
                    <div class="stat-value">₹1,25,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-chart-pie"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Budget Utilization</div>
                    <div class="stat-value">68%</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-calendar-alt"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Budget Remaining</div>
                    <div class="stat-value">₹58,000</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-trending-down"></i></div>
                <div class="stat-content">
                    <div class="stat-label">vs Last Month</div>
                    <div class="stat-value">-8%</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <h3>Recent Expenses</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Payment Method</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>2024-12-10</td>
                        <td><span class="status-badge status-active">Marketing</span></td>
                        <td>Social Media Ads</td>
                        <td>₹15,000</td>
                        <td>Online</td>
                        <td><button class="btn btn-secondary">Edit</button></td>
                    </tr>
                    <tr>
                        <td>2024-12-09</td>
                        <td><span class="status-badge status-pending">Operations</span></td>
                        <td>Server Maintenance</td>
                        <td>₹8,500</td>
                        <td>Online</td>
                        <td><button class="btn btn-secondary">Edit</button></td>
                    </tr>
                    <tr>
                        <td>2024-12-08</td>
                        <td><span class="status-badge status-blocked">Salaries</span></td>
                        <td>Staff Salaries</td>
                        <td>₹85,000</td>
                        <td>Bank Transfer</td>
                        <td><button class="btn btn-secondary">Edit</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="charts-grid mt-20">
            <div class="chart-card">
                <h3>Expenses by Category</h3>
                <canvas id="expenseCategoryChart"></canvas>
            </div>
            <div class="chart-card">
                <h3>Budget vs Actual</h3>
                <canvas id="budgetActualChart"></canvas>
            </div>
        </div>
    `;
}

// Initialize Financial Features
function initializeFinancialFeatures(sectionId) {
    setTimeout(() => {
        if (sectionId === 'affiliate-tracking') {
            const ctx = document.getElementById('commissionTrendsChart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                        datasets: [{
                            label: 'Commissions (₹)',
                            data: [8500, 12000, 15000, 18500, 21000, 22500],
                            borderColor: '#667eea',
                            backgroundColor: 'rgba(102, 126, 234, 0.1)',
                            tension: 0.4,
                            fill: true
                        }]
                    }
                });
            }
        } else if (sectionId === 'donation-reports') {
            const ctx1 = document.getElementById('donationCategoryChart');
            if (ctx1) {
                new Chart(ctx1, {
                    type: 'doughnut',
                    data: {
                        labels: ['Driver Welfare', 'Education', 'Healthcare', 'Other'],
                        datasets: [{
                            data: [45, 25, 20, 10],
                            backgroundColor: ['#667eea', '#43e97b', '#4facfe', '#feca57']
                        }]
                    }
                });
            }
            const ctx2 = document.getElementById('donationTrendsChart');
            if (ctx2) {
                new Chart(ctx2, {
                    type: 'bar',
                    data: {
                        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                        datasets: [{
                            label: 'Donations (₹)',
                            data: [25000, 32000, 28000, 35000, 42000, 45000],
                            backgroundColor: '#f093fb'
                        }]
                    }
                });
            }
        } else if (sectionId === 'cancellation-earnings') {
            const ctx = document.getElementById('cancellationReasonsChart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['Change of Plans', 'Late Cancellation', 'Vehicle Issue', 'Driver Unavailable', 'Other'],
                        datasets: [{
                            label: 'Number of Cancellations',
                            data: [45, 32, 28, 25, 26],
                            backgroundColor: '#ff6b6b'
                        }]
                    }
                });
            }
        } else if (sectionId === 'insurance-fund') {
            const ctx = document.getElementById('insuranceFundChart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                        datasets: [{
                            label: 'Fund Balance (₹)',
                            data: [350000, 385000, 420000, 465000, 502000, 545000],
                            borderColor: '#43e97b',
                            backgroundColor: 'rgba(67, 233, 123, 0.1)',
                            tension: 0.4,
                            fill: true
                        }]
                    }
                });
            }
        } else if (sectionId === 'revenue-analytics') {
            const ctx1 = document.getElementById('revenueAnalyticsChart');
            if (ctx1) {
                new Chart(ctx1, {
                    type: 'line',
                    data: {
                        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                        datasets: [{
                            label: 'Revenue (₹)',
                            data: [185000, 220000, 195000, 245000],
                            borderColor: '#667eea',
                            backgroundColor: 'rgba(102, 126, 234, 0.1)',
                            tension: 0.4,
                            fill: true
                        }]
                    }
                });
            }
            const ctx2 = document.getElementById('revenueByTypeChart');
            if (ctx2) {
                new Chart(ctx2, {
                    type: 'pie',
                    data: {
                        labels: ['Standard Rides', 'Premium Rides', 'Outstation', 'Rental'],
                        datasets: [{
                            data: [55, 20, 15, 10],
                            backgroundColor: ['#667eea', '#f093fb', '#43e97b', '#4facfe']
                        }]
                    }
                });
            }
            const ctx3 = document.getElementById('revenueByRegionChart');
            if (ctx3) {
                new Chart(ctx3, {
                    type: 'bar',
                    data: {
                        labels: ['Jaipur', 'Jodhpur', 'Udaipur', 'Jaisalmer', 'Bikaner'],
                        datasets: [{
                            label: 'Revenue (₹)',
                            data: [320000, 185000, 145000, 98000, 97000],
                            backgroundColor: '#667eea'
                        }]
                    }
                });
            }
        } else if (sectionId === 'expense-tracking') {
            const ctx1 = document.getElementById('expenseCategoryChart');
            if (ctx1) {
                new Chart(ctx1, {
                    type: 'doughnut',
                    data: {
                        labels: ['Salaries', 'Marketing', 'Operations', 'Maintenance', 'Other'],
                        datasets: [{
                            data: [68, 12, 10, 7, 3],
                            backgroundColor: ['#ff6b6b', '#667eea', '#4facfe', '#feca57', '#43e97b']
                        }]
                    }
                });
            }
            const ctx2 = document.getElementById('budgetActualChart');
            if (ctx2) {
                new Chart(ctx2, {
                    type: 'bar',
                    data: {
                        labels: ['Salaries', 'Marketing', 'Operations', 'Maintenance'],
                        datasets: [{
                            label: 'Budget',
                            data: [90000, 20000, 15000, 12000],
                            backgroundColor: 'rgba(102, 126, 234, 0.5)'
                        }, {
                            label: 'Actual',
                            data: [85000, 15000, 8500, 10000],
                            backgroundColor: 'rgba(67, 233, 123, 0.5)'
                        }]
                    }
                });
            }
        }
    }, 100);
}

// Action Functions
function processAffiliatePayout(affiliateId) {
    if (confirm(`Process payout for affiliate ${affiliateId}?`)) {
        showToast(`Payout processed for affiliate ${affiliateId}`, 'success');
        logAdminAction('PROCESS_AFFILIATE_PAYOUT', `Affiliate: ${affiliateId}`);
    }
}

function exportDonationReport() {
    showToast('Donation report exported successfully', 'success');
    logAdminAction('EXPORT_DONATION_REPORT', 'Report exported');
}

function generateReceipt(donationId) {
    showToast(`Receipt generated for donation ${donationId}`, 'success');
    logAdminAction('GENERATE_RECEIPT', `Donation: ${donationId}`);
}

function generateTaxReport(format) {
    showToast(`Tax report generated in ${format.toUpperCase()} format`, 'success');
    logAdminAction('GENERATE_TAX_REPORT', `Format: ${format}`);
}

function reviewClaim(claimId) {
    showToast(`Opening claim ${claimId} for review`, 'info');
    logAdminAction('REVIEW_CLAIM', `Claim: ${claimId}`);
}

function processClaim(claimId) {
    if (confirm(`Process payment for claim ${claimId}?`)) {
        showToast(`Payment processed for claim ${claimId}`, 'success');
        logAdminAction('PROCESS_CLAIM_PAYMENT', `Claim: ${claimId}`);
    }
}

function updateRevenueChart() {
    showToast('Revenue chart updated', 'info');
}

function processDriverPayout(driverId) {
    if (confirm(`Process payout for driver ${driverId}?`)) {
        showToast(`Payout processed for driver ${driverId}`, 'success');
        logAdminAction('PROCESS_DRIVER_PAYOUT', `Driver: ${driverId}`);
    }
}

function processAllPayouts() {
    if (confirm('Process all pending payouts?')) {
        showLoading();
        setTimeout(() => {
            hideLoading();
            showToast('All payouts processed successfully', 'success');
            logAdminAction('PROCESS_ALL_PAYOUTS', 'Batch payout processed');
        }, 2000);
    }
}

function showAddExpenseForm() {
    showToast('Add expense form (to be implemented)', 'info');
}
