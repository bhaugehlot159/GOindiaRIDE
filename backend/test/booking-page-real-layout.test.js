const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readRepoFilesUnder(relativeDir, extension = '.js') {
  const baseDir = path.join(root, relativeDir);
  if (!fs.existsSync(baseDir)) return [];
  const rows = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        rows.push(fs.readFileSync(fullPath, 'utf8'));
      }
    }
  }
  walk(baseDir);
  return rows;
}

function readBookingPageSource() {
  return [
    readRepoFile('pages/booking.html'),
    ...readRepoFilesUnder('customer/chunks/booking/scripts', '.js'),
    ...readRepoFilesUnder('customer/chunks/booking/styles', '.css')
  ].join('\n');
}

test('booking page starts in live route state instead of demo fare or driver data', () => {
  const html = readBookingPageSource();

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

test('booking production entry hides readiness meter and exposes verified support and PWA links', () => {
  const bookingHtml = readRepoFile('pages/booking.html');
  const bookingSource = readBookingPageSource();

  assert.doesNotMatch(bookingHtml, /Booking Readiness/);
  assert.doesNotMatch(bookingSource, /RID12345/);
  assert.match(bookingHtml, /data-goi-pwa-manifest="customer"/);
  assert.match(bookingHtml, /href="\.\.\/manifest\.webmanifest" data-goi-pwa-manifest="public"/);
  assert.match(bookingHtml, /href="\.\.\/service-worker\.js" data-goi-pwa-service-worker="public-alias"/);
  assert.match(bookingHtml, /Customer helpline \+91 84268 91471/);
  assert.match(bookingHtml, /booking-customer-helpline/);
  assert.match(bookingSource, /body\.booking-page\.professional-booking:not\(\.booking-advanced-ready\) \.cab-page-content[\s\S]*display: none !important/);
});

test('booking current-location flow keeps exact GPS coordinates for maps and admin review', () => {
  const html = readBookingPageSource();

  assert.match(html, /BOOKING_EXACT_LOCATION_STORAGE_KEY/);
  assert.match(html, /enableHighAccuracy:\s*true/);
  assert.match(html, /maximumAge:\s*0/);
  assert.match(html, /watchPosition/);
  assert.match(html, /BOOKING_GPS_FIRST_FIX_TIMEOUT_MS\s*=\s*8000/);
  assert.match(html, /timeout:\s*timeoutMs/);
  assert.match(html, /startBookingCurrentLocationRefinement/);
  assert.match(html, /coords\.accuracy/);
  assert.match(html, /buildBookingLocationSnapshot/);
  assert.match(html, /getBookingMapQueryValue\('pickup'\)/);
  assert.match(html, /pickupCoordinates:\s*locationPins\.pickup\.coordinates/);
  assert.match(html, /dropoffCoordinates:\s*locationPins\.dropoff\.coordinates/);
  assert.match(html, /routeStopLocations:\s*locationPins\.stops/);
  assert.match(html, /const safeLat = Number\(lat\.toFixed\(7\)\);/);
  assert.match(html, /const safeLng = Number\(lng\.toFixed\(7\)\);/);
  assert.match(html, /https:\/\/www\.openstreetmap\.org\/\?mlat=\$\{safeLat\}&mlon=\$\{safeLng\}#map=17\/\$\{safeLat\}\/\$\{safeLng\}/);
  assert.doesNotMatch(html, /return 'Current location';/);
  assert.doesNotMatch(html, /maximumAge:\s*30000/);
  assert.doesNotMatch(html, /showBookingLocationNotice\(`\$\{targetLabel\} GPS signal weak hai/);
  assert.doesNotMatch(html, /showWeakToast/);
});

test('booking secure fare estimate sends idempotency key before final booking create', () => {
  const html = readBookingPageSource();
  const estimateCall = html.match(/const fareEstimateResult = await fetchJsonAcrossApiBases\([\s\S]+?\/api\/bookings\/fare\/estimate[\s\S]+?\);/);

  assert.ok(estimateCall, 'fare estimate call should exist');
  assert.match(estimateCall[0], /includeIdempotency:\s*true/);
  assert.match(estimateCall[0], /idPrefix:\s*'gir-booking-fare-estimate'/);
});

test('booking final submit refreshes expired tokens and falls back to admin review queue', () => {
  const html = readBookingPageSource();

  assert.match(html, /CUSTOMER_BOOKING_LOCAL_STORE_KEYS/);
  assert.match(html, /'goindiaride_active_bookings'/);
  assert.match(html, /'customerBookings'/);
  assert.match(html, /'customer_bookings'/);
  assert.match(html, /'goindiaride_live_customer_booking_queue_v1'/);
  assert.match(html, /adminBookingScope:\s*bookingRecord\.adminBookingScope \|\| 'customer'/);
  assert.match(html, /sourceKey:\s*bookingRecord\.sourceKey \|\| 'customer_booking_submit'/);
  assert.match(html, /customerSnapshot:\s*\{/);
  assert.match(html, /function getBackendRefreshToken\(/);
  assert.match(html, /function refreshBookingBackendAccessToken\(/);
  assert.match(html, /function resolveFreshBookingAccessToken\(/);
  assert.match(html, /function isBookingAuthFailureReason\(/);
  assert.match(html, /async function submitBookingThroughAdminReviewFallback\(/);
  assert.match(html, /booking_create_auth_retry/);
  assert.match(html, /auth_expired_admin_queue/);
  assert.match(html, /token_missing_local_queue/);
  assert.match(html, /clearBackendAccessTokens\(\)/);
  assert.match(html, /Live booking auth expired; sent to admin review fallback/);
  assert.doesNotMatch(html, /Secure login session missing\. Please login again to place a live booking\./);
});
