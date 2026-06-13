const User = require('../models/User');
const Booking = require('../models/Booking');
const WalletAccount = require('../models/WalletAccount');
const WalletTransaction = require('../models/WalletTransaction');
const WalletTopupOrder = require('../models/WalletTopupOrder');
const WalletWithdrawalRequest = require('../models/WalletWithdrawalRequest');
const Notification = require('../models/Notification');
const LoginLog = require('../models/LoginLog');
const BehaviorEvent = require('../models/BehaviorEvent');
const SecurityLog = require('../models/SecurityLog');
const SecurityIncident = require('../models/SecurityIncident');
const LiveLocation = require('../models/LiveLocation');
const GdprRequest = require('../models/GdprRequest');
const GdprConsentEvent = require('../models/GdprConsentEvent');

const GDPR_PHASE2_VERSION = 'goindiaride_gdpr_compliance_phase2_v1';
const GDPR_POLICY_VERSION = '2026-06-13-gdpr-phase2';
const RESPONSE_TARGET_DAYS = 30;
const EXPORT_LIMIT = 500;

const RIGHTS = Object.freeze([
  { id: 'access', article: 'GDPR Article 15', status: 'active' },
  { id: 'rectification', article: 'GDPR Article 16', status: 'active' },
  { id: 'erasure', article: 'GDPR Article 17', status: 'review_workflow_active' },
  { id: 'restriction', article: 'GDPR Article 18', status: 'active' },
  { id: 'portability', article: 'GDPR Article 20', status: 'active' },
  { id: 'objection', article: 'GDPR Article 21', status: 'active' },
  { id: 'consent_withdrawal', article: 'GDPR Article 7', status: 'active' }
]);

const PROCESSING_ACTIVITIES = Object.freeze([
  {
    id: 'account_profile',
    purpose: 'Account creation, authentication, support and profile management',
    dataCategories: ['identity', 'contact', 'account_security'],
    lawfulBasis: ['contract', 'legitimate_interests']
  },
  {
    id: 'booking_and_trip',
    purpose: 'Ride booking, route support, driver coordination and customer service',
    dataCategories: ['booking', 'trip', 'location', 'communication'],
    lawfulBasis: ['contract', 'legitimate_interests']
  },
  {
    id: 'wallet_payment_refund',
    purpose: 'Wallet, payment, payout, refund, accounting and dispute handling',
    dataCategories: ['transaction', 'payment_reference', 'settlement'],
    lawfulBasis: ['contract', 'legal_obligation']
  },
  {
    id: 'security_fraud_safety',
    purpose: 'Security monitoring, fraud prevention, safety incidents and abuse response',
    dataCategories: ['ip', 'device', 'risk_signal', 'incident'],
    lawfulBasis: ['legitimate_interests', 'legal_obligation']
  },
  {
    id: 'consent_preferences',
    purpose: 'Consent, cookie, marketing, analytics and optional location preferences',
    dataCategories: ['preference', 'consent_event'],
    lawfulBasis: ['consent', 'legitimate_interests']
  }
]);

const CONSENT_TYPES = Object.freeze(['marketing', 'analytics', 'location', 'cookies', 'support']);
const REQUEST_TYPES = Object.freeze(RIGHTS.map((item) => item.id));
const ADMIN_REQUEST_STATUSES = new Set(['received', 'verifying_identity', 'under_review', 'fulfilled', 'rejected', 'cancelled']);

function addDays(date, days) {
  return new Date(date.getTime() + (Number(days) || 0) * 24 * 60 * 60 * 1000);
}

function cleanText(value, maxLen = 280) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function toPlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function redactDeep(input) {
  const blockedKeys = new Set([
    'password',
    'passwordHash',
    'refreshToken',
    'refreshTokens',
    'token',
    'tokenHash',
    'twoFactorSecret',
    'secret',
    'otp',
    'code'
  ]);

  if (Array.isArray(input)) return input.map((item) => redactDeep(item));
  if (!input || typeof input !== 'object') return input;

  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (blockedKeys.has(key)) return [key, '[redacted]'];
    return [key, redactDeep(value)];
  }));
}

