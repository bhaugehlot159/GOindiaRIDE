const test = require('node:test');
const assert = require('node:assert/strict');

const {
  estimateBookingFare,
  getOfficialStateTaxCoverage
} = require('../../js/booking-fare-calculator');
const { getRouteSuggestions } = require('../../js/route-suggestions');

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

test('fare calculator handles homepage station outstation route with competitive day components', () => {
  const estimate = estimateBookingFare({
    pickup: 'Udaipur',
    drop: 'Jaisalmer Railway Station',
    tripPlan: 'outstation',
    tripServiceType: 'outstation_one_way',
    vehicleType: 'suv',
    passengers: 1,
    luggage: 'none',
    distanceKm: 489,
    distanceSource: 'home_known_route',
    paymentMethod: 'cash'
  });

  assert.equal(estimate.distanceKm, 489);
  assert.equal(estimate.tollSource, 'mapped_route_toll_table');
  assert.equal(estimate.tollCharge, 135);
  assert.equal(estimate.parkingCharge, 55);
  assert.equal(estimate.extraDistanceFare, 0);
  assert.equal(estimate.driverNightBatta, 0);
  assert.equal(estimate.stateTax, 0);
  assert.equal(estimate.competitiveBenchmarkFare, 7760);
  assert.equal(estimate.competitiveTargetFare, 7139);
  assert.equal(estimate.competitiveDiscountPercent, 8);
  assert.equal(estimate.competitiveDiscount, 3576);
  assert.equal(estimate.totalFare, 7139);
  assert.equal(estimate.billedSubtotal, 6439);
});

test('fare calculator adds night bhatta only when a night ride time is supplied', () => {
  const dayEstimate = estimateBookingFare({
    pickup: 'Udaipur',
    drop: 'Jaisalmer Railway Station',
    tripPlan: 'outstation',
    tripServiceType: 'outstation_one_way',
    vehicleType: 'suv',
    passengers: 1,
    luggage: 'none',
    distanceKm: 489,
    distanceSource: 'home_known_route',
    rideTime: '14:00',
    paymentMethod: 'cash'
  });
  const nightEstimate = estimateBookingFare({
    pickup: 'Udaipur',
    drop: 'Jaisalmer Railway Station',
    tripPlan: 'outstation',
    tripServiceType: 'outstation_one_way',
    vehicleType: 'suv',
    passengers: 1,
    luggage: 'none',
    distanceKm: 489,
    distanceSource: 'home_known_route',
    rideTime: '23:15',
    paymentMethod: 'cash'
  });

  assert.equal(dayEstimate.driverNightBatta, 0);
  assert.equal(nightEstimate.driverNightBatta, 250);
  assert.equal(nightEstimate.totalFare, dayEstimate.totalFare + 250);
  assert.ok(nightEstimate.totalFare > dayEstimate.totalFare);
});

test('fare calculator keeps Udaipur to Sirohi Bus Stand as a real outstation route', () => {
  const routeData = getRouteSuggestions('Udaipur', 'Sirohi Bus Stand');
  const estimate = estimateBookingFare({
    pickup: 'Udaipur',
    drop: 'Sirohi Bus Stand',
    tripPlan: 'outstation',
    tripServiceType: 'outstation_one_way',
    vehicleType: 'sedan',
    passengers: 1,
    luggage: 'none',
    paymentMethod: 'cash'
  });

  assert.equal(routeData.distance, '126 km');
  assert.equal(estimate.distanceSource, 'route_table');
  assert.equal(estimate.distanceKm, 126);
  assert.equal(estimate.tripPlan, 'outstation');
  assert.ok(estimate.totalFare > 2000);
  assert.equal(estimate.stateTax, 0);
  assert.notEqual(estimate.distanceKm, 12);
});

test('fare calculator covers every VAHAN AITP state and does not miss state codes', () => {
  const coverage = getOfficialStateTaxCoverage();
  const states = coverage.map((item) => item.state);
  assert.equal(coverage.length, 36);
  assert.ok(states.includes('Rajasthan'));
  assert.ok(states.includes('Haryana'));
  assert.ok(states.includes('Gujarat'));
  assert.ok(states.includes('Uttar Pradesh'));
  assert.ok(coverage.every((item) => item.stateCode && item.sourceUrl));
  assert.equal(coverage.find((item) => item.state === 'Rajasthan').hasAutoSlab, true);
  assert.equal(coverage.find((item) => item.state === 'Haryana').hasAutoSlab, true);
  assert.equal(coverage.find((item) => item.state === 'Gujarat').hasAutoSlab, true);
});

test('fare calculator adds different official state taxes for a multi-state route', () => {
  const estimate = estimateBookingFare({
    pickup: 'Delhi Airport',
    drop: 'Jaipur',
    tripPlan: 'outstation',
    tripServiceType: 'outstation_one_way',
    vehicleType: 'suv',
    passengers: 1,
    luggage: 'none',
    distanceKm: 280,
    distanceSource: 'home_known_route',
    paymentMethod: 'cash'
  });

  assert.deepEqual(estimate.stateTaxRouteStates, ['Delhi', 'Haryana', 'Rajasthan']);
  assert.equal(estimate.stateTax, 260);
  assert.deepEqual(
    estimate.stateTaxBreakdown.map((item) => [item.state, item.amount, item.perDay]),
    [
      ['Haryana', 100, 100],
      ['Rajasthan', 160, 160]
    ]
  );
  assert.equal(estimate.stateTaxRequiresAdminReview, false);
});

