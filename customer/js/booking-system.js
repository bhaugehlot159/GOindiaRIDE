/**
 * GO India RIDE - Booking System
 * Handles all booking-related functionality
 */

// Initialize booking system
document.addEventListener('DOMContentLoaded', function() {
    initializeBookingSystem();
    setupBookingForm();
    setupScheduleForm();
    setupFareCalculator();
});

/**
 * Initialize booking system
 */
function initializeBookingSystem() {
    console.log('Booking system initialized');
    
    // Load active bookings
    loadActiveBookings();
    loadScheduledBookings();
    
    // Setup ride preferences
    loadRidePreferences();
}

/**
 * Setup booking form
 */
function setupBookingForm() {
    const form = document.getElementById('bookingForm');
    
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        handleBookingSubmit();
    });
    
    // Auto-calculate fare when inputs change
    const pickup = document.getElementById('pickupLocation');
    const drop = document.getElementById('dropLocation');
    const vehicleType = document.getElementById('vehicleType');
    
    [pickup, drop, vehicleType].forEach(input => {
        if (input) {
            input.addEventListener('change', calculateFarePreview);
        }
    });
}

/**
 * Handle booking submission
 */
function handleBookingSubmit() {
    const pickup = document.getElementById('pickupLocation').value;
    const drop = document.getElementById('dropLocation').value;
    const vehicleType = document.getElementById('vehicleType').value;
    const acPreference = document.getElementById('acPreference').checked;
    const luggageSpace = document.getElementById('luggageSpace').checked;
    
    if (!pickup || !drop) {
        CustomerPortal.showToast('Please enter pickup and drop locations', 'error');
        return;
    }
    
    // Check if first booking
    const isFirstBooking = localStorage.getItem('goindiaride_user_type') === 'new';
    
    CustomerPortal.showLoading();
    
    // Simulate booking process
    setTimeout(() => {
        const booking = {
            id: 'BOOK' + Date.now(),
            pickup,
            drop,
            vehicleType,
            acPreference,
            luggageSpace,
            status: 'searching',
            timestamp: new Date().toISOString(),
            fare: calculateFare(pickup, drop, vehicleType),
            discount: isFirstBooking ? 5 : 0,
            otp: generateOTP()
        };
        
        // Apply first booking discount
        if (isFirstBooking) {
            booking.finalFare = booking.fare * 0.95; // 5% discount
            localStorage.setItem('goindiaride_user_type', 'existing');
        } else {
            booking.finalFare = booking.fare;
        }
        
        // Save booking
        saveBooking(booking);
        
        CustomerPortal.hideLoading();
        CustomerPortal.closeModal('bookingModal');
        
        // Show success message
        const message = isFirstBooking 
            ? `Booking confirmed! First ride discount applied: ₹${(booking.fare - booking.finalFare).toFixed(0)} saved!`
            : 'Booking confirmed! Searching for driver...';
        
        CustomerPortal.showToast(message, 'success');
        
        // Open live trip modal
        setTimeout(() => {
            openLiveTripModal(booking);
        }, 1000);
        
        // Update ride history
        addToRideHistory(booking);
    }, 2000);
}

/**
 * Calculate fare preview
 */
function calculateFarePreview() {
    const pickup = document.getElementById('pickupLocation').value;
    const drop = document.getElementById('dropLocation').value;
    const vehicleType = document.getElementById('vehicleType').value;
    
    if (!pickup || !drop) return;
    
    const fare = calculateFare(pickup, drop, vehicleType);
    const isFirstBooking = localStorage.getItem('goindiaride_user_type') === 'new';
    const discount = isFirstBooking ? fare * 0.05 : 0;
    const finalFare = fare - discount;
    
    const preview = document.getElementById('farePreview');
    preview.innerHTML = `
        <h4>Fare Estimate</h4>
        <div style="margin: 1rem 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Base Fare:</span>
                <span>₹${fare.toFixed(0)}</span>
            </div>
            ${isFirstBooking ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; color: #06A77D;">
                    <span>First Ride Discount (5%):</span>
                    <span>-₹${discount.toFixed(0)}</span>
                </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 2px solid var(--border-color); padding-top: 0.5rem;">
                <span>Total:</span>
                <span>₹${finalFare.toFixed(0)}</span>
            </div>
        </div>
        <small style="color: var(--text-light);">*Actual fare may vary based on traffic and route</small>
    `;
}

/**
 * Calculate fare based on distance and vehicle type
 */
