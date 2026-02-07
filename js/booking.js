// ===============================
// AUTOCOMPLETE + TOURIST PLACES
// ===============================

document.addEventListener("DOMContentLoaded", () => {

  const input = document.getElementById("locationInput");
  const suggestionsBox = document.getElementById("suggestions");
  const placesSection = document.getElementById("placesSection");

  if (!input || !suggestionsBox) return;

  // ===============================
  // COLLECT ALL LOCATIONS
  // ===============================
  let ALL_LOCATIONS = [];

  // States
  if (window.locationsData?.states) {
    ALL_LOCATIONS.push(...window.locationsData.states);
  }

  // Rajasthan districts
  if (window.locationsData?.rajasthan?.districts) {
    ALL_LOCATIONS.push(...window.locationsData.rajasthan.districts);
  }

  // Tourist places (district wise)
  if (window.RajasthanData) {
    Object.keys(window.RajasthanData).forEach(district => {
      window.RajasthanData[district].forEach(place => {
        ALL_LOCATIONS.push(place.name);
      });
    });
  }

  // Remove duplicates
  ALL_LOCATIONS = [...new Set(ALL_LOCATIONS)];

  // ===============================
  // INPUT EVENT
  // ===============================
  input.addEventListener("input", function () {
    const value = this.value.toLowerCase().trim();
    suggestionsBox.innerHTML = "";

    if (value.length < 1) {
      suggestionsBox.style.display = "none";
      return;
    }

    const matches = ALL_LOCATIONS.filter(name =>
      name.toLowerCase().includes(value)
    );

    if (matches.length === 0) {
      suggestionsBox.style.display = "none";
      return;
    }

    suggestionsBox.style.display = "block";

    matches.slice(0, 10).forEach(name => {
      const li = document.createElement("li");
      li.textContent = name;

      li.addEventListener("click", () => {
        input.value = name;
        suggestionsBox.style.display = "none";
        showTouristPlaces(name);
      });

      suggestionsBox.appendChild(li);
    });
  });

  // ===============================
  // SHOW TOURIST PLACES
  // ===============================
  function showTouristPlaces(selectedName) {
    placesSection.innerHTML = "";

    if (!window.RajasthanData) return;

    // Case 1: District selected
    if (window.RajasthanData[selectedName]) {
      renderPlaces(selectedName, window.RajasthanData[selectedName]);
      return;
    }

    // Case 2: Tourist place selected
    Object.keys(window.RajasthanData).forEach(district => {
      const found = window.RajasthanData[district].find(
        p => p.name === selectedName
      );

      if (found) {
        renderPlaces(district, window.RajasthanData[district]);
      }
    });
  }

  // ===============================
  // RENDER PLACES
  // ===============================
  function renderPlaces(district, places) {
    const title = document.createElement("h2");
    title.textContent = district + " Tourist Places";
    placesSection.appendChild(title);

    const ul = document.createElement("ul");
    ul.className = "places-list";

    places.forEach(place => {
      const li = document.createElement("li");
      li.textContent = place.name;
      ul.appendChild(li);
    });

    placesSection.appendChild(ul);
  }

  // ===============================
  // CLICK OUTSIDE CLOSE
  // ===============================
  document.addEventListener("click", e => {
    if (!e.target.closest(".booking-section")) {
      suggestionsBox.style.display = "none";
    }
  });

});
