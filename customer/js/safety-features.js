/**
 * GO India RIDE - Safety Features
 * Handles live location sharing, SOS, emergency contacts, and ride OTP
 */

// Initialize safety features
document.addEventListener('DOMContentLoaded', function() {
    initializeSafetyFeatures();
    setupEmergencyContacts();
    setupOfflineEmergency();
});

/**
 * Initialize safety features
 */
function initializeSafetyFeatures() {
    console.log('Safety features initialized');
    
    // Check for emergency contacts
    checkEmergencyContactsSetup();
    
    // Setup virtual escort option
    setupVirtualEscort();
}

/**
 * Check emergency contacts setup
 */
function checkEmergencyContactsSetup() {
    const contacts = JSON.parse(localStorage.getItem('goindiaride_emergency_contacts') || '[]');
    
    const emergencyBtn = document.getElementById('emergencyContactBtn');
    if (emergencyBtn) {
        if (contacts.length > 0) {
            const primaryContact = contacts[0];
            document.getElementById('emergencyContactNumber').textContent = primaryContact.phone;
            emergencyBtn.href = `tel:${primaryContact.phone}`;
        } else {
            emergencyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                openEmergencyContactsModal();
            });
        }
    }
}

/**
 * Setup emergency contacts
 */
function setupEmergencyContacts() {
    const emergencyContactsOption = document.getElementById('emergencyContacts');
    
    if (emergencyContactsOption) {
        emergencyContactsOption.addEventListener('click', openEmergencyContactsModal);
    }
}

/**
 * Open emergency contacts modal
 */
