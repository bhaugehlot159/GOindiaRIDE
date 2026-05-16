const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CUSTOMER_FEATURES = [
  'home_dashboard',
  'booking',
  'quick_booking',
  'saved_places',
  'fare_estimator',
  'active_rides',
  'scheduled_rides',
  'airport_transfers',
  'outstation_rides',
  'hourly_rentals',
  'trip_modes',
  'ride_history',
  'wallet',
  'wallet_topup',
  'wallet_withdrawal',
  'wallet_transfer',
  'rewards',
  'messages',
  'donations',
  'split_fare',
  'tourism',
  'travel_card',
  'temple_timings',
  'cultural_guide',
  'local_events',
  'tour_packages',
  'heritage_walks',
  'food_guide',
  'shopping_guide',
  'profile',
  'ride_preferences',
  'emergency_contacts',
  'notifications',
  'customer_support',
  'emergency'
];

const DRIVER_FEATURES = ['availability', 'booking_requests', 'active_trips', 'earnings', 'kyc', 'wallet', 'messages', 'safety'];

function createLocalStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    getItem(key) {
      const safeKey = String(key);
      return store.has(safeKey) ? store.get(safeKey) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    }
  };
}

function createNode(tagName = 'div') {
  const classes = new Set();
  return {
    tagName,
    id: '',
    title: '',
    dataset: {},
    disabled: false,
    textContent: '',
    innerHTML: '',
    style: {},
    children: [],
    firstChild: null,
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      }
    },
    appendChild(child) {
      this.children.push(child);
      this.firstChild = this.children[0] || null;
      return child;
    },
    insertBefore(child) {
      this.children.unshift(child);
      this.firstChild = this.children[0] || null;
      return child;
    },
    querySelector() {
      return createNode('span');
    },
    querySelectorAll() {
      return [];
    },
    setAttribute(name, value) {
      this[name] = value;
    }
  };
}

function loadBridge() {
  const bridgePath = path.join(__dirname, '..', '..', 'js', 'admin-control-bridge.js');
  const code = fs.readFileSync(bridgePath, 'utf8');
  const alerts = [];
  const listeners = {};
  const head = createNode('head');
  const body = createNode('body');
  const sandbox = {
    console,
    alerts,
    localStorage: createLocalStorage(),
    location: { href: 'http://localhost/customer-dashboard.html' },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
        this.key = options.key || null;
      }
    },
    document: {
      head,
      body,
      documentElement: { dataset: {} },
      getElementById() {
        return null;
      },
      createElement(tagName) {
        return createNode(tagName);
      },
      querySelectorAll() {
        return [];
      }
    },
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).forEach((handler) => handler(event));
    },
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    alert(message) {
      alerts.push(String(message || ''));
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: bridgePath });
  return sandbox;
}

test('customer portal exposes every admin-controlled feature', () => {
  const sandbox = loadBridge();
  const bridge = sandbox.AdminControlBridge;
  const controls = bridge.readControls();
  const actualFeatures = Object.keys(controls.portalFeatures.customer).sort();

  assert.deepEqual(actualFeatures, CUSTOMER_FEATURES.slice().sort());
});

test('admin control bridge keeps customer and driver features in separate buckets', () => {
  const sandbox = loadBridge();
  const bridge = sandbox.AdminControlBridge;

  sandbox.localStorage.setItem('goindiaride_admin_portal_controls_v1', JSON.stringify({
    portalFeatures: {
      customer: {
        booking: { enabled: false, reason: 'Customer booking paused' },
        booking_requests: { enabled: false, reason: 'Wrong customer bucket' }
      },
      driver: {
        availability: { enabled: false, reason: 'Driver unavailable' },
        quick_booking: { enabled: false, reason: 'Wrong driver bucket' }
      }
    }
  }));

  const controls = bridge.readControls();

  assert.equal(controls.portalFeatures.customer.booking.enabled, false);
  assert.equal(controls.portalFeatures.customer.quick_booking.enabled, false);
  assert.equal(controls.portalFeatures.driver.availability.enabled, false);
  assert.equal(controls.portalFeatures.driver.booking_requests.enabled, false);
  assert.equal(Object.hasOwn(controls.portalFeatures.customer, 'booking_requests'), false);
  assert.equal(Object.hasOwn(controls.portalFeatures.driver, 'quick_booking'), false);
  assert.deepEqual(Object.keys(controls.portalFeatures.customer).sort(), CUSTOMER_FEATURES.slice().sort());
  assert.deepEqual(Object.keys(controls.portalFeatures.driver).sort(), DRIVER_FEATURES.slice().sort());
  assert.equal(controls.legacyMixedFeatureControls.latestReadPartition.customer.booking_requests.reason, 'Wrong customer bucket');
  assert.equal(controls.legacyMixedFeatureControls.latestReadPartition.driver.quick_booking.reason, 'Wrong driver bucket');
});

test('admin can pause and resume every customer feature', () => {
  const sandbox = loadBridge();
  const bridge = sandbox.AdminControlBridge;
  const subject = { id: 'customer-control-test', email: 'customer@example.com' };

  for (const featureId of CUSTOMER_FEATURES) {
    const pause = bridge.setFeatureEnabled('customer', featureId, false, `Pause ${featureId}`);
    assert.equal(pause.ok, true);
    assert.equal(bridge.getFeaturePolicy('customer', featureId, subject).allowed, false);
    assert.equal(bridge.guardFeatureAction('customer', featureId, `test:${featureId}`, { getSubject: () => subject }), false);

    const resume = bridge.setFeatureEnabled('customer', featureId, true, `Resume ${featureId}`);
    assert.equal(resume.ok, true);
    assert.equal(bridge.getFeaturePolicy('customer', featureId, subject).allowed, true);
    assert.equal(bridge.guardFeatureAction('customer', featureId, `test:${featureId}`, { getSubject: () => subject }), true);
  }

  assert.equal(sandbox.alerts.length, CUSTOMER_FEATURES.length);
});

