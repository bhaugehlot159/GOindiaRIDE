/**
 * GO India RIDE - Customer Portal Main JavaScript
 * Handles navigation, theme, user management, and core functionality
 */

// Initialize customer portal
document.addEventListener('DOMContentLoaded', function() {
    initializePortal();
    setupNavigation();
    setupThemeToggle();
    setupModals();
    setupSOSButton();
    loadUserData();
    loadDemoData();
});

/**
 * Initialize the portal with default settings
 */
function initializePortal() {
    console.log('GO India RIDE Customer Portal initialized');
    
    // Check if first visit
    const isFirstVisit = !localStorage.getItem('goindiaride_visited');
    if (isFirstVisit) {
        localStorage.setItem('goindiaride_visited', 'true');
        localStorage.setItem('goindiaride_user_type', 'new');
        showFirstTimeWelcome();
    }
    
    // Initialize theme
    const savedTheme = localStorage.getItem('goindiaride_theme') || 'light';
    document.body.className = savedTheme === 'dark' ? 'dark-mode' : '';
    
    // Set active section
    const activeSection = localStorage.getItem('goindiaride_active_section') || 'homeSection';
    showSection(activeSection);
}

/**
 * Setup navigation between sections
 */
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const sectionId = this.getAttribute('data-section');
            
            // Update active nav button
            navButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Show section
            showSection(sectionId);
            
            // Save state
            localStorage.setItem('goindiaride_active_section', sectionId);
        });
    });
}

/**
 * Show specific section
 */
function showSection(sectionId) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
}

/**
 * Setup theme toggle
 */
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    
    themeToggle.addEventListener('click', function() {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        const theme = isDarkMode ? 'dark' : 'light';
        
        // Update icon
        const icon = this.querySelector('i');
        icon.className = isDarkMode ? 'fas fa-sun' : 'fas fa-moon';
        
        // Save preference
        localStorage.setItem('goindiaride_theme', theme);
        
        // Show toast
        showToast(isDarkMode ? 'Dark mode enabled' : 'Light mode enabled', 'success');
    });
}

/**
 * Setup all modals
 */
function setupModals() {
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.modal .close');
    
    // Close modal on close button click
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            closeModal(modal);
        });
    });
    
    // Close modal on outside click
    modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal(modal);
            }
        });
    });
    
    // Setup specific modal triggers
    setupModalTriggers();
}

/**
 * Setup modal trigger buttons
 */
function setupModalTriggers() {
    // Schedule booking
    const scheduleBtn = document.getElementById('scheduleBookingBtn');
    if (scheduleBtn) {
        scheduleBtn.addEventListener('click', () => openModal('scheduleModal'));
    }
    
    // Add money buttons
    const addMoneyBtns = document.querySelectorAll('.btn-add-money');
    addMoneyBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const walletType = this.getAttribute('data-wallet');
            openAddMoneyModal(walletType);
        });
    });
    
    // Wallet actions
    document.getElementById('donateBtn')?.addEventListener('click', () => openModal('donationModal'));
    document.getElementById('splitFareBtn')?.addEventListener('click', () => openModal('splitFareModal'));
    
    // Profile options
    document.getElementById('ridePreferences')?.addEventListener('click', () => openModal('preferencesModal'));
    document.getElementById('customerSupport')?.addEventListener('click', () => openModal('supportChatModal'));
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    
    // Booking type buttons
    const bookingTypeBtns = document.querySelectorAll('.booking-type-btn');
    bookingTypeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.getAttribute('data-type');
            openBookingModal(type);
        });
    });
}

/**
 * Open modal
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Close modal
 */
