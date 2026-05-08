const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const walletCoreSource = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'wallet-core.js'), 'utf8');

test('UPI app top-up modal hides reference and screenshot fields', () => {
  assert.match(walletCoreSource, /const showReferenceFields = !isAppRedirect;/);
  assert.match(walletCoreSource, /data-reference-fields style="display:\$\{showReferenceFields \? 'block' : 'none'\};"/);
  assert.match(walletCoreSource, /const providerReference = isAppRedirect \? implicitReference : String\(input\?\.value \|\| ''\)\.trim\(\);/);
  assert.match(walletCoreSource, /const confirmButtonLabel = isAppRedirect \? 'Done' : 'Confirm Payment';/);
});

test('UPI app top-up modal offers live UPI ID collect checkout', () => {
  assert.match(walletCoreSource, /data-customer-upi-id/);
  assert.match(walletCoreSource, /Pay by UPI ID/);
  assert.match(walletCoreSource, /createUpiIdCollectCheckout/);
  assert.match(walletCoreSource, /verifyRazorpayTopupPayment\(payment\)/);
});
