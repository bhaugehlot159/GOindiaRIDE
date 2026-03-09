/**
 * GO India RIDE - Tourism Guide
 * Handles digital travel card, temple timings, cultural guide, events, packages, and more
 */

// Initialize tourism guide
document.addEventListener('DOMContentLoaded', function() {
    initializeTourismGuide();
    setupDigitalTravelCard();
});

/**
 * Initialize tourism guide
 */
function initializeTourismGuide() {
    console.log('Tourism guide initialized');
    
    // Load tourism data
    loadTourismData();
    
    // Generate QR code for travel card
    generateTravelCardQR();
}

/**
 * Load tourism data
 */
function loadTourismData() {
    // Initialize if not exists
    if (!localStorage.getItem('goindiaride_tourism_data')) {
        const tourismData = {
            temples: [
                {
                    name: 'Govind Dev Ji Temple',
                    location: 'City Palace, Jaipur',
                    morningAarti: '4:30 AM',
                    eveningAarti: '7:30 PM',
                    description: 'Famous Krishna temple in the heart of Jaipur',
                    dressCode: 'Modest clothing required',
                    photography: 'Not allowed inside'
                },
                {
                    name: 'Birla Mandir',
                    location: 'JLN Marg, Jaipur',
                    morningAarti: '6:00 AM',
                    eveningAarti: '6:00 PM',
                    description: 'Beautiful white marble temple dedicated to Lord Vishnu',
                    dressCode: 'Traditional dress preferred',
                    photography: 'Allowed in outer areas'
                },
                {
                    name: 'Galtaji Temple (Monkey Temple)',
                    location: 'Galta Gate, Jaipur',
                    morningAarti: '5:00 AM',
                    eveningAarti: '5:00 PM',
                    description: 'Ancient Hindu pilgrimage site with natural springs',
                    dressCode: 'Modest clothing, remove shoes',
                    photography: 'Allowed'
                }
            ],
            events: [
                {
                    name: 'Teej Festival',
                    date: 'August 2024',
                    location: 'Citywide',
                    description: 'Celebrates the monsoon and marital bliss',
                    specialOffers: 'Get 15% off on rides during festival days'
                },
                {
                    name: 'Jaipur Literature Festival',
                    date: 'January 2025',
                    location: 'Diggi Palace',
                    description: 'World\'s largest free literary festival',
                    specialOffers: 'Special packages available for attendees'
                },
                {
                    name: 'Elephant Festival',
                    date: 'March 2024',
                    location: 'Jaipur Polo Ground',
                    description: 'Colorful festival featuring decorated elephants',
                    specialOffers: 'Exclusive tour packages with elephant rides'
                }
            ],
            tourPackages: [
                {
                    name: 'Jaipur Heritage Tour',
                    duration: '8 hours',
                    price: 2500,
                    places: ['Amber Fort', 'City Palace', 'Hawa Mahal', 'Jantar Mantar', 'Jal Mahal'],
                    included: ['AC Vehicle', 'Guide', 'Entry Tickets', 'Lunch']
                },
                {
                    name: 'Pink City Express',
                    duration: '4 hours',
                    price: 1500,
                    places: ['Hawa Mahal', 'City Palace', 'Jantar Mantar'],
                    included: ['AC Vehicle', 'Guide']
                },
                {
                    name: 'Spiritual Jaipur',
                    duration: '6 hours',
                    price: 1800,
                    places: ['Birla Mandir', 'Govind Dev Ji', 'Galtaji', 'Moti Dungri'],
                    included: ['AC Vehicle', 'Spiritual Guide', 'Prasad']
                }
            ],
            heritageWalks: [
                {
                    name: 'Walled City Walk',
                    duration: '3 hours',
                    difficulty: 'Easy',
                    highlights: ['Local markets', 'Historic havelis', 'Street food'],
                    startPoint: 'Tripolia Gate',
                    price: 500
                },
                {
                    name: 'Bazaar Trail',
                    duration: '2 hours',
                    difficulty: 'Easy',
                    highlights: ['Johari Bazaar', 'Bapu Bazaar', 'Local crafts'],
                    startPoint: 'Hawa Mahal',
                    price: 400
                },
                {
                    name: 'Temple Circuit',
                    duration: '4 hours',
                    difficulty: 'Moderate',
                    highlights: ['5 major temples', 'Religious history', 'Architecture'],
                    startPoint: 'Govind Dev Ji Temple',
                    price: 600
                }
            ],
            foodGuide: [
                {
                    name: 'Dal Baati Churma',
                    restaurant: 'Chokhi Dhani',
                    price: 350,
                    type: 'Main Course',
                    description: 'Traditional Rajasthani delicacy with lentils and wheat balls'
                },
                {
                    name: 'Laal Maas',
                    restaurant: 'Handi Restaurant',
                    price: 450,
                    type: 'Main Course',
                    description: 'Spicy mutton curry with red chilies'
                },
                {
                    name: 'Ghewar',
                    restaurant: 'LMB',
                    price: 200,
                    type: 'Dessert',
                    description: 'Disc-shaped sweet cake made with flour and soaked in sugar syrup'
                },
                {
                    name: 'Pyaaz Kachori',
                    restaurant: 'Rawat Mishthan Bhandar',
                    price: 50,
                    type: 'Snack',
                    description: 'Crispy pastry filled with spicy onion mixture'
                }
            ],
            shoppingGuide: [
                {
                    name: 'Johari Bazaar',
                    items: ['Jewelry', 'Gems', 'Precious stones'],
                    timing: '10:00 AM - 9:00 PM',
                    bargainTip: 'Start at 50% of quoted price',
                    bestFor: 'Traditional jewelry'
                },
                {
                    name: 'Bapu Bazaar',
                    items: ['Textiles', 'Handicrafts', 'Mojari (shoes)'],
                    timing: '10:00 AM - 9:00 PM',
                    bargainTip: 'Best prices in bulk',
                    bestFor: 'Textiles and handicrafts'
                },
                {
                    name: 'Tripolia Bazaar',
                    items: ['Bangles', 'Carpets', 'Brassware'],
                    timing: '10:00 AM - 9:00 PM',
                    bargainTip: 'Compare prices at 3-4 shops',
                    bestFor: 'Lac bangles'
                }
            ],
            culturalInfo: {
                greetings: {
                    title: 'Greetings',
                    info: 'Use "Namaste" (hands folded) or "Ram Ram" as common greetings'
                },
                dressCode: {
                    title: 'Dress Code',
                    info: 'Modest clothing is appreciated, especially at religious sites. Remove shoes before entering temples.'
                },
                photography: {
                    title: 'Photography',
                    info: 'Always ask permission before photographing people or religious ceremonies. Some temples prohibit photography inside.'
                },
                dining: {
                    title: 'Dining Etiquette',
                    info: 'Many locals eat with right hand. Wash hands before and after meals. Respect vegetarian preferences.'
                },
                festivals: {
                    title: 'Festival Participation',
                    info: 'Tourists are welcome to join festivals. Dress in traditional attire if possible. Be respectful of rituals.'
                }
            }
        };
        
        localStorage.setItem('goindiaride_tourism_data', JSON.stringify(tourismData));
    }
}

