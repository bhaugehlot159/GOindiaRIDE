const map = L.map("map").setView([23.8431, 73.7147], 9);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);

// ✅ Dungarpur markers
Rajasthan.Dungarpur.temples_religious.forEach(place => {
  L.marker([place.lat, place.lng])
    .addTo(map)
    .bindPopup(`<b>${place.name}</b><br>Dungarpur`);
});
