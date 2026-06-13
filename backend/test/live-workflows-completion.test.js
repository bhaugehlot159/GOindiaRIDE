const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readFilesUnder(relativeDir, extension = '.js') {
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

function readCustomerPortalBookingSource() {
  return [
    read('customer/js/booking-system.js'),
    ...readFilesUnder('customer/chunks/portal/scripts/booking-system', '.js')
  ].join('\n');
}

test('customer booking flow is backend-first and persists real admin review fallback data', () => {
  const html = read('customer/index.html');
  const booking = readCustomerPortalBookingSource();
  const portal = read('customer/js/customer-portal.js');

  assert.match(html, /id="ridePaymentMethod"/);
  assert.match(booking, /function buildFareBreakdown\(/);
  assert.match(booking, /tollCharge/);
  assert.match(booking, /parkingCharge/);
  assert.match(booking, /nightCharge/);
  assert.match(booking, /gst/);
  assert.match(booking, /createFallbackAdminReviewBooking/);
  assert.match(booking, /\/api\/bookings\/fallback\/admin-review-queue/);
  assert.match(booking, /goindiaride_live_payment_records_v1/);
  assert.doesNotMatch(booking, /Secure session missing\. Please login again/);
  assert.match(portal, /type: 'customer_sos'/);
  assert.match(portal, /PortalConnector\.broadcastToAll/);
});

test('public no-login booking shortcut keeps admin queue, email, edit, and search signals connected', () => {
  const home = read('index.html');
  const publicBooking = read('book-cab.html');
  const customerBookingPage = read('pages/booking.html');
  const shortcut = read('js/quick-booking.js');
  const bookingMapCore = read('customer/chunks/booking/scripts/page/map/core-route.js');
  const bookingReverseGeocode = read('customer/chunks/booking/scripts/page/map/reverse-geocode.js');
  const bookingGps = read('customer/chunks/booking/scripts/page/map/gps-current-location.js');
  const adminApp = read('admin/js/admin-app.js');
  const sitemap = read('sitemap.xml');
  const robots = read('robots.txt');
  const homeNavbar = home.match(/<div class="navbar-links">[\s\S]*?<\/div>\s*<\/div>\s*<\/nav>/)?.[0] || '';
  const homeFooter = home.match(/<footer class="footer">[\s\S]*?<\/footer>/)?.[0] || '';

  assert.match(home, /<title>GO India RIDE - Premium Taxi Service<\/title>/);
  assert.match(home, /home-international\.css\?v=20260610-handoff-nav1/);
  assert.match(home, /Airport, city and intercity cab booking/);
  assert.match(home, /js\/locations\.js\?v=20260610-home-suggest1/);
  assert.match(home, /shared\/chunks\/home\/scripts\/index\.js\?v=20260610-handoff-nav1/);
  assert.doesNotMatch(home, /20260610-location-ui1/);
  assert.doesNotMatch(homeNavbar, /book-cab\.html|taxi-service\.html|nav\.bookCab|nav\.taxiService/);
  assert.match(homeNavbar, /href="\.\/pages\/login\.html"[^>]*rel="nofollow"/);
  assert.match(homeNavbar, /href="\.\/pages\/signup\.html"[^>]*rel="nofollow"/);
  assert.match(homeNavbar, /href="\.\/pages\/login\.html\?admin=1&next=%2Fadmin%2Fapp\.html"[^>]*rel="nofollow"/);
  assert.match(home, /id="homeQuickBookingForm"[\s\S]*name="pickup"[^>]*required[\s\S]*name="drop"[^>]*required[\s\S]*name="phone"[^>]*required/);
  assert.match(home, /id="homePickupInput"[^>]*autocomplete="off"[^>]*aria-controls="homeLocationSuggestPanel"/);
  assert.match(home, /id="homeDropInput"[^>]*autocomplete="off"[^>]*aria-controls="homeLocationSuggestPanel"/);
  assert.doesNotMatch(home, /list="homeLocationList"|<datalist id="homeLocationList"/);
  assert.match(home, /id="homeUseLocationBtn"[\s\S]*Use current location/);
  assert.match(home, /id="homeLocationSuggestPanel"/);
  assert.match(home, /data-home-suggestion="pickup"/);
  assert.match(home, /data-home-trip-plan="airport"[\s\S]*data-home-service-mode="airport_pickup"/);
  assert.match(home, /data-home-trip-plan="rental"[\s\S]*data-home-journey="round_trip"/);
  assert.match(home, /data-home-booking-link/);
  assert.match(home, /source=home_route&amp;tripPlan=outstation/);
  assert.match(home, /vehicleType=sedan&amp;vehicleModel=business_sedan/);
  assert.doesNotMatch(home, /onclick="goToBooking\(\)"/);
  assert.doesNotMatch(homeFooter, /href="#(?:about|careers|press|blog|faq|support|safety|driver-signup|driver-faq|driver-support|documents)"/);
  assert.match(home, /href="\.\/pages\/legal\/gdpr-notice\.html"[^>]*rel="nofollow"/);
  assert.match(read('pages/login.html'), /<meta name="googlebot" content="noindex, follow">/);
  assert.match(customerBookingPage, /<meta name="googlebot" content="noindex, follow">/);
  assert.match(customerBookingPage, /<link rel="canonical" href="https:\/\/goindiaride\.in\/book-cab\.html">/);
  assert.match(customerBookingPage, /core-route\.js\?v=20260611-exact-location1/);
  assert.match(customerBookingPage, /reverse-geocode\.js\?v=20260611-exact-location1/);
  assert.match(customerBookingPage, /gps-current-location\.js\?v=20260611-exact-location1/);
  assert.match(read('pages/legal/gdpr-notice.html'), /<meta name="googlebot" content="noindex, follow">/);
  assert.match(publicBooking, /id="quickBookingForm"/);
  assert.match(publicBooking, /Direct cab booking, no login/);
  assert.match(publicBooking, /css\/quick-booking\.css\?v=20260611-location-autofill1/);
  assert.match(publicBooking, /id="pickupInput"[^>]*aria-controls="pickupLocationSuggestPanel"/);
  assert.match(publicBooking, /id="dropInput"[^>]*aria-controls="dropLocationSuggestPanel"/);
  assert.match(publicBooking, /id="pickupLocationSuggestPanel"[^>]*role="listbox"/);
  assert.match(publicBooking, /id="dropLocationSuggestPanel"[^>]*role="listbox"/);
  assert.match(publicBooking, /id="phoneInput"[^>]*name="customerPhone"[^>]*required[^>]*aria-required="true"/);
  assert.match(publicBooking, /id="serviceModeInput"/);
  assert.match(publicBooking, /id="vehicleModelInput"/);
  assert.match(publicBooking, /id="passengerInput"/);
  assert.match(publicBooking, /id="luggageInput"/);
  assert.match(publicBooking, /id="paymentInput"/);
  assert.match(publicBooking, /id="budgetInput"/);
  assert.match(publicBooking, /id="promoInput"/);
  assert.match(publicBooking, /id="terminalInput"/);
  assert.match(publicBooking, /id="flightInput"/);
  assert.match(publicBooking, /id="gstCompanyInput"/);
  assert.match(publicBooking, /id="gstNumberInput"/);
  assert.match(publicBooking, /id="manageBookingInput"/);
  assert.match(publicBooking, /id="editReasonInput"/);
  assert.match(publicBooking, /js\/locations\.js\?v=20260611-location-autofill1/);
  assert.match(publicBooking, /js\/route-suggestions\.js\?v=20260611-real-toll1/);
  assert.match(publicBooking, /js\/quick-booking\.js\?v=20260611-exact-location1/);
  assert.match(publicBooking, /id="tollAmount"/);
  assert.match(publicBooking, /id="tollNote"/);

  assert.match(shortcut, /\/api\/bookings\/fallback\/admin-review-queue/);
  assert.match(shortcut, /\/api\/bookings\/fallback\/admin-alert-email/);
  assert.match(shortcut, /syncBookingInBackground\(booking, isEdit\)/);
  assert.match(shortcut, /makeIdempotencyKey\(body, path\)/);
  assert.match(shortcut, /sourceKey:\s*existing\.bookingId \? 'shortcut_customer_edit' : 'shortcut_public_booking'/);
  assert.match(shortcut, /mode:\s*existing\.bookingId \? 'public_no_login_customer_edit' : 'public_no_login_shortcut'/);
  assert.match(shortcut, /bookingChannel:\s*'google_direct_shortcut'/);
  assert.match(shortcut, /changedFields/);
  assert.match(shortcut, /customerFeatures/);
  assert.match(shortcut, /adminEmailDispatch/);
  assert.match(shortcut, /Valid mobile number is required/);
  assert.match(shortcut, /function buildLocationOptions\(/);
  assert.match(shortcut, /window\.locationsData/);
  assert.match(shortcut, /function getLocationSuggestions\(query\)/);
  assert.match(shortcut, /function wireLocationAutocomplete\(/);
  assert.match(shortcut, /CURRENT_LOCATION_TARGET_ACCURACY_METERS = 35/);
  assert.match(shortcut, /function getBestCurrentLocation\(onBetterPoint\)/);
  assert.match(shortcut, /function resolveCurrentLocationAddress\(point\)/);
  assert.match(shortcut, /Exact current location nahi mila/);
  assert.match(shortcut, /Location \+ Precise location ON/);
  assert.match(shortcut, /function applyHomepagePrefillFromUrl\(/);
  assert.match(shortcut, /new URLSearchParams\(window\.location\.search \|\| ''\)/);
  assert.match(shortcut, /setTripPlan\(tripPlan, true\)/);
  assert.match(shortcut, /setFieldValue\(fields\.pickup, getPrefill\('pickup'\), 180\)/);
  assert.match(shortcut, /setFieldValue\(fields\.phone, getPrefill\('phone'\) \|\| getPrefill\('customerPhone'\), 40\)/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /HOME_BASE_LOCATION_SUGGESTIONS/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /buildHomeLocationSuggestions/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /getHomeLocationSuggestions\(query\)/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /return suggestions;/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /function renderHomeSuggestions\(/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /dataset\.bookingValue/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /getBookingLocationValue\(pickupInput\)/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /navigator\.geolocation/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /const gpsLabel = `Current location \(\$\{lat\}, \$\{lng\}\)`/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /fillHomeLocation\(pickupInput, gpsLabel\)/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /fillHomeLocation\(pickupInput, addressLabel, `\$\{addressLabel\} \(\$\{lat\}, \$\{lng\}\)`\)/);
  assert.match(read('shared/chunks/home/scripts/index.js'), /GPS selected:/);
  assert.doesNotMatch(read('shared/chunks/home/scripts/index.js'), /slice\(0, 6\)/);
  assert.match(bookingMapCore, /const BOOKING_GPS_TARGET_ACCURACY_METERS = 35/);
  assert.match(bookingMapCore, /accuracy <= BOOKING_GPS_TARGET_ACCURACY_METERS/);
  assert.match(bookingMapCore, /GPS <= \$\{BOOKING_GPS_TARGET_ACCURACY_METERS\}m chahiye/);
  assert.match(bookingReverseGeocode, /const landmark = address\.amenity/);
  assert.match(bookingReverseGeocode, /'tower', 'building', 'office'/);
  assert.match(bookingGps, /function getBookingCurrentPositionWatchBest\(/);
  assert.match(bookingGps, /function getBestBookingCurrentLocation\(onBetterPoint = null\)/);
  assert.match(bookingGps, /runProbe\(getBookingCurrentPositionInstant/);
  assert.match(bookingGps, /runProbe\(getBookingCurrentPositionWatchBest/);
  assert.match(bookingGps, /if \(!isBookingPreciseCurrentLocationPoint\(bestPoint\)\) return;/);
  assert.match(bookingGps, /await applyBookingMapCoordinates\(safeTarget, warmedPoint/);
  assert.match(bookingGps, /function focusManualLocationInputAfterWeakGps\(target\)/);
  assert.match(bookingGps, /showQuickLocationSuggestions\(input, \{ inputType: 'insertText' \}\)/);

  assert.match(adminApp, /fallback\/admin-review-queue\?limit=500&status=/);
  assert.match(adminApp, /mapBackendBookingRow\(row, "backend_fallback_admin_review_queue"\)/);
  assert.match(adminApp, /syncAdminBookingUpdateToFallbackQueue/);

  assert.match(sitemap, /https:\/\/goindiaride\.in\/book-cab\.html/);
  assert.match(sitemap, /https:\/\/goindiaride\.in\/taxi-service\.html/);
  assert.match(sitemap, /<lastmod>2026-06-08<\/lastmod>/);
  assert.match(sitemap, /https:\/\/goindiaride\.in\/pages\/legal\/terms-and-conditions\.html/);
  assert.match(sitemap, /https:\/\/goindiaride\.in\/pages\/legal\/privacy-policy\.html/);
  assert.doesNotMatch(sitemap, /pages\/login\.html|pages\/signup\.html|admin\//);
  assert.match(robots, /Sitemap:\s*https:\/\/goindiaride\.in\/sitemap\.xml/);
});

test('auth entry pages keep noindex, live form ids, and professional layout hooks', () => {
  const login = read('pages/login.html');
  const signup = read('pages/signup.html');
  const authCss = read('css/auth-professional.css');
  const firebaseAuth = read('shared/chunks/auth/login/scripts/admin-security-firebase.js');
  const recoveryUi = read('shared/chunks/auth/login/scripts/recovery-ui-init.js');
  const customerPhoneInput = login.match(/<input[^>]+id="customerPhone"[^>]+>/)?.[0] || '';
  const driverPhoneInput = login.match(/<input[^>]+id="driverPhone"[^>]+>/)?.[0] || '';
  const signupPhoneInput = signup.match(/<input[^>]+id="phone"[^>]+>/)?.[0] || '';

  assert.match(login, /<meta name="googlebot" content="noindex, follow">/);
  assert.match(signup, /<meta name="googlebot" content="noindex, follow">/);
  assert.match(login, /css\/auth-professional\.css\?v=20260608-auth11/);
  assert.match(signup, /css\/auth-professional\.css\?v=20260608-auth11/);
  assert.match(login, /<body class="auth-entry-page auth-login-page">/);
  assert.match(signup, /<body class="auth-entry-page auth-signup-page">/);

  assert.match(login, /id="customerForm"/);
  assert.match(login, /id="driverForm"/);
  assert.match(login, /id="adminForm"/);
  assert.match(login, /auth-routes\.js\?v=20260612-auth-routes1/);
  assert.doesNotMatch(login, /\son(?:click|change)=/);
  assert.match(login, /data-auth-action="customer-send-otp"/);
  assert.match(login, /data-auth-action="driver-send-otp"/);
  assert.match(login, /data-auth-action="admin-step1-login"/);
  assert.match(login, /guardPhoneAutofillLeak/);
  assert.match(login, /class="auth-ride-preview"/);

  assert.match(customerPhoneInput, /name="goindiaride_customer_mobile_otp"/);
  assert.match(customerPhoneInput, /autocomplete="off"/);
  assert.match(customerPhoneInput, /inputmode="tel"/);
  assert.match(driverPhoneInput, /name="goindiaride_driver_mobile_otp"/);
  assert.match(driverPhoneInput, /autocomplete="off"/);
  assert.match(driverPhoneInput, /inputmode="tel"/);

  assert.match(signup, /id="signupForm"/);
  assert.match(signup, /class="auth-ride-preview"/);
  assert.match(signup, /id="fullname"[\s\S]*autocomplete="name"/);
  assert.match(signup, /id="email"[\s\S]*autocomplete="email"/);
  assert.match(signupPhoneInput, /name="phone"/);
  assert.match(signupPhoneInput, /autocomplete="tel"/);
  assert.match(signupPhoneInput, /inputmode="tel"/);
  assert.match(signup, /id="password"[\s\S]*autocomplete="new-password"/);
  assert.match(signup, /id="confirmPassword"[\s\S]*autocomplete="new-password"/);

  assert.match(authCss, /Loaded only by login\/signup pages/);
  assert.match(authCss, /body\.auth-entry-page::before/);
  assert.match(authCss, /content:\s*none !important/);
  assert.match(authCss, /v2: ride-app entry surface, not a dashboard shell/);
  assert.match(authCss, /v3: app-style auth like ride platforms, not a split dashboard/);
  assert.match(authCss, /v4: compact international ride auth surface/);
  assert.match(authCss, /v5: international ride marketplace auth combination/);
  assert.match(authCss, /v6: international cab photo and clean booking-auth blend/);
  assert.match(authCss, /v7: full-bleed travel auth with floating booking panel/);
  assert.match(authCss, /v8: corporate dark hero with simple ride auth card/);
  assert.match(authCss, /v9: final Ola-Uber inspired corporate auth combination/);
  assert.match(authCss, /v11: final Ola Corporate \+ Uber inspired auth composition/);
  assert.match(authCss, /Its Easy, Safe and Efficient/);
  assert.match(authCss, /background:\s*#eeeeef !important/);
  assert.match(authCss, /grid-template-columns:\s*1fr !important/);
  assert.match(authCss, /overflow:\s*visible !important/);
  assert.match(authCss, /auth-ride-preview/);
  assert.match(authCss, /quick-booking-hero\.png/);
  assert.match(authCss, /position:\s*fixed !important/);
  assert.match(authCss, /grid-template-columns:\s*minmax\(320px,\s*0\.88fr\)\s*minmax\(470px,\s*1\.12fr\)/);
  assert.match(authCss, /height:\s*auto !important/);
  assert.match(firebaseAuth, /reportSetupError/);
  assert.match(recoveryUi, /initFirebasePhoneAuth\(\{silent:true\}\)/);
});

test('driver portal exposes real KYC, deposit, booking acceptance, penalty, and payout workflow', () => {
  const html = read('driver/index.html');
  const workflow = read('driver/js/driver-live-workflow.js');

  assert.match(html, /driver-live-workflow\.js\?v=20260516-real-live1/);
  assert.match(workflow, /const OFFER_MS = 5 \* 60 \* 1000/);
  assert.match(workflow, /KYC approval pending/);
  assert.match(workflow, /Security deposit must be at least/);
  assert.match(workflow, /status: "driver_assigned"/);
  assert.match(workflow, /pending_reassignment/);
  assert.match(workflow, /Auto-rejected after 5-minute timeout/);
  assert.match(workflow, /goindiaride_driver_payouts_v1/);
  assert.match(workflow, /goindiaride_driver_penalties_v1/);
});

test('admin app has unified live control center and fresh service worker coverage', () => {
  const admin = read('admin/app.html');
  const legacyAdmin = read('admin/index.html');
  const center = read('admin/js/admin-live-control-center.js');
  const sw = read('sw.js');

  assert.match(admin, /admin-app\.js\?v=20260610-sms-reference1/);
  assert.match(admin, /admin-live-control-center\.js\?v=20260613-fraud-phase1/);
  assert.match(legacyAdmin, /admin-live-control-center\.js\?v=20260613-fraud-phase1/);
  assert.match(center, /Unified Admin Control Center/);
  assert.match(center, /approveBooking/);
  assert.match(center, /cancelBooking/);
  assert.match(center, /refundBooking/);
  assert.match(center, /approvePayout/);
  assert.match(center, /goindiaride_admin_portal_connection_v1/);
  assert.match(center, /mode: "real_live"/);
  assert.match(center, /fraudFlags/);
  assert.match(center, /demandSummary/);
  assert.match(center, /function getBookingContact/);
  assert.match(center, /customerSnapshot\.phone/);
  assert.match(center, /function isIncompleteLocalOnlyBooking/);
  assert.match(center, /function isInternalDiagnosticBooking/);
  assert.match(center, /if \(isPlaceholderText\(pickup\)\) return/);
  assert.match(center, /approveKyc/);
  assert.match(admin, /admin-feature-control-center\.js\?v=20260528-admin-hangfix1/);
  assert.match(read('admin/js/admin-app.js'), /goindiaride_admin_debug_payloads/);
  assert.match(read('admin/js/admin-app.js'), /showRawPayload \? `<details class="booking-payload-details">/);
  assert.match(sw, /goindiaride-pwa-v64-20260613-driver-gps/);
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /path\.startsWith\('\/driver\/'\)/);
});

test('admin app homepage entry opens admin login instead of customer login', () => {
  const home = read('index.html');
  const admin2fa = read('shared/chunks/auth/login/scripts/admin-2fa.js');
  const adminSecurity = read('shared/chunks/auth/login/scripts/admin-security-firebase.js');
  const recovery = read('shared/chunks/auth/login/scripts/recovery-ui-init.js');

  assert.match(home, /pages\/login\.html\?admin=1&next=%2Fadmin%2Fapp\.html/);
  assert.match(admin2fa, /function shouldOpenAdminLoginFromQuery\(\)/);
  assert.match(admin2fa, /next\.startsWith\('\/admin\/'\)/);
  assert.match(admin2fa, /if\(adminText\)adminText\.style\.display='inline'/);
  assert.match(adminSecurity, /if\(demoCustomer\)demoCustomer\.style\.display/);
  assert.match(recovery, /shouldOpenAdminLoginFromQuery\(\)/);
  assert.match(recovery, /else\{\s*updateLoginMethod\(\);\s*\}/);
});