function closeModal(modal) {
    if (typeof modal === 'string') {
        modal = document.getElementById(modal);
    }
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Setup SOS button
 */
function setupSOSButton() {
    const sosButton = document.getElementById('sosButton');
    
    sosButton.addEventListener('click', function() {
        openModal('sosModal');
        
        // Log SOS activation
        logSOSActivation();
    });
    
    // Share location button
    const shareLocationBtn = document.getElementById('shareLocationBtn');
    if (shareLocationBtn) {
        shareLocationBtn.addEventListener('click', shareLocationViaWhatsApp);
    }
}

/**
 * Share location via WhatsApp
 */
function shareLocationViaWhatsApp() {
    if (navigator.geolocation) {
        showLoading();
        navigator.geolocation.getCurrentPosition(
            function(position) {
                hideLoading();
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const message = `🚨 EMERGENCY! I need help. My current location: https://maps.google.com/?q=${lat},${lon}`;
                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
            },
            function(error) {
                hideLoading();
                showToast('Unable to get location. Please enable location services.', 'error');
            }
        );
    } else {
        showToast('Geolocation is not supported by your browser.', 'error');
    }
}

/**
 * Log SOS activation
 */
function logSOSActivation() {
    const sosLogs = JSON.parse(localStorage.getItem('goindiaride_sos_logs') || '[]');
    sosLogs.push({
        timestamp: new Date().toISOString(),
        location: 'Unknown' // Would be actual location in production
    });
    localStorage.setItem('goindiaride_sos_logs', JSON.stringify(sosLogs));
}

/**
 * Load user data
 */
function loadUserData() {
    const userData = JSON.parse(localStorage.getItem('goindiaride_user') || '{}');
    
    // Set default user data if not exists
    if (!userData.name) {
        userData.name = 'Guest User';
        userData.email = 'guest@goindiaride.com';
        userData.phone = '+91 XXXXXXXXXX';
        userData.avatar = 'https://via.placeholder.com/100';
        localStorage.setItem('goindiaride_user', JSON.stringify(userData));
    }
    
    // Update UI
    document.getElementById('userName').textContent = userData.name;
    document.getElementById('profileName').textContent = userData.name;
    document.getElementById('profileEmail').textContent = userData.email;
    document.getElementById('profilePhone').textContent = userData.phone;
    
    // Update avatars
    document.querySelectorAll('.user-avatar, #profileAvatar').forEach(img => {
        img.src = userData.avatar;
    });
    
    // Update travel card
    document.getElementById('travelName').textContent = userData.name;
    document.getElementById('travelID').textContent = generateTravelID();
    document.getElementById('travelValidity').textContent = getValidityDate();
}

/**
 * Generate travel ID
 */
function generateTravelID() {
    const existing = localStorage.getItem('goindiaride_travel_id');
    if (existing) return existing;
    
    const id = 'GIR' + Date.now().toString().slice(-8);
    localStorage.setItem('goindiaride_travel_id', id);
    return id;
}

/**
 * Get validity date (30 days from now)
 */
function getValidityDate() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toLocaleDateString('en-IN');
}

/**
 * Load demo data
 */
function loadDemoData() {
    loadFavoriteLocations();
    loadRecentPlaces();
    loadWalletBalance();
    loadTransactions();
    loadRideHistory();
    loadRewards();
    setupTourismCards();
}

/**
 * Load favorite locations
 */
function loadFavoriteLocations() {
    const favorites = JSON.parse(localStorage.getItem('goindiaride_favorites') || '[]');
    
    // Add demo favorites if empty
    if (favorites.length === 0) {
        favorites.push(
            { icon: 'fa-home', name: 'Home', address: 'Jaipur, Rajasthan' },
            { icon: 'fa-briefcase', name: 'Work', address: 'M.I. Road, Jaipur' }
        );
        localStorage.setItem('goindiaride_favorites', JSON.stringify(favorites));
    }
    
    const favoritesList = document.getElementById('favoritesList');
    favoritesList.innerHTML = favorites.map(fav => `
        <div class="favorite-item">
            <i class="fas ${fav.icon}"></i>
            <span>${fav.name}</span>
        </div>
    `).join('');
}

/**
 * Load recent places
 */
function loadRecentPlaces() {
    const recent = JSON.parse(localStorage.getItem('goindiaride_recent_places') || '[]');
    
    // Add demo recent places if empty
    if (recent.length === 0) {
        recent.push(
            { name: 'Hawa Mahal', time: '2 days ago' },
            { name: 'City Palace', time: '5 days ago' },
            { name: 'Amber Fort', time: '1 week ago' }
        );
        localStorage.setItem('goindiaride_recent_places', JSON.stringify(recent));
    }
    
    const recentList = document.getElementById('recentPlacesList');
    recentList.innerHTML = recent.slice(0, 5).map(place => `
        <div class="place-item">
            <i class="fas fa-map-marker-alt"></i>
            <span>${place.name}</span>
        </div>
    `).join('');
}

/**
 * Load wallet balance
 */
function loadWalletBalance() {
    const wallet = JSON.parse(localStorage.getItem('goindiaride_wallet') || '{"payment": 0, "donation": 0}');
    
    document.getElementById('paymentBalance').textContent = wallet.payment || 0;
    document.getElementById('donationBalance').textContent = wallet.donation || 0;
}