/**
 * Setup digital travel card
 */
function setupDigitalTravelCard() {
    const travelCard = document.getElementById('digitalTravelCard');
    
    if (travelCard) {
        travelCard.addEventListener('click', showTravelCardDetails);
    }
}

/**
 * Generate travel card QR code
 */
function generateTravelCardQR() {
    const qrCode = document.getElementById('travelQR');
    
    if (qrCode) {
        const travelId = localStorage.getItem('goindiaride_travel_id') || 'GIR00000000';
        qrCode.innerHTML = `
            <div style="font-size: 0.7rem; text-align: center;">
                <i class="fas fa-qrcode" style="font-size: 3rem;"></i><br>
                ${travelId}
            </div>
        `;
    }
}

/**
 * Show travel card details
 */
function showTravelCardDetails() {
    const userData = JSON.parse(localStorage.getItem('goindiaride_user') || '{}');
    const travelId = localStorage.getItem('goindiaride_travel_id');
    const validity = getValidityDate();
    const rideHistory = JSON.parse(localStorage.getItem('goindiaride_ride_history') || '[]');
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Digital Travel Card</h2>
            
            <div style="background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)); padding: 2rem; border-radius: 16px; color: white; margin-bottom: 1.5rem;">
                <div style="text-align: center; margin-bottom: 1.5rem;">
                    <div style="background: white; display: inline-block; padding: 1rem; border-radius: 8px;">
                        <i class="fas fa-qrcode" style="font-size: 5rem; color: var(--text-dark);"></i>
                    </div>
                </div>
                <div style="text-align: center;">
                    <h3>${userData.name || 'Guest User'}</h3>
                    <p>ID: ${travelId}</p>
                    <p>Valid Until: ${validity}</p>
                </div>
            </div>
            
            <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <strong>Card Benefits:</strong>
                <ul style="margin: 0.5rem 0 0 1.5rem; color: var(--text-dark);">
                    <li>Special tourist rates on rides</li>
                    <li>Priority booking at tourist spots</li>
                    <li>Discounts at partner restaurants</li>
                    <li>24/7 tourist helpline access</li>
                </ul>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1rem;">
                <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; text-align: center;">
                    <strong>${rideHistory.length}</strong><br>
                    <small>Total Rides</small>
                </div>
                <div style="background: var(--bg-light); padding: 1rem; border-radius: 8px; text-align: center;">
                    <strong>${calculateTotalDistance(rideHistory)} km</strong><br>
                    <small>Distance Covered</small>
                </div>
            </div>
            
            <button class="btn-primary" onclick="downloadTravelCard()" style="width: 100%; margin-bottom: 0.5rem;">
                <i class="fas fa-download"></i> Download Card
            </button>
            <button class="btn-secondary" onclick="this.closest('.modal').remove()" style="width: 100%;">
                Close
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
 * Calculate total distance from ride history
 */
function calculateTotalDistance(rideHistory) {
    // In production, this would calculate actual distances
    return (rideHistory.length * 12.5).toFixed(1); // Average 12.5 km per ride
}

/**
 * Get validity date
 */
function getValidityDate() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toLocaleDateString('en-IN');
}

