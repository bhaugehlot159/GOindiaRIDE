const PHASE1_FRAUD_DETECTION_VERSION = 'goindiaride_fraud_detection_phase1_v1';

const DEFAULT_THRESHOLDS = Object.freeze({
  rapidCancellationBlock: 3,
  cardReuseBlock: 5,
  ipVelocityBlock: 10,
  referralBurstBlock: 8,
  activeContactBookingLimit: 3,
  highFareAmount: 50000,
  blockScore: 85,
  reviewScore: 70,
  monitorScore: 40
});

const PHASE1_FRAUD_ALGORITHMS = Object.freeze([
  {
    id: 'booking_velocity',
    label: 'Booking velocity and cancellation bursts',
    status: 'active',
    owasp: ['OAT-006', 'OAT-016'],
    signals: ['usage_patterns', 'velocity', 'timing']
  },
  {
    id: 'identity_reuse',
    label: 'Repeated customer identity across active bookings',
    status: 'active',
    owasp: ['OAT-019', 'OAT-020'],
    signals: ['usage_patterns', 'identity_reuse']
  },
  {
    id: 'payment_cashout_risk',
    label: 'Payment, refund, payout and cash-out abuse',
    status: 'active',
    owasp: ['OAT-001', 'OAT-012'],
    signals: ['payment_attempts', 'refund_velocity', 'cashout']
  },
  {
    id: 'fare_integrity',
    label: 'Fare, distance and route integrity',
    status: 'active',
    owasp: ['OAT-003', 'OAT-016'],
    signals: ['fare_amount', 'route_shape', 'distance']
  },
  {
    id: 'device_session_anomaly',
    label: 'Device, IP and session anomaly indicators',
    status: 'active',
    owasp: ['OAT-008', 'OAT-018'],
    signals: ['device_characteristics', 'ip_characteristics', 'geolocation']
  },
  {
    id: 'fake_ride_pattern',
    label: 'Fake ride and low-quality booking pattern checks',
    status: 'active',
    owasp: ['OAT-017', 'OAT-021'],
    signals: ['placeholder_route', 'missing_contact', 'test_artifact']
  }
]);

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function recommendedActionFromScore(score) {
  if (score >= DEFAULT_THRESHOLDS.blockScore) return 'temporary_block_and_admin_review';
  if (score >= DEFAULT_THRESHOLDS.reviewScore) return 'hold_for_admin_review';
  if (score >= DEFAULT_THRESHOLDS.monitorScore) return 'monitor_realtime';
  return 'allow_with_logging';
}

