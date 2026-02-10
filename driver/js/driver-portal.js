// Driver Portal - Main JavaScript
// LocalStorage keys
const STORAGE_KEYS = {
    DRIVER_DATA: 'driver_data',
    ONLINE_STATUS: 'online_status',
    EARNINGS: 'earnings_data',
    TRIPS: 'trips_data',
    DRIVING_HOURS: 'driving_hours',
    PREFERENCES: 'driver_preferences'
};

// Driver State
let driverState = {
    isOnline: false,
    currentRide: null,
    todayEarnings: 0,
    todayTrips: 0,
    rating: 4.8,
    onlineHours: 0,
    drivingHours: 0,
    location: null,
    batteryLevel: 100,
    networkStatus: 'good',
    restRequired: false
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeDriver();
    setupEventListeners();
    checkSystemStatus();
    loadDemoData();
    startStatusMonitoring();
});

// Initialize Driver Data
function initializeDriver() {
    // Load saved data
    const savedData = localStorage.getItem(STORAGE_KEYS.DRIVER_DATA);
    if (savedData) {
        const data = JSON.parse(savedData);
        driverState = { ...driverState, ...data };
    }
    
    // Update UI
    updateDashboard();
    
    // Check night mode preference
    const preferences = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCES) || '{}');
    if (preferences.nightMode) {
        document.body.classList.add('night-mode');
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Online Toggle
    const onlineToggle = document.getElementById('onlineToggle');
    if (onlineToggle) {
        onlineToggle.addEventListener('change', handleOnlineToggle);
    }
    
    // Night Mode Toggle
    const nightModeToggle = document.getElementById('nightModeToggle');
    if (nightModeToggle) {
        nightModeToggle.addEventListener('click', toggleNightMode);
    }
}

// Handle Online Status Toggle
function handleOnlineToggle(event) {
    const isChecked = event.target.checked;
    
    // Check if rest is required
    if (driverState.restRequired && isChecked) {
        showToast('You must take rest before going online!', 'error');
        event.target.checked = false;
        return;
    }
    
    // Check if KYC is complete
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    if (!kycData.verified && isChecked) {
        showToast('Complete KYC verification first!', 'error');
        event.target.checked = false;
        openKYC();
        return;
    }
    
    driverState.isOnline = isChecked;
    updateOnlineStatus();
    
    if (isChecked) {
        showToast('You are now online!', 'success');
        startGPSTracking();
        checkForRideRequests();
    } else {
        showToast('You are now offline', 'info');
        stopGPSTracking();
    }
    
    saveDriverData();
}

// Update Online Status Display
function updateOnlineStatus() {
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = driverState.isOnline ? 'Online' : 'Offline';
        statusText.style.color = driverState.isOnline ? 'var(--success-color)' : 'var(--text-secondary)';
    }
}

// Update Dashboard
function updateDashboard() {
    // Today's Earnings
    document.getElementById('todayEarnings').textContent = `₹${driverState.todayEarnings.toFixed(2)}`;
    
    // Today's Trips
    document.getElementById('todayTrips').textContent = driverState.todayTrips;
    
    // Rating
    document.getElementById('driverRating').textContent = driverState.rating.toFixed(1);
    
    // Online Hours
    document.getElementById('onlineHours').textContent = `${driverState.onlineHours}h`;
    
    // Update status
    updateOnlineStatus();
    
    // Update KYC status
    updateKYCStatus();
    
    // Update wallet balance
    updateWalletBalance();
}

// Check System Status
function checkSystemStatus() {
    // Battery Status
    if ('getBattery' in navigator) {
        navigator.getBattery().then(function(battery) {
            updateBatteryStatus(battery.level * 100, battery.charging);
            
            battery.addEventListener('levelchange', function() {
                updateBatteryStatus(battery.level * 100, battery.charging);
            });
        });
    } else {
        document.getElementById('batteryStatus').textContent = 'Not available';
    }
    
    // Network Status
    updateNetworkStatus();
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    
    // GPS Status
    checkGPSStatus();
}

