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

    if (typeof initializeAutocomplete === 'function') {
        initializeAutocomplete('calcFrom');
        initializeAutocomplete('calcTo');
    }

    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    modal.querySelector('#calculateFare').addEventListener('click', async function() {
        const from = document.getElementById('calcFrom').value;
        const to = document.getElementById('calcTo').value;
        const vehicle = document.getElementById('calcVehicle').value;

        if (!from || !to) {
            CustomerPortal.showToast('Please enter both locations', 'error');
            return;
        }

        let estimate = { km: 5, source: 'fallback' };
        try {
            if (window.LocationDistanceEstimator && typeof LocationDistanceEstimator.estimateDistanceKm === 'function') {
                estimate = await LocationDistanceEstimator.estimateDistanceKm(from, to);
            }
        } catch (error) {
            estimate = { km: 5, source: 'fallback' };
        }

        const km = Number(estimate.km || 5);
        const fare = calculateFare(from, to, vehicle, km, 'standard', 1);
        const result = document.getElementById('fareResult');

        result.innerHTML = `
            <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; text-align: center;">
                <h3>Estimated Fare</h3>
                <p style="font-size: 2rem; font-weight: bold; color: var(--primary-color); margin: 1rem 0;">
                    ₹${fare.toFixed(0)}
                </p>
                <p style="margin: 0.25rem 0; color: var(--text-dark);">Distance: <strong>${km.toFixed(1)} km</strong></p>
                <p style="margin: 0.25rem 0; color: var(--text-dark);">Rate: <strong>₹${getVehicleRate(vehicle)}/km</strong></p>
                <small style="color: var(--text-light);">Source: ${String(estimate.source || 'fallback').replace(/_/g, ' ')}</small>
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
        driver: booking.driverName || 'Assigned Driver',
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
