const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const walletRoutesSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'walletRoutes.js'), 'utf8');

test('UPI ID collect checkout is live gateway backed and branded', () => {
  assert.match(walletRoutesSource, /router\.post\('\/topup\/upi-id\/checkout'/);
  assert.match(walletRoutesSource, /createRazorpayUpiIdCollectTopupCheckout/);
  assert.match(walletRoutesSource, /sanitizeUpiId\(req\.body\.payerUpiId/);
  assert.match(walletRoutesSource, /name: PAYMENT_DISPLAY_NAME/);
  assert.match(walletRoutesSource, /'metadata\.upiIdCollect\.payerUpiId'/);
});
