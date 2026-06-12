const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PHASE1_FRAUD_DETECTION_VERSION,
  evaluateBookingFraudPhase1,
  buildFraudDetectionSnapshot,
  getFraudDetectionStatus
} = require('../src/services/fraudDetectionService');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('phase 1 fraud status exposes active algorithms and live controls', () => {
  const status = getFraudDetectionStatus();
  const algorithmIds = status.algorithms.map((item) => item.id);

  assert.equal(status.ok, true);
  assert.equal(status.active, true);
  assert.equal(status.version, PHASE1_FRAUD_DETECTION_VERSION);
  assert.equal(status.controls.bookingCreateGate, 'active');
  assert.equal(status.controls.adminControlCenter, 'active');
  assert.match(status.controls.realtimeStatusEndpoint, /\/health\/fraud-detection/);
  assert.match(status.controls.securityStatusEndpoint, /\/api\/security\/fraud-detection\/status/);
  [
    'booking_velocity',
    'identity_reuse',
    'payment_cashout_risk',
    'fare_integrity',
    'device_session_anomaly',
    'fake_ride_pattern'
  ].forEach((id) => assert.ok(algorithmIds.includes(id), `${id} should be active`));
});

test('phase 1 booking evaluator blocks old fraud thresholds without weakening them', () => {
  const result = evaluateBookingFraudPhase1({
    booking: {
      bookingId: 'BK-FRAUD-1',
      amount: 1200,
      distanceKm: 14,
      pickupLocation: 'Jaipur',
      dropLocation: 'Ajmer',
      customerSnapshot: {
        phone: '+919876543210',
        email: 'customer@example.com'
      }
    },
    context: {
      rapidCancellations: 3,
      cardReuse: 5,
      ipVelocity: 10,
      activeContactBookings: 1
    }
  });

  assert.equal(result.active, true);
  assert.equal(result.isFraud, true);
  assert.ok(result.riskScore >= 85);
  assert.equal(result.enforceAction, 'temporary_block');
  assert.ok(result.algorithms.includes('booking_velocity'));
  assert.ok(result.algorithms.includes('payment_cashout_risk'));
  assert.ok(result.signals.some((signal) => signal.id === 'rapid_cancellation_burst'));
  assert.ok(result.signals.some((signal) => signal.id === 'payment_card_reuse'));
  assert.ok(result.signals.some((signal) => signal.id === 'ip_booking_velocity'));
});

test('phase 1 snapshot detects admin-visible local booking and cash-out flags', () => {
  const snapshot = buildFraudDetectionSnapshot({
    bookings: [
      {
        bookingId: 'BK-LOCAL-1',
        amount: 0,
        pickupLocation: 'Pickup pending',
        dropLocation: 'Drop pending'
      },
      {
        bookingId: 'BK-LOCAL-2',
        amount: 500,
        pickupLocation: 'Jaipur',
        dropLocation: 'Udaipur',
        customerSnapshot: { phone: '+919876543210' }
      },
      {
        bookingId: 'BK-LOCAL-3',
        amount: 600,
        pickupLocation: 'Jaipur',
        dropLocation: 'Udaipur',
        customerSnapshot: { phone: '+919876543210' }
      },
      {
        bookingId: 'BK-LOCAL-4',
        amount: 700,
        pickupLocation: 'Jaipur',
        dropLocation: 'Udaipur',
        customerSnapshot: { phone: '+919876543210' }
      },
      {
        bookingId: 'BK-LOCAL-5',
        amount: 800,
        pickupLocation: 'Jaipur',
        dropLocation: 'Udaipur',
        customerSnapshot: { phone: '+919876543210' }
      }
    ],
    payments: [{ bookingId: 'BK-LOCAL-2', status: 'refund_initiated' }],
    payouts: [{ payoutId: 'PO-1', amount: 25000, status: 'pending' }],
    sosLogs: [{ id: 'SOS-1', status: 'active' }]
  });

  const labels = snapshot.flags.map((flag) => flag.label).join(' ');

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.version, PHASE1_FRAUD_DETECTION_VERSION);
  assert.ok(snapshot.summary.flaggedBookings >= 1);
  assert.match(labels, /missing a valid fare/);
  assert.match(labels, /active customer SOS/);
  assert.match(labels, /refund initiated/);
  assert.match(labels, /high pending payout/);
  assert.ok(snapshot.flags.some((flag) => flag.algorithm === 'identity_reuse'));
});

test('phase 1 fraud detection is wired into booking, security route and admin UI', () => {
  const riskService = read('backend/src/services/riskService.js');
  const bookingRoutes = read('backend/src/routes/bookingRoutes.js');
  const securityRoutes = read('backend/src/routes/securityRoutes.js');
  const adminCenter = read('admin/js/admin-live-control-center.js');

  assert.match(riskService, /evaluateBookingFraudPhase1/);
  assert.match(riskService, /recordFraudDetectionIncident/);
  assert.match(bookingRoutes, /recordFraudDetectionIncident/);
  assert.match(bookingRoutes, /phase1_booking_fraud_detected/);
  assert.match(securityRoutes, /['"]\/fraud-detection\/status['"]/);
  assert.match(read('backend/src/app.js'), /['"]\/health\/fraud-detection['"]/);
  assert.match(adminCenter, /goindiaride_fraud_detection_phase1_v1/);
  assert.match(adminCenter, /\/health\/fraud-detection/);
  assert.match(adminCenter, /Phase 1 Fraud & SOS Flags/);
  assert.match(adminCenter, /syncFraudDetectionStatus/);
});
