/* ===== BOOKING VARIABLES ===== */
let pickupInput;
let dropInput;
let fareResult;

/* ===== INIT BOOKING ===== */
document.addEventListener("DOMContentLoaded", () => {
  pickupInput = document.getElementById("pickup");
  dropInput = document.getElementById("drop");
  fareResult = document.getElementById("fareResult");
});
/* ===============================
   BOOKING CORE FUNCTIONS
   =============================== */

// Global booking object
let bookingData = {
  pickup: "",
  drop: "",
  date: "",
  time: "",
  passengers: 1,
  vehicle: "",
  distance: 0,
  fare: 0
};

// Get input values
function collectBookingData() {
  bookingData.pickup = document.getElementById("pickup")?.value || "";
  bookingData.drop = document.getElementById("drop")?.value || "";
  bookingData.date = document.getElementById("date")?.value || "";
  bookingData.time = document.getElementById("time")?.value || "";
  bookingData.passengers = parseInt(
    document.getElementById("passengers")?.value || 1
  );
}

// Validation
function validateBooking() {
  if (!bookingData.pickup || !bookingData.drop) {
    alert("Pickup और Drop दोनों जरूरी हैं");
    return false;
  }
  return true;
}
/* ===============================
   DISTANCE & FARE CALCULATION
   =============================== */

// Fake distance generator (same behaviour as before)
function calculateDistance() {
  const min = 30;
  const max = 300;
  bookingData.distance = Math.floor(Math.random() * (max - min)) + min;
  return bookingData.distance;
}

// Fare calculation logic
function calculateFare() {
  const baseFare = 250;
  const perKmRate = 12;

  bookingData.fare =
    baseFare + bookingData.distance * perKmRate;

  const fareBox = document.getElementById("fareResult");
  if (fareBox) {
    fareBox.innerText =
      `Distance: ${bookingData.distance} KM | Fare: ₹${bookingData.fare}`;
  }
}

// Main estimate function (button se call hota hai)
function estimateFare() {
  collectBookingData();

  if (!validateBooking()) return;

  calculateDistance();
  calculateFare();
}
