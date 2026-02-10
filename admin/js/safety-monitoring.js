// ===== Safety & Monitoring Features + Management Features =====

// This file contains all 8 Safety & Monitoring features plus 8 Management features
// Total: 16 additional features for the admin portal

// SAFETY & MONITORING FEATURES (Functions 1-8)

function createHealthMonitorContent() {
    return `<div class="section-header"><h2>Driver Health Monitor</h2><p>Track driver working hours, fatigue alerts, and health check reminders</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-content"><div class="stat-label">Fatigue Alerts</div><div class="stat-value">5</div></div></div></div><div class="card mt-20"><h3>Driver Working Hours</h3><table class="data-table"><thead><tr><th>Driver</th><th>Hours</th><th>Status</th></tr></thead><tbody><tr><td>Ravi Kumar</td><td>9.5 hrs</td><td><span class="status-badge status-blocked">Fatigue Alert</span></td></tr></tbody></table></div>`;
}

function createLiveTrackingContent() {
    return `<div class="section-header"><h2>Live Map Tracking</h2><p>Real-time location of all active drivers</p></div><div class="card"><h3>Live Map</h3><div style="height: 400px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;"><div class="text-center"><i class="fas fa-map fa-3x mb-20"></i><p>Live Tracking Integration</p></div></div></div>`;
}

function createSOSAlertsContent() {
    return `<div class="section-header"><h2>SOS Alerts Dashboard</h2><p>Emergency alerts management</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-exclamation-circle"></i></div><div class="stat-content"><div class="stat-label">Active SOS</div><div class="stat-value">2</div></div></div></div><div class="card mt-20"><h3>Active Alerts</h3><p>No active SOS alerts at the moment</p></div>`;
}

function createDocumentVerificationContent() {
    return `<div class="section-header"><h2>Document Verification System</h2><p>Verify driver documents</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #feca57;"><i class="fas fa-clock"></i></div><div class="stat-content"><div class="stat-label">Pending Verification</div><div class="stat-value">15</div></div></div></div><div class="card mt-20"><h3>Pending Documents</h3><table class="data-table"><thead><tr><th>Driver</th><th>Document</th><th>Actions</th></tr></thead><tbody><tr><td>Anil Kumar</td><td>Driving License</td><td><button class="btn btn-success">Approve</button></td></tr></tbody></table></div>`;
}

function createDemandHeatmapContent() {
    return `<div class="section-header"><h2>Demand Heat Map</h2><p>Visual demand representation</p></div><div class="card"><h3>Heat Map</h3><div style="height: 400px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;"><i class="fas fa-fire fa-3x"></i></div></div>`;
}

function createVirtualEscortContent() {
    return `<div class="section-header"><h2>Virtual Escort Control</h2><p>Manage virtual escort feature</p></div><div class="card"><h3>Settings</h3><div class="form-group"><label class="flex"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label><span>Enable Virtual Escort</span></label></div></div>`;
}

function createBackgroundCheckContent() {
    return `<div class="section-header"><h2>Background Check Status</h2><p>Driver verification tracking</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #43e97b;"><i class="fas fa-check-circle"></i></div><div class="stat-content"><div class="stat-label">Verified</div><div class="stat-value">142</div></div></div></div>`;
}

function createIncidentReportsContent() {
    return `<div class="section-header"><h2>Incident Reports</h2><p>Log and track incidents</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #ff6b6b;"><i class="fas fa-exclamation-circle"></i></div><div class="stat-content"><div class="stat-label">Open Incidents</div><div class="stat-value">3</div></div></div></div><div class="card mt-20"><button class="btn btn-primary"><i class="fas fa-plus"></i> Log New Incident</button></div>`;
}

// MANAGEMENT FEATURES (Functions 9-16)

function createLeaderboardContent() {
    return `<div class="section-header"><h2>Driver Leaderboard</h2><p>Top performing drivers</p></div><div class="card"><h3>Top Drivers</h3><table class="data-table"><thead><tr><th>Rank</th><th>Driver</th><th>Rides</th><th>Rating</th></tr></thead><tbody><tr><td>🥇 #1</td><td>Anil Kumar</td><td>520</td><td>⭐ 4.9</td></tr><tr><td>🥈 #2</td><td>Ravi Kumar</td><td>450</td><td>⭐ 4.8</td></tr></tbody></table></div>`;
}

