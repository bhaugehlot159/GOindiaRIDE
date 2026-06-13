const mongoose = require('mongoose');

const Booking = require('../models/Booking');
const LiveLocation = require('../models/LiveLocation');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const { getFraudDetectionStatus } = require('./fraudDetectionService');
const { getGdprComplianceStatus } = require('./gdprComplianceService');
const { getPushNotificationStatus } = require('./pushNotificationService');
const { getSecurityHardeningStatus } = require('./securityHardeningService');

const PHASE5_ADMIN_OPERATIONS_CENTER_VERSION = 'goindiaride_admin_operations_center_phase5_v1';
const OPS_POLICY_VERSION = '2026-06-13-admin-operations-phase5';
const ACTIVE_LOCATION_WINDOW_MS = 5 * 60 * 1000;
const STALE_LOCATION_WINDOW_MS = 15 * 60 * 1000;
const MAX_QUEUE_ROWS = 12;

function isMongoReady() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function safeText(value, maxLength = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function toAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }
  return Math.round(amount * 100) / 100;
}

function minutesSince(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

function asDate(msAgo) {
  return new Date(Date.now() - msAgo);
}

function settleValue(result, fallback) {
  return result && result.status === 'fulfilled' ? result.value : fallback;
}

function getAdminOperationsCenterStatus() {
  return {
    ok: true,
    active: true,
    productionReady: true,
    version: PHASE5_ADMIN_OPERATIONS_CENTER_VERSION,
    policyVersion: OPS_POLICY_VERSION,
    mode: 'phase5-production-admin-operations-control-center',
    standards: [
      'Google SRE four golden signals',
      'NIST incident handling lifecycle',
      'Incident KPI queue and MTTA tracking',
      'Role-gated admin command center'
    ],
    controls: {
      operationsDashboard: 'active',
      dispatchQueue: 'active',
      incidentQueue: 'active',
      liveDriverLocationSla: 'active',
      bookingSlaTriage: 'active',
      adminOnlySnapshot: 'active',
      runbookChecklist: 'active',
      phaseHealthIntegrations: 'active'
    },
    endpoints: {
      publicHealth: '/health/admin-operations-center',
      adminSnapshot: 'GET /api/admin/operations/center'
    },
    warningCount: 0
  };
}

function classifyBookingPriority(booking = {}) {
  const ageMinutes = minutesSince(booking.createdAt);
  const amount = toAmount(booking.amount || booking.totalFare || booking.fare);
  const missingFare = amount <= 0;
  const oldPending = ageMinutes !== null && ageMinutes >= 20;
  if (missingFare || amount >= 5000 || oldPending) {
    return 'high';
  }
  if (ageMinutes !== null && ageMinutes >= 10) {
    return 'medium';
  }
  return 'normal';
}

function mapBookingQueueRow(row = {}) {
  return {
    bookingId: safeText(row.bookingId || row._id, 80),
    status: safeText(row.status || 'created', 40),
    adminReviewStatus: safeText(row.adminReviewStatus || 'pending', 40),
    customerName: safeText(row.customerSnapshot?.name || 'Customer', 120),
    customerPhone: safeText(row.customerSnapshot?.phone || '', 40),
    pickup: safeText(row.pickupLocation, 180),
    drop: safeText(row.dropLocation, 180),
    amount: toAmount(row.amount || row.totalFare || row.fare),
    driverAssigned: Boolean(row.driverId),
    ageMinutes: minutesSince(row.createdAt),
    priority: classifyBookingPriority(row),
    createdAt: row.createdAt || null
  };
}

function mapIncidentQueueRow(row = {}) {
  return {
    incidentId: safeText(row.incidentId || row._id, 100),
    eventType: safeText(row.eventType, 100),
    severity: safeText(row.severity, 40),
    riskScore: Number(row.riskScore || 0),
    status: safeText(row.status || 'open', 40),
    recommendedAction: safeText(row.recommendedAction, 160),
    ageMinutes: minutesSince(row.createdAt),
    createdAt: row.createdAt || null
  };
}

function buildRunbook(counts = {}) {
  return [
    {
      id: 'triage_pending_bookings',
      label: 'Triage pending bookings',
      owner: 'booking_ops',
      trigger: 'pendingQueue > 0',
      active: Number(counts.pendingBookings || 0) > 0,
      action: 'Review route, fare, contact details and adminReviewStatus before dispatch.'
    },
    {
      id: 'assign_driver_with_live_location',
      label: 'Assign driver with fresh GPS',
      owner: 'dispatch',
      trigger: 'approvedUnassigned > 0',
      active: Number(counts.approvedUnassigned || 0) > 0,
      action: 'Prefer active driver GPS rows updated within five minutes.'
    },
    {
      id: 'contact_customer_on_stale_dispatch',
      label: 'Escalate stale dispatch',
      owner: 'customer_support',
      trigger: 'maxPendingAgeMinutes >= 20',
      active: Number(counts.maxPendingAgeMinutes || 0) >= 20,
      action: 'Call customer, confirm pickup timing, and send push/in-app update.'
    },
    {
      id: 'review_security_incidents',
      label: 'Review open safety/security incidents',
      owner: 'safety_ops',
      trigger: 'openIncidents > 0',
      active: Number(counts.openIncidents || 0) > 0,
      action: 'Open security queue, verify riskScore, assign owner, and mark mitigation.'
    },
    {
      id: 'verify_phase_health',
      label: 'Verify phase health',
      owner: 'ops_lead',
      trigger: 'every_shift',
      active: true,
      action: 'Check fraud, GDPR, security and push-health badges before shift handoff.'
    }
  ];
}

function buildGoldenSignals(counts = {}) {
  return {
    latency: {
      label: 'Queue age',
      value: Number(counts.maxPendingAgeMinutes || 0),
      unit: 'minutes',
      status: Number(counts.maxPendingAgeMinutes || 0) >= 20 ? 'warning' : 'good'
    },
    traffic: {
      label: 'Bookings 24h',
      value: Number(counts.bookings24h || 0),
      unit: 'requests',
      status: 'good'
    },
    errors: {
      label: 'Open incidents',
      value: Number(counts.openIncidents || 0),
      unit: 'incidents',
      status: Number(counts.criticalIncidents || 0) > 0 ? 'critical' : (Number(counts.openIncidents || 0) > 0 ? 'warning' : 'good')
    },
    saturation: {
      label: 'Dispatch pressure',
      value: Number(counts.dispatchPressure || 0),
      unit: 'score',
      status: Number(counts.dispatchPressure || 0) >= 80 ? 'critical' : (Number(counts.dispatchPressure || 0) >= 50 ? 'warning' : 'good')
    }
  };
}

function calculateDispatchPressure({ pendingBookings, approvedUnassigned, activeDriverLocations, staleDriverLocations }) {
  const demand = Number(pendingBookings || 0) + (Number(approvedUnassigned || 0) * 1.5);
  const supply = Math.max(1, Number(activeDriverLocations || 0));
  const stalePenalty = Math.min(25, Number(staleDriverLocations || 0) * 5);
  return Math.min(100, Math.round((demand / supply) * 25 + stalePenalty));
}

async function getAdminOperationsCenterSnapshot({ actor = null } = {}) {
  const status = getAdminOperationsCenterStatus();
  const now = new Date();

  if (!isMongoReady()) {
    const counts = {
      totalBookings: 0,
      bookings24h: 0,
      pendingBookings: 0,
      approvedBookings: 0,
      approvedUnassigned: 0,
      completedBookings: 0,
      activeDriverLocations: 0,
      staleDriverLocations: 0,
      openIncidents: 0,
      criticalIncidents: 0,
      unreadAdminNotifications: 0,
      activePushSubscriptions: 0,
      dispatchPressure: 0,
      maxPendingAgeMinutes: 0
    };

    return {
      ...status,
      databaseConnected: false,
      generatedAt: now.toISOString(),
      actor: actor ? { id: safeText(actor.id, 80), role: safeText(actor.role, 40), accountType: safeText(actor.accountType, 40) } : null,
      counts,
      goldenSignals: buildGoldenSignals(counts),
      queues: { dispatch: [], incidents: [] },
      phaseHealth: {
        fraud: getFraudDetectionStatus(),
        gdpr: getGdprComplianceStatus(),
        security: getSecurityHardeningStatus(),
        push: getPushNotificationStatus()
      },
      runbook: buildRunbook(counts)
    };
  }

  const since24h = asDate(24 * 60 * 60 * 1000);
  const activeLocationSince = asDate(ACTIVE_LOCATION_WINDOW_MS);
  const staleLocationSince = asDate(STALE_LOCATION_WINDOW_MS);

  const settled = await Promise.allSettled([
    Booking.countDocuments({}),
    Booking.countDocuments({ createdAt: { $gte: since24h } }),
    Booking.countDocuments({ adminReviewStatus: 'pending', status: 'created' }),
    Booking.countDocuments({ adminReviewStatus: 'approved' }),
    Booking.countDocuments({ adminReviewStatus: 'approved', status: 'created', $or: [{ driverId: null }, { driverId: '' }] }),
    Booking.countDocuments({ status: 'completed' }),
    LiveLocation.countDocuments({ subjectType: 'driver', status: 'tracking', updatedAt: { $gte: activeLocationSince } }),
    LiveLocation.countDocuments({ subjectType: 'driver', status: 'tracking', updatedAt: { $lt: staleLocationSince } }),
    SecurityIncident.countDocuments({ status: { $in: ['open', 'investigating'] } }),
    SecurityIncident.countDocuments({ status: { $in: ['open', 'investigating'] }, severity: 'critical' }),
    Notification.countDocuments({ audience: 'admin', isRead: false }),
    PushSubscription.countDocuments({ status: 'active' }),
    User.countDocuments({ accountType: 'driver' }),
    User.countDocuments({ accountType: 'customer' }),
    Booking.find({ adminReviewStatus: { $in: ['pending', 'approved'] }, status: 'created' })
      .sort({ createdAt: 1 })
      .limit(MAX_QUEUE_ROWS)
      .lean(),
    SecurityIncident.find({ status: { $in: ['open', 'investigating'] } })
      .sort({ severity: -1, riskScore: -1, createdAt: -1 })
      .limit(MAX_QUEUE_ROWS)
      .lean()
  ]);

  const dispatchRows = settleValue(settled[14], []).map(mapBookingQueueRow);
  const incidentRows = settleValue(settled[15], []).map(mapIncidentQueueRow);
  const maxPendingAgeMinutes = dispatchRows.reduce((max, row) => Math.max(max, Number(row.ageMinutes || 0)), 0);
  const counts = {
    totalBookings: settleValue(settled[0], 0),
    bookings24h: settleValue(settled[1], 0),
    pendingBookings: settleValue(settled[2], 0),
    approvedBookings: settleValue(settled[3], 0),
    approvedUnassigned: settleValue(settled[4], 0),
    completedBookings: settleValue(settled[5], 0),
    activeDriverLocations: settleValue(settled[6], 0),
    staleDriverLocations: settleValue(settled[7], 0),
    openIncidents: settleValue(settled[8], 0),
    criticalIncidents: settleValue(settled[9], 0),
    unreadAdminNotifications: settleValue(settled[10], 0),
    activePushSubscriptions: settleValue(settled[11], 0),
    driverAccounts: settleValue(settled[12], 0),
    customerAccounts: settleValue(settled[13], 0),
    maxPendingAgeMinutes
  };
  counts.dispatchPressure = calculateDispatchPressure(counts);

  return {
    ...status,
    databaseConnected: true,
    generatedAt: now.toISOString(),
    actor: actor ? { id: safeText(actor.id, 80), role: safeText(actor.role, 40), accountType: safeText(actor.accountType, 40) } : null,
    thresholds: {
      activeDriverLocationMinutes: ACTIVE_LOCATION_WINDOW_MS / 60000,
      staleDriverLocationMinutes: STALE_LOCATION_WINDOW_MS / 60000,
      stalePendingBookingMinutes: 20
    },
    counts,
    goldenSignals: buildGoldenSignals(counts),
    queues: {
      dispatch: dispatchRows,
      incidents: incidentRows
    },
    phaseHealth: {
      fraud: getFraudDetectionStatus(),
      gdpr: getGdprComplianceStatus(),
      security: getSecurityHardeningStatus(),
      push: getPushNotificationStatus()
    },
    runbook: buildRunbook(counts)
  };
}

module.exports = {
  PHASE5_ADMIN_OPERATIONS_CENTER_VERSION,
  OPS_POLICY_VERSION,
  getAdminOperationsCenterSnapshot,
  getAdminOperationsCenterStatus
};
