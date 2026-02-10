// ===== AI & Automation Features =====

// 1. AI Auto-Block System
function createAutoBlockContent() {
    return `
        <div class="section-header">
            <h2>AI Auto-Block System</h2>
            <p>Automatically detect and block suspicious users/drivers</p>
        </div>
        
        <div class="card">
            <h3>Configuration</h3>
            <div class="form-group">
                <label class="form-label">Sensitivity Level</label>
                <select class="form-select" id="blockSensitivity">
                    <option value="low">Low - Block only severe violations</option>
                    <option value="medium" selected>Medium - Standard protection</option>
                    <option value="high">High - Strict monitoring</option>
                </select>
            </div>
            <div class="form-group">
                <label class="flex" style="align-items: center; gap: 10px;">
                    <label class="switch">
                        <input type="checkbox" id="autoBlockEnabled" checked>
                        <span class="slider"></span>
                    </label>
                    <span>Enable Auto-Block System</span>
                </label>
            </div>
            <button class="btn btn-primary" onclick="saveAutoBlockSettings()">Save Settings</button>
        </div>
        
        <div class="card mt-20">
            <h3>Recently Blocked Users</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>User ID</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Reason</th>
                        <th>Date</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="blockedUsersList">
                    <tr>
                        <td>#5234</td>
                        <td>Suspicious User</td>
                        <td><span class="status-badge status-blocked">Customer</span></td>
                        <td>Multiple fake booking attempts</td>
                        <td>2024-12-10</td>
                        <td><button class="btn btn-success" onclick="unblockUser(5234)">Unblock</button></td>
                    </tr>
                    <tr>
                        <td>#7891</td>
                        <td>Rogue Driver</td>
                        <td><span class="status-badge status-blocked">Driver</span></td>
                        <td>Fraudulent activity pattern detected</td>
                        <td>2024-12-09</td>
                        <td><button class="btn btn-success" onclick="unblockUser(7891)">Unblock</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="stats-grid mt-20">
            <div class="stat-card">
                <div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-ban"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Total Blocked</div>
                    <div class="stat-value">28</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Pending Review</div>
                    <div class="stat-value">5</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-shield-alt"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Threats Prevented</div>
                    <div class="stat-value">142</div>
                </div>
            </div>
        </div>
    `;
}

// 2. Smart Fare Control
function createSmartFareContent() {
    return `
        <div class="section-header">
            <h2>Smart Fare Control</h2>
            <p>Dynamic pricing based on demand and surge pricing management</p>
        </div>
        
        <div class="card">
            <h3>Dynamic Pricing Settings</h3>
            <div class="form-group">
                <label class="form-label">Base Fare (₹/km)</label>
                <input type="number" class="form-input" id="baseFare" value="12" min="5" max="50">
            </div>
            <div class="form-group">
                <label class="form-label">Surge Multiplier</label>
                <input type="range" class="form-input" id="surgeMultiplier" min="1" max="3" step="0.1" value="1.5">
                <div id="surgeValue">1.5x</div>
            </div>
            <div class="form-group">
                <label class="flex" style="align-items: center; gap: 10px;">
                    <label class="switch">
                        <input type="checkbox" id="surgePricingEnabled" checked>
                        <span class="slider"></span>
                    </label>
                    <span>Enable Surge Pricing</span>
                </label>
            </div>
            <button class="btn btn-primary" onclick="saveFareSettings()">Apply Changes</button>
        </div>
        
        <div class="card mt-20">
            <h3>Area-wise Fare Configuration</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Area</th>
                        <th>Base Fare</th>
                        <th>Peak Hour Multiplier</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Jaipur City Center</td>
                        <td>₹15/km</td>
                        <td>1.5x</td>
                        <td><span class="status-badge status-active">Active</span></td>
                        <td><button class="btn btn-secondary">Edit</button></td>
                    </tr>
                    <tr>
                        <td>Jodhpur Airport</td>
                        <td>₹18/km</td>
                        <td>2.0x</td>
                        <td><span class="status-badge status-active">Active</span></td>
                        <td><button class="btn btn-secondary">Edit</button></td>
                    </tr>
                    <tr>
                        <td>Udaipur Tourist Zone</td>
                        <td>₹20/km</td>
                        <td>1.8x</td>
                        <td><span class="status-badge status-active">Active</span></td>
                        <td><button class="btn btn-secondary">Edit</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="chart-card mt-20">
            <h3>Fare Trends</h3>
            <canvas id="fareTrendsChart"></canvas>
        </div>
    `;
}

