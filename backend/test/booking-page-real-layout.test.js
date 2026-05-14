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