function calculateFare(pickup, drop, vehicleType) {
    // Simulate distance calculation (in production, use actual maps API)
    const baseDistance = 10; // km
    const randomVariation = Math.random() * 10;
    const distance = baseDistance + randomVariation;
    
    // Vehicle type rates per km
    const rates = {
        'mini': 8,
        'sedan': 12,
        'suv': 18,
        'luxury': 25
    };
    
    const rate = rates[vehicleType] || rates['sedan'];
    const baseFare = distance * rate;
    
    // Add base charge
    const baseCharge = 50;
    
    return baseFare + baseCharge;
}

/**
 * Save booking
 */
function saveBooking(booking) {
    const bookings = JSON.parse(localStorage.getItem('goindiaride_active_bookings') || '[]');
    bookings.push(booking);
    localStorage.setItem('goindiaride_active_bookings', JSON.stringify(bookings));
    
    loadActiveBookings();
}

/**
 * Load active bookings
 */
function loadActiveBookings() {
    const bookings = JSON.parse(localStorage.getItem('goindiaride_active_bookings') || '[]');
    const container = document.getElementById('activeBookingsList');
    
    if (!container) return;
    
    if (bookings.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">No active bookings</p>';
        return;
    }
    
    container.innerHTML = bookings.map(booking => `
        <div class="booking-item">
            <div>
                <strong>${booking.pickup} → ${booking.drop}</strong>
                <div>
                    <span class="badge badge-${booking.status}">${booking.status}</span> •
                    <span>₹${booking.finalFare.toFixed(0)}</span>
                </div>
                <small>${new Date(booking.timestamp).toLocaleString()}</small>
            </div>
            <button class="btn-primary" onclick="viewLiveTrip('${booking.id}')">
                <i class="fas fa-eye"></i> Track
            </button>
        </div>
    `).join('');
}

/**
 * Open live trip modal
 */
function openLiveTripModal(booking) {
    // Generate demo driver data
    const drivers = [
        { name: 'Rajesh Kumar', vehicle: 'Maruti Swift - RJ14AB1234', rating: 4.8, phone: '+91 98765 43210' },
        { name: 'Suresh Sharma', vehicle: 'Honda City - RJ14CD5678', rating: 4.9, phone: '+91 98765 43211' },
        { name: 'Mahesh Patel', vehicle: 'Toyota Innova - RJ14EF9012', rating: 4.7, phone: '+91 98765 43212' }
    ];
    
    const driver = drivers[Math.floor(Math.random() * drivers.length)];
    
    // Update modal content
    document.getElementById('driverName').textContent = driver.name;
    document.getElementById('vehicleDetails').textContent = driver.vehicle;
    document.getElementById('driverRating').textContent = driver.rating;
    document.getElementById('rideOTP').textContent = booking.otp;
    
    // Setup chat button
    document.getElementById('chatWithDriver')?.addEventListener('click', () => {
        CustomerPortal.closeModal('liveTripModal');
        openChatModal(driver);
    });
    
    // Setup call button (with masking)
    document.getElementById('callDriver')?.addEventListener('click', () => {
        initiateCallMasking(driver);
    });
    
    // Setup share trip button
    document.getElementById('shareTrip')?.addEventListener('click', () => {
        shareTrip(booking, driver);
    });
    
    CustomerPortal.openModal('liveTripModal');
}

/**
 * View live trip
 */
function viewLiveTrip(bookingId) {
    const bookings = JSON.parse(localStorage.getItem('goindiaride_active_bookings') || '[]');
    const booking = bookings.find(b => b.id === bookingId);
    
    if (booking) {
        openLiveTripModal(booking);
    }
}

/**
 * Generate OTP
 */
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Open chat modal
 */
function openChatModal(driver) {
    CustomerPortal.openModal('chatModal');
    
    // Load chat messages
    loadChatMessages(driver);
    
    // Setup send message
    document.getElementById('sendMessage')?.addEventListener('click', sendChatMessage);
    
    // Setup quick messages
    const quickMsgBtns = document.querySelectorAll('.quick-msg-btn');
    quickMsgBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const message = this.getAttribute('data-msg');
            sendQuickMessage(message);
        });
    });
    
    // Enter key to send
    document.getElementById('chatInput')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}

/**
 * Load chat messages
 */
function loadChatMessages(driver) {
    const chatMessages = document.getElementById('chatMessages');
    
    // Demo messages
    const messages = [
        { type: 'received', text: `Hello! I'm ${driver.name}, your driver for today.`, time: '10:30 AM' },
        { type: 'received', text: 'I will reach in 5 minutes.', time: '10:31 AM' }
    ];
    
    chatMessages.innerHTML = messages.map(msg => `
        <div class="message ${msg.type}">
            ${msg.text}
            <small style="display: block; margin-top: 0.25rem; opacity: 0.7; font-size: 0.75rem;">${msg.time}</small>
        </div>
    `).join('');
}

