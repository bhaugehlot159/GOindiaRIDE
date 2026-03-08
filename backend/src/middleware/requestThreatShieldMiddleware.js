const SecurityIncident = require('../models/SecurityIncident');
const { getClientIp, getDeviceMeta, getCountry } = require('../utils/device');
const { evaluateAiThreat, applyAutoResponse } = require('../services/aiSecurityDetectiveService');

const ipVelocityMap = new Map();
const ipTemporaryBlockMap = new Map();

const PAYLOAD_PATTERNS = [
  /<\s*script/gi,
  /javascript:/gi,
  /onerror\s*=/gi,
  /onload\s*=/gi,
  /union\s+select/gi,
  /drop\s+table/gi,
  /\bor\b\s+1\s*=\s*1/gi,
  /\$where/gi,
  /<\s*iframe/gi
];

const AUTOMATION_USER_AGENTS = [
  'sqlmap',
  'nikto',
  'nmap',
  'acunetix',
  'dirbuster',
  'masscan',
  'hydra',
  'curl/',
  'wget/',
  'python-requests',
  'httpclient'
];

function nowTs() {
  return Date.now();
}

function pruneMaps() {
  const ts = nowTs();

  for (const [key, bucket] of ipVelocityMap.entries()) {
    if (ts - bucket.updatedAt > 10 * 60 * 1000) {
      ipVelocityMap.delete(key);
    }
  }

  for (const [ip, blockedUntil] of ipTemporaryBlockMap.entries()) {
    if (ts >= blockedUntil) {
      ipTemporaryBlockMap.delete(ip);
    }
  }
}

function recordVelocity(ip, pathKey) {
  const key = `${ip}::${pathKey}`;
  const ts = nowTs();
  const bucket = ipVelocityMap.get(key) || {
    hits: [],
    updatedAt: ts
  };

  bucket.hits.push(ts);
  bucket.hits = bucket.hits.filter((item) => ts - item <= 60 * 1000);
  bucket.updatedAt = ts;

  ipVelocityMap.set(key, bucket);
  return bucket.hits.length;
}

function countPatternMatches(payloadString) {
  if (!payloadString) return 0;

  return PAYLOAD_PATTERNS.reduce((acc, pattern) => {
    const matches = payloadString.match(pattern);
    return acc + (matches ? matches.length : 0);
  }, 0);
}

function scoreUserAgent(userAgentRaw) {
  const ua = String(userAgentRaw || '').toLowerCase();
  if (!ua) return 8;

  const found = AUTOMATION_USER_AGENTS.filter((needle) => ua.includes(needle));
  if (!found.length) return 0;

  return Math.min(30, found.length * 10);
}

