// ===== Admin Portal Core Functionality =====

// Theme Management
const themeToggle = document.getElementById('themeToggle');
const currentTheme = localStorage.getItem('adminTheme') || 'light';

// Set initial theme
if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
}

themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'light');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        localStorage.setItem('adminTheme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        localStorage.setItem('adminTheme', 'dark');
    }
});

// Navigation Management
const menuItems = document.querySelectorAll('.menu-item');
const contentSections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('pageTitle');

menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = item.getAttribute('data-section');
        
        // Update active menu item
        menuItems.forEach(mi => mi.classList.remove('active'));
        item.classList.add('active');
        
        // Update active content section
        contentSections.forEach(section => section.classList.remove('active'));
        const targetSection = document.getElementById(`section-${sectionId}`);
        if (targetSection) {
            targetSection.classList.add('active');
            
            // Update page title
            const sectionTitle = item.querySelector('span').textContent;
            pageTitle.textContent = sectionTitle;
            
            // Load section content if empty
            loadSectionContent(sectionId, targetSection);
            
            // Close mobile sidebar
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('mobile-open');
            }
        }
    });
});

// Mobile Menu Toggle
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const sidebarClose = document.getElementById('sidebarClose');

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        sidebar.classList.add('mobile-open');
    });
}

if (sidebarClose) {
    sidebarClose.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
    });
}

// Sidebar Search
const sidebarSearch = document.getElementById('sidebarSearch');
sidebarSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    menuItems.forEach(item => {
        const text = item.querySelector('span').textContent.toLowerCase();
        const section = item.closest('.menu-section');
        if (text.includes(searchTerm)) {
            item.style.display = 'flex';
            if (section) section.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
    
    // Hide empty sections
    document.querySelectorAll('.menu-section').forEach(section => {
        const visibleItems = section.querySelectorAll('.menu-item[style="display: flex;"]');
        if (visibleItems.length === 0 && searchTerm) {
            section.style.display = 'none';
        } else {
            section.style.display = 'block';
        }
    });
});

// Logout Functionality
document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('currentAdmin');
        localStorage.removeItem('userRole');
        window.location.href = '../pages/login.html';
    }
});

// Toast Notification System
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Loading Overlay
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

// Initialize Demo Data
function initializeDemoData() {
    // Check if demo data already exists
    if (!localStorage.getItem('adminDemoInitialized')) {
        // Create demo users
        const demoUsers = [
            { id: 1, name: 'Rajesh Kumar', email: 'rajesh@example.com', phone: '9876543210', status: 'active', joinDate: '2024-01-15' },
            { id: 2, name: 'Priya Sharma', email: 'priya@example.com', phone: '9876543211', status: 'active', joinDate: '2024-02-20' },
            { id: 3, name: 'Amit Patel', email: 'amit@example.com', phone: '9876543212', status: 'inactive', joinDate: '2024-03-10' },
            { id: 4, name: 'Sneha Reddy', email: 'sneha@example.com', phone: '9876543213', status: 'active', joinDate: '2024-04-05' },
            { id: 5, name: 'Vikram Singh', email: 'vikram@example.com', phone: '9876543214', status: 'blocked', joinDate: '2024-05-12' }
        ];
        
        // Create demo drivers
        const demoDrivers = [
            { id: 1, name: 'Ravi Kumar', email: 'ravi@example.com', phone: '8765432109', vehicle: 'Sedan - DL 01 AB 1234', rating: 4.8, totalRides: 450, status: 'available', revenue: 125000 },
            { id: 2, name: 'Mohan Lal', email: 'mohan@example.com', phone: '8765432108', vehicle: 'SUV - DL 02 CD 5678', rating: 4.9, totalRides: 380, status: 'on-trip', revenue: 98000 },
            { id: 3, name: 'Suresh Babu', email: 'suresh@example.com', phone: '8765432107', vehicle: 'Hatchback - DL 03 EF 9012', rating: 4.5, totalRides: 290, status: 'offline', revenue: 72000 },
            { id: 4, name: 'Anil Kumar', email: 'anil@example.com', phone: '8765432106', vehicle: 'Sedan - DL 04 GH 3456', rating: 4.7, totalRides: 520, status: 'available', revenue: 145000 },
            { id: 5, name: 'Dinesh Yadav', email: 'dinesh@example.com', phone: '8765432105', vehicle: 'SUV - DL 05 IJ 7890', rating: 4.6, totalRides: 310, status: 'available', revenue: 89000 }
        ];
        
        // Create demo bookings
        const demoBookings = [
            { id: 1, customerId: 1, driverId: 1, from: 'Jaipur Railway Station', to: 'Hawa Mahal', fare: 450, status: 'completed', date: '2024-12-01' },
            { id: 2, customerId: 2, driverId: 2, from: 'Jodhpur Airport', to: 'Mehrangarh Fort', fare: 650, status: 'completed', date: '2024-12-02' },
            { id: 3, customerId: 3, driverId: 1, from: 'Udaipur City Palace', to: 'Lake Pichola', fare: 350, status: 'cancelled', date: '2024-12-03' },
            { id: 4, customerId: 4, driverId: 3, from: 'Jaisalmer Fort', to: 'Sam Sand Dunes', fare: 1200, status: 'completed', date: '2024-12-04' },
            { id: 5, customerId: 1, driverId: 4, from: 'Amber Fort', to: 'Jal Mahal', fare: 550, status: 'completed', date: '2024-12-05' }
        ];
        
        // Store demo data
        localStorage.setItem('adminDemoUsers', JSON.stringify(demoUsers));
        localStorage.setItem('adminDemoDrivers', JSON.stringify(demoDrivers));
        localStorage.setItem('adminDemoBookings', JSON.stringify(demoBookings));
        localStorage.setItem('adminDemoInitialized', 'true');
    }
}