// Update Battery Status
function updateBatteryStatus(level, charging) {
    const batteryIcon = document.getElementById('batteryIcon');
    const batteryStatus = document.getElementById('batteryStatus');
    const batteryItem = batteryStatus.parentElement;
    
    batteryStatus.textContent = `${Math.round(level)}%`;
    driverState.batteryLevel = level;
    
    // Update icon
    if (charging) {
        batteryIcon.className = 'fas fa-battery-bolt';
    } else if (level > 75) {
        batteryIcon.className = 'fas fa-battery-full';
    } else if (level > 50) {
        batteryIcon.className = 'fas fa-battery-three-quarters';
    } else if (level > 25) {
        batteryIcon.className = 'fas fa-battery-half';
    } else {
        batteryIcon.className = 'fas fa-battery-quarter';
    }
    
    // Update color
    batteryItem.classList.remove('good', 'warning', 'danger');
    if (level > 50) {
        batteryItem.classList.add('good');
    } else if (level > 20) {
        batteryItem.classList.add('warning');
    } else {
        batteryItem.classList.add('danger');
        if (driverState.isOnline) {
            showToast('Battery low! Please charge your phone.', 'warning');
        }
    }
}

// Update Network Status
function updateNetworkStatus() {
    const networkIcon = document.getElementById('networkIcon');
    const networkStatus = document.getElementById('networkStatus');
    const networkItem = networkStatus.parentElement;
    
    const isOnline = navigator.onLine;
    
    if (isOnline) {
        // Check connection type if available
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            const effectiveType = connection.effectiveType;
            networkStatus.textContent = effectiveType || 'Connected';
            
            if (effectiveType === '4g' || effectiveType === '5g') {
                networkItem.classList.remove('warning', 'danger');
                networkItem.classList.add('good');
                driverState.networkStatus = 'good';
            } else {
                networkItem.classList.remove('good', 'danger');
                networkItem.classList.add('warning');
                driverState.networkStatus = 'slow';
            }
        } else {
            networkStatus.textContent = 'Connected';
            networkItem.classList.remove('warning', 'danger');
            networkItem.classList.add('good');
            driverState.networkStatus = 'good';
        }
    } else {
        networkStatus.textContent = 'Offline';
        networkItem.classList.remove('good', 'warning');
        networkItem.classList.add('danger');
        driverState.networkStatus = 'offline';
        showToast('Network connection lost!', 'error');
    }
}

// Check GPS Status
function checkGPSStatus() {
    const gpsIcon = document.getElementById('gpsIcon');
    const gpsStatus = document.getElementById('gpsStatus');
    const gpsItem = gpsStatus.parentElement;
    
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                gpsStatus.textContent = 'Active';
                gpsItem.classList.remove('warning', 'danger');
                gpsItem.classList.add('good');
                driverState.location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
            },
            function(error) {
                gpsStatus.textContent = 'Disabled';
                gpsItem.classList.remove('good', 'warning');
                gpsItem.classList.add('danger');
                showToast('Please enable GPS for accurate tracking', 'warning');
            }
        );
    } else {
        gpsStatus.textContent = 'Not supported';
        gpsItem.classList.remove('good', 'warning');
        gpsItem.classList.add('danger');
    }
}

