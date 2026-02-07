/* ===============================
   ADMIN / BOOKINGS VIEW
   =============================== */

function loadBookings() {
  if (typeof firebase === "undefined") {
    console.warn("Firebase not loaded");
    return;
  }

  if (typeof db === "undefined") {
    console.warn("Database not initialised");
    return;
  }

  db.ref("bookings").once("value", snapshot => {
    const data = snapshot.val();
    console.log("All bookings:", data);
  });
}
