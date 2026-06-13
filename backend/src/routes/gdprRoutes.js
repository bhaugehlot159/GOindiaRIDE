const express = require('express');

const auth = require('../middleware/authMiddleware');
const { getClientIp } = require('../utils/device');
const {
  getGdprComplianceStatus,
  buildDataSubjectExport,
  getSubjectPrivacyStatus,
  createGdprRequest,
  updateConsentPreferences,
  listGdprRequests,
  updateGdprRequestStatus,
  REQUEST_TYPES,
  CONSENT_TYPES
} = require('../services/gdprComplianceService');

const authenticate = auth.authenticate || auth;
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

function sendError(res, error, fallbackMessage) {
  return res.status(error.statusCode || 500).json({
    message: error.message || fallbackMessage
  });
}

router.get('/compliance/status', (req, res) => {
  return res.status(200).json(getGdprComplianceStatus());
});

router.get('/status', authenticate, async (req, res) => {
  try {
    const user = getUserContext(req);
    const status = await getSubjectPrivacyStatus({ userId: user.id });
    return res.status(200).json(status);
  } catch (error) {
    return sendError(res, error, 'Unable to fetch GDPR privacy status');
  }
});

router.get('/export', authenticate, async (req, res) => {
  try {
    const user = getUserContext(req);
    const payload = await buildDataSubjectExport({ userId: user.id, portability: false });
    res.setHeader('Content-Disposition', 'attachment; filename="goindiaride-data-export.json"');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 'Unable to build GDPR data export');
  }
});

router.get('/portability', authenticate, async (req, res) => {
  try {
    const user = getUserContext(req);
    const payload = await buildDataSubjectExport({ userId: user.id, portability: true });
    res.setHeader('Content-Disposition', 'attachment; filename="goindiaride-portable-data.json"');
    return res.status(200).json(payload);
  } catch (error) {
    return sendError(res, error, 'Unable to build GDPR portability export');
  }
});

router.get('/requests', authenticate, async (req, res) => {
  try {
    const user = getUserContext(req);
    const status = await getSubjectPrivacyStatus({ userId: user.id });
    return res.status(200).json({
      ok: true,
      requests: status.recentRequests
    });
  } catch (error) {
    return sendError(res, error, 'Unable to fetch GDPR requests');
  }
});

router.post('/requests', authenticate, async (req, res) => {
  try {
    const user = getUserContext(req);
    const requestType = String(req.body?.requestType || '').trim().toLowerCase();

    if (!REQUEST_TYPES.includes(requestType)) {
      return res.status(400).json({
        message: 'requestType must be one of access, rectification, erasure, restriction, objection, portability or consent_withdrawal'
      });
    }

    const result = await createGdprRequest({
      userId: user.id,
      requestType,
      details: req.body?.details || {},
      channel: req.body?.channel || 'self_service',
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    return res.status(201).json(result);
  } catch (error) {
    return sendError(res, error, 'Unable to create GDPR request');
  }
});

router.get('/consent', authenticate, async (req, res) => {
  try {
    const user = getUserContext(req);
    const status = await getSubjectPrivacyStatus({ userId: user.id });
    return res.status(200).json({
      ok: true,
      consentTypes: CONSENT_TYPES,
      preferences: status.preferences
    });
  } catch (error) {
    return sendError(res, error, 'Unable to fetch consent preferences');
  }
});

router.patch('/consent', authenticate, async (req, res) => {
  try {
    const user = getUserContext(req);
    const preferences = req.body?.preferences || req.body || {};
    const result = await updateConsentPreferences({
      userId: user.id,
      preferences,
      source: req.body?.source || 'self_service',
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Unable to update consent preferences');
  }
});

router.get('/admin/requests', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await listGdprRequests({
      status: String(req.query?.status || '').trim().toLowerCase(),
      requestType: String(req.query?.requestType || '').trim().toLowerCase(),
      userId: String(req.query?.userId || '').trim(),
      limit: Number(req.query?.limit || 100)
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Unable to fetch GDPR admin request queue');
  }
});

router.patch('/admin/requests/:requestId', authenticate, requireAdmin, async (req, res) => {
  try {
    const actor = getUserContext(req);
    const result = await updateGdprRequestStatus({
      requestId: req.params.requestId,
      status: String(req.body?.status || '').trim().toLowerCase(),
      note: req.body?.note || '',
      actorId: actor.id || actor.email || 'admin'
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Unable to update GDPR request status');
  }
});

module.exports = router;