// Start GPS Tracking
function startGPSTracking() {
    if ('geolocation' in navigator) {
        driverState.watchId = navigator.geolocation.watchPosition(
            function(position) {
                driverState.location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                };
                
                // Update speed monitoring if in ride
                if (driverState.currentRide) {
                    updateSpeedMonitoring(position.coords.speed);
                }
            },
            function(error) {
                console.error('GPS tracking error:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    }
}

// Stop GPS Tracking
function stopGPSTracking() {
    if (driverState.watchId) {
        navigator.geolocation.clearWatch(driverState.watchId);
        driverState.watchId = null;
    }
}

// Toggle Night Mode
function toggleNightMode() {
    document.body.classList.toggle('night-mode');
    
    const preferences = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCES) || '{}');
    preferences.nightMode = document.body.classList.contains('night-mode');
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
    
    showToast(preferences.nightMode ? 'Night mode enabled' : 'Night mode disabled', 'info');
}

// Check for Ride Requests (Demo)
function checkForRideRequests() {
    if (!driverState.isOnline) return;
    
    // Simulate ride request after random delay (demo)
    const delay = Math.random() * 30000 + 10000; // 10-40 seconds
    setTimeout(() => {
        if (driverState.isOnline && !driverState.currentRide) {
            showRideRequest();
        }
    }, delay);
}

// Show Ride Request
function showRideRequest() {
    const modal = document.getElementById('rideRequestModal');
    modal.style.display = 'flex';
    
    // Demo data
    const pickups = ['Jaipur Railway Station', 'Airport', 'Hawa Mahal', 'City Palace', 'Amber Fort'];
    const drops = ['Hotel Taj', 'Airport', 'Pink City', 'Bus Stand', 'Mall Road'];
    
    document.getElementById('requestPickup').textContent = pickups[Math.floor(Math.random() * pickups.length)];
    document.getElementById('requestDrop').textContent = drops[Math.floor(Math.random() * drops.length)];
    document.getElementById('requestFare').textContent = `₹${(Math.random() * 500 + 100).toFixed(0)}`;
    
    // Start countdown
    let timeLeft = 30;
    const timer = setInterval(() => {
        timeLeft--;
        document.getElementById('requestTimer').textContent = `${timeLeft}s`;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            rejectRequest();
        }
    }, 1000);
    
    // Store timer to clear later
    driverState.requestTimer = timer;
}

// Accept Ride Request
function acceptRequest() {
    // Clear timer
    if (driverState.requestTimer) {
        clearInterval(driverState.requestTimer);
    }
    
    // Hide modal
    document.getElementById('rideRequestModal').style.display = 'none';
    
    // Create ride
    driverState.currentRide = {
        id: '#' + Math.floor(Math.random() * 100000),
        pickup: document.getElementById('requestPickup').textContent,
        drop: document.getElementById('requestDrop').textContent,
        fare: document.getElementById('requestFare').textContent,
        status: 'Accepted',
        startTime: Date.now()
    };
    
    // Show current ride section
    const rideSection = document.getElementById('currentRideSection');
    rideSection.style.display = 'block';
    
    document.getElementById('currentRideId').textContent = driverState.currentRide.id;
    document.getElementById('currentRideStatus').textContent = 'Going to Pickup';
    document.getElementById('pickupLocation').textContent = driverState.currentRide.pickup;
    document.getElementById('dropLocation').textContent = driverState.currentRide.drop;
    
    showToast('Ride accepted! Navigate to pickup location.', 'success');
    saveDriverData();
}

// Reject Ride Request
function rejectRequest() {
    if (driverState.requestTimer) {
        clearInterval(driverState.requestTimer);
    }
    
    document.getElementById('rideRequestModal').style.display = 'none';
    showToast('Ride request rejected', 'info');
    
    // Check for next request
    checkForRideRequests();
}

// Navigate Route
function navigateRoute() {
    if (!driverState.location) {
        showToast('GPS location not available', 'error');
        return;
    }
    
    const destination = driverState.currentRide.drop;
    
    // Open Google Maps
    const url = `https://www.google.com/maps/dir/?api=1&origin=${driverState.location.lat},${driverState.location.lng}&destination=${encodeURIComponent(destination)}`;
    window.open(url, '_blank');
    
    showToast('Opening navigation...', 'info');
}

// Complete Ride
function completeRide() {
    if (!driverState.currentRide) return;
    
    // Calculate earnings
    const fareAmount = parseFloat(driverState.currentRide.fare.replace('₹', ''));
    driverState.todayEarnings += fareAmount;
    driverState.todayTrips++;
    
    // Update driving hours
    const drivingTime = (Date.now() - driverState.currentRide.startTime) / (1000 * 60 * 60);
    driverState.drivingHours += drivingTime;
    driverState.onlineHours += drivingTime;
    
    // Check fatigue
    checkFatigue();
    
    // Save fare before clearing ride
    const completedFare = driverState.currentRide.fare;
    
    // Save trip
    saveTrip(driverState.currentRide);
    
    // Clear current ride
    driverState.currentRide = null;
    document.getElementById('currentRideSection').style.display = 'none';
    
    // Update dashboard
    updateDashboard();
    
    showToast(`Ride completed! Earned ${completedFare}`, 'success');
    
    // Check for next request
    checkForRideRequests();
    
    saveDriverData();
}

