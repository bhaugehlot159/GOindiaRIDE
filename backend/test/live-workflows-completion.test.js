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
  const shortcut = read('js/quick-booking.js');
  const adminApp = read('admin/js/admin-app.js');
  const sitemap = read('sitemap.xml');
  const robots = read('robots.txt');
  const homeNavbar = home.match(/<div class="navbar-links">[\s\S]*?<\/div>\s*<\/div>\s*<\/nav>/)?.[0] || '';

  assert.match(home, /<title>GO India RIDE - Premium Taxi Service<\/title>/);
  assert.doesNotMatch(homeNavbar, /book-cab\.html|taxi-service\.html|nav\.bookCab|nav\.taxiService/);
  assert.match(homeNavbar, /href="\.\/pages\/login\.html"[^>]*rel="nofollow"/);
  assert.match(homeNavbar, /href="\.\/pages\/signup\.html"[^>]*rel="nofollow"/);
  assert.match(homeNavbar, /href="\.\/pages\/login\.html\?admin=1&next=%2Fadmin%2Fapp\.html"[^>]*rel="nofollow"/);
  assert.match(home, /href="\.\/pages\/legal\/gdpr-notice\.html"[^>]*rel="nofollow"/);
  assert.match(read('pages/login.html'), /<meta name="googlebot" content="noindex, follow">/);
  assert.match(read('pages/booking.html'), /<meta name="googlebot" content="noindex, follow">/);
  assert.match(read('pages/booking.html'), /<link rel="canonical" href="https:\/\/goindiaride\.in\/book-cab\.html">/);
  assert.match(read('pages/legal/gdpr-notice.html'), /<meta name="googlebot" content="noindex, follow">/);
  assert.match(publicBooking, /id="quickBookingForm"/);
  assert.match(publicBooking, /Direct cab booking, no login/);
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

  assert.match(shortcut, /\/api\/bookings\/fallback\/admin-review-queue/);
  assert.match(shortcut, /\/api\/bookings\/fallback\/admin-alert-email/);
  assert.match(shortcut, /makeIdempotencyKey\(body, path\)/);
  assert.match(shortcut, /sourceKey:\s*existing\.bookingId \? 'shortcut_customer_edit' : 'shortcut_public_booking'/);
  assert.match(shortcut, /mode:\s*existing\.bookingId \? 'public_no_login_customer_edit' : 'public_no_login_shortcut'/);
  assert.match(shortcut, /bookingChannel:\s*'google_direct_shortcut'/);
  assert.match(shortcut, /changedFields/);
  assert.match(shortcut, /customerFeatures/);
  assert.match(shortcut, /adminEmailDispatch/);
  assert.match(shortcut, /Valid mobile number is required/);

  assert.match(adminApp, /fallback\/admin-review-queue\?limit=500&status=/);
  assert.match(adminApp, /mapBackendBookingRow\(row, "backend_fallback_admin_review_queue"\)/);
  assert.match(adminApp, /syncAdminBookingUpdateToFallbackQueue/);

  assert.match(sitemap, /https:\/\/goindiaride\.in\/book-cab\.html/);
  assert.match(sitemap, /https:\/\/goindiaride\.in\/taxi-service\.html/);
  assert.match(sitemap, /<lastmod>2026-06-08<\/lastmod>/);
  assert.doesNotMatch(sitemap, /pages\/login\.html|pages\/signup\.html|admin\/|terms-and-conditions\.html|privacy-policy\.html/);
  assert.match(robots, /Sitemap:\s*https:\/\/goindiaride\.in\/sitemap\.xml/);
});

test('auth entry pages keep noindex, live form ids, and professional layout hooks', () => {
  const login = read('pages/login.html');
  const signup = read('pages/signup.html');
  const authCss = read('css/auth-professional.css');
  const customerPhoneInput = login.match(/<input[^>]+id="customerPhone"[^>]+>/)?.[0] || '';
  const driverPhoneInput = login.match(/<input[^>]+id="driverPhone"[^>]+>/)?.[0] || '';
  const signupPhoneInput = signup.match(/<input[^>]+id="phone"[^>]+>/)?.[0] || '';

  assert.match(login, /<meta name="googlebot" content="noindex, follow">/);
  assert.match(signup, /<meta name="googlebot" content="noindex, follow">/);
  assert.match(login, /css\/auth-professional\.css\?v=20260608-auth1/);
  assert.match(signup, /css\/auth-professional\.css\?v=20260608-auth1/);
  assert.match(login, /<body class="auth-entry-page auth-login-page">/);
  assert.match(signup, /<body class="auth-entry-page auth-signup-page">/);

  assert.match(login, /id="customerForm"/);
  assert.match(login, /id="driverForm"/);
  assert.match(login, /id="adminForm"/);
  assert.match(login, /customerSendOTP\(\)/);
  assert.match(login, /driverSendOTP\(\)/);
  assert.match(login, /adminStep1Login\(\)/);

  assert.match(customerPhoneInput, /name="customerPhone"/);
  assert.match(customerPhoneInput, /autocomplete="tel"/);
  assert.match(customerPhoneInput, /inputmode="tel"/);
  assert.match(driverPhoneInput, /name="driverPhone"/);
  assert.match(driverPhoneInput, /autocomplete="tel"/);
  assert.match(driverPhoneInput, /inputmode="tel"/);

  assert.match(signup, /id="signupForm"/);
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
  assert.match(authCss, /grid-template-columns:\s*minmax\(300px, 0\.86fr\) minmax\(480px, 1\.14fr\)/);
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

  assert.match(admin, /admin-app\.js\?v=20260528-admin-hangfix1/);
  assert.match(admin, /admin-live-control-center\.js\?v=20260528-admin-hangfix1/);
  assert.match(legacyAdmin, /admin-live-control-center\.js\?v=20260528-admin-hangfix1/);
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
  assert.match(sw, /goindiaride-pwa-v52-20260608-search-sitelink-cleanup/);
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