function openEmergencyContactsModal() {
    const contacts = JSON.parse(localStorage.getItem('goindiaride_emergency_contacts') || '[]');
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Emergency Contacts</h2>
            <p style="color: var(--text-light); margin-bottom: 1.5rem;">
                Add trusted contacts who will be notified in case of emergency
            </p>
            
            <div id="contactsList">
                ${contacts.map((contact, index) => `
                    <div class="contact-item" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--bg-light); border-radius: 8px; margin-bottom: 0.75rem;">
                        <div>
                            <strong>${contact.name}</strong><br>
                            <small style="color: var(--text-light);">${contact.phone}</small><br>
                            <small style="color: var(--text-light);">${contact.relation}</small>
                        </div>
                        <button class="btn-secondary" onclick="removeEmergencyContact(${index})" style="padding: 0.5rem 1rem;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('') || '<p style="text-align: center; color: var(--text-light);">No emergency contacts added yet</p>'}
            </div>
            
            ${contacts.length < 3 ? `
                <div style="margin-top: 1.5rem;">
                    <h3>Add New Contact</h3>
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" id="contactName" placeholder="Enter name">
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="tel" id="contactPhone" placeholder="+91 XXXXXXXXXX">
                    </div>
                    <div class="form-group">
                        <label>Relation</label>
                        <select id="contactRelation">
                            <option value="Family">Family</option>
                            <option value="Friend">Friend</option>
                            <option value="Colleague">Colleague</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <button class="btn-primary" onclick="addEmergencyContact()">Add Contact</button>
                </div>
            ` : '<p style="text-align: center; color: var(--text-light); margin-top: 1rem;">Maximum 3 emergency contacts allowed</p>'}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Add emergency contact
 */
function addEmergencyContact() {
    const name = document.getElementById('contactName').value.trim();
    const phone = document.getElementById('contactPhone').value.trim();
    const relation = document.getElementById('contactRelation').value;
    
    if (!name || !phone) {
        CustomerPortal.showToast('Please fill all fields', 'error');
        return;
    }
    
    // Validate phone number
    const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        CustomerPortal.showToast('Please enter valid Indian phone number', 'error');
        return;
    }
    
    const contacts = JSON.parse(localStorage.getItem('goindiaride_emergency_contacts') || '[]');
    
    if (contacts.length >= 3) {
        CustomerPortal.showToast('Maximum 3 contacts allowed', 'error');
        return;
    }
    
    contacts.push({ name, phone, relation });
    localStorage.setItem('goindiaride_emergency_contacts', JSON.stringify(contacts));
    
    CustomerPortal.showToast('Emergency contact added successfully!', 'success');
    
    // Refresh modal
    document.querySelectorAll('.modal').forEach(m => m.remove());
    openEmergencyContactsModal();
}

/**
 * Remove emergency contact
 */
function removeEmergencyContact(index) {
    if (confirm('Are you sure you want to remove this emergency contact?')) {
        const contacts = JSON.parse(localStorage.getItem('goindiaride_emergency_contacts') || '[]');
        contacts.splice(index, 1);
        localStorage.setItem('goindiaride_emergency_contacts', JSON.stringify(contacts));
        
        CustomerPortal.showToast('Contact removed', 'success');
        
        // Refresh modal
        document.querySelectorAll('.modal').forEach(m => m.remove());
        openEmergencyContactsModal();
    }
}

/**
 * Setup offline emergency access
 */
function setupOfflineEmergency() {
    // Cache emergency numbers
    const emergencyNumbers = {
        police: '100',
        ambulance: '108',
        fire: '101',
        womenHelpline: '1091',
        childHelpline: '1098'
    };
    
    localStorage.setItem('goindiaride_emergency_numbers', JSON.stringify(emergencyNumbers));
    
    // Cache last known trip details
    cacheLastTripDetails();
}

/**
 * Cache last trip details
 */
function cacheLastTripDetails() {
    const activeBookings = JSON.parse(localStorage.getItem('goindiaride_active_bookings') || '[]');
    
    if (activeBookings.length > 0) {
        const lastTrip = activeBookings[activeBookings.length - 1];
        localStorage.setItem('goindiaride_last_trip', JSON.stringify(lastTrip));
    }
}

/**
 * Setup virtual escort option
 */
function setupVirtualEscort() {
    // Virtual escort is a premium feature
    // Store preference
    const virtualEscortEnabled = localStorage.getItem('goindiaride_virtual_escort') === 'true';
    
    // If enabled, monitor trips
    if (virtualEscortEnabled) {
        monitorActiveTrips();
    }
}

/**
 * Monitor active trips
 */
function monitorActiveTrips() {
    // In production, this would:
    // 1. Send trip details to monitoring center
    // 2. Enable GPS tracking
    // 3. Setup periodic check-in calls
    // 4. Alert on route deviation
    
    console.log('Virtual escort monitoring active');
}

/**
 * Enable virtual escort for trip
 */
function enableVirtualEscort(bookingId) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Virtual Escort</h2>
            <div style="text-align: center; margin: 1.5rem 0;">
                <i class="fas fa-shield-alt" style="font-size: 4rem; color: var(--success-color);"></i>
            </div>
            <p style="margin-bottom: 1rem;">Virtual Escort provides enhanced safety during your ride:</p>
            <ul style="margin: 1rem 0 1rem 1.5rem; color: var(--text-dark);">
                <li>Call center monitors your trip in real-time</li>
                <li>Regular check-in calls during the journey</li>
                <li>Immediate response on any safety concern</li>
                <li>Alert on route deviation</li>
            </ul>
            <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin: 1.5rem 0;">
                <p><strong>Additional Charge:</strong> ₹50 per trip</p>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <button class="btn-secondary" onclick="this.closest('.modal').remove()">Skip</button>
                <button class="btn-primary" onclick="confirmVirtualEscort('${bookingId}')">Enable</button>
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
 * Confirm virtual escort
 */
function confirmVirtualEscort(bookingId) {
    CustomerPortal.showLoading();
    
    setTimeout(() => {
        // Enable virtual escort for this trip
        const booking = {
            bookingId,
            virtualEscort: true,
            timestamp: new Date().toISOString()
        };
        
        const virtualEscortTrips = JSON.parse(localStorage.getItem('goindiaride_virtual_escort_trips') || '[]');
        virtualEscortTrips.push(booking);
        localStorage.setItem('goindiaride_virtual_escort_trips', JSON.stringify(virtualEscortTrips));
        
        CustomerPortal.hideLoading();
        document.querySelectorAll('.modal').forEach(m => m.remove());
        
        CustomerPortal.showToast('Virtual Escort enabled for this trip', 'success');
    }, 1500);
}

/**
 * Share live location
 */
function shareLiveLocation(bookingId) {
    if (!navigator.geolocation) {
        CustomerPortal.showToast('Geolocation not supported', 'error');
        return;
    }
    
    CustomerPortal.showLoading();
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            // In production, this would create a real-time tracking link
            const trackingLink = `https://goindiaride.com/track/${bookingId}`;
            
            const contacts = JSON.parse(localStorage.getItem('goindiaride_emergency_contacts') || '[]');
            
            CustomerPortal.hideLoading();
            
            showLocationShareModal(trackingLink, lat, lon, contacts);
        },
        function(error) {
            CustomerPortal.hideLoading();
            CustomerPortal.showToast('Unable to get location', 'error');
        }
    );
}

/**
 * Show location share modal
 */
