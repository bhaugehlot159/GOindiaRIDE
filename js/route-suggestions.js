/**
 * GO India RIDE - Route Suggestions System
 * Points of Interest along routes in Rajasthan
 */

// Route data with highlights and suggestions
const routeSuggestions = {
    "Jaipur-Ajmer": {
        distance: "135 km",
        duration: "2.5 hours",
        highlights: [
            { name: "Sambhar Lake", km: 65, type: "tourist", icon: "🏞️", description: "India's largest saltwater lake" },
            { name: "Kishangarh Fort", km: 90, type: "fort", icon: "🏰", description: "Historic fort with lake views" },
            { name: "Pushkar", km: 125, type: "religious", icon: "🛕", description: "Sacred city with Brahma Temple" }
        ],
        restaurants: [
            { name: "Highway King Dhaba", km: 45, type: "dhaba", rating: 4.3 },
            { name: "Rajasthani Rasoi", km: 80, type: "restaurant", rating: 4.5 }
        ],
        petrolPumps: [
            { name: "Indian Oil", km: 30 },
            { name: "HP Petrol", km: 70 },
            { name: "BPCL", km: 110 }
        ]
    },
    
    "Jaipur-Jodhpur": {
        distance: "335 km",
        duration: "5.5 hours",
        highlights: [
            { name: "Ajmer Sharif Dargah", km: 135, type: "religious", icon: "🕌", description: "Famous Sufi shrine" },
            { name: "Pushkar Lake", km: 145, type: "tourist", icon: "🏞️", description: "Sacred Hindu pilgrimage site" },
            { name: "Merta City", km: 200, type: "city", icon: "🏙️", description: "Birthplace of Meera Bai" },
            { name: "Nagaur Fort", km: 250, type: "fort", icon: "🏰", description: "Historic Rajput fort" }
        ],
        restaurants: [
            { name: "Kesar Da Dhaba", km: 135, type: "dhaba", rating: 4.6 },
            { name: "Pushkar Café", km: 145, type: "cafe", rating: 4.4 },
            { name: "Highway Junction", km: 220, type: "dhaba", rating: 4.2 }
        ],
        petrolPumps: [
            { name: "Indian Oil", km: 50 },
            { name: "BPCL", km: 135 },
            { name: "HP Petrol", km: 180 },
            { name: "Reliance", km: 250 }
        ]
    },
    
    "Jaipur-Udaipur": {
        distance: "395 km",
        duration: "6.5 hours",
        highlights: [
            { name: "Ajmer", km: 135, type: "city", icon: "🏙️", description: "Historic city with Dargah" },
            { name: "Pushkar", km: 145, type: "religious", icon: "🛕", description: "Sacred Hindu city" },
            { name: "Chittorgarh Fort", km: 280, type: "fort", icon: "🏰", description: "UNESCO World Heritage Site" },
            { name: "Rajsamand Lake", km: 340, type: "tourist", icon: "🏞️", description: "Beautiful artificial lake" }
        ],
        restaurants: [
            { name: "Highway Treat", km: 100, type: "restaurant", rating: 4.3 },
            { name: "Chittorgarh Bhojnalaya", km: 280, type: "dhaba", rating: 4.4 },
            { name: "Lake View Restaurant", km: 340, type: "restaurant", rating: 4.5 }
        ],
        petrolPumps: [
            { name: "Indian Oil", km: 60 },
            { name: "HP Petrol", km: 135 },
            { name: "BPCL", km: 220 },
            { name: "Indian Oil", km: 310 }
        ]
    },
    
    "Jaipur-Agra": {
        distance: "240 km",
        duration: "4 hours",
        highlights: [
            { name: "Bharatpur Bird Sanctuary", km: 180, type: "wildlife", icon: "🦜", description: "UNESCO World Heritage Site" },
            { name: "Fatehpur Sikri", km: 210, type: "fort", icon: "🏰", description: "Mughal architectural marvel" }
        ],
        restaurants: [
            { name: "Dausa Highway Dhaba", km: 60, type: "dhaba", rating: 4.2 },
            { name: "Bharatpur Restaurant", km: 180, type: "restaurant", rating: 4.4 },
            { name: "Sikri Rasoi", km: 210, type: "restaurant", rating: 4.5 }
        ],
        petrolPumps: [
            { name: "HP Petrol", km: 50 },
            { name: "Indian Oil", km: 120 },
            { name: "BPCL", km: 180 }
        ]
    },
    
    "Jaipur-Delhi": {
        distance: "280 km",
        duration: "4.5 hours",
        highlights: [
            { name: "Neemrana Fort", km: 122, type: "fort", icon: "🏰", description: "Heritage fort hotel" },
            { name: "Alwar City", km: 150, type: "city", icon: "🏙️", description: "Historic city with palace" }
        ],
        restaurants: [
            { name: "Shahpura Haveli", km: 70, type: "restaurant", rating: 4.3 },
            { name: "Neemrana Restaurant", km: 122, type: "restaurant", rating: 4.6 },
            { name: "Alwar Dhaba", km: 150, type: "dhaba", rating: 4.2 }
        ],
        petrolPumps: [
            { name: "HP Petrol", km: 60 },
            { name: "Indian Oil", km: 122 },
            { name: "BPCL", km: 180 },
            { name: "Reliance", km: 240 }
        ]
    },
    
    "Jodhpur-Jaisalmer": {
        distance: "285 km",
        duration: "5 hours",
        highlights: [
            { name: "Osian Temples", km: 65, type: "religious", icon: "🛕", description: "Ancient Jain temples" },
            { name: "Pokhran Fort", km: 170, type: "fort", icon: "🏰", description: "Historic desert fort" },
            { name: "Sam Sand Dunes", km: 250, type: "tourist", icon: "🏜️", description: "Desert safari experience" }
        ],
        restaurants: [
            { name: "Desert Dhaba", km: 100, type: "dhaba", rating: 4.1 },
            { name: "Pokhran Rasoi", km: 170, type: "restaurant", rating: 4.3 }
        ],
        petrolPumps: [
            { name: "Indian Oil", km: 65 },
            { name: "HP Petrol", km: 170 },
            { name: "BPCL", km: 240 }
        ]
    },
    
    "Udaipur-Mount Abu": {
        distance: "165 km",
        duration: "3 hours",
        highlights: [
            { name: "Kumbhalgarh Fort", km: 85, type: "fort", icon: "🏰", description: "Second longest wall after Great Wall of China" },
            { name: "Ranakpur Jain Temple", km: 95, type: "religious", icon: "🛕", description: "Stunning marble temple" },
            { name: "Nakki Lake", km: 160, type: "tourist", icon: "🏞️", description: "Sacred lake in hills" }
        ],
        restaurants: [
            { name: "Kumbhalgarh Restaurant", km: 85, type: "restaurant", rating: 4.4 },
            { name: "Ranakpur Cafe", km: 95, type: "cafe", rating: 4.5 }
        ],
        petrolPumps: [
            { name: "HP Petrol", km: 50 },
            { name: "Indian Oil", km: 120 }
        ]
    }
};

