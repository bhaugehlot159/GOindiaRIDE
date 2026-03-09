/* ===============================
   VEHICLE AUTO SUGGESTION
   =============================== */

const passengerInput = document.getElementById("passengers");
const vehicleOutput = document.getElementById("vehicleSuggest");

if (passengerInput) {
  passengerInput.addEventListener("input", () => {
    const count = parseInt(passengerInput.value);
    let vehicle = "";

    if (!count || count <= 0) {
      vehicle = "";
    } else if (count === 1) {
      vehicle = "Bike / Auto";
    } else if (count <= 4) {
      vehicle = "Sedan";
    } else if (count <= 6) {
      vehicle = "SUV";
    } else if (count <= 12) {
      vehicle = "Tempo Traveller";
    } else {
      vehicle = "Bus";
    }

    if (vehicleOutput) {
      vehicleOutput.innerText = vehicle;
    }
  });
}