test('admin corrections and action wrappers reach customer actions', () => {
  const sandbox = loadBridge();
  const bridge = sandbox.AdminControlBridge;
  let topupCalls = 0;

  sandbox.startWalletTopup = function startWalletTopup() {
    topupCalls += 1;
    return 'topup-started';
  };

  const correction = bridge.setFeatureCorrection('customer', 'tourism', 'Show only approved Rajasthan tourism suggestions.', {
    labelOverride: 'Tourism review'
  });
  assert.equal(correction.ok, true);
  const tourismPolicy = bridge.getFeaturePolicy('customer', 'tourism', {});
  assert.equal(tourismPolicy.correction, 'Show only approved Rajasthan tourism suggestions.');
  assert.equal(tourismPolicy.labelOverride, 'Tourism review');

  bridge.setFeatureEnabled('customer', 'wallet_topup', false, 'Wallet top-up paused by admin.');
  const wrapResult = bridge.wrapFeatureActions('customer', {
    startWalletTopup: 'wallet_topup'
  }, {
    getSubject: () => ({ id: 'customer-control-test' })
  });

  assert.equal(wrapResult.missing.length, 0);
  assert.ok(wrapResult.wrapped.includes('startWalletTopup'));
  assert.equal(sandbox.startWalletTopup(), false);
  assert.equal(topupCalls, 0);
  assert.ok(sandbox.alerts.includes('Wallet top-up paused by admin.'));

  bridge.setFeatureEnabled('customer', 'wallet_topup', true, 'Wallet top-up resumed by admin.');
  assert.equal(sandbox.startWalletTopup(), 'topup-started');
  assert.equal(topupCalls, 1);
});

test('admin demo/live connect force-verifies every customer feature on both saved stores', () => {
  const sandbox = loadBridge();
  const bridge = sandbox.AdminControlBridge;

  sandbox.localStorage.setItem('goindiaride_admin_portal_controls_v1', JSON.stringify({
    portals: {
      customer: { enabled: false, status: 'disabled', reason: 'Earlier pause' }
    },
    portalFeatures: {
      customer: {
        booking: { enabled: false, status: 'disabled', reason: 'Earlier booking pause' },
        wallet_topup: { enabled: false, status: 'paused', reason: 'Earlier wallet pause' }
      }
    }
  }));

  const result = bridge.connectPortalFeaturesLive('customer', CUSTOMER_FEATURES, {
    source: 'test',
    reason: 'Automated demo/live verification'
  });
  const controls = bridge.readControls();
  const verification = bridge.getPortalFeatureVerification('customer');
  const savedVerification = JSON.parse(sandbox.localStorage.getItem('goindiaride_admin_portal_feature_live_verification_v1'));

  assert.equal(result.ok, true);
  assert.equal(result.verification.total, CUSTOMER_FEATURES.length);
  assert.equal(result.verification.passed, CUSTOMER_FEATURES.length);
  assert.equal(controls.portals.customer.enabled, true);
  assert.equal(controls.portals.customer.status, 'active');
  assert.equal(controls.portals.customer.connectionMode, 'demo_live');
  assert.equal(controls.portalFeatures.customer.booking.enabled, true);
  assert.equal(controls.portalFeatures.customer.booking.verificationStatus, 'passed');
  assert.equal(controls.portalFeatures.customer.wallet_topup.enabled, true);
  assert.equal(controls.portalFeatures.customer.wallet_topup.connectionMode, 'demo_live');
  assert.equal(controls.portalFeatureVerification.customer.ok, true);
  assert.equal(verification.ok, true);
  assert.equal(savedVerification.admin.customer.ok, true);
  assert.equal(savedVerification.customer.ok, true);

  CUSTOMER_FEATURES.forEach((featureId) => {
    const control = controls.portalFeatures.customer[featureId];
    assert.equal(control.enabled, true, `${featureId} should be enabled`);
    assert.equal(control.demoReady, true, `${featureId} should be demo-ready`);
    assert.equal(control.liveReady, true, `${featureId} should be live-ready`);
    assert.equal(control.verificationStatus, 'passed', `${featureId} should be verified`);
  });
});

test('customer runtime records a full feature verification snapshot after admin live connect', () => {
  const sandbox = loadBridge();
  const bridge = sandbox.AdminControlBridge;
  const featureMap = CUSTOMER_FEATURES.reduce((acc, featureId) => {
    acc[featureId] = `#${featureId}`;
    return acc;
  }, {});

  bridge.connectPortalFeaturesLive('customer', CUSTOMER_FEATURES, { source: 'test' });
  bridge.initFeatureRuntime('customer', featureMap, {
    getSubject: () => ({ id: 'runtime-customer' })
  });

  const savedVerification = JSON.parse(sandbox.localStorage.getItem('goindiaride_admin_portal_feature_live_verification_v1'));

  assert.equal(sandbox.document.documentElement.dataset.adminFeatureRuntime, 'verified');
  assert.equal(sandbox.document.documentElement.dataset.adminFeatureRuntimePassed, `${CUSTOMER_FEATURES.length}/${CUSTOMER_FEATURES.length}`);
  const runtimeKey = Object.keys(savedVerification).find((key) => key.startsWith('runtime:'));
  assert.ok(runtimeKey);
  const runtimeSnapshot = savedVerification[runtimeKey];
  assert.equal(runtimeSnapshot.customer.ok, true);
  assert.equal(runtimeSnapshot.customer.total, CUSTOMER_FEATURES.length);
  assert.equal(runtimeSnapshot.customer.passed, CUSTOMER_FEATURES.length);
});