function normalizeText(value, maxLen = 180) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function normalizeEmail(value) {
  const email = normalizeText(value, 180).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizePhone(value) {
  const raw = normalizeText(value, 40);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  if (raw.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  return `+${digits}`;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function extractBookingContact(booking = {}) {
  const customer = isPlainObject(booking.customer) ? booking.customer : {};
  const customerSnapshot = isPlainObject(booking.customerSnapshot) ? booking.customerSnapshot : {};

  return {
    phone: normalizePhone(
      booking.customerPhone
        || booking.phone
        || booking.mobile
        || booking.contact
        || customerSnapshot.phone
        || customer.phone
    ),
    email: normalizeEmail(
      booking.customerEmail
        || booking.email
        || booking.userEmail
        || customerSnapshot.email
        || customer.email
    )
  };
}

function getBookingAmount(booking = {}) {
  return Number(
    booking.finalFare
      || booking.totalFare
      || booking.amount
      || booking.fare
      || booking.fareAmount
      || 0
  );
}

function isPlaceholderText(value) {
  const text = normalizeText(value).toLowerCase();
  return !text
    || text === 'pickup pending'
    || text === 'drop pending'
    || text === 'not set'
    || text === 'distance pending'
    || text === 'unknown'
    || text === 'na'
    || text === 'n/a';
}

function getRouteShape(booking = {}) {
  const pickup = normalizeText(
    booking.pickup
      || booking.pickupLocation
      || booking.from
      || booking.origin
      || ''
  );
  const dropoff = normalizeText(
    booking.dropoff
      || booking.drop
      || booking.dropLocation
      || booking.to
      || booking.destination
      || ''
  );

  return {
    pickup,
    dropoff,
    incomplete: isPlaceholderText(pickup) || isPlaceholderText(dropoff)
  };
}

function mergeThresholds(thresholds = {}) {
  return {
    ...DEFAULT_THRESHOLDS,
    ...(isPlainObject(thresholds) ? thresholds : {})
  };
}

function pushSignal(signals, signal) {
  signals.push({
    id: signal.id,
    algorithm: signal.algorithm,
    category: signal.category,
    severity: signal.severity || severityFromScore(signal.score || 0),
    score: clampScore(signal.score || 0),
    floor: clampScore(signal.floor || 0),
    blocking: Boolean(signal.blocking),
    label: normalizeText(signal.label, 220),
    evidence: isPlainObject(signal.evidence) ? signal.evidence : {},
    owasp: Array.isArray(signal.owasp) ? signal.owasp : [],
    nistSignals: Array.isArray(signal.nistSignals) ? signal.nistSignals : []
  });
}

function summarizeSignals(signals) {
  const score = signals.reduce((sum, signal) => sum + Number(signal.score || 0), 0);
  const floor = signals.reduce((max, signal) => Math.max(max, Number(signal.floor || 0)), 0);
  const riskScore = clampScore(Math.max(score, floor));
  const severity = severityFromScore(riskScore);
  const blocking = signals.some((signal) => signal.blocking);

  return {
    riskScore,
    severity,
    recommendedAction: recommendedActionFromScore(riskScore),
    blocking
  };
}

function evaluateBookingFraudPhase1({ booking = {}, context = {}, thresholds = {} } = {}) {
  const limits = mergeThresholds(thresholds);
  const signals = [];
  const amount = getBookingAmount(booking);
  const route = getRouteShape(booking);
  const contact = extractBookingContact(booking);
  const rapidCancellations = Number(context.rapidCancellations || 0);
  const cardReuse = Number(context.cardReuse || 0);
  const ipVelocity = Number(context.ipVelocity || 0);
  const referralBurst = Number(context.referralBurst || 0);
  const activeContactBookings = Number(context.activeContactBookings || context.sameContactActiveBookings || 0);
  const deviceFingerprint = normalizeText(context.deviceFingerprint || booking.deviceFingerprint || '', 160).toLowerCase();
  const distanceKm = Number(booking.distanceKm || booking.distance || context.distanceKm || 0);

  if (rapidCancellations >= limits.rapidCancellationBlock) {
    pushSignal(signals, {
      id: 'rapid_cancellation_burst',
      algorithm: 'booking_velocity',
      category: 'velocity',
      score: 38,
      floor: 85,
      blocking: true,
      label: 'Rapid cancellation burst exceeded Phase 1 threshold',
      evidence: { rapidCancellations, threshold: limits.rapidCancellationBlock },
      owasp: ['OAT-006', 'OAT-016'],
      nistSignals: ['usage_patterns', 'velocity', 'timing']
    });
  }

  if (cardReuse >= limits.cardReuseBlock) {
    pushSignal(signals, {
      id: 'payment_card_reuse',
      algorithm: 'payment_cashout_risk',
      category: 'payment',
      score: 38,
      floor: 85,
      blocking: true,
      label: 'Payment token/card hash reuse exceeded Phase 1 threshold',
      evidence: { cardReuse, threshold: limits.cardReuseBlock },
      owasp: ['OAT-001', 'OAT-012'],
      nistSignals: ['payment_attempts', 'usage_patterns']
    });
  }

  if (ipVelocity >= limits.ipVelocityBlock) {
    pushSignal(signals, {
      id: 'ip_booking_velocity',
      algorithm: 'booking_velocity',
      category: 'velocity',
      score: 34,
      floor: 85,
      blocking: true,
      label: 'Booking velocity from one IP exceeded Phase 1 threshold',
      evidence: { ipVelocity, threshold: limits.ipVelocityBlock },
      owasp: ['OAT-006', 'OAT-016'],
      nistSignals: ['ip_characteristics', 'velocity', 'timing']
    });
  }

  if (referralBurst >= limits.referralBurstBlock) {
    pushSignal(signals, {
      id: 'referral_burst',
      algorithm: 'payment_cashout_risk',
      category: 'promo_abuse',
      score: 28,
      floor: 75,
      label: 'Referral/promo burst needs admin review',
      evidence: { referralBurst, threshold: limits.referralBurstBlock },
      owasp: ['OAT-002', 'OAT-012'],
      nistSignals: ['usage_patterns', 'velocity']
    });
  }

  if (activeContactBookings > limits.activeContactBookingLimit) {
    pushSignal(signals, {
      id: 'customer_identity_reuse',
      algorithm: 'identity_reuse',
      category: 'identity',
      score: 26,
      floor: 70,
      label: 'Same customer contact appears on too many active bookings',
      evidence: { activeContactBookings, threshold: limits.activeContactBookingLimit, contact },
      owasp: ['OAT-019', 'OAT-020'],
      nistSignals: ['usage_patterns', 'identity_reuse']
    });
  }

  if (amount <= 0) {
    pushSignal(signals, {
      id: 'missing_fare',
      algorithm: 'fare_integrity',
      category: 'fare',
      score: 24,
      floor: 55,
      label: 'Booking is missing a valid fare amount',
      evidence: { amount },
      owasp: ['OAT-003'],
      nistSignals: ['usage_patterns']
    });
  } else if (amount > limits.highFareAmount) {
    pushSignal(signals, {
      id: 'high_fare_amount',
      algorithm: 'fare_integrity',
      category: 'fare',
      score: 18,
      floor: 45,
      label: 'Unusually high fare amount requires monitoring',
      evidence: { amount, threshold: limits.highFareAmount },
      owasp: ['OAT-003'],
      nistSignals: ['usage_patterns']
    });
  }

  if (amount > 0 && distanceKm <= 0) {
    pushSignal(signals, {
      id: 'missing_distance',
      algorithm: 'fare_integrity',
      category: 'fare',
      score: 12,
      label: 'Paid booking has no trusted distance value',
      evidence: { amount, distanceKm },
      owasp: ['OAT-003'],
      nistSignals: ['usage_patterns']
    });
  }

  if (!contact.phone && !contact.email) {
    pushSignal(signals, {
      id: 'missing_customer_contact',
      algorithm: 'fake_ride_pattern',
      category: 'identity',
      score: 18,
      floor: 45,
      label: 'Booking has no usable customer phone or email',
      evidence: { contact },
      owasp: ['OAT-017', 'OAT-021'],
      nistSignals: ['usage_patterns']
    });
  }

  if (route.incomplete) {
    pushSignal(signals, {
      id: 'placeholder_route',
      algorithm: 'fake_ride_pattern',
      category: 'route',
      score: 18,
      floor: 45,
      label: 'Booking route contains placeholder pickup or drop',
      evidence: route,
      owasp: ['OAT-017', 'OAT-021'],
      nistSignals: ['usage_patterns']
    });
  }

  if (deviceFingerprint.includes('emulator') || deviceFingerprint.includes('bot') || deviceFingerprint.includes('headless')) {
    pushSignal(signals, {
      id: 'automation_device_fingerprint',
      algorithm: 'device_session_anomaly',
      category: 'device',
      score: 34,
      floor: 80,
      label: 'Device fingerprint looks automated or emulated',
      evidence: { deviceFingerprint },
      owasp: ['OAT-008', 'OAT-018'],
      nistSignals: ['device_characteristics', 'ip_characteristics']
    });
  }

  const summary = summarizeSignals(signals);
  const isFraud = summary.blocking || summary.riskScore >= limits.blockScore;

  return {
    active: true,
    version: PHASE1_FRAUD_DETECTION_VERSION,
    evaluatedAt: new Date().toISOString(),
    isFraud,
    riskScore: summary.riskScore,
    severity: summary.severity,
    recommendedAction: summary.recommendedAction,
    enforceAction: isFraud ? 'temporary_block' : summary.recommendedAction,
    signalCount: signals.length,
    algorithms: [...new Set(signals.map((signal) => signal.algorithm))],
    signals,
    evidence: {
      amount,
      distanceKm,
      contact,
      route,
      rapidCancellations,
      cardReuse,
      ipVelocity,
      referralBurst,
      activeContactBookings
    }
  };
}

function buildFraudDetectionSnapshot({ bookings = [], payments = [], payouts = [], sosLogs = [] } = {}) {
  const bookingRows = Array.isArray(bookings) ? bookings : [];
  const paymentRows = Array.isArray(payments) ? payments : [];
  const payoutRows = Array.isArray(payouts) ? payouts : [];
  const sosRows = Array.isArray(sosLogs) ? sosLogs : [];
  const contactCounts = new Map();

  bookingRows.forEach((booking) => {
    const contact = extractBookingContact(booking);
    const contactKey = contact.phone || contact.email;
    if (contactKey) contactCounts.set(contactKey, (contactCounts.get(contactKey) || 0) + 1);
  });

  const flags = [];
  const bookingEvaluations = bookingRows.map((booking) => {
    const contact = extractBookingContact(booking);
    const contactKey = contact.phone || contact.email;
    const result = evaluateBookingFraudPhase1({
      booking,
      context: {
        activeContactBookings: contactKey ? contactCounts.get(contactKey) : 0,
        deviceFingerprint: booking.deviceFingerprint
      }
    });

    result.signals.forEach((signal) => {
      flags.push({
        severity: signal.severity,
        algorithm: signal.algorithm,
        label: `${normalizeText(booking.bookingId || booking.id || 'Booking', 80)}: ${signal.label}`,
        riskScore: Math.max(signal.score, signal.floor || 0)
      });
    });
    return result;
  });

  paymentRows.forEach((payment) => {
    const status = normalizeText(payment.status, 80).toLowerCase();
    if (status === 'refund_initiated' || status === 'chargeback' || status === 'failed_repeatedly') {
      flags.push({
        severity: status === 'chargeback' ? 'high' : 'medium',
        algorithm: 'payment_cashout_risk',
        label: `${normalizeText(payment.bookingId || payment.id || 'Payment', 80)}: ${status.replace(/_/g, ' ')}`,
        riskScore: status === 'chargeback' ? 75 : 45
      });
    }
  });

  payoutRows.forEach((payout) => {
    const amount = Number(payout.amount || payout.payoutAmount || 0);
    const status = normalizeText(payout.status, 80).toLowerCase();
    if ((status === 'pending' || status === 'requested') && amount >= 20000) {
      flags.push({
        severity: 'medium',
        algorithm: 'payment_cashout_risk',
        label: `${normalizeText(payout.id || payout.payoutId || 'Payout', 80)}: high pending payout`,
        riskScore: 50
      });
    }
  });

  sosRows
    .filter((item) => normalizeText(item.status, 80).toLowerCase() === 'active')
    .forEach((item) => {
      flags.push({
        severity: 'critical',
        algorithm: 'sos_safety_signal',
        label: `${normalizeText(item.id || item.incidentId || 'SOS', 80)}: active customer SOS`,
        riskScore: 95
      });
    });

  const sortedFlags = flags
    .sort((left, right) => Number(right.riskScore || 0) - Number(left.riskScore || 0))
    .slice(0, 12);

  return {
    ok: true,
    active: true,
    version: PHASE1_FRAUD_DETECTION_VERSION,
    generatedAt: new Date().toISOString(),
    algorithms: PHASE1_FRAUD_ALGORITHMS,
    summary: {
      evaluatedBookings: bookingRows.length,
      flaggedBookings: bookingEvaluations.filter((result) => result.signalCount > 0).length,
      activeFlags: sortedFlags.length,
      criticalFlags: sortedFlags.filter((flag) => flag.severity === 'critical').length,
      highFlags: sortedFlags.filter((flag) => flag.severity === 'high').length
    },
    flags: sortedFlags
  };
}

function getFraudDetectionStatus() {
  return {
    ok: true,
    active: true,
    version: PHASE1_FRAUD_DETECTION_VERSION,
    mode: 'phase1-live-monitoring-and-booking-gate',
    generatedAt: new Date().toISOString(),
    thresholds: DEFAULT_THRESHOLDS,
    algorithms: PHASE1_FRAUD_ALGORITHMS,
    controls: {
      bookingCreateGate: 'active',
      adminControlCenter: 'active',
      realtimeStatusEndpoint: '/health/fraud-detection',
      securityStatusEndpoint: '/api/security/fraud-detection/status',
      actionVelocityShield: String(process.env.ACTION_VELOCITY_SHIELD_ENABLED || 'true').toLowerCase() !== 'false',
      autoBan: false,
      failMode: 'fail_safe_review'
    }
  };
}

module.exports = {
  PHASE1_FRAUD_DETECTION_VERSION,
  PHASE1_FRAUD_ALGORITHMS,
  DEFAULT_THRESHOLDS,
  evaluateBookingFraudPhase1,
  buildFraudDetectionSnapshot,
  getFraudDetectionStatus,
  extractBookingContact,
  normalizePhone,
  normalizeEmail
};