// Get demo data
function getDemoData(type) {
    const data = localStorage.getItem(`adminDemo${type}`);
    return data ? JSON.parse(data) : [];
}

// Update dashboard statistics
function updateDashboardStats() {
    const users = getDemoData('Users');
    const drivers = getDemoData('Drivers');
    const bookings = getDemoData('Bookings');
    
    const activeDrivers = drivers.filter(d => d.status === 'available' || d.status === 'on-trip').length;
    const totalRevenue = bookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + b.fare, 0);
    
    document.getElementById('stat-users').textContent = users.length;
    document.getElementById('stat-drivers').textContent = activeDrivers + ' / ' + drivers.length;
    document.getElementById('stat-bookings').textContent = bookings.length;
    document.getElementById('stat-revenue').textContent = '₹' + totalRevenue.toLocaleString();
}

// Load section content dynamically
function loadSectionContent(sectionId, targetSection) {
    // Skip if content already loaded
    if (targetSection.innerHTML.trim() !== '') return;
    
    showLoading();
    
    setTimeout(() => {
        let content = '';
        
        switch(sectionId) {
            case 'ai-auto-block':
                content = createAutoBlockContent();
                break;
            case 'smart-fare':
                content = createSmartFareContent();
                break;
            case 'demand-prediction':
                content = createDemandPredictionContent();
                break;
            case 'auto-offer':
                content = createAutoOfferContent();
                break;
            case 'speed-monitor':
                content = createSpeedMonitorContent();
                break;
            case 'driver-matching':
                content = createDriverMatchingContent();
                break;
            case 'fraud-detection':
                content = createFraudDetectionContent();
                break;
            case 'maintenance-alerts':
                content = createMaintenanceAlertsContent();
                break;
            case 'affiliate-tracking':
                content = createAffiliateTrackingContent();
                break;
            case 'donation-reports':
                content = createDonationReportsContent();
                break;
            case 'cancellation-earnings':
                content = createCancellationEarningsContent();
                break;
            case 'tax-reports':
                content = createTaxReportsContent();
                break;
            case 'insurance-fund':
                content = createInsuranceFundContent();
                break;
            case 'revenue-analytics':
                content = createRevenueAnalyticsContent();
                break;
            case 'driver-payout':
                content = createDriverPayoutContent();
                break;
            case 'expense-tracking':
                content = createExpenseTrackingContent();
                break;
            case 'health-monitor':
                content = createHealthMonitorContent();
                break;
            case 'live-tracking':
                content = createLiveTrackingContent();
                break;
            case 'sos-alerts':
                content = createSOSAlertsContent();
                break;
            case 'document-verification':
                content = createDocumentVerificationContent();
                break;
            case 'demand-heatmap':
                content = createDemandHeatmapContent();
                break;
            case 'virtual-escort':
                content = createVirtualEscortContent();
                break;
            case 'background-check':
                content = createBackgroundCheckContent();
                break;
            case 'incident-reports':
                content = createIncidentReportsContent();
                break;
            case 'leaderboard':
                content = createLeaderboardContent();
                break;
            case 'vendor-management':
                content = createVendorManagementContent();
                break;
            case 'service-alerts':
                content = createServiceAlertsContent();
                break;
            case 'support-dashboard':
                content = createSupportDashboardContent();
                break;
            case 'driver-approval':
                content = createDriverApprovalContent();
                break;
            case 'promo-offers':
                content = createPromoOffersContent();
                break;
            case 'system-config':
                content = createSystemConfigContent();
                break;
            case 'audit-logs':
                content = createAuditLogsContent();
                break;
            default:
                content = '<div class="section-header"><h2>Section Not Found</h2></div>';
        }
        
        targetSection.innerHTML = content;
        hideLoading();
        
        // Initialize any charts or special functionality for the section
        initializeSectionFeatures(sectionId);
    }, 300);
}

