// GO India RIDE - Main Application File
console.log('App.js loaded successfully!');

// Initialize app on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Application initialized');
    loadUserData();
});

// Load user data on dashboard
function loadUserData() {
    const userRole = localStorage.getItem('userRole');
    
    if (userRole === 'customer') {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        console.log('Customer logged in:', user);
    } else if (userRole === 'driver') {
        const driver = JSON.parse(localStorage.getItem('currentDriver'));
        console.log('Driver logged in:', driver);
    } else if (userRole === 'admin') {
        const admin = JSON.parse(localStorage.getItem('currentAdmin'));
        console.log('Admin logged in:', admin);
    }
}

// Logout function
function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentDriver');
    localStorage.removeItem('currentAdmin');
    localStorage.removeItem('userRole');
    window.location.href = './login.html';
}

// Check authentication
function checkAuth() {
    const userRole = localStorage.getItem('userRole');
    const currentUser = localStorage.getItem('currentUser');
    const currentDriver = localStorage.getItem('currentDriver');
    const currentAdmin = localStorage.getItem('currentAdmin');

    if (userRole === 'customer' && currentUser) {
        return JSON.parse(currentUser);
    } else if (userRole === 'driver' && currentDriver) {
        return JSON.parse(currentDriver);
    } else if (userRole === 'admin' && currentAdmin) {
        return JSON.parse(currentAdmin);
    }
    
    return null;
}

// Load districts for auto-suggest
async function loadDistricts() {
    try {
        const response = await fetch('./data/format-2-json/states/rajasthan-50-complete.json');
        const data = await response.json();
        return Object.keys(data.districts);
    } catch (error) {
        console.error('Error loading districts:', error);
        return [];
    }
}

// Auto-suggest function
function setupAutoSuggest(inputElement, suggestionsElement) {
    let allDistricts = [];
    
    loadDistricts().then(districts => {
        allDistricts = districts.filter(d => d.length > 0);
    });
    
    inputElement.addEventListener('input', function(e) {
        const value = e.target.value.toLowerCase();
        
        if (value.length < 1) {
            suggestionsElement.innerHTML = '';
            return;
        }
        
        const filtered = allDistricts.filter(d => 
            d.toLowerCase().includes(value)
        );
        
        if (filtered.length === 0) {
            suggestionsElement.innerHTML = '<div style="padding: 10px; color: #999;">No results found</div>';
            return;
        }
        
        const html = filtered.slice(0, 8).map(d => 
            `<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;" onclick="selectDistrict(this, '${d}')">${d}</div>`
        ).join('');
        
        suggestionsElement.innerHTML = html;
    });
}

function selectDistrict(element, district) {
    const input = element.closest('.suggestion-container').querySelector('input');
    input.value = district;
    element.parentElement.innerHTML = '';
}

// Calculate fare
function calculateFare(distance, rideType) {
    const basefare = 50;
    const kmRate = 5;
    const minuteRate = 10;
    const estimatedTime = Math.ceil(distance / 20); // 20 km/hour average
    
    let multiplier = 1;
    if (rideType === 'premium') multiplier = 1.5;
    if (rideType === 'share') multiplier = 0.7;
    
    const fare = (basefare + (distance * kmRate) + (estimatedTime * minuteRate)) * multiplier;
    return Math.round(fare);
}

// Format currency
function formatCurrency(amount) {
    return '₹' + amount.toLocaleString('en-IN');
}

// Get district info
async function getDistrictInfo(districtName) {
    try {
        const response = await fetch('./data/format-2-json/states/rajasthan-50-complete.json');
        const data = await response.json();
        return data.districts[districtName] || null;
    } catch (error) {
        console.error('Error loading district info:', error);
        return null;
    }
}

console.log('✅ Application ready!');
