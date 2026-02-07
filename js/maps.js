// Rajasthan center
const map = L.map("map").setView([26.9124, 75.7873], 7);

// OpenStreetMap layer
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

// Marker loop
rajasthanData.forEach(districtData => {
  districtData.places.forEach(place => {

    const marker = L.marker([place.lat, place.lng]).addTo(map);

    marker.bindPopup(`
      <b>${place.name}</b><br/>
      District: ${districtData.district}
    `);

  });
});
