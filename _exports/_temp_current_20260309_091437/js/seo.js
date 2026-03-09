/* ===============================
   SEO HELPERS
   =============================== */

function loadSEOCity(city) {
  if (!city) return;

  document.title = `Taxi Service in ${city} | GoIndiaRide`;

  const metaDesc = document.querySelector("meta[name='description']");
  if (metaDesc) {
    metaDesc.setAttribute(
      "content",
      `Book reliable taxi service in ${city}. Safe drivers, best fares, GoIndiaRide.`
    );
  }
}
