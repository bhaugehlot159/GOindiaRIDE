const express = require('express');

const auth = require('../middleware/authMiddleware');
const authenticate = auth.authenticate || auth;
const SecurityIncident = require('../models/SecurityIncident');
const { getClientIp } = require('../utils/device');
const { trackBehaviorEvent } = require('../services/behaviorService');
const { logSecurityEvent } = require('../services/securityLogService');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { evaluateAiThreat, applyAutoResponse } = require('../services/aiSecurityDetectiveService');

const router = express.Router();

function getUserContext(req) {
  const user = req.user || req.auth || {};
  return {
    id: user.id || user.sub || user._id || null,
    role: user.role || 'user',
    email: user.email || null
  };
}

function requireAdmin(req, res, next) {
  const user = getUserContext(req);
  if (user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: Admin only' });
  }
  return next();
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return Object.fromEntries(Object.entries(metadata).slice(0, 25));
}

function normalizeSosChannel(value) {
  const normalized = String(value || 'both').trim().toLowerCase();
  if (normalized === 'police' || normalized === 'ambulance' || normalized === 'both') {
    return normalized;
  }
  return null;
}

function normalizeSosLocation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      address: null,
      lat: null,
      lng: null
    };
  }

  const lat = Number(input.lat);
  const lng = Number(input.lng);

  return {
    address: input.address ? String(input.address).trim().slice(0, 160) : null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null
  };
}

async function createEmergencyNotifications({
  channel,
  requesterId,
  requesterRole,
  requesterEmail,
  bookingId,
  note,
  location,
  incidentId
}) {
  const [admins, drivers] = await Promise.all([
    User.find({ $or: [{ role: 'admin' }, { accountType: 'admin' }] }).select('_id').lean(),
    User.find({ accountType: 'driver' }).select('_id').lean()
  ]);

  const titleByChannel = {
    police: 'Emergency SOS - Police',
    ambulance: 'Emergency SOS - Ambulance',
    both: 'Emergency SOS - Police and Ambulance'
  };

  const locationText = location.address ? ` near ${location.address}` : '';
  const noteText = note ? ` Note: ${note}` : '';
  const bookingText = bookingId ? ` Booking ${bookingId}.` : '';
  const requesterText = requesterEmail || requesterId;

  const message = `SOS triggered by ${requesterRole} (${requesterText})${locationText}.${bookingText}${noteText}`.trim();

  const docs = [];

  admins.forEach((item) => {
    docs.push({
      userId: item._id,
      audience: 'admin',
      bookingId,
      type: 'emergency_sos',
      title: titleByChannel[channel],
      message,
      metadata: {
        incidentId,
        channel,
        location,
        note,
        requesterRole
      }
    });
  });

  drivers.forEach((item) => {
    docs.push({
      userId: item._id,
      audience: 'driver',
      bookingId,
      type: 'emergency_sos',
      title: titleByChannel[channel],
      message,
      metadata: {
        incidentId,
        channel,
        location,
        note,
        requesterRole
      }
    });
  });

  if (!docs.length) {
    await Notification.create({
      userId: null,
      audience: 'admin',
      bookingId,
      type: 'emergency_sos',
      title: titleByChannel[channel],
      message,
      metadata: {
        incidentId,
        channel,
        location,
        note,
        requesterRole,
        fallback: true
      }
    });

    return {
      adminCount: 1,
      driverCount: 0,
      fallback: true
    };
  }

  await Notification.insertMany(docs, { ordered: false });

  return {
    adminCount: admins.length,
    driverCount: drivers.length,
    fallback: false
  };
}