test('fare calculator applies Rajasthan other-state tourist tax only on Rajasthan entry', () => {
  const estimate = estimateBookingFare({
    pickup: 'Agra',
    drop: 'Jaipur',
    tripPlan: 'outstation',
    tripServiceType: 'outstation_one_way',
    vehicleType: 'sedan',
    passengers: 1,
    luggage: 'none',
    distanceKm: 240,
    distanceSource: 'home_known_route',
    paymentMethod: 'cash'
  });

  assert.deepEqual(estimate.stateTaxRouteStates, ['Uttar Pradesh', 'Rajasthan']);
  assert.equal(estimate.stateTax, 160);
  assert.deepEqual(
    estimate.stateTaxBreakdown.map((item) => [item.state, item.amount]),
    [['Rajasthan', 160]]
  );
  assert.equal(estimate.stateTaxRequiresAdminReview, false);
});

test('fare calculator adds Gujarat official other-state weekly taxi tax', () => {
  const estimate = estimateBookingFare({
    pickup: 'Udaipur',
    drop: 'Ahmedabad',
    tripPlan: 'outstation',
    tripServiceType: 'outstation_one_way',
    vehicleType: 'sedan',
    passengers: 1,
    luggage: 'none',
    distanceKm: 260,
    distanceSource: 'home_known_route',
    paymentMethod: 'cash'
  });

  assert.deepEqual(estimate.stateTaxRouteStates, ['Rajasthan', 'Gujarat']);
  assert.equal(estimate.stateTax, 48);
  assert.deepEqual(estimate.stateTaxMissingStates, []);
  assert.equal(estimate.stateTaxRequiresAdminReview, false);
  assert.deepEqual(
    estimate.stateTaxBreakdown.map((item) => [item.state, item.amount, item.perDay]),
    [['Gujarat', 48, 48]]
  );
  assert.match(estimate.stateTaxBreakdown[0].sourceUrl, /cot\.gujarat\.gov\.in\/tax-structure/);
});

test('fare calculator uses official Rajmarg Yatra route toll quote when supplied', () => {
  const estimate = estimateBookingFare({
    pickup: 'Udaipur',
    drop: 'Ahmedabad',
    tripPlan: 'outstation',
    tripServiceType: 'outstation_one_way',
    vehicleType: 'sedan',
    passengers: 1,
    luggage: 'none',
    distanceKm: 251,
    distanceSource: 'official_route_planner',
    paymentMethod: 'cash',
    routeData: {
      source: 'rajmarg_yatra_route_planner',
      sourceUrl: 'https://rajmargyatra.nhai.gov.in/#/route-planner',
      distance: '253.26 Km',
      duration: '5h 29m 27s',
      total_cost: 300,
      total_tolls: 3,
      tollDetails: [
        { tp_name: 'Paduna', tp_rate: 75, tp_latitude: '24.271438', tp_longitude: '73.67379', isEligible: true },
        { tp_name: 'Khandi Obari', tp_rate: 190, tp_latitude: '23.9941418', tp_longitude: '73.6271827', isEligible: true },
        { tp_name: 'Vantada', tp_rate: 35, tp_latitude: '23.61615', tp_longitude: '73.254472', isEligible: true }
      ]
    }
  });

  assert.equal(estimate.distanceSource, 'official_route_planner');
  assert.equal(estimate.distanceKm, 253);
  assert.equal(estimate.tollSource, 'official_rajmarg_yatra_route_planner');
  assert.equal(estimate.tollCharge, 300);
  assert.equal(estimate.tollRequiresAdminReview, false);
  assert.deepEqual(
    estimate.tollPlazas.map((item) => [item.name, item.amount]),
    [
      ['Paduna', 75],
      ['Khandi Obari', 190],
      ['Vantada', 35]
    ]
  );
  assert.equal(estimate.stateTax, 48);
});

test('fare calculator routes states without verified public slabs to official checkpost review instead of fake tax', () => {
  const estimate = estimateBookingFare({
    pickup: 'Udaipur',
    drop: 'Mumbai',
    tripPlan: 'outstation',
    tripServiceType: 'outstation_one_way',
    vehicleType: 'sedan',
    passengers: 1,
    luggage: 'none',
    distanceKm: 760,
    distanceSource: 'home_known_route',
    paymentMethod: 'cash'
  });

  assert.deepEqual(estimate.stateTaxRouteStates, ['Rajasthan', 'Gujarat', 'Maharashtra']);
  assert.equal(estimate.stateTax, 48);
  assert.deepEqual(estimate.stateTaxMissingStates, ['Maharashtra']);
  assert.equal(estimate.stateTaxRequiresAdminReview, true);
  assert.match(estimate.stateTaxBreakdown[1].quoteUrl, /vahan\.parivahan\.gov\.in\/aitp/);
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