// Initialize section-specific features
function initializeSectionFeatures(sectionId) {
    // This function will be extended by other JS files
    if (typeof initializeAIFeatures === 'function' && sectionId.includes('ai-') || 
        ['speed-monitor', 'driver-matching', 'fraud-detection', 'maintenance-alerts'].includes(sectionId)) {
        initializeAIFeatures(sectionId);
    }
    if (typeof initializeFinancialFeatures === 'function' && 
        ['affiliate-tracking', 'donation-reports', 'cancellation-earnings', 'tax-reports', 
         'insurance-fund', 'revenue-analytics', 'driver-payout', 'expense-tracking'].includes(sectionId)) {
        initializeFinancialFeatures(sectionId);
    }
    if (typeof initializeSafetyFeatures === 'function' && 
        ['health-monitor', 'live-tracking', 'sos-alerts', 'document-verification', 
         'demand-heatmap', 'virtual-escort', 'background-check', 'incident-reports'].includes(sectionId)) {
        initializeSafetyFeatures(sectionId);
    }
}

// Initialize charts on dashboard
function initializeDashboardCharts() {
    // Revenue Chart
    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Revenue (₹)',
                    data: [12000, 19000, 15000, 25000, 22000, 30000, 28000, 35000, 32000, 38000, 42000, 45000],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₹' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Booking Status Chart
    const bookingCtx = document.getElementById('bookingChart');
    if (bookingCtx) {
        new Chart(bookingCtx, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'In Progress', 'Cancelled', 'Pending'],
                datasets: [{
                    data: [450, 85, 35, 60],
                    backgroundColor: ['#43e97b', '#4facfe', '#ff6b6b', '#feca57']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

// Load recent activity
function loadRecentActivity() {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;
    
    const activities = [
        { icon: 'fas fa-user-plus', bg: '#667eea', title: 'New user registered', time: '5 minutes ago' },
        { icon: 'fas fa-car', bg: '#f093fb', title: 'Driver Ravi Kumar completed a ride', time: '12 minutes ago' },
        { icon: 'fas fa-money-bill', bg: '#43e97b', title: 'Payment of ₹650 received', time: '25 minutes ago' },
        { icon: 'fas fa-exclamation-triangle', bg: '#feca57', title: 'SOS alert resolved', time: '1 hour ago' },
        { icon: 'fas fa-file-alt', bg: '#4facfe', title: 'New document submitted for verification', time: '2 hours ago' }
    ];
    
    activityList.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon" style="background: ${activity.bg};">
                <i class="${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-time">${activity.time}</div>
            </div>
        </div>
    `).join('');
}

// Log admin action
function logAdminAction(action, details) {
    const logs = JSON.parse(localStorage.getItem('adminAuditLogs') || '[]');
    logs.unshift({
        timestamp: new Date().toISOString(),
        action: action,
        details: details,
        admin: 'Admin User'
    });
    // Keep only last 1000 logs
    if (logs.length > 1000) logs.pop();
    localStorage.setItem('adminAuditLogs', JSON.stringify(logs));
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const userRole = localStorage.getItem('userRole');
    if (userRole !== 'admin') {
        // Redirect to login for demo purposes, or allow access
        console.log('Admin access - demo mode');
    }
    
    // Initialize demo data
    initializeDemoData();
    
    // Update dashboard stats
    updateDashboardStats();
    
    // Initialize dashboard charts
    initializeDashboardCharts();
    
    // Load recent activity
    loadRecentActivity();
    
    // Log admin login
    logAdminAction('LOGIN', 'Admin logged into portal');
});

// Auto-refresh dashboard every 60 seconds
setInterval(() => {
    if (document.getElementById('section-dashboard').classList.contains('active')) {
        updateDashboardStats();
        loadRecentActivity();
    }
}, 60000);
