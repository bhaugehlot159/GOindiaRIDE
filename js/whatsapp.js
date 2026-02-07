/* ===============================
   WHATSAPP BOOKING
   =============================== */

function sendBookingWhatsApp() {
  if (typeof bookingData === "undefined") {
    alert("Booking data not ready");
    return;
  }

  const message = `
🚕 *GoIndiaRide Booking*
Pickup: ${bookingData.pickup}
Drop: ${bookingData.drop}
Date: ${bookingData.date}
Time: ${bookingData.time}
Passengers: ${bookingData.passengers}
Distance: ${bookingData.distance} KM
Fare: ₹${bookingData.fare}
`;

  const phoneNumber = "918426891471"; // your WhatsApp number
  const url =
    "https://wa.me/" +
    phoneNumber +
    "?text=" +
    encodeURIComponent(message);

  window.open(url, "_blank");
}
