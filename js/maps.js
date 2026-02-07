/* ===============================
   GOOGLE MAPS
   =============================== */

let map;
let directionsService;
let directionsRenderer;

function initMap() {
  const centerIndia = { lat: 22.9734, lng: 78.6569 };

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 6,
    center: centerIndia
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer();
  directionsRenderer.setMap(map);
}

// Optional: draw route (future ready)
function drawRoute(origin, destination) {
  if (!directionsService || !directionsRenderer) return;

  directionsService.route(
    {
      origin: origin,
      destination: destination,
      travelMode: google.maps.TravelMode.DRIVING
    },
    (result, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);
      }
    }
  );
}