// 3. Demand Prediction Algorithm
function createDemandPredictionContent() {
    return `
        <div class="section-header">
            <h2>Demand Prediction Algorithm</h2>
            <p>AI-powered predictions for high-demand areas and times</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #667eea, #764ba2);"><i class="fas fa-chart-line"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Prediction Accuracy</div>
                    <div class="stat-value">87%</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb, #f5576c);"><i class="fas fa-fire"></i></div>
                <div class="stat-content">
                    <div class="stat-label">High Demand Zones</div>
                    <div class="stat-value">12</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe, #00f2fe);"><i class="fas fa-clock"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Peak Hours Today</div>
                    <div class="stat-value">3</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <h3>Predicted High-Demand Areas (Next 2 Hours)</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Area</th>
                        <th>Predicted Demand</th>
                        <th>Current Drivers</th>
                        <th>Recommendation</th>
                        <th>Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Jaipur Railway Station</td>
                        <td><span class="status-badge status-blocked">High (45 rides)</span></td>
                        <td>12 drivers</td>
                        <td>Deploy 8 more drivers</td>
                        <td>92%</td>
                    </tr>
                    <tr>
                        <td>Jodhpur Clock Tower</td>
                        <td><span class="status-badge status-pending">Medium (28 rides)</span></td>
                        <td>15 drivers</td>
                        <td>Sufficient coverage</td>
                        <td>85%</td>
                    </tr>
                    <tr>
                        <td>Udaipur City Palace</td>
                        <td><span class="status-badge status-active">Low (12 rides)</span></td>
                        <td>8 drivers</td>
                        <td>Optimal</td>
                        <td>78%</td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="chart-card mt-20">
            <h3>Demand Prediction vs Actual</h3>
            <canvas id="demandPredictionChart"></canvas>
        </div>
    `;
}

// 4. Auto-Offer System
function createAutoOfferContent() {
    return `
        <div class="section-header">
            <h2>Auto-Offer System</h2>
            <p>Automatically send ride offers to nearby drivers</p>
        </div>
        
        <div class="card">
            <h3>System Configuration</h3>
            <div class="form-group">
                <label class="form-label">Search Radius (km)</label>
                <input type="number" class="form-input" id="searchRadius" value="5" min="1" max="20">
            </div>
            <div class="form-group">
                <label class="form-label">Offer Timeout (seconds)</label>
                <input type="number" class="form-input" id="offerTimeout" value="30" min="10" max="120">
            </div>
            <div class="form-group">
                <label class="form-label">Priority Selection</label>
                <select class="form-select" id="prioritySelection">
                    <option value="rating">Highest Rating First</option>
                    <option value="distance" selected>Nearest Driver First</option>
                    <option value="acceptance">Best Acceptance Rate</option>
                    <option value="balanced">Balanced Algorithm</option>
                </select>
            </div>
            <div class="form-group">
                <label class="flex" style="align-items: center; gap: 10px;">
                    <label class="switch">
                        <input type="checkbox" id="autoOfferEnabled" checked>
                        <span class="slider"></span>
                    </label>
                    <span>Enable Auto-Offer System</span>
                </label>
            </div>
            <button class="btn btn-primary" onclick="saveAutoOfferSettings()">Save Settings</button>
        </div>
        
        <div class="card mt-20">
            <h3>Recent Offers</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Booking ID</th>
                        <th>Driver Offered</th>
                        <th>Distance</th>
                        <th>Response Time</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>#B1234</td>
                        <td>Ravi Kumar</td>
                        <td>2.3 km</td>
                        <td>8 seconds</td>
                        <td><span class="status-badge status-active">Accepted</span></td>
                    </tr>
                    <tr>
                        <td>#B1235</td>
                        <td>Mohan Lal</td>
                        <td>4.1 km</td>
                        <td>25 seconds</td>
                        <td><span class="status-badge status-blocked">Declined</span></td>
                    </tr>
                    <tr>
                        <td>#B1236</td>
                        <td>Anil Kumar</td>
                        <td>1.8 km</td>
                        <td>5 seconds</td>
                        <td><span class="status-badge status-active">Accepted</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="stats-grid mt-20">
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-check-circle"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Acceptance Rate</div>
                    <div class="stat-value">78%</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-clock"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Avg Response Time</div>
                    <div class="stat-value">12s</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #667eea;"><i class="fas fa-bell"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Offers Sent Today</div>
                    <div class="stat-value">145</div>
                </div>
            </div>
        </div>
    `;
}