/**
 * Load transactions
 */
function loadTransactions() {
    const transactions = JSON.parse(localStorage.getItem('goindiaride_transactions') || '[]');
    
    // Add demo transactions if empty
    if (transactions.length === 0) {
        transactions.push(
            { type: 'ride', amount: -250, date: '2024-02-08', description: 'Ride to Hawa Mahal' },
            { type: 'added', amount: 500, date: '2024-02-07', description: 'Added to wallet' },
            { type: 'cashback', amount: 25, date: '2024-02-06', description: 'Cashback earned' }
        );
        localStorage.setItem('goindiaride_transactions', JSON.stringify(transactions));
    }
    
    const transactionList = document.getElementById('transactionList');
    transactionList.innerHTML = transactions.slice(0, 10).map(txn => `
        <div class="transaction-item">
            <div>
                <i class="fas ${getTransactionIcon(txn.type)}"></i>
                <span>${txn.description}</span>
                <small>${txn.date}</small>
            </div>
            <div class="${txn.amount > 0 ? 'text-success' : 'text-danger'}">
                ${txn.amount > 0 ? '+' : ''}₹${Math.abs(txn.amount)}
            </div>
        </div>
    `).join('');
}

/**
 * Get transaction icon
 */
function getTransactionIcon(type) {
    const icons = {
        'ride': 'fa-car',
        'added': 'fa-plus-circle',
        'cashback': 'fa-gift',
        'donation': 'fa-hands-helping'
    };
    return icons[type] || 'fa-circle';
}

/**
 * Load ride history
 */
function loadRideHistory() {
    const rides = JSON.parse(localStorage.getItem('goindiaride_ride_history') || '[]');
    
    // Add demo rides if empty
    if (rides.length === 0) {
        rides.push(
            {
                id: 'RIDE001',
                from: 'Jaipur Airport',
                to: 'City Palace',
                date: '2024-02-08',
                fare: 350,
                status: 'completed',
                driver: 'Rajesh Kumar',
                rating: 5
            },
            {
                id: 'RIDE002',
                from: 'Hotel',
                to: 'Hawa Mahal',
                date: '2024-02-07',
                fare: 250,
                status: 'completed',
                driver: 'Suresh Sharma',
                rating: 4
            }
        );
        localStorage.setItem('goindiaride_ride_history', JSON.stringify(rides));
    }
    
    const rideHistoryList = document.getElementById('rideHistoryList');
    rideHistoryList.innerHTML = rides.slice(0, 10).map(ride => `
        <div class="ride-item">
            <div>
                <strong>${ride.from} → ${ride.to}</strong>
                <div>
                    <small>${ride.date}</small> • 
                    <small>₹${ride.fare}</small> • 
                    <small>${ride.driver}</small>
                </div>
                <div class="driver-rating">
                    ${'⭐'.repeat(ride.rating)}
                </div>
            </div>
            <button class="btn-secondary" onclick="rebookRide('${ride.id}')">
                <i class="fas fa-redo"></i>
            </button>
        </div>
    `).join('');
}

/**
 * Rebook a previous ride
 */
function rebookRide(rideId) {
    const rides = JSON.parse(localStorage.getItem('goindiaride_ride_history') || '[]');
    const ride = rides.find(r => r.id === rideId);
    
    if (ride) {
        showToast('Opening booking with saved details...', 'success');
        openBookingModal('local', ride);
    }
}

/**
 * Load rewards
 */
function loadRewards() {
    const rewards = JSON.parse(localStorage.getItem('goindiaride_rewards') || '{"points": 0, "cashback": 0}');
    
    // Set demo rewards if empty
    if (rewards.points === 0) {
        rewards.points = 150;
        rewards.cashback = 75;
        localStorage.setItem('goindiaride_rewards', JSON.stringify(rewards));
    }
    
    document.getElementById('rewardPoints').textContent = rewards.points;
    document.getElementById('cashbackEarned').textContent = '₹' + rewards.cashback;
}

/**
 * Setup tourism cards
 */
