const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.FIREBASE_KEY = process.env.FIREBASE_KEY || 'test-firebase-key';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goindiaride_test';

const walletRoutes = require('../src/routes/walletRoutes');
const {
  DEFAULT_PAYMENT_MODES,
  resolveTopupCheckoutMode,
  shouldUseReferenceQrForTopup,
  shouldUseUpiAppRedirectForTopup,
  shouldUsePaymentLinkRedirectForTopup,
  canUsePayPalForTopup,
  canUseRazorpayForTopup
} = walletRoutes.__test;

const lockedTopupModeContracts = [
  { modeId: 'upi', provider: 'upi_app_redirect', family: 'upi-app', qrVisible: false },
  { modeId: 'upi_intent', provider: 'upi_app_redirect', family: 'upi-app', qrVisible: false },
  { modeId: 'phonepe_wallet', provider: 'upi_app_redirect', family: 'upi-app', qrVisible: false },
  { modeId: 'googlepay_wallet', provider: 'upi_app_redirect', family: 'upi-app', qrVisible: false },
  { modeId: 'paytm_wallet', provider: 'upi_app_redirect', family: 'upi-app', qrVisible: false },
  { modeId: 'upi_qr', provider: 'qr_checkout', family: 'qr-only', qrVisible: true },
  { modeId: 'bharat_qr', provider: 'qr_checkout', family: 'qr-only', qrVisible: true },
  { modeId: 'international_qr', provider: 'qr_checkout', family: 'qr-only', qrVisible: true },
  { modeId: 'rupay_card', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'visa_master_amex', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'debit_card', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'credit_card', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'netbanking', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'net_banking', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'razorpay', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'runtime-ui', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'wallet_add', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'wallet_topup', provider: 'razorpay_checkout', family: 'gateway', qrVisible: false },
  { modeId: 'paypal', provider: 'paypal_checkout', family: 'paypal', qrVisible: false },
  { modeId: 'paypal_wallet', provider: 'paypal_checkout', family: 'paypal', qrVisible: false },
  { modeId: 'cashfree', provider: 'payment_link_redirect', family: 'payment-link', qrVisible: false },
  { modeId: 'stripe_cards', provider: 'payment_link_redirect', family: 'payment-link', qrVisible: false },
  { modeId: 'apple_pay', provider: 'payment_link_redirect', family: 'payment-link', qrVisible: false },
  { modeId: 'google_pay_intl', provider: 'payment_link_redirect', family: 'payment-link', qrVisible: false },
  { modeId: 'alipay', provider: 'payment_link_redirect', family: 'payment-link', qrVisible: false },
  { modeId: 'wechat_pay', provider: 'payment_link_redirect', family: 'payment-link', qrVisible: false },
  { modeId: 'swift_wire', provider: 'customer_reference', family: 'manual-reference', qrVisible: false }
];

for (const contract of lockedTopupModeContracts) {
  test(`wallet top-up mode lock: ${contract.modeId} uses ${contract.family}`, () => {
    const actualProvider = resolveTopupCheckoutMode(contract.modeId, 'INR');
    assert.equal(actualProvider, contract.provider);
    assert.equal(actualProvider === 'qr_checkout', contract.qrVisible);
    assert.equal(shouldUseReferenceQrForTopup(contract.modeId), contract.qrVisible);
    assert.equal(
      shouldUseUpiAppRedirectForTopup(contract.modeId),
      contract.provider === 'upi_app_redirect'
    );
    assert.equal(
      shouldUsePaymentLinkRedirectForTopup(contract.modeId),
      contract.provider === 'payment_link_redirect'
    );
    assert.equal(canUsePayPalForTopup(contract.modeId), contract.provider === 'paypal_checkout');
    if (contract.provider === 'razorpay_checkout') {
      assert.equal(canUseRazorpayForTopup(contract.modeId, 'INR'), true);
    }
  });
}

test('every seeded add-money payment mode has an explicit routing lock', () => {
  const lockedModeIds = new Set(lockedTopupModeContracts.map((contract) => contract.modeId));
  const seededAddMoneyModes = DEFAULT_PAYMENT_MODES
    .filter((mode) => Array.isArray(mode.flows) && mode.flows.includes('add_money'))
    .map((mode) => mode.modeId)
    .sort();

  const missingLocks = seededAddMoneyModes.filter((modeId) => !lockedModeIds.has(modeId));
  assert.deepEqual(missingLocks, []);
});

test('QR checkout is locked only to QR-specific wallet modes', () => {
  const qrModes = lockedTopupModeContracts
    .filter((contract) => resolveTopupCheckoutMode(contract.modeId, 'INR') === 'qr_checkout')
    .map((contract) => contract.modeId)
    .sort();
  assert.deepEqual(qrModes, ['bharat_qr', 'international_qr', 'upi_qr'].sort());
});

test('UPI app wallet modes do not require Razorpay checkout', () => {
  const upiAppModes = ['upi', 'upi_intent', 'phonepe_wallet', 'googlepay_wallet', 'paytm_wallet'];
  for (const modeId of upiAppModes) {
    assert.equal(resolveTopupCheckoutMode(modeId, 'INR'), 'upi_app_redirect');
    assert.equal(shouldUseReferenceQrForTopup(modeId), false);
  }
});

test('cab-style wallet benchmark families are all covered', () => {
  const families = new Set(lockedTopupModeContracts.map((contract) => contract.family));
  assert.equal(families.has('upi-app'), true);
  assert.equal(families.has('qr-only'), true);
  assert.equal(families.has('gateway'), true);
  assert.equal(families.has('paypal'), true);
  assert.equal(families.has('payment-link'), true);
});