function showLocationShareModal(trackingLink, lat, lon, contacts) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Share Live Location</h2>
            <p style="margin-bottom: 1rem;">Share your live trip location with trusted contacts</p>
            
            <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <strong>Current Location:</strong><br>
                <small style="color: var(--text-light);">Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}</small>
            </div>
            
            <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <strong>Tracking Link:</strong><br>
                <small style="color: var(--text-light); word-break: break-all;">${trackingLink}</small>
                <button class="btn-secondary" onclick="copyToClipboard('${trackingLink}')" style="margin-top: 0.5rem; width: 100%;">
                    <i class="fas fa-copy"></i> Copy Link
                </button>
            </div>
            
            <h3 style="margin: 1.5rem 0 1rem 0;">Share With:</h3>
            <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
                ${contacts.length > 0 ? contacts.map(contact => `
                    <button class="btn-secondary" onclick="shareLocationWith('${contact.name}', '${contact.phone}', '${trackingLink}')" style="justify-content: space-between;">
                        <span><i class="fas fa-user"></i> ${contact.name}</span>
                        <span><i class="fas fa-share"></i></span>
                    </button>
                `).join('') : '<p style="text-align: center; color: var(--text-light);">No emergency contacts added</p>'}
            </div>
            
            <button class="btn-primary" onclick="shareViaWhatsApp('${trackingLink}')" style="width: 100%;">
                <i class="fab fa-whatsapp"></i> Share via WhatsApp
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Copy to clipboard
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        CustomerPortal.showToast('Link copied to clipboard', 'success');
    }).catch(() => {
        CustomerPortal.showToast('Failed to copy link', 'error');
    });
}

/**
 * Share location with contact
 */
function shareLocationWith(name, phone, link) {
    const message = `
🚗 I'm on a GO India RIDE trip

Track my live location:
${link}

- Shared with ${name}
    `.trim();
    
    const whatsappUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    
    CustomerPortal.showToast(`Sharing location with ${name}`, 'success');
}

/**
 * Share via WhatsApp
 */
function shareViaWhatsApp(link) {
    const message = `
🚗 I'm on a GO India RIDE trip

Track my live location:
${link}

Stay updated in real-time!
    `.trim();
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    
    CustomerPortal.showToast('Sharing via WhatsApp', 'success');
}

/**
 * Show driver verification
 */
function showDriverVerification(driver) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Driver Verification</h2>
            
            <div style="text-align: center; margin: 1.5rem 0;">
                <img src="https://via.placeholder.com/120" alt="Driver" style="width: 120px; height: 120px; border-radius: 50%; border: 4px solid var(--success-color);">
                <div style="margin-top: 1rem;">
                    <span style="background: var(--success-color); color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem;">
                        <i class="fas fa-check-circle"></i> Verified
                    </span>
                </div>
            </div>
            
            <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <strong>Name:</strong> ${driver.name}<br>
                <strong>Vehicle:</strong> ${driver.vehicle}<br>
                <strong>Rating:</strong> <span style="color: var(--accent-color);">★ ${driver.rating}</span><br>
                <strong>Total Trips:</strong> 2,345<br>
                <strong>Experience:</strong> 5 years
            </div>
            
            <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <strong>Verification Badges:</strong><br>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
                    <span style="background: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.85rem;">
                        <i class="fas fa-id-card"></i> ID Verified
                    </span>
                    <span style="background: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.85rem;">
                        <i class="fas fa-car"></i> Vehicle Verified
                    </span>
                    <span style="background: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.85rem;">
                        <i class="fas fa-shield-alt"></i> Background Check
                    </span>
                    <span style="background: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.85rem;">
                        <i class="fas fa-star"></i> Top Rated
                    </span>
                </div>
            </div>
            
            <button class="btn-primary" onclick="this.closest('.modal').remove()" style="width: 100%;">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Verify ride with OTP
 */
function verifyRideOTP(enteredOTP, actualOTP) {
    if (enteredOTP === actualOTP) {
        CustomerPortal.showToast('Ride verified! Starting trip...', 'success');
        return true;
    } else {
        CustomerPortal.showToast('Invalid OTP. Please check and try again.', 'error');
        return false;
    }
}

/**
 * Auto-share trip with emergency contacts
 */
function autoShareTrip(booking) {
    const autoShare = localStorage.getItem('goindiaride_auto_share_trips') === 'true';
    
    if (autoShare) {
        const contacts = JSON.parse(localStorage.getItem('goindiaride_emergency_contacts') || '[]');
        
        if (contacts.length > 0) {
            const trackingLink = `https://goindiaride.com/track/${booking.id}`;
            
            contacts.forEach(contact => {
                shareLocationWith(contact.name, contact.phone, trackingLink);
            });
            
            CustomerPortal.showToast('Trip details shared with emergency contacts', 'success');
        }
    }
}

// Export functions
window.SafetyFeatures = {
    shareLiveLocation,
    enableVirtualEscort,
    showDriverVerification,
    verifyRideOTP,
    autoShareTrip,
    addEmergencyContact,
    removeEmergencyContact,
    copyToClipboard,
    shareLocationWith,
    shareViaWhatsApp,
    confirmVirtualEscort
};