function setupTourismCards() {
    // Temple timings
    document.getElementById('templeTimings')?.addEventListener('click', function() {
        showTempleTimings();
    });
    
    // Cultural guide
    document.getElementById('culturalGuide')?.addEventListener('click', function() {
        showCulturalGuide();
    });
    
    // Events
    document.getElementById('eventsAlerts')?.addEventListener('click', function() {
        showLocalEvents();
    });
    
    // Tour packages
    document.getElementById('tourPackages')?.addEventListener('click', function() {
        showTourPackages();
    });
    
    // Heritage walks
    document.getElementById('heritageWalks')?.addEventListener('click', function() {
        showHeritageWalks();
    });
    
    // Food guide
    document.getElementById('foodGuide')?.addEventListener('click', function() {
        showFoodGuide();
    });
    
    // Shopping guide
    document.getElementById('shoppingGuide')?.addEventListener('click', function() {
        showShoppingGuide();
    });
}

/**
 * Show temple timings
 */
function showTempleTimings() {
    const temples = [
        { name: 'Govind Dev Ji Temple', morning: '4:30 AM - 11:00 AM', evening: '5:30 PM - 9:30 PM' },
        { name: 'Birla Mandir', morning: '6:00 AM - 12:00 PM', evening: '3:00 PM - 9:00 PM' },
        { name: 'Galtaji Temple', morning: '5:00 AM - 9:00 PM', evening: 'Full day' }
    ];
    
    const content = `
        <h3>Temple Aarti Timings</h3>
        ${temples.map(temple => `
            <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-light); border-radius: 8px;">
                <strong>${temple.name}</strong><br>
                Morning: ${temple.morning}<br>
                Evening: ${temple.evening}
            </div>
        `).join('')}
    `;
    
    showInfoModal('Temple Timings', content);
}

/**
 * Show cultural guide
 */
function showCulturalGuide() {
    const content = `
        <h3>Rajasthani Cultural Guide</h3>
        <div style="padding: 1rem; background: var(--bg-light); border-radius: 8px; margin-bottom: 1rem;">
            <strong>Dress Code:</strong><br>
            • Modest clothing recommended for temples<br>
            • Remove shoes before entering temples<br>
            • Cover head in some religious places
        </div>
        <div style="padding: 1rem; background: var(--bg-light); border-radius: 8px; margin-bottom: 1rem;">
            <strong>Local Customs:</strong><br>
            • Greet with "Namaste" (hands folded)<br>
            • Ask permission before photography<br>
            • Respect local traditions and festivals
        </div>
    `;
    
    showInfoModal('Cultural Guide', content);
}

/**
 * Show local events
 */
function showLocalEvents() {
    const events = [
        { name: 'Teej Festival', date: 'August 2024', location: 'Citywide' },
        { name: 'Jaipur Literature Festival', date: 'January 2025', location: 'Diggi Palace' },
        { name: 'Elephant Festival', date: 'March 2024', location: 'Jaipur Polo Ground' }
    ];
    
    const content = `
        <h3>Upcoming Events & Festivals</h3>
        ${events.map(event => `
            <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-light); border-radius: 8px;">
                <strong>${event.name}</strong><br>
                📅 ${event.date}<br>
                📍 ${event.location}
            </div>
        `).join('')}
    `;
    
    showInfoModal('Local Events', content);
}

/**
 * Show tour packages
 */
function showTourPackages() {
    const packages = [
        { name: 'Jaipur City Tour', duration: '1 Day', price: '₹2,500', places: 'Hawa Mahal, City Palace, Jantar Mantar' },
        { name: 'Heritage Tour', duration: '2 Days', price: '₹5,000', places: 'Amber Fort, Nahargarh Fort, Jaigarh Fort' },
        { name: 'Pink City Express', duration: '4 Hours', price: '₹1,500', places: 'Major landmarks' }
    ];
    
    const content = `
        <h3>Tour Packages</h3>
        ${packages.map(pkg => `
            <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-light); border-radius: 8px;">
                <strong>${pkg.name}</strong><br>
                ⏱️ ${pkg.duration} • 💰 ${pkg.price}<br>
                📍 ${pkg.places}<br>
                <button class="btn-primary" style="margin-top: 0.5rem;" onclick="bookTourPackage('${pkg.name}')">Book Now</button>
            </div>
        `).join('')}
    `;
    
    showInfoModal('Tour Packages', content);
}

/**
 * Show heritage walks
 */
