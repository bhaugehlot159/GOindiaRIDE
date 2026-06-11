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

test('fare calculator does not invent toll when a route has no mapped toll corridor', () => {
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

  assert.equal(estimate.tollSource, 'mapped_route_required_admin_review');
  assert.equal(estimate.tollPlazaCount, 0);
  assert.equal(estimate.tollCharge, 0);
  assert.equal(estimate.tollRequiresAdminReview, true);
});

test('fare calculator marks short local city rides as no mapped toll', () => {
  const estimate = estimateBookingFare({
    pickup: 'Jaipur Railway Station',
    drop: 'Jaipur Hotel',
    tripPlan: 'city',
    tripServiceType: 'local_point',
    vehicleType: 'economy',
    vehicleModel: 'hatchback_car',
    passengers: 1,
    luggage: 'none',
    distanceKm: 12,
    distanceSource: 'shortcut_estimate'
  });

  assert.equal(estimate.tollSource, 'local_no_mapped_toll');
  assert.equal(estimate.tollCharge, 0);
  assert.equal(estimate.tollRequiresAdminReview, false);
});

test('fare calculator trusts exact booking coordinates from current location', () => {
  const estimate = estimateBookingFare({
    pickup: 'Customer exact pickup',
    drop: 'Airport exact drop',
    pickupCoordinates: { lat: 24.5854, lng: 73.7125, accuracy: 18, source: 'browser_gps_high_accuracy' },
    dropoffCoordinates: { lat: 24.6177, lng: 73.8961, accuracy: 25, source: 'google_geocode' },
    tripPlan: 'airport',
    tripServiceType: 'airport_transfer',
    vehicleType: 'economy',
    vehicleModel: 'hatchback_car',
    passengers: 1,
    luggage: 'none',
    enforceTrustedDistance: true
  });

  assert.equal(estimate.distanceTrusted, true);
  assert.equal(estimate.distanceSource, 'booking_coordinate');
  assert.ok(estimate.distanceKm > 0);
});