function normalizeConsentPreferences(preferences = {}) {
  const source = preferences && typeof preferences === 'object' ? preferences : {};
  return {
    marketing: source.marketing === true,
    analytics: source.analytics === true,
    location: source.location === true,
    cookies: source.cookies === true,
    support: source.support !== false,
    consentVersion: cleanText(source.consentVersion || GDPR_POLICY_VERSION, 80) || GDPR_POLICY_VERSION,
    updatedAt: source.updatedAt || null,
    source: cleanText(source.source || 'system_default', 80) || 'system_default'
  };
}

function getGdprComplianceStatus() {
  return {
    ok: true,
    active: true,
    version: GDPR_PHASE2_VERSION,
    policyVersion: GDPR_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'phase2-live-data-subject-rights-and-consent',
    responseTargetDays: RESPONSE_TARGET_DAYS,
    contact: {
      privacyEmail: 'privacy@goindiaride.in',
      supportEmail: 'support@goindiaride.in'
    },
    rights: RIGHTS,
    processingActivities: PROCESSING_ACTIVITIES,
    controls: {
      authenticatedExport: '/api/gdpr/export',
      portabilityExport: '/api/gdpr/portability',
      requestIntake: '/api/gdpr/requests',
      consentPreferences: '/api/gdpr/consent',
      adminRequestQueue: '/api/gdpr/admin/requests',
      publicStatusEndpoint: '/health/gdpr-compliance',
      legalNotice: '/pages/legal/gdpr-notice.html',
      privacyByDesign: 'data minimization, secret redaction, authenticated subject access, audit trail'
    }
  };
}

async function findSubjectUser(userId) {
  return User.findById(userId)
    .select('-passwordHash -refreshToken -refreshTokens -twoFactorSecret')
    .lean();
}

async function limitedFind(Model, filter, sort = { createdAt: -1 }, limit = EXPORT_LIMIT) {
  if (!Model || typeof Model.find !== 'function') return [];
  return Model.find(filter).sort(sort).limit(limit).lean();
}

