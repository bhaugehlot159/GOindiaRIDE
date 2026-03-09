// ======================================
// DISTRICT VIEW CONTROLLER
// ======================================

const districtSelect = document.getElementById("districtSelect");
const districtOutput = document.getElementById("districtOutput");

// Rajasthan districts dropdown fill
locationsData.rajasthan.districts.forEach(district => {
  const option = document.createElement("option");
  option.value = district;
  option.textContent = district;
  districtSelect.appendChild(option);
});

// On district change
districtSelect.addEventListener("change", function () {
  const selectedDistrict = this.value;
  showDistrictData(selectedDistrict);
});

// Show full district data
function showDistrictData(districtName) {

  districtOutput.innerHTML = "";

  // JS key match (name cleanup)
  const jsKey = districtName
    .replace(/-/g, "")
    .replace(/\s/g, "");

  const districtData = Rajasthan[jsKey];

  if (!districtData) {
    districtOutput.innerHTML = "<p>Data not available</p>";
    return;
  }

  for (let category in districtData) {
    const section = document.createElement("div");
    section.className = "district-section";

    const heading = document.createElement("h3");
    heading.textContent = category.replace(/_/g, " ").toUpperCase();

    const list = document.createElement("ul");

    districtData[category].forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });

    section.appendChild(heading);
    section.appendChild(list);
    districtOutput.appendChild(section);
  }
}
