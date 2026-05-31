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
  assert.match(sw, /goindiaride-pwa-v47-20260531-optimization/);
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