function buildPayloadString(req) {
  const body = req.body && typeof req.body === 'object' ? JSON.stringify(req.body).slice(0, 4000) : '';
  const query = req.query && typeof req.query === 'object' ? JSON.stringify(req.query).slice(0, 1500) : '';
  return `${body}\n${query}`;
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

async function recordIncident({
  req,
  score,
  severity,
  recommendedAction,
  evidence,
  autoResponse,
  reason
}) {
  const ip = getClientIp(req);
  const country = getCountry(req);
  const device = getDeviceMeta(req);
  const authUser = req.user || req.auth || {};

  await SecurityIncident.create({
    source: 'gateway',
    eventType: 'request_threat_probe',
    userId: authUser.id || authUser.sub || authUser._id || null,
    email: authUser.email || null,
    ip,
    city: req.headers['x-city'] || country || 'unknown',
    deviceFingerprint: device.fingerprint,
    riskScore: score,
    severity,
    recommendedAction: recommendedAction || reason || 'monitor_realtime',
    autoResponse: autoResponse || { action: 'logged_only', applied: false, note: '' },
    signals: {
      velocityHitsPerMinute: evidence.velocityHits,
      suspiciousPatternCount: evidence.patternMatchCount,
      method: req.method,
      path: req.originalUrl,
      userAgentScore: evidence.userAgentScore,
      threatShield: true
    },
    metadata: {
      reason,
      userAgent: req.headers['user-agent'] || '',
      referer: req.headers.referer || '',
      origin: req.headers.origin || '',
      hasAuthorization: Boolean(req.headers.authorization)
    },
    timeline: [
      {
        action: 'gateway_incident_captured',
        note: reason || 'Request threat shield triggered',
        actorId: authUser.id || authUser.sub || authUser._id || undefined
      }
    ]
  });
}

function requestThreatShieldMiddleware(options = {}) {
  const autoBlockScore = Number(options.autoBlockScore || process.env.REQUEST_AUTO_BLOCK_SCORE || 85);
  const incidentScore = Number(options.incidentScore || process.env.REQUEST_INCIDENT_SCORE || 55);

  return async function requestThreatShield(req, res, next) {
    try {
      pruneMaps();

      const ip = getClientIp(req);
      if (ip && ipTemporaryBlockMap.has(ip)) {
        const blockedUntil = ipTemporaryBlockMap.get(ip);
        if (Date.now() < blockedUntil) {
          return res.status(429).json({
            message: 'Traffic temporarily blocked by AI security shield',
            blockedUntil: new Date(blockedUntil).toISOString()
          });
        }
        ipTemporaryBlockMap.delete(ip);
      }

      const pathKey = (req.baseUrl || '') + (req.path || '');
      const velocityHits = recordVelocity(ip || 'unknown_ip', pathKey || 'unknown_path');

      const userAgentScore = scoreUserAgent(req.headers['user-agent']);
      const payloadString = buildPayloadString(req);
      const patternMatchCount = countPatternMatches(payloadString);

      let manualRiskBoost = 0;
      if (velocityHits >= 80) manualRiskBoost += 25;
      else if (velocityHits >= 45) manualRiskBoost += 16;
      else if (velocityHits >= 25) manualRiskBoost += 8;

      if (patternMatchCount >= 4) manualRiskBoost += 45;
      else if (patternMatchCount >= 2) manualRiskBoost += 30;
      else if (patternMatchCount >= 1) manualRiskBoost += 18;

      manualRiskBoost += userAgentScore;

      const aiScoreResult = await evaluateAiThreat({
        userId: (req.user && (req.user.id || req.user.sub || req.user._id)) || null,
        email: (req.user && req.user.email) || null,
        ip,
        city: req.headers['x-city'] || 'unknown',
        deviceFingerprint: req.headers['x-device-fingerprint'] || null,
        eventType: 'auth_failure',
        metadata: {
          manualRiskBoost,
          velocityHits,
          patternMatchCount,
          userAgentScore,
          requestPath: req.originalUrl,
          requestMethod: req.method
        }
      });

      req.aiShieldScore = aiScoreResult.score;

      const evidence = {
        velocityHits,
        patternMatchCount,
        userAgentScore
      };

      if (aiScoreResult.score >= autoBlockScore) {
        if (ip) {
          ipTemporaryBlockMap.set(ip, Date.now() + (10 * 60 * 1000));
        }

        const authUserId = req.user && (req.user.id || req.user.sub || req.user._id);
        const autoResponse = await applyAutoResponse({ userId: authUserId || null, score: aiScoreResult.score });

        await recordIncident({
          req,
          score: aiScoreResult.score,
          severity: severityFromScore(aiScoreResult.score),
          recommendedAction: 'gateway_auto_block',
          evidence,
          autoResponse,
          reason: 'High-risk probe blocked by request threat shield'
        });

        return res.status(403).json({
          message: 'Request blocked by AI threat shield',
          riskScore: aiScoreResult.score
        });
      }

      if (aiScoreResult.score >= incidentScore) {
        await recordIncident({
          req,
          score: aiScoreResult.score,
          severity: severityFromScore(aiScoreResult.score),
          recommendedAction: 'monitor_realtime',
          evidence,
          reason: 'Suspicious request allowed under enhanced monitoring'
        });
      }

      return next();
    } catch (error) {
      return next();
    }
  };
}

module.exports = {
  requestThreatShieldMiddleware
};