// Check Fatigue
function checkFatigue() {
    if (driverState.drivingHours >= 8) {
        driverState.restRequired = true;
        driverState.isOnline = false;
        
        // Update toggle
        const onlineToggle = document.getElementById('onlineToggle');
        if (onlineToggle) {
            onlineToggle.checked = false;
        }
        
        // Show fatigue alert
        const fatigueAlert = document.getElementById('fatigueAlert');
        fatigueAlert.style.display = 'flex';
        
        document.getElementById('drivingHours').textContent = driverState.drivingHours.toFixed(1);
        
        // Start rest timer (30 minutes demo)
        startRestTimer(30);
        
        showToast('Mandatory rest period started. You must rest for 30 minutes.', 'warning');
        
        stopGPSTracking();
        updateOnlineStatus();
    }
}

// Start Rest Timer
function startRestTimer(minutes) {
    let timeLeft = minutes * 60; // in seconds
    
    const timer = setInterval(() => {
        timeLeft--;
        
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        
        document.getElementById('restTimer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            driverState.restRequired = false;
            driverState.drivingHours = 0;
            document.getElementById('fatigueAlert').style.display = 'none';
            showToast('Rest period complete! You can go online now.', 'success');
            saveDriverData();
        }
    }, 1000);
}

// Save Trip
function saveTrip(trip) {
    const trips = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRIPS) || '[]');
    trips.unshift({
        ...trip,
        completedAt: Date.now()
    });
    localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips.slice(0, 100))); // Keep last 100 trips
}

// Save Driver Data
function saveDriverData() {
    localStorage.setItem(STORAGE_KEYS.DRIVER_DATA, JSON.stringify(driverState));
}

// Start Status Monitoring
function startStatusMonitoring() {
    // Update online hours every minute
    setInterval(() => {
        if (driverState.isOnline && !driverState.currentRide) {
            driverState.onlineHours += 1/60; // 1 minute
            document.getElementById('onlineHours').textContent = `${Math.floor(driverState.onlineHours)}h`;
        }
        
        if (driverState.currentRide) {
            driverState.drivingHours += 1/60;
        }
    }, 60000);
    
    // Save data every 5 minutes
    setInterval(saveDriverData, 300000);
}

// Load Demo Data
function loadDemoData() {
    // Initialize with demo data if first time
    if (!localStorage.getItem(STORAGE_KEYS.DRIVER_DATA)) {
        driverState.rating = 4.8;
        driverState.todayEarnings = 850.50;
        driverState.todayTrips = 12;
        driverState.onlineHours = 6;
        saveDriverData();
        updateDashboard();
    }
}

// Update KYC Status
function updateKYCStatus() {
    const kycData = JSON.parse(localStorage.getItem('kyc_data') || '{}');
    const statusElement = document.getElementById('kycStatus');
    
    if (kycData.verified) {
        statusElement.textContent = 'Verified ✓';
        statusElement.style.color = 'var(--success-color)';
    } else {
        statusElement.textContent = 'Pending';
        statusElement.style.color = 'var(--warning-color)';
    }
}

// Update Wallet Balance
function updateWalletBalance() {
    const walletData = JSON.parse(localStorage.getItem('wallet_data') || '{"balance": 0}');
    document.getElementById('walletBalance').textContent = `₹${walletData.balance.toFixed(2)}`;
}

// Show Toast Notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--danger-color)' : type === 'warning' ? 'var(--warning-color)' : 'var(--info-color)'};
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        animation: slideDown 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Navigation Functions
function showHome() {
    // Already on home
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.nav-item')[0].classList.add('active');
}

function showProfile() {
    openProfile();
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes slideUp {
        from {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        to {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
