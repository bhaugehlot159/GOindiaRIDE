// Initialize map
let map;
let pickupMarker, dropoffMarker;
let selectedRideType = 'economy';
const rideRates = {
    economy: 5,
    premium: 8
};

// Check user authentication
const currentUser = checkAuth();
document.getElementById('userDisplay').textContent = `Welcome, ${currentUser.fullname}!`;

// Initialize Leaflet Map
function initMap() {
    map = L.map('map').setView([28.7041, 77.1025], 13); // Delhi coordinates

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
}

// Ride type selection
document.querySelectorAll('.ride-type-card').forEach(card => {
    card.addEventListener('click', function() {
        document.querySelectorAll('.ride-type-card').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        selectedRideType = this.dataset.type;
        calculateFare();
    });
});

// Calculate fare estimation
function calculateFare() {
    const baseFare = 50;
    const distance = Math.random() * 10 + 5; // Random distance for demo
    const time = Math.random() * 30 + 10; // Random time for demo
    
    const ratePerKm = rideRates[selectedRideType];
    const distanceFare = distance * ratePerKm;
    const timeFare = (time / 60) * 10; // ₹10 per minute
    
    const total = baseFare + distanceFare + timeFare;
    
    document.getElementById('distanceFare').textContent = `₹${distanceFare.toFixed(2)}`;
    document.getElementById('timeFare').textContent = `₹${timeFare.toFixed(2)}`;
    document.getElementById('totalFare').textContent = `₹${total.toFixed(2)}`;
}

// Handle booking form submission
document.getElementById('bookingForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const pickup = document.getElementById('pickup').value;
    const dropoff = document.getElementById('dropoff').value;
    const rideDateTime = document.getElementById('rideDateTime').value;
    const totalFare = document.getElementById('totalFare').textContent;

    const booking = {
        id: Date.now(),
        userId: currentUser.id,
        pickup,
        dropoff,
        rideType: selectedRideType,
        rideDateTime: rideDateTime || new Date().toISOString(),
        totalFare,
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    // Save booking
    const bookings = JSON.parse(localStorage.getItem('bookings')) || [];
    bookings.push(booking);
    localStorage.setItem('bookings', JSON.stringify(bookings));

    alert('Booking confirmed! Ride ID: ' + booking.id);
    window.location.href = 'dashboard.html';
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', function() {
    initMap();
    calculateFare();
});