function createVendorManagementContent() {
    return `<div class="section-header"><h2>Vendor Management</h2><p>Manage vehicle vendors</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #667eea;"><i class="fas fa-handshake"></i></div><div class="stat-content"><div class="stat-label">Active Vendors</div><div class="stat-value">12</div></div></div></div><div class="card mt-20"><button class="btn btn-primary"><i class="fas fa-plus"></i> Add Vendor</button></div>`;
}

function createServiceAlertsContent() {
    return `<div class="section-header"><h2>Service Alerts System</h2><p>Send notifications to users</p></div><div class="card"><h3>Send Alert</h3><div class="form-group"><label class="form-label">Recipient</label><select class="form-select"><option>All Drivers</option><option>All Customers</option></select></div><div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" placeholder="Enter message..."></textarea></div><button class="btn btn-primary"><i class="fas fa-paper-plane"></i> Send</button></div>`;
}

function createSupportDashboardContent() {
    return `<div class="section-header"><h2>Customer Support Dashboard</h2><p>Manage support tickets</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #feca57;"><i class="fas fa-ticket-alt"></i></div><div class="stat-content"><div class="stat-label">Open Tickets</div><div class="stat-value">23</div></div></div></div><div class="card mt-20"><h3>Recent Tickets</h3><table class="data-table"><thead><tr><th>ID</th><th>Customer</th><th>Issue</th><th>Status</th></tr></thead><tbody><tr><td>#TKT001</td><td>Rajesh Kumar</td><td>Payment Issue</td><td><span class="status-badge status-pending">Open</span></td></tr></tbody></table></div>`;
}

function createDriverApprovalContent() {
    return `<div class="section-header"><h2>Driver Approval Workflow</h2><p>Review new driver applications</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #feca57;"><i class="fas fa-user-clock"></i></div><div class="stat-content"><div class="stat-label">Pending</div><div class="stat-value">12</div></div></div></div><div class="card mt-20"><h3>Applications</h3><table class="data-table"><thead><tr><th>Name</th><th>Phone</th><th>Actions</th></tr></thead><tbody><tr><td>Vikram Singh</td><td>+91 98765-12345</td><td><button class="btn btn-success">Approve</button></td></tr></tbody></table></div>`;
}

function createPromoOffersContent() {
    return `<div class="section-header"><h2>Promotional Offers</h2><p>Manage discount codes and campaigns</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon" style="background: #667eea;"><i class="fas fa-tags"></i></div><div class="stat-content"><div class="stat-label">Active Offers</div><div class="stat-value">8</div></div></div></div><div class="card mt-20"><button class="btn btn-primary"><i class="fas fa-plus"></i> Create Offer</button></div>`;
}

function createSystemConfigContent() {
    return `<div class="section-header"><h2>System Configuration</h2><p>Manage app settings</p></div><div class="card"><h3>Feature Toggles</h3><div class="form-group"><label class="flex"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label><span>Enable New Bookings</span></label></div><div class="form-group"><label class="flex"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label><span>Enable Surge Pricing</span></label></div><button class="btn btn-primary">Save Configuration</button></div>`;
}

function createAuditLogsContent() {
    return `<div class="section-header"><h2>Audit Logs</h2><p>Track all admin actions</p></div><div class="card"><h3>Activity Logs</h3><table class="data-table"><thead><tr><th>Timestamp</th><th>Admin</th><th>Action</th><th>Details</th></tr></thead><tbody id="auditLogsList"><tr><td>Loading...</td><td>-</td><td>-</td><td>-</td></tr></tbody></table></div>`;
}

// Initialize Safety & Management Features
function initializeSafetyFeatures(sectionId) {
    if (sectionId === 'audit-logs') {
        setTimeout(loadAuditLogs, 100);
    }
}

function loadAuditLogs() {
    const logs = JSON.parse(localStorage.getItem('adminAuditLogs') || '[]');
    const tbody = document.getElementById('auditLogsList');
    if (tbody && logs.length > 0) {
        tbody.innerHTML = logs.slice(0, 50).map(log => `
            <tr>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td>${log.admin}</td>
                <td><span class="status-badge status-active">${log.action}</span></td>
                <td>${log.details}</td>
            </tr>
        `).join('');
    }
}