/**
 * Download travel card
 */
function downloadTravelCard() {
    CustomerPortal.showToast('Travel card download feature coming soon!', 'info');
}

/**
 * Show temple timings with detailed information
 */
function showTempleTimingsDetailed() {
    const tourismData = JSON.parse(localStorage.getItem('goindiaride_tourism_data'));
    const temples = tourismData.temples;
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <span class="close">&times;</span>
            <h2>Temple Aarti Timings</h2>
            <p style="color: var(--text-light); margin-bottom: 1.5rem;">
                Daily aarti schedules and special event timings
            </p>
            
            ${temples.map(temple => `
                <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; margin-bottom: 1rem;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--primary-color);">
                        <i class="fas fa-om"></i> ${temple.name}
                    </h3>
                    <p style="color: var(--text-light); margin-bottom: 1rem;">
                        <i class="fas fa-map-marker-alt"></i> ${temple.location}
                    </p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                        <div>
                            <strong>Morning Aarti:</strong><br>
                            <span style="color: var(--accent-color);">${temple.morningAarti}</span>
                        </div>
                        <div>
                            <strong>Evening Aarti:</strong><br>
                            <span style="color: var(--accent-color);">${temple.eveningAarti}</span>
                        </div>
                    </div>
                    <p style="font-size: 0.9rem; margin-bottom: 0.5rem;">${temple.description}</p>
                    <div style="font-size: 0.85rem; color: var(--text-light);">
                        <strong>Dress Code:</strong> ${temple.dressCode}<br>
                        <strong>Photography:</strong> ${temple.photography}
                    </div>
                    <button class="btn-secondary" onclick="bookTempleRide('${temple.name}', '${temple.location}')" style="width: 100%; margin-top: 1rem;">
                        <i class="fas fa-car"></i> Book Ride to Temple
                    </button>
                </div>
            `).join('')}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Book ride to temple
 */
function bookTempleRide(templeName, location) {
    CustomerPortal.showToast(`Booking ride to ${templeName}...`, 'success');
    
    // Close modals and open booking
    document.querySelectorAll('.modal').forEach(m => m.remove());
    
    // Open booking modal with prefilled destination
    setTimeout(() => {
        CustomerPortal.openModal('bookingModal');
        document.getElementById('dropLocation').value = location;
    }, 500);
}

/**
 * Show cultural guide detailed
 */
function showCulturalGuideDetailed() {
    const tourismData = JSON.parse(localStorage.getItem('goindiaride_tourism_data'));
    const culturalInfo = tourismData.culturalInfo;
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <span class="close">&times;</span>
            <h2>Rajasthani Cultural Guide</h2>
            <p style="color: var(--text-light); margin-bottom: 1.5rem;">
                Essential information for respectful tourism
            </p>
            
            ${Object.entries(culturalInfo).map(([key, item]) => `
                <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; margin-bottom: 1rem;">
                    <h3 style="margin-bottom: 0.75rem; color: var(--primary-color);">
                        ${getIconForCulturalItem(key)} ${item.title}
                    </h3>
                    <p style="color: var(--text-dark);">${item.info}</p>
                </div>
            `).join('')}
            
            <div style="background: linear-gradient(135deg, var(--accent-color), var(--warning-color)); padding: 1.5rem; border-radius: 12px; color: white; margin-top: 1.5rem;">
                <h3 style="margin-bottom: 0.5rem;"><i class="fas fa-lightbulb"></i> Pro Tip</h3>
                <p>Download our Cultural Guide PDF for offline access during your travels!</p>
                <button class="btn-secondary" onclick="downloadCulturalGuide()" style="margin-top: 1rem; background: white; color: var(--text-dark);">
                    <i class="fas fa-download"></i> Download PDF
                </button>
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
 * Get icon for cultural item
 */
function getIconForCulturalItem(key) {
    const icons = {
        greetings: '<i class="fas fa-hands"></i>',
        dressCode: '<i class="fas fa-tshirt"></i>',
        photography: '<i class="fas fa-camera"></i>',
        dining: '<i class="fas fa-utensils"></i>',
        festivals: '<i class="fas fa-calendar-alt"></i>'
    };
    return icons[key] || '<i class="fas fa-info-circle"></i>';
}

/**
 * Download cultural guide
 */
function downloadCulturalGuide() {
    CustomerPortal.showToast('Cultural guide PDF download coming soon!', 'info');
}

/**
 * Show local events detailed
 */
function showLocalEventsDetailed() {
    const tourismData = JSON.parse(localStorage.getItem('goindiaride_tourism_data'));
    const events = tourismData.events;
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <span class="close">&times;</span>
            <h2>Local Events & Festivals</h2>
            <p style="color: var(--text-light); margin-bottom: 1.5rem;">
                Upcoming festivals and special events in Jaipur
            </p>
            
            ${events.map(event => `
                <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; margin-bottom: 1rem;">
                    <h3 style="margin-bottom: 0.5rem; color: var(--primary-color);">
                        <i class="fas fa-calendar-check"></i> ${event.name}
                    </h3>
                    <div style="color: var(--text-light); margin-bottom: 1rem;">
                        📅 ${event.date} • 📍 ${event.location}
                    </div>
                    <p style="margin-bottom: 1rem;">${event.description}</p>
                    <div style="background: var(--bg-white); padding: 1rem; border-radius: 8px; border-left: 4px solid var(--success-color);">
                        <strong style="color: var(--success-color);">Special Offer:</strong><br>
                        ${event.specialOffers}
                    </div>
                    <button class="btn-secondary" onclick="notifyMeForEvent('${event.name}')" style="width: 100%; margin-top: 1rem;">
                        <i class="fas fa-bell"></i> Notify Me
                    </button>
                </div>
            `).join('')}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Notify me for event
 */
function notifyMeForEvent(eventName) {
    const notifications = JSON.parse(localStorage.getItem('goindiaride_event_notifications') || '[]');
    
    if (!notifications.includes(eventName)) {
        notifications.push(eventName);
        localStorage.setItem('goindiaride_event_notifications', JSON.stringify(notifications));
        CustomerPortal.showToast(`You'll be notified about ${eventName}`, 'success');
    } else {
        CustomerPortal.showToast('Already subscribed to this event', 'info');
    }
}

/**
 * Show tour packages detailed
 */
function showTourPackagesDetailed() {
    const tourismData = JSON.parse(localStorage.getItem('goindiaride_tourism_data'));
    const packages = tourismData.tourPackages;
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <span class="close">&times;</span>
            <h2>Tour Packages</h2>
            <p style="color: var(--text-light); margin-bottom: 1.5rem;">
                Pre-designed tour packages for memorable experiences
            </p>
            
            ${packages.map(pkg => `
                <div style="background: var(--bg-light); padding: 1.5rem; border-radius: 12px; margin-bottom: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                        <h3 style="color: var(--primary-color);">
                            <i class="fas fa-suitcase"></i> ${pkg.name}
                        </h3>
                        <span style="background: var(--accent-color); color: white; padding: 0.5rem 1rem; border-radius: 20px; font-weight: bold;">
                            ₹${pkg.price}
                        </span>
                    </div>
                    <div style="color: var(--text-light); margin-bottom: 1rem;">
                        ⏱️ ${pkg.duration}
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <strong>Places Covered:</strong><br>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                            ${pkg.places.map(place => `
                                <span style="background: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem;">
                                    📍 ${place}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <strong>Included:</strong><br>
                        <div style="margin-top: 0.5rem;">
                            ${pkg.included.map(item => `
                                <div style="font-size: 0.9rem; color: var(--text-dark);">
                                    ✓ ${item}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <button class="btn-primary" onclick="bookTourPackageDetailed('${pkg.name}', ${pkg.price})" style="width: 100%;">
                        <i class="fas fa-shopping-cart"></i> Book Package
                    </button>
                </div>
            `).join('')}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Book tour package
 */
function bookTourPackageDetailed(packageName, price) {
    CustomerPortal.showLoading();
    
    setTimeout(() => {
        // Save package booking
        const bookings = JSON.parse(localStorage.getItem('goindiaride_package_bookings') || '[]');
        bookings.push({
            package: packageName,
            price: price,
            date: new Date().toISOString(),
            status: 'confirmed'
        });
        localStorage.setItem('goindiaride_package_bookings', JSON.stringify(bookings));
        
        CustomerPortal.hideLoading();
        document.querySelectorAll('.modal').forEach(m => m.remove());
        
        CustomerPortal.showToast(`${packageName} booked successfully!`, 'success');
    }, 2000);
}

// Export functions for global use
window.TourismGuide = {
    showTempleTimingsDetailed,
    showCulturalGuideDetailed,
    showLocalEventsDetailed,
    showTourPackagesDetailed,
    bookTempleRide,
    downloadCulturalGuide,
    notifyMeForEvent,
    bookTourPackageDetailed,
    downloadTravelCard
};