function showHeritageWalks() {
    const walks = [
        { name: 'Walled City Walk', duration: '3 hours', difficulty: 'Easy' },
        { name: 'Bazaar Trail', duration: '2 hours', difficulty: 'Easy' },
        { name: 'Temple Circuit', duration: '4 hours', difficulty: 'Moderate' }
    ];
    
    const content = `
        <h3>Heritage Walk Routes</h3>
        ${walks.map(walk => `
            <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-light); border-radius: 8px;">
                <strong>${walk.name}</strong><br>
                Duration: ${walk.duration}<br>
                Difficulty: ${walk.difficulty}
            </div>
        `).join('')}
    `;
    
    showInfoModal('Heritage Walks', content);
}

/**
 * Show food guide
 */
function showFoodGuide() {
    const foods = [
        { name: 'Dal Baati Churma', restaurant: 'Chokhi Dhani', price: '₹350' },
        { name: 'Laal Maas', restaurant: 'Handi Restaurant', price: '₹450' },
        { name: 'Ghewar', restaurant: 'LMB', price: '₹200' }
    ];
    
    const content = `
        <h3>Local Food Guide</h3>
        ${foods.map(food => `
            <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-light); border-radius: 8px;">
                <strong>${food.name}</strong><br>
                📍 ${food.restaurant}<br>
                💰 ${food.price}
            </div>
        `).join('')}
    `;
    
    showInfoModal('Food Guide', content);
}

/**
 * Show shopping guide
 */
function showShoppingGuide() {
    const markets = [
        { name: 'Johari Bazaar', items: 'Jewelry, Gems', timing: '10 AM - 9 PM' },
        { name: 'Bapu Bazaar', items: 'Textiles, Handicrafts', timing: '10 AM - 9 PM' },
        { name: 'Tripolia Bazaar', items: 'Bangles, Carpets', timing: '10 AM - 9 PM' }
    ];
    
    const content = `
        <h3>Shopping Guide</h3>
        ${markets.map(market => `
            <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-light); border-radius: 8px;">
                <strong>${market.name}</strong><br>
                Items: ${market.items}<br>
                Timing: ${market.timing}
            </div>
        `).join('')}
    `;
    
    showInfoModal('Shopping Guide', content);
}

/**
 * Show info modal
 */
function showInfoModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>${title}</h2>
            ${content}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

/**
 * Open booking modal
 */
function openBookingModal(type, prefillData = null) {
    const modal = document.getElementById('bookingModal');
    const title = document.getElementById('bookingModalTitle');
    
    const titles = {
        'local': 'Book Local Ride',
        'outstation': 'Book Outstation Trip',
        'rental': 'Book Rental',
        'airport': 'Book Airport Transfer'
    };
    
    title.textContent = titles[type] || 'Book a Ride';
    
    if (prefillData) {
        document.getElementById('pickupLocation').value = prefillData.from || '';
        document.getElementById('dropLocation').value = prefillData.to || '';
    }
    
    openModal('bookingModal');
}

/**
 * Open add money modal
 */
function openAddMoneyModal(walletType) {
    const modal = document.getElementById('addMoneyModal');
    modal.setAttribute('data-wallet-type', walletType);
    openModal('addMoneyModal');
    
    // Setup amount buttons
    const amountBtns = modal.querySelectorAll('.amount-btn');
    amountBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            amountBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('customAmount').value = this.getAttribute('data-amount');
        });
    });
}

/**
 * Handle logout
 */
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        showLoading();
        setTimeout(() => {
            localStorage.removeItem('goindiaride_active_section');
            showToast('Logged out successfully', 'success');
            hideLoading();
            // In production, redirect to login page
            // window.location.href = '/login.html';
        }, 1000);
    }
}

/**
 * Show first time welcome
 */
function showFirstTimeWelcome() {
    setTimeout(() => {
        showToast('Welcome to GO India RIDE! 🚗', 'success');
        
        // Show first booking discount
        setTimeout(() => {
            showToast('Get 5% off on your first booking! Use code: FIRST5', 'info');
        }, 2000);
    }, 500);
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#06A77D' : type === 'error' ? '#E63946' : '#004E89'};
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideUp 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Show loading overlay
 */
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('active');
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.remove('active');
}

/**
 * Book tour package
 */
function bookTourPackage(packageName) {
    showLoading();
    setTimeout(() => {
        hideLoading();
        showToast(`Booking ${packageName}... Redirecting to payment`, 'success');
    }, 1500);
}

// Export functions for use in other modules
window.CustomerPortal = {
    showSection,
    openModal,
    closeModal,
    showToast,
    showLoading,
    hideLoading,
    rebookRide,
    bookTourPackage
};
