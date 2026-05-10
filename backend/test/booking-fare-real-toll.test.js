const test = require('node:test');
const assert = require('node:assert/strict');

const { estimateBookingFare } = require('../../js/booking-fare-calculator');

test('fare calculator uses mapped toll plazas for Udaipur to Jaisalmer', () => {
  const estimate = estimateBookingFare({
    pickup: 'Udaipur, Rajasthan',
    drop: 'Jaisalmer, Rajasthan',
    tripPlan: 'airport',
    tripServiceType: 'airport_transfer',
    vehicleType: 'economy',
    vehicleModel: 'hatchback_car',
    passengers: 1,
    luggage: 'none',
    distanceKm: 489,
    distanceSource: 'server_coordinate'
  });

  assert.equal(estimate.tollSource, 'mapped_route_toll_table');
  assert.equal(estimate.tollCharge, 135);
  assert.equal(estimate.tollPlazaCount, 2);
  assert.deepEqual(
    estimate.tollPlazas.map((item) => item.name),
    ['Mandawada (Gomati)', 'Motisar Khanori']
  );
});

test('fare calculator keeps route-direction toll data when reversed', () => {
  const estimate = estimateBookingFare({
    pickup: 'Jaisalmer, Rajasthan',
    drop: 'Udaipur, Rajasthan',
    tripPlan: 'outstation',
    tripServiceType: 'city_local_trip',
    vehicleType: 'economy',
    vehicleModel: 'hatchback_car',
    passengers: 1,
    luggage: 'none',
    distanceKm: 490,
    distanceSource: 'server_coordinate'
  });

  assert.equal(estimate.tollSource, 'mapped_route_toll_table');
  assert.equal(estimate.tollCharge, 125);
  assert.deepEqual(
    estimate.tollPlazas.map((item) => item.name),
    ['Kair Fakir Ki Dhani', 'Nimbasar']
  );
});

test('fare calculator falls back only when a route has no mapped toll corridor', () => {
  const estimate = estimateBookingFare({
    pickup: 'Kota, Rajasthan',
    drop: 'Bikaner, Rajasthan',
    tripPlan: 'outstation',
    tripServiceType: 'city_local_trip',
    vehicleType: 'economy',
    vehicleModel: 'hatchback_car',
    passengers: 1,
    luggage: 'none',
    distanceKm: 520,
    distanceSource: 'server_coordinate'
  });

  assert.equal(estimate.tollSource, 'distance_band_fallback');
  assert.equal(estimate.tollPlazaCount, 0);
  assert.ok(estimate.tollCharge > 0);
});