/**
 * Send chat message
 */
function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    const chatMessages = document.getElementById('chatMessages');
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    const messageHTML = `
        <div class="message sent">
            ${message}
            <small style="display: block; margin-top: 0.25rem; opacity: 0.7; font-size: 0.75rem;">${time}</small>
        </div>
    `;
    
    chatMessages.insertAdjacentHTML('beforeend', messageHTML);
    input.value = '';
    
    // Auto-scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Simulate driver response
    setTimeout(() => {
        const response = `
            <div class="message received">
                Okay, noted!
                <small style="display: block; margin-top: 0.25rem; opacity: 0.7; font-size: 0.75rem;">${time}</small>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', response);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 2000);
}

/**
 * Send quick message
 */
function sendQuickMessage(message) {
    const input = document.getElementById('chatInput');
    input.value = message;
    sendChatMessage();
}

/**
 * Initiate call masking
 */
function initiateCallMasking(driver) {
    // In production, this would use a call masking service
    const maskedNumber = '+91 80XXX XXXXX';
    
    if (confirm(`Call driver via masked number?\n\nYour number will not be revealed to the driver.\n\nMasked Number: ${maskedNumber}`)) {
        CustomerPortal.showToast('Connecting call via masked number...', 'success');
        
        // Simulate call
        setTimeout(() => {
            CustomerPortal.showToast('Call connected', 'success');
        }, 2000);
    }
}

/**
 * Share trip
 */
function shareTrip(booking, driver) {
    const message = `
🚗 I'm on a ride with GO India RIDE

Driver: ${driver.name}
Vehicle: ${driver.vehicle}
OTP: ${booking.otp}

Track my ride: https://goindiaride.com/track/${booking.id}
    `.trim();
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    
    CustomerPortal.showToast('Sharing trip details...', 'success');
}

/**
 * Setup schedule form
 */
function setupScheduleForm() {
    const form = document.getElementById('scheduleForm');
    
    if (!form) return;
    
    // Set minimum date to today
    const dateInput = document.getElementById('scheduleDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.min = today;
    }
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        handleScheduleSubmit();
    });
}

/**
 * Handle schedule submission
 */
function handleScheduleSubmit() {
    const date = document.getElementById('scheduleDate').value;
    const time = document.getElementById('scheduleTime').value;
    const recurring = document.getElementById('recurringRide').checked;
    
    if (!date || !time) {
        CustomerPortal.showToast('Please select date and time', 'error');
        return;
    }
    
    const scheduledRide = {
        id: 'SCHED' + Date.now(),
        date,
        time,
        recurring,
        status: 'scheduled',
        timestamp: new Date().toISOString()
    };
    
    // Save scheduled ride
    const scheduled = JSON.parse(localStorage.getItem('goindiaride_scheduled_rides') || '[]');
    scheduled.push(scheduledRide);
    localStorage.setItem('goindiaride_scheduled_rides', JSON.stringify(scheduled));
    
    CustomerPortal.closeModal('scheduleModal');
    CustomerPortal.showToast('Ride scheduled successfully!', 'success');
    
    loadScheduledBookings();
}

/**
 * Load scheduled bookings
 */
function loadScheduledBookings() {
    const scheduled = JSON.parse(localStorage.getItem('goindiaride_scheduled_rides') || '[]');
    const container = document.getElementById('scheduledBookingsList');
    
    if (!container) return;
    
    if (scheduled.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">No scheduled rides</p>';
        return;
    }
    
    container.innerHTML = scheduled.map(ride => `
        <div class="booking-item">
            <div>
                <strong>Scheduled Ride</strong>
                <div>
                    ${ride.date} at ${ride.time}
                    ${ride.recurring ? ' • <span class="badge badge-info">Recurring</span>' : ''}
                </div>
            </div>
            <div>
                <button class="btn-secondary" onclick="editScheduledRide('${ride.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-secondary" onclick="cancelScheduledRide('${ride.id}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * Cancel scheduled ride
 */
function cancelScheduledRide(rideId) {
    if (confirm('Are you sure you want to cancel this scheduled ride?')) {
        let scheduled = JSON.parse(localStorage.getItem('goindiaride_scheduled_rides') || '[]');
        scheduled = scheduled.filter(r => r.id !== rideId);
        localStorage.setItem('goindiaride_scheduled_rides', JSON.stringify(scheduled));
        
        CustomerPortal.showToast('Scheduled ride cancelled', 'success');
        loadScheduledBookings();
    }
}

/**
 * Edit scheduled ride
 */
function editScheduledRide(rideId) {
    CustomerPortal.showToast('Edit feature coming soon!', 'info');
}

/**
 * Setup fare calculator
 */
function setupFareCalculator() {
    const calcBtn = document.getElementById('openFareCalc');
    
    if (calcBtn) {
        calcBtn.addEventListener('click', function() {
            showFareCalculatorModal();
        });
    }
}

/**
 * Show fare calculator modal
 */
function showFareCalculatorModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Fare Calculator</h2>
            <div class="form-group">
                <label>From</label>
                <input type="text" id="calcFrom" placeholder="Enter pickup location">
            </div>
            <div class="form-group">
                <label>To</label>
                <input type="text" id="calcTo" placeholder="Enter drop location">
            </div>
            <div class="form-group">
                <label>Vehicle Type</label>
                <select id="calcVehicle">
                    <option value="mini">Mini (₹8/km)</option>
                    <option value="sedan">Sedan (₹12/km)</option>
                    <option value="suv">SUV (₹18/km)</option>
                    <option value="luxury">Luxury (₹25/km)</option>
                </select>
            </div>
            <button class="btn-primary" id="calculateFare">Calculate Fare</button>
            <div id="fareResult" style="margin-top: 1rem;"></div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Setup close button
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    // Setup calculate button
    modal.querySelector('#calculateFare').addEventListener('click', function() {
        const from = document.getElementById('calcFrom').value;
        const to = document.getElementById('calcTo').value;
        const vehicle = document.getElementById('calcVehicle').value;
        
        if (!from || !to) {
            CustomerPortal.showToast('Please enter both locations', 'error');
            return;
        }
        
        const fare = calculateFare(from, to, vehicle);
        const result = document.getElementById('fareResult');
        
        result.innerHTML = `
            <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; text-align: center;">
                <h3>Estimated Fare</h3>
                <p style="font-size: 2rem; font-weight: bold; color: var(--primary-color); margin: 1rem 0;">
                    ₹${fare.toFixed(0)}
                </p>
                <small style="color: var(--text-light);">*Actual fare may vary</small>
            </div>
        `;
    });
}

/**
 * Add to ride history
 */
function addToRideHistory(booking) {
    const history = JSON.parse(localStorage.getItem('goindiaride_ride_history') || '[]');
    
    // Convert booking to history format
    const historyItem = {
        id: booking.id,
        from: booking.pickup,
        to: booking.drop,
        date: new Date(booking.timestamp).toLocaleDateString(),
        fare: booking.finalFare,
        status: 'completed',
        driver: 'Demo Driver',
        rating: 0
    };
    
    history.unshift(historyItem); // Add to beginning
    localStorage.setItem('goindiaride_ride_history', JSON.stringify(history));
}

/**
 * Load ride preferences
 */
function loadRidePreferences() {
    const preferences = JSON.parse(localStorage.getItem('goindiaride_ride_preferences') || '{}');
    
    // Set default preferences if empty
    if (Object.keys(preferences).length === 0) {
        preferences.ac = 'any';
        preferences.driverGender = 'any';
        preferences.music = 'any';
        localStorage.setItem('goindiaride_ride_preferences', JSON.stringify(preferences));
    }
    
    // Load preferences into modal if it exists
    if (document.getElementById('acPref')) {
        document.getElementById('acPref').value = preferences.ac || 'any';
    }
    if (document.getElementById('driverGenderPref')) {
        document.getElementById('driverGenderPref').value = preferences.driverGender || 'any';
    }
    if (document.getElementById('musicPref')) {
        document.getElementById('musicPref').value = preferences.music || 'any';
    }
}

/**
 * Save ride preferences
 */
document.getElementById('savePreferences')?.addEventListener('click', function() {
    const preferences = {
        ac: document.getElementById('acPref').value,
        driverGender: document.getElementById('driverGenderPref').value,
        music: document.getElementById('musicPref').value
    };
    
    localStorage.setItem('goindiaride_ride_preferences', JSON.stringify(preferences));
    CustomerPortal.closeModal('preferencesModal');
    CustomerPortal.showToast('Preferences saved successfully!', 'success');
});

// Export functions
window.BookingSystem = {
    viewLiveTrip,
    cancelScheduledRide,
    editScheduledRide
};
