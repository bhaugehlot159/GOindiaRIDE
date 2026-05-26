const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('booking page starts in live route state instead of demo fare or driver data', () => {
  const html = readRepoFile('pages/booking.html');

  assert.match(html, /id="routePreviewLink"/);
  assert.match(html, /google\.com\/maps\/dir/);
  assert.match(html, /function createAwaitingFareEstimate\(/);
  assert.match(html, /if \(!routeIsReady\(inputs\)\)/);
  assert.match(html, /function customerRowLooksDriver\(/);
  assert.match(html, /function customerRowLooksCustomer\(/);
  assert.match(html, /function customerPhoneLooksUsable\(/);
  assert.match(html, /function customerEmailLooksUsable\(/);
  assert.match(html, /customerRowLooksDriver\(parsedUser\)/);
  assert.match(html, /identityName\.includes\('driver'\) && !hasCustomerContact/);
  assert.match(html, /filter\(\(item\) => customerRowLooksCustomer\(item\) && !customerRowLooksDriver\(item\)\)/);
  assert.match(html, /Booking Sent for Approval/);
  assert.match(html, /overflow-x: hidden !important/);
  assert.match(html, /max-width: min\(1440px, 100%\) !important/);
  assert.doesNotMatch(html, /id="totalFare">₹120/);
  assert.doesNotMatch(html, /id="driverName">Driver Name/);
  assert.doesNotMatch(html, /RJ 01 AB 1234/);
});

test('booking current-location flow keeps exact GPS coordinates for maps and admin review', () => {
  const html = readRepoFile('pages/booking.html');

  assert.match(html, /BOOKING_EXACT_LOCATION_STORAGE_KEY/);
  assert.match(html, /enableHighAccuracy:\s*true/);
  assert.match(html, /maximumAge:\s*0/);
  assert.match(html, /watchPosition/);
  assert.match(html, /coords\.accuracy/);
  assert.match(html, /buildBookingLocationSnapshot/);
  assert.match(html, /getBookingMapQueryValue\('pickup'\)/);
  assert.match(html, /pickupCoordinates:\s*locationPins\.pickup\.coordinates/);
  assert.match(html, /dropoffCoordinates:\s*locationPins\.dropoff\.coordinates/);
  assert.match(html, /routeStopLocations:\s*locationPins\.stops/);
  assert.match(html, /https:\/\/www\.google\.com\/maps\?q=\$\{Number\(lat\.toFixed\(7\)\)\},\$\{Number\(lng\.toFixed\(7\)\)\}/);
  assert.doesNotMatch(html, /return 'Current location';/);
  assert.doesNotMatch(html, /maximumAge:\s*30000/);
});

test('booking secure fare estimate sends idempotency key before final booking create', () => {
  const html = readRepoFile('pages/booking.html');
  const estimateCall = html.match(/const fareEstimateResult = await fetchJsonAcrossApiBases\([\s\S]+?\/api\/bookings\/fare\/estimate[\s\S]+?\);/);

  assert.ok(estimateCall, 'fare estimate call should exist');
  assert.match(estimateCall[0], /includeIdempotency:\s*true/);
  assert.match(estimateCall[0], /idPrefix:\s*'gir-booking-fare-estimate'/);
});