async function buildDataSubjectExport({ userId, portability = false } = {}) {
  const user = await findSubjectUser(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const id = String(user._id || userId);
  const userObjectId = user._id;
  const email = String(user.email || '').toLowerCase();
  const phone = String(user.phone || '');
  const ownerFilter = { ownerId: id };
  const bookingContactFilters = [];
  if (email) bookingContactFilters.push({ 'customerSnapshot.email': email });
  if (phone) bookingContactFilters.push({ 'customerSnapshot.phone': phone });

  const bookingFilter = bookingContactFilters.length
    ? { $or: [{ userId: userObjectId }, ...bookingContactFilters] }
    : { userId: userObjectId };

  const [
    bookings,
    walletAccounts,
    walletTransactions,
    walletTopups,
    walletWithdrawals,
    notifications,
    loginLogs,
    behaviorEvents,
    securityLogs,
    securityIncidents,
    liveLocations,
    gdprRequests,
    consentEvents
  ] = await Promise.all([
    limitedFind(Booking, bookingFilter),
    limitedFind(WalletAccount, ownerFilter),
    limitedFind(WalletTransaction, ownerFilter),
    limitedFind(WalletTopupOrder, ownerFilter),
    limitedFind(WalletWithdrawalRequest, ownerFilter),
    limitedFind(Notification, { userId: userObjectId }),
    limitedFind(LoginLog, { $or: [{ userId: userObjectId }, { email }] }),
    limitedFind(BehaviorEvent, { userId: userObjectId }),
    limitedFind(SecurityLog, { userId: userObjectId }),
    limitedFind(SecurityIncident, { $or: [{ userId: userObjectId }, { email }] }),
    limitedFind(LiveLocation, { userId: id }),
    limitedFind(GdprRequest, { userId: userObjectId }),
    limitedFind(GdprConsentEvent, { userId: userObjectId })
  ]);

  const exportPayload = {
    ok: true,
    version: GDPR_PHASE2_VERSION,
    exportType: portability ? 'portable_data_copy' : 'data_subject_access_copy',
    generatedAt: new Date().toISOString(),
    subject: {
      id,
      email,
      phone,
      accountType: user.accountType || '',
      role: user.role || ''
    },
    legalContext: {
      responseTargetDays: RESPONSE_TARGET_DAYS,
      notes: [
        'Secrets, password hashes, OTPs and refresh tokens are redacted.',
        'Operational records may be retained where required for booking, tax, safety, fraud prevention, disputes or legal obligations.'
      ]
    },
    dataCategories: {
      profile: redactDeep(toPlain(user)),
      privacyPreferences: normalizeConsentPreferences(user.privacyPreferences || {}),
      privacyFlags: toPlain(user.privacyFlags || {}),
      bookings: redactDeep(toPlain(bookings)),
      wallet: {
        accounts: redactDeep(toPlain(walletAccounts)),
        transactions: redactDeep(toPlain(walletTransactions)),
        topups: redactDeep(toPlain(walletTopups)),
        withdrawals: redactDeep(toPlain(walletWithdrawals))
      },
      notifications: redactDeep(toPlain(notifications)),
      liveLocations: redactDeep(toPlain(liveLocations)),
      securityAndAudit: {
        loginLogs: redactDeep(toPlain(loginLogs)),
        behaviorEvents: redactDeep(toPlain(behaviorEvents)),
        securityLogs: redactDeep(toPlain(securityLogs)),
        securityIncidents: redactDeep(toPlain(securityIncidents))
      },
      gdpr: {
        requests: redactDeep(toPlain(gdprRequests)),
        consentEvents: redactDeep(toPlain(consentEvents))
      }
    },
    recordCounts: {
      bookings: bookings.length,
      walletAccounts: walletAccounts.length,
      walletTransactions: walletTransactions.length,
      walletTopups: walletTopups.length,
      walletWithdrawals: walletWithdrawals.length,
      notifications: notifications.length,
      liveLocations: liveLocations.length,
      loginLogs: loginLogs.length,
      behaviorEvents: behaviorEvents.length,
      securityLogs: securityLogs.length,
      securityIncidents: securityIncidents.length,
      gdprRequests: gdprRequests.length,
      consentEvents: consentEvents.length
    }
  };

  if (portability) {
    exportPayload.portability = {
      format: 'application/json',
      machineReadable: true,
      providedByUserCategories: ['profile', 'bookings', 'wallet', 'privacyPreferences']
    };
  }

  return exportPayload;
}

async function getSubjectPrivacyStatus({ userId } = {}) {
  const user = await findSubjectUser(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const requests = await GdprRequest.find({ userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return {
    ok: true,
    version: GDPR_PHASE2_VERSION,
    generatedAt: new Date().toISOString(),
    subject: {
      id: String(user._id),
      email: user.email || '',
      accountType: user.accountType || ''
    },
    preferences: normalizeConsentPreferences(user.privacyPreferences || {}),
    flags: toPlain(user.privacyFlags || {}),
    recentRequests: requests.map((item) => ({
      requestId: item.requestId,
      requestType: item.requestType,
      status: item.status,
      dueAt: item.dueAt,
      createdAt: item.createdAt,
      completedAt: item.completedAt || null
    }))
  };
}

async function createGdprRequest({
  userId,
  requestType,
  details = {},
  ip = '',
  userAgent = '',
  channel = 'self_service'
} = {}) {
  if (!REQUEST_TYPES.includes(requestType)) {
    const error = new Error('Invalid GDPR request type');
    error.statusCode = 400;
    throw error;
  }

  const user = await findSubjectUser(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const now = new Date();
  const request = await GdprRequest.create({
    userId,
    email: user.email || '',
    requestType,
    channel,
    details: {
      note: cleanText(details.note, 800),
      scope: cleanText(details.scope, 160),
      preferredFormat: cleanText(details.preferredFormat || 'json', 40)
    },
    dueAt: addDays(now, RESPONSE_TARGET_DAYS),
    legalHoldReason: requestType === 'erasure'
      ? 'Pending review for booking, tax, safety, fraud, dispute and legal retention requirements.'
      : '',
    timeline: [
      {
        action: 'request_received',
        note: `${requestType} request received via ${channel}`,
        actorId: String(userId || ''),
        createdAt: now
      }
    ],
    metadata: {
      ip,
      userAgent: cleanText(userAgent, 300),
      phase: 'gdpr_phase2'
    }
  });

  const privacyFlags = {
    ...(user.privacyFlags || {}),
    lastPrivacyRequestId: request.requestId
  };
  if (requestType === 'erasure') privacyFlags.erasureRequestedAt = now;
  if (requestType === 'portability') privacyFlags.portabilityRequestedAt = now;
  if (requestType === 'restriction') privacyFlags.restrictedProcessing = true;
  if (requestType === 'objection') privacyFlags.objectedToProcessing = true;

  await User.findByIdAndUpdate(userId, { $set: { privacyFlags } });

  return {
    ok: true,
    request: {
      requestId: request.requestId,
      requestType: request.requestType,
      status: request.status,
      dueAt: request.dueAt,
      legalHoldReason: request.legalHoldReason || '',
      createdAt: request.createdAt
    }
  };
}

async function updateConsentPreferences({
  userId,
  preferences = {},
  ip = '',
  userAgent = '',
  source = 'self_service'
} = {}) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const current = normalizeConsentPreferences(user.privacyPreferences || {});
  const now = new Date();
  const next = {
    ...current,
    updatedAt: now,
    source: cleanText(source, 80) || 'self_service',
    consentVersion: GDPR_POLICY_VERSION
  };

  CONSENT_TYPES.forEach((type) => {
    if (Object.prototype.hasOwnProperty.call(preferences, type)) {
      next[type] = preferences[type] === true;
    }
  });

  const changed = CONSENT_TYPES.filter((type) => current[type] !== next[type]);
  user.privacyPreferences = next;
  await user.save();

  if (changed.length) {
    await GdprConsentEvent.insertMany(changed.map((type) => ({
      userId,
      email: user.email || '',
      consentType: type,
      granted: next[type],
      source,
      ip,
      userAgent: cleanText(userAgent, 300),
      policyVersion: GDPR_POLICY_VERSION,
      metadata: {
        previous: current[type],
        next: next[type]
      }
    })), { ordered: false });
  }

  return {
    ok: true,
    version: GDPR_PHASE2_VERSION,
    preferences: next,
    changed
  };
}

async function listGdprRequests({ status = '', requestType = '', userId = '', limit = 100 } = {}) {
  const query = {};
  if (status) query.status = status;
  if (requestType) query.requestType = requestType;
  if (userId) query.userId = userId;

  const rows = await GdprRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 500))
    .lean();

  return {
    ok: true,
    count: rows.length,
    requests: rows.map((item) => ({
      requestId: item.requestId,
      userId: item.userId ? String(item.userId) : '',
      email: item.email || '',
      requestType: item.requestType,
      status: item.status,
      dueAt: item.dueAt,
      completedAt: item.completedAt || null,
      legalHoldReason: item.legalHoldReason || '',
      createdAt: item.createdAt
    }))
  };
}

async function updateGdprRequestStatus({
  requestId,
  status,
  note = '',
  actorId = ''
} = {}) {
  if (!ADMIN_REQUEST_STATUSES.has(status)) {
    const error = new Error('Invalid GDPR request status');
    error.statusCode = 400;
    throw error;
  }

  const patch = {
    status,
    reviewedBy: cleanText(actorId, 120)
  };
  if (status === 'fulfilled' || status === 'rejected' || status === 'cancelled') {
    patch.completedAt = new Date();
  }
  if (status === 'verifying_identity') {
    patch.verifiedAt = null;
  }
  if (status === 'under_review') {
    patch.verifiedAt = new Date();
  }

  const request = await GdprRequest.findOneAndUpdate(
    { requestId },
    {
      $set: patch,
      $push: {
        timeline: {
          action: `status_${status}`,
          note: cleanText(note, 280) || `Status changed to ${status}`,
          actorId: cleanText(actorId, 120),
          createdAt: new Date()
        }
      }
    },
    { new: true }
  ).lean();

  if (!request) {
    const error = new Error('GDPR request not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    ok: true,
    request
  };
}

module.exports = {
  GDPR_PHASE2_VERSION,
  GDPR_POLICY_VERSION,
  REQUEST_TYPES,
  CONSENT_TYPES,
  getGdprComplianceStatus,
  buildDataSubjectExport,
  getSubjectPrivacyStatus,
  createGdprRequest,
  updateConsentPreferences,
  listGdprRequests,
  updateGdprRequestStatus,
  normalizeConsentPreferences,
  redactDeep
};
