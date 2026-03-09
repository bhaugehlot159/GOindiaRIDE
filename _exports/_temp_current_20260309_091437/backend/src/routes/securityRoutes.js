const express = require('express');

const auth = require('../middleware/authMiddleware');
const authenticate = auth.authenticate || auth;
const SecurityIncident = require('../models/SecurityIncident');
const { getClientIp } = require('../utils/device');
const { trackBehaviorEvent } = require('../services/behaviorService');
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