// 5. AI Speed Monitor Dashboard
function createSpeedMonitorContent() {
    return `
        <div class="section-header">
            <h2>AI Speed Monitor Dashboard</h2>
            <p>Track driver speeds in real-time and manage violations</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Active Violations</div>
                    <div class="stat-value">3</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-tachometer-alt"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Avg Speed Today</div>
                    <div class="stat-value">48 km/h</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-car"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Drivers Monitored</div>
                    <div class="stat-value">156</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <h3>Speed Violations</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Driver</th>
                        <th>Speed</th>
                        <th>Speed Limit</th>
                        <th>Location</th>
                        <th>Time</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Ravi Kumar</td>
                        <td><span class="status-badge status-blocked">95 km/h</span></td>
                        <td>60 km/h</td>
                        <td>NH-8, Jaipur</td>
                        <td>10:30 AM</td>
                        <td><button class="btn btn-warning">Send Warning</button></td>
                    </tr>
                    <tr>
                        <td>Suresh Babu</td>
                        <td><span class="status-badge status-pending">72 km/h</span></td>
                        <td>60 km/h</td>
                        <td>Jodhpur City</td>
                        <td>11:15 AM</td>
                        <td><button class="btn btn-warning">Send Warning</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="chart-card mt-20">
            <h3>Speed Distribution</h3>
            <canvas id="speedDistributionChart"></canvas>
        </div>
    `;
}

// 6. Smart Driver Matching
function createDriverMatchingContent() {
    return `
        <div class="section-header">
            <h2>Smart Driver Matching</h2>
            <p>AI-powered driver matching based on multiple criteria</p>
        </div>
        
        <div class="card">
            <h3>Matching Criteria Weights</h3>
            <div class="form-group">
                <label class="form-label">Distance Weight: <span id="distanceWeight">40%</span></label>
                <input type="range" class="form-input" id="distanceSlider" min="0" max="100" value="40" oninput="updateWeight('distance', this.value)">
            </div>
            <div class="form-group">
                <label class="form-label">Rating Weight: <span id="ratingWeight">30%</span></label>
                <input type="range" class="form-input" id="ratingSlider" min="0" max="100" value="30" oninput="updateWeight('rating', this.value)">
            </div>
            <div class="form-group">
                <label class="form-label">Vehicle Type Match: <span id="vehicleWeight">20%</span></label>
                <input type="range" class="form-input" id="vehicleSlider" min="0" max="100" value="20" oninput="updateWeight('vehicle', this.value)">
            </div>
            <div class="form-group">
                <label class="form-label">Acceptance Rate: <span id="acceptanceWeight">10%</span></label>
                <input type="range" class="form-input" id="acceptanceSlider" min="0" max="100" value="10" oninput="updateWeight('acceptance', this.value)">
            </div>
            <button class="btn btn-primary" onclick="saveMatchingCriteria()">Save Criteria</button>
        </div>
        
        <div class="stats-grid mt-20">
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-bullseye"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Match Accuracy</div>
                    <div class="stat-value">92%</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #4facfe;"><i class="fas fa-user-check"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Customer Satisfaction</div>
                    <div class="stat-value">4.7/5</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #667eea;"><i class="fas fa-sync"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Matches Today</div>
                    <div class="stat-value">342</div>
                </div>
            </div>
        </div>
    `;
}