// Get route key from pickup and dropoff
function getRouteKey(pickup, dropoff) {
    // Extract district names (assuming format: "District, Location" or just "District")
    const pickupDistrict = pickup.split(',')[0].trim();
    const dropoffDistrict = dropoff.split(',')[0].trim();
    
    // Try both combinations
    const key1 = `${pickupDistrict}-${dropoffDistrict}`;
    const key2 = `${dropoffDistrict}-${pickupDistrict}`;
    
    if (routeSuggestions[key1]) return key1;
    if (routeSuggestions[key2]) return key2;
    
    return null;
}

// Get route suggestions
function getRouteSuggestions(pickup, dropoff) {
    const routeKey = getRouteKey(pickup, dropoff);
    if (routeKey) {
        return routeSuggestions[routeKey];
    }
    return null;
}

// Generate route highlights HTML
function generateRouteHighlightsHTML(routeData) {
    if (!routeData) return '';
    
    let html = '<div class="route-highlights-card" style="background: white; border-radius: 12px; padding: 1.5rem; margin-top: 1.5rem; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">';
    
    // Header
    html += '<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">';
    html += '<i class="fas fa-route" style="color: #667eea; font-size: 1.5rem;"></i>';
    html += '<h3 style="color: #333; margin: 0;">Route Highlights</h3>';
    html += '</div>';
    
    // Distance & Duration
    html += '<div style="display: flex; gap: 2rem; margin-bottom: 1.5rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">';
    html += `<div><strong>🛣️ Distance:</strong> ${routeData.distance}</div>`;
    html += `<div><strong>⏱️ Duration:</strong> ${routeData.duration}</div>`;
    html += '</div>';
    
    // Points of Interest
    if (routeData.highlights && routeData.highlights.length > 0) {
        html += '<div style="margin-bottom: 1.5rem;">';
        html += '<h4 style="color: #333; margin-bottom: 0.8rem; font-size: 1rem;">📍 Points of Interest</h4>';
        html += '<div style="display: grid; gap: 0.8rem;">';
        
        routeData.highlights.forEach(highlight => {
            html += '<div style="padding: 0.8rem; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea;">';
            html += `<div style="display: flex; justify-content: space-between; align-items: start;">';
            html += `<div style="flex: 1;">`;
            html += `<div style="font-weight: bold; color: #333;">${highlight.icon} ${highlight.name}</div>`;
            html += `<div style="font-size: 0.85rem; color: #666; margin-top: 0.2rem;">${highlight.description}</div>`;
            html += `</div>`;
            html += `<div style="background: #667eea; color: white; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.8rem; white-space: nowrap;">${highlight.km} km</div>`;
            html += `</div>`;
            html += '</div>';
        });
        
        html += '</div></div>';
    }
    
    // Restaurants
    if (routeData.restaurants && routeData.restaurants.length > 0) {
        html += '<div style="margin-bottom: 1.5rem;">';
        html += '<h4 style="color: #333; margin-bottom: 0.8rem; font-size: 1rem;">🍽️ Food Stops</h4>';
        html += '<div style="display: grid; gap: 0.5rem;">';
        
        routeData.restaurants.forEach(restaurant => {
            html += '<div style="padding: 0.6rem; background: #fff3cd; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">';
            html += `<span style="color: #333;">${restaurant.name}</span>`;
            html += `<div style="display: flex; gap: 1rem; align-items: center;">`;
            html += `<span style="color: #f39c12;">⭐ ${restaurant.rating}</span>`;
            html += `<span style="background: #f39c12; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">${restaurant.km} km</span>`;
            html += `</div>`;
            html += '</div>';
        });
        
        html += '</div></div>';
    }
    
    // Petrol Pumps
    if (routeData.petrolPumps && routeData.petrolPumps.length > 0) {
        html += '<div>';
        html += '<h4 style="color: #333; margin-bottom: 0.8rem; font-size: 1rem;">⛽ Petrol Pumps</h4>';
        html += '<div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">';
        
        routeData.petrolPumps.forEach(pump => {
            html += `<div style="padding: 0.5rem 1rem; background: #d4edda; border-radius: 6px; font-size: 0.85rem; color: #155724;">`;
            html += `${pump.name} - ${pump.km} km`;
            html += `</div>`;
        });
        
        html += '</div></div>';
    }
    
    html += '</div>';
    return html;
}

// Generate live route info for ongoing rides
function generateLiveRouteInfo(routeData, currentKm) {
    if (!routeData || !routeData.highlights) return '';
    
    // Find next point of interest
    const nextHighlight = routeData.highlights.find(h => h.km > currentKm);
    
    if (!nextHighlight) {
        return '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">🏁 Almost there! Approaching destination.</div>';
    }
    
    const distanceAhead = nextHighlight.km - currentKm;
    
    let html = '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; box-shadow: 0 3px 10px rgba(0,0,0,0.2);">';
    html += '<div style="font-weight: bold; margin-bottom: 0.5rem;">📍 Coming Up Next</div>';
    html += `<div style="font-size: 1.2rem; margin-bottom: 0.3rem;">${nextHighlight.icon} ${nextHighlight.name}</div>`;
    html += `<div style="opacity: 0.9; font-size: 0.9rem;">${nextHighlight.description}</div>`;
    html += `<div style="margin-top: 0.8rem; padding: 0.5rem; background: rgba(255,255,255,0.2); border-radius: 6px;">`;
    html += `⏱️ ${distanceAhead.toFixed(0)} km ahead`;
    html += `</div>`;
    html += '<div style="margin-top: 0.8rem; font-size: 0.85rem; opacity: 0.8;">💡 Tip: Ask your driver if you want to stop!</div>';
    html += '</div>';
    
    return html;
}

// Show route highlights on booking page
function showRouteHighlights(pickup, dropoff, containerId) {
    const routeData = getRouteSuggestions(pickup, dropoff);
    const container = document.getElementById(containerId);
    
    if (container) {
        if (routeData) {
            container.innerHTML = generateRouteHighlightsHTML(routeData);
            container.style.display = 'block';
        } else {
            container.innerHTML = '';
            container.style.display = 'none';
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getRouteSuggestions,
        generateRouteHighlightsHTML,
        generateLiveRouteInfo,
        showRouteHighlights
    };
}
