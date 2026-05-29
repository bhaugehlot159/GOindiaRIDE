let currentLiveTripDriver = null;

function openLiveTripModal(booking) {
    const status = normalizeBookingLifecycleStatus(booking);
    const hasAssignedDriver = status === 'driver_assigned' && Boolean(booking.driverName || booking.driverId);
    const isPendingAdmin = status === 'pending_admin_review';

    let driver = {
        name: 'Pending Admin Approval',
        vehicle: 'Booking is in live admin review queue',
        rating: '--',
        phone: ''
    };

    if (hasAssignedDriver) {
        const registeredDrivers = JSON.parse(localStorage.getItem('drivers') || '[]');
        const matchedDriver = registeredDrivers.find((item) => String(item.id || '') === String(booking.driverId || ''));
        driver = {
            name: booking.driverName || matchedDriver?.name || 'Assigned Driver',
            vehicle: matchedDriver
                ? ((matchedDriver.vehicleModel || 'Vehicle') + ' - ' + (matchedDriver.vehicleNumber || 'Pending'))
                : (booking.vehicleType || 'Vehicle details pending'),
            rating: matchedDriver && matchedDriver.rating ? Number(matchedDriver.rating).toFixed(1) : '--',
            phone: matchedDriver?.phone || booking.driverPhone || ''
        };
    } else if (status === 'approved_waiting_driver') {
        driver = {
            name: 'Approved by Admin',
            vehicle: 'Driver will be assigned shortly',
            rating: '--',
            phone: ''
        };
    } else if (status === 'rejected_by_admin') {
        driver = {
            name: 'Booking Rejected',
            vehicle: 'Please create a new booking or contact support',
            rating: '--',
            phone: ''
        };
    }

    document.getElementById('driverName').textContent = driver.name;
    document.getElementById('vehicleDetails').textContent = driver.vehicle;
    document.getElementById('driverRating').textContent = driver.rating;
    document.getElementById('rideOTP').textContent = hasAssignedDriver ? (booking.otp || '----') : 'N/A';

    const chatBtn = document.getElementById('chatWithDriver');
    const callBtn = document.getElementById('callDriver');
    const shareBtn = document.getElementById('shareTrip');

    if (chatBtn) {
        chatBtn.disabled = !hasAssignedDriver;
        chatBtn.style.opacity = hasAssignedDriver ? '1' : '0.5';
        chatBtn.onclick = hasAssignedDriver ? () => {
            CustomerPortal.closeModal('liveTripModal');
            openChatModal(driver);
        } : null;
    }

    if (callBtn) {
        callBtn.disabled = !hasAssignedDriver;
        callBtn.style.opacity = hasAssignedDriver ? '1' : '0.5';
        callBtn.onclick = hasAssignedDriver ? () => {
            initiateCallMasking(driver);
        } : null;
    }

    if (shareBtn) {
        shareBtn.onclick = () => {
            shareTrip(booking, driver);
        };
    }
    
    CustomerPortal.openModal('liveTripModal');

    if (isPendingAdmin) {
        CustomerPortal.showToast('Booking is in admin review queue. Driver assignment is paused until admin approval.', 'info');
    }
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
    currentLiveTripDriver = driver;
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
    const messages = getLiveTripChatMessages(driver);

    if (!messages.length) {
        chatMessages.innerHTML = `
            <div class="message received">
                No live trip messages yet.
                <small style="display: block; margin-top: 0.25rem; opacity: 0.7; font-size: 0.75rem;">Live chat ready</small>
            </div>
        `;
        return;
    }
    
    chatMessages.innerHTML = messages.map(msg => `
        <div class="message ${msg.type}">
            ${msg.text}
            <small style="display: block; margin-top: 0.25rem; opacity: 0.7; font-size: 0.75rem;">${msg.time}</small>
        </div>
    `).join('');
}

function getLiveTripChatKey(driver) {
    const driverRef = String(driver && (driver.id || driver.phone || driver.name) || 'assigned-driver')
        .replace(/[^a-z0-9_-]/gi, '_')
        .slice(0, 80);
    return `goindiaride_live_trip_chat_${driverRef}_v1`;
}

function getLiveTripChatMessages(driver) {
    try {
        const rows = JSON.parse(localStorage.getItem(getLiveTripChatKey(driver)) || '[]');
        return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
    } catch (_error) {
        return [];
    }
}

function saveLiveTripChatMessage(driver, type, text) {
    const rows = getLiveTripChatMessages(driver);
    rows.push({
        type,
        text,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString()
    });
    localStorage.setItem(getLiveTripChatKey(driver), JSON.stringify(rows.slice(-100)));
    return rows;
}

function notifyLiveTripChat(driver, message) {
    if (!window.PortalConnector || typeof window.PortalConnector.createNotification !== 'function') return;
    window.PortalConnector.createNotification({
        type: 'customer_live_trip_message',
        title: 'Live trip message',
        message: message.slice(0, 160),
        sourcePortal: 'customer',
        targetPortals: ['driver', 'admin'],
        metadata: {
            driverId: driver && driver.id,
            driverPhone: driver && driver.phone,
            channel: 'live_trip_chat',
            liveMode: true
        }
    });
}

/**
 * Send chat message
 */
function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    const chatMessages = document.getElementById('chatMessages');
    const driver = currentLiveTripDriver || {};
    saveLiveTripChatMessage(driver, 'sent', message);
    notifyLiveTripChat(driver, message);
    
    const messageHTML = `
        <div class="message sent">
            ${message}
            <small style="display: block; margin-top: 0.25rem; opacity: 0.7; font-size: 0.75rem;">Just now</small>
        </div>
    `;
    
    chatMessages.insertAdjacentHTML('beforeend', messageHTML);
    input.value = '';
    
    // Auto-scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
    const phone = String(driver && driver.phone || '').trim();
    if (!phone) {
        CustomerPortal.showToast('Driver phone is not available yet. Try after assignment sync.', 'error');
        return;
    }
    CustomerPortal.showToast('Opening live call dialer...', 'success');
    window.location.href = `tel:${phone}`;
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