// 7. Fraud Detection System
function createFraudDetectionContent() {
    return `
        <div class="section-header">
            <h2>Fraud Detection System</h2>
            <p>AI-powered fraud detection and prevention</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-exclamation-circle"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Suspicious Activities</div>
                    <div class="stat-value">7</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-flag"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Flagged Accounts</div>
                    <div class="stat-value">12</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-shield-alt"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Fraud Prevented</div>
                    <div class="stat-value">₹45,000</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <h3>Recent Fraud Alerts</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>User/Driver</th>
                        <th>Fraud Type</th>
                        <th>Risk Level</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>#F001</td>
                        <td>Customer #5234</td>
                        <td>Multiple fake bookings</td>
                        <td><span class="status-badge status-blocked">High</span></td>
                        <td>2024-12-10</td>
                        <td><button class="btn btn-danger">Block User</button></td>
                    </tr>
                    <tr>
                        <td>#F002</td>
                        <td>Driver #7891</td>
                        <td>Location spoofing</td>
                        <td><span class="status-badge status-pending">Medium</span></td>
                        <td>2024-12-09</td>
                        <td><button class="btn btn-warning">Investigate</button></td>
                    </tr>
                    <tr>
                        <td>#F003</td>
                        <td>Customer #3456</td>
                        <td>Payment fraud pattern</td>
                        <td><span class="status-badge status-blocked">High</span></td>
                        <td>2024-12-08</td>
                        <td><button class="btn btn-danger">Block User</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// 8. Predictive Maintenance Alerts
function createMaintenanceAlertsContent() {
    return `
        <div class="section-header">
            <h2>Predictive Maintenance Alerts</h2>
            <p>Vehicle maintenance reminders based on distance and usage</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-wrench"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Urgent Maintenance</div>
                    <div class="stat-value">8</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #feca57;"><i class="fas fa-calendar-alt"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Due This Week</div>
                    <div class="stat-value">23</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background: #43e97b;"><i class="fas fa-check-circle"></i></div>
                <div class="stat-content">
                    <div class="stat-label">Up to Date</div>
                    <div class="stat-value">125</div>
                </div>
            </div>
        </div>
        
        <div class="card mt-20">
            <h3>Maintenance Alerts</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Vehicle</th>
                        <th>Driver</th>
                        <th>Service Type</th>
                        <th>Distance Covered</th>
                        <th>Priority</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>DL 01 AB 1234</td>
                        <td>Ravi Kumar</td>
                        <td>Oil Change + Filter</td>
                        <td>9,850 km</td>
                        <td><span class="status-badge status-blocked">Urgent</span></td>
                        <td><button class="btn btn-primary">Notify Driver</button></td>
                    </tr>
                    <tr>
                        <td>DL 02 CD 5678</td>
                        <td>Mohan Lal</td>
                        <td>Tire Rotation</td>
                        <td>7,200 km</td>
                        <td><span class="status-badge status-pending">Medium</span></td>
                        <td><button class="btn btn-primary">Notify Driver</button></td>
                    </tr>
                    <tr>
                        <td>DL 03 EF 9012</td>
                        <td>Suresh Babu</td>
                        <td>Brake Inspection</td>
                        <td>12,300 km</td>
                        <td><span class="status-badge status-blocked">Urgent</span></td>
                        <td><button class="btn btn-primary">Notify Driver</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// Initialize AI Features
function initializeAIFeatures(sectionId) {
    setTimeout(() => {
        if (sectionId === 'smart-fare') {
            const ctx = document.getElementById('fareTrendsChart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'],
                        datasets: [{
                            label: 'Average Fare',
                            data: [12, 18, 15, 14, 22, 25],
                            borderColor: '#667eea',
                            tension: 0.4
                        }]
                    }
                });
            }
        } else if (sectionId === 'demand-prediction') {
            const ctx = document.getElementById('demandPredictionChart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM'],
                        datasets: [{
                            label: 'Predicted',
                            data: [20, 45, 35, 30, 50, 40],
                            backgroundColor: 'rgba(102, 126, 234, 0.5)'
                        }, {
                            label: 'Actual',
                            data: [18, 48, 32, 28, 52, 38],
                            backgroundColor: 'rgba(67, 233, 123, 0.5)'
                        }]
                    }
                });
            }
        } else if (sectionId === 'speed-monitor') {
            const ctx = document.getElementById('speedDistributionChart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['0-20', '20-40', '40-60', '60-80', '80-100', '100+'],
                        datasets: [{
                            label: 'Number of Drivers',
                            data: [5, 25, 85, 35, 8, 2],
                            backgroundColor: '#667eea'
                        }]
                    }
                });
            }
        }
        
        // Initialize range slider for surge pricing
        const surgeSlider = document.getElementById('surgeMultiplier');
        if (surgeSlider) {
            surgeSlider.addEventListener('input', (e) => {
                document.getElementById('surgeValue').textContent = e.target.value + 'x';
            });
        }
    }, 100);
}

// Action Functions
function saveAutoBlockSettings() {
    const sensitivity = document.getElementById('blockSensitivity').value;
    const enabled = document.getElementById('autoBlockEnabled').checked;
    showToast('Auto-block settings saved successfully', 'success');
    logAdminAction('UPDATE_AUTO_BLOCK_SETTINGS', `Sensitivity: ${sensitivity}, Enabled: ${enabled}`);
}

function unblockUser(userId) {
    if (confirm(`Are you sure you want to unblock user #${userId}?`)) {
        showToast(`User #${userId} has been unblocked`, 'success');
        logAdminAction('UNBLOCK_USER', `User ID: ${userId}`);
    }
}

function saveFareSettings() {
    const baseFare = document.getElementById('baseFare').value;
    const surgeMultiplier = document.getElementById('surgeMultiplier').value;
    showToast('Fare settings updated successfully', 'success');
    logAdminAction('UPDATE_FARE_SETTINGS', `Base: ₹${baseFare}/km, Surge: ${surgeMultiplier}x`);
}

function saveAutoOfferSettings() {
    showToast('Auto-offer settings saved successfully', 'success');
    logAdminAction('UPDATE_AUTO_OFFER_SETTINGS', 'Settings updated');
}

function updateWeight(type, value) {
    document.getElementById(`${type}Weight`).textContent = value + '%';
}

function saveMatchingCriteria() {
    showToast('Driver matching criteria saved successfully', 'success');
    logAdminAction('UPDATE_MATCHING_CRITERIA', 'Criteria weights updated');
}
