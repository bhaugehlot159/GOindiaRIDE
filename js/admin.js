/* ===============================
   ADMIN / BOOKINGS VIEW
   =============================== */

function loadBookings() {
  if (typeof firebase === "undefined") {
    return;
  }

  if (typeof db === "undefined") {
    return;
  }

  db.ref("bookings").once("value", snapshot => {
    snapshot.val();
  });
}