router.post('/event', authenticate, async (req, res) => {
  try {
    const user = getUserContext(req);
    const eventType = String(req.body?.eventType || '').trim();

    if (!eventType) {
      return res.status(400).json({ message: 'eventType is required' });
    }

    const ip = getClientIp(req);
    const city = req.body?.city || req.headers['x-city'] || 'unknown';
    const deviceFingerprint = req.body?.deviceFingerprint || req.headers['x-device-fingerprint'] || null;

    const payload = {
      userId: user.id,
      ip,
      email: req.body?.email || user.email || null,
      city,
      deviceFingerprint,
      eventType,
      eventAt: req.body?.eventAt,
      metadata: normalizeMetadata(req.body?.metadata)
    };

    const aiResult = await evaluateAiThreat(payload);
    const autoResponse = await applyAutoResponse({ userId: user.id, score: aiResult.score });

    const incident = await SecurityIncident.create({
      source: req.body?.source || 'client',
      eventType,
      userId: user.id,
      email: payload.email,
      ip,
      city,
      deviceFingerprint,
      riskScore: aiResult.score,
      severity: aiResult.severity,
      recommendedAction: aiResult.recommendedAction,
      autoResponse,
      signals: aiResult.signals,
      metadata: payload.metadata,
      timeline: [
        {
          action: 'incident_created',
          note: `Auto action: ${autoResponse.action}`,
          actorId: user.id || undefined
        }
      ]
    });

    const behaviorSupportedEventTypes = new Set(['login', 'booking_create', 'booking_cancel', 'payment', 'profile_change']);
    if (user.id && behaviorSupportedEventTypes.has(eventType)) {
      await trackBehaviorEvent({
        userId: user.id,
        eventType,
        ip,
        city,
        deviceFingerprint,
        metadata: {
          riskScore: aiResult.score,
          severity: aiResult.severity,
          source: req.body?.source || 'client'
        }
      });
    }

    return res.status(201).json({
      incidentId: incident.incidentId,
      riskScore: aiResult.score,
      severity: aiResult.severity,
      recommendedAction: aiResult.recommendedAction,
      autoResponse,
      components: aiResult.components,
      signals: aiResult.signals
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to evaluate security incident' });
  }
});

router.post('/sos', authenticate, async (req, res) => {
  try {
    const user = getUserContext(req);
    if (!user.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const channel = normalizeSosChannel(req.body?.channel);
    if (!channel) {
      return res.status(400).json({ message: 'channel must be police, ambulance or both' });
    }

    const bookingIdValue = req.body?.bookingId;
    const bookingId = bookingIdValue ? String(bookingIdValue).trim().slice(0, 64) : null;
    const note = String(req.body?.note || '').trim().slice(0, 240);
    const location = normalizeSosLocation(req.body?.location);
    const ip = getClientIp(req);

    const riskScore = channel === 'both' ? 95 : 90;

    const incident = await SecurityIncident.create({
      source: 'client',
      eventType: `sos_${channel}`,
      userId: user.id,
      email: user.email,
      ip,
      city: location.address || req.headers['x-city'] || 'unknown',
      deviceFingerprint: req.body?.deviceFingerprint || req.headers['x-device-fingerprint'] || null,
      riskScore,
      severity: 'critical',
      recommendedAction: 'dispatch_emergency_support',
      autoResponse: {
        action: 'notify_admin_and_driver',
        applied: true,
        note: 'Emergency broadcast generated'
      },
      signals: {
        sos: true,
        channel,
        hasLocation: Boolean(location.address || (location.lat !== null && location.lng !== null))
      },
      metadata: {
        bookingId,
        note,
        location
      },
      timeline: [
        {
          action: 'sos_triggered',
          note: `SOS ${channel} triggered`,
          actorId: user.id
        }
      ]
    });

    const notificationSummary = await createEmergencyNotifications({
      channel,
      requesterId: user.id,
      requesterRole: user.role,
      requesterEmail: user.email,
      bookingId,
      note,
      location,
      incidentId: incident.incidentId
    });

    await trackBehaviorEvent({
      userId: user.id,
      eventType: 'sos_trigger',
      ip,
      city: location.address || req.headers['x-city'] || 'unknown',
      deviceFingerprint: req.body?.deviceFingerprint || req.headers['x-device-fingerprint'] || null,
      metadata: {
        channel,
        incidentId: incident.incidentId,
        bookingId
      }
    });

    await logSecurityEvent({
      userId: user.id,
      action: 'sos_triggered',
      ip,
      riskScore,
      result: 'flagged',
      metadata: {
        channel,
        incidentId: incident.incidentId,
        bookingId,
        location
      }
    });

    return res.status(201).json({
      incidentId: incident.incidentId,
      channel,
      severity: incident.severity,
      notificationSummary
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to trigger SOS' });
  }
});

router.get('/incidents', authenticate, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 25, 1), 200);
    const minScore = Math.min(Math.max(Number(req.query?.minScore) || 0, 0), 100);
    const status = req.query?.status;
    const severity = req.query?.severity;

    const query = {
      riskScore: { $gte: minScore }
    };

    if (status) query.status = status;
    if (severity) query.severity = severity;

    const incidents = await SecurityIncident.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      count: incidents.length,
      incidents
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch incidents' });
  }
});

router.get('/pulse', authenticate, requireAdmin, async (req, res) => {
  try {
    const since = new Date(Date.now() - (24 * 60 * 60 * 1000));

    const [summaryRows, eventRows, criticalOpenCount] = await Promise.all([
      SecurityIncident.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$severity',
            count: { $sum: 1 },
            maxScore: { $max: '$riskScore' }
          }
        }
      ]),
      SecurityIncident.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ]),
      SecurityIncident.countDocuments({
        createdAt: { $gte: since },
        severity: 'critical',
        status: { $in: ['open', 'investigating'] }
      })
    ]);

    return res.status(200).json({
      windowHours: 24,
      criticalOpenCount,
      severitySummary: summaryRows,
      topEventTypes: eventRows
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch pulse metrics' });
  }
});

router.patch('/incidents/:incidentId', authenticate, requireAdmin, async (req, res) => {
  try {
    const incidentId = req.params.incidentId;
    const nextStatus = req.body?.status;
    const note = String(req.body?.note || '').trim();

    const allowedStatus = new Set(['open', 'investigating', 'mitigated', 'false_positive']);
    if (nextStatus && !allowedStatus.has(nextStatus)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const user = getUserContext(req);

    const update = {};
    if (nextStatus) {
      update.status = nextStatus;
    }

    const timelineEntry = {
      action: 'status_updated',
      note: note || `Status changed to ${nextStatus || 'open'}`,
      actorId: user.id || undefined,
      createdAt: new Date()
    };

    const incident = await SecurityIncident.findOneAndUpdate(
      { incidentId },
      {
        $set: update,
        $push: { timeline: timelineEntry }
      },
      { new: true }
    ).lean();

    if (!incident) {
      return res.status(404).json({ message: 'Incident not found' });
    }

    return res.status(200).json({
      message: 'Incident updated',
      incident
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update incident' });
  }
});

module.exports = router;


