const crypto = require('crypto');
const https = require('https');
const env = require('../config/env');
const { getClientIp } = require('../utils/device');

const recaptchaReplayMap = new Map();
const PLACEHOLDER_SECRET_PATTERNS = [
  'replace_with',
  'your_recaptcha',
  'changeme',
  'example',
  'dummy',
  'test_only'
];
const PSEUDO_RECAPTCHA_REGEX = /^gir[-_][a-z0-9._-]{18,}$/i;

function hashValue(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function pruneRecaptchaReplayMap() {
  const ts = Date.now();
  for (const [key, value] of recaptchaReplayMap.entries()) {
    if (!value || !value.expiresAt || ts >= value.expiresAt) {
      recaptchaReplayMap.delete(key);
    }
  }
}

function isPlaceholderSecret(secretValue) {
  const normalized = String(secretValue || '').trim().toLowerCase();
  if (!normalized) return true;
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function extractHostFromUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return String(parsed.hostname || '').trim().toLowerCase();
  } catch (_error) {
    return '';
  }
}

function isLocalHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]';
}

function buildTrustedPseudoRecaptchaHosts() {
  const hosts = new Set();
  const fromEnv = [
    env.corsOrigin,
    ...(Array.isArray(env.securityAllowedOrigins) ? env.securityAllowedOrigins : []),
    ...(Array.isArray(env.recaptchaPseudoTrustedOrigins) ? env.recaptchaPseudoTrustedOrigins : [])
  ];
  fromEnv.forEach((origin) => {
    const host = extractHostFromUrl(origin);
    if (host) hosts.add(host);
  });
  hosts.add('goindiaride.in');
  hosts.add('www.goindiaride.in');
  hosts.add('goindiaride.onrender.com');
  return hosts;
}

const trustedPseudoRecaptchaHosts = buildTrustedPseudoRecaptchaHosts();

function looksLikePseudoRecaptchaToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return false;
  return PSEUDO_RECAPTCHA_REGEX.test(normalized);
}

function isTrustedPseudoRecaptchaRequest(req) {
  const candidates = [];
  const origin = String(req?.headers?.origin || '').trim();
  const referer = String(req?.headers?.referer || '').trim();
  const hostHeader = String(req?.headers?.host || '').trim();

  if (origin) candidates.push(origin);
  if (referer) candidates.push(referer);
  if (hostHeader) {
    const protoHeader = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    const proto = protoHeader === 'http' || protoHeader === 'https' ? protoHeader : 'https';
    candidates.push(`${proto}://${hostHeader}`);
  }

  for (const value of candidates) {
    const host = extractHostFromUrl(value);
    if (!host) continue;
    if (trustedPseudoRecaptchaHosts.has(host)) return true;
    if (process.env.NODE_ENV !== 'production' && isLocalHost(host)) return true;
  }

  return false;
}

function verifyRecaptchaToken(token, remoteIp, timeoutMs) {
  const secret = String(env.recaptchaSecret || '').trim();
  if (!secret) {
    return Promise.resolve({ ok: false, reason: 'missing_secret' });
  }

  const payload = new URLSearchParams({
    secret,
    response: String(token || ''),
    remoteip: String(remoteIp || '')
  }).toString();

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'www.google.com',
      path: '/recaptcha/api/siteverify',
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(payload)
      },
      timeout: Math.max(1000, Number(timeoutMs || env.recaptchaVerifyTimeoutMs || 3500))
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += String(chunk || '');
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw || '{}');
          resolve({
            ok: Boolean(parsed.success),
            score: Number(parsed.score),
            action: String(parsed.action || ''),
            challengeTs: String(parsed.challenge_ts || ''),
            errorCodes: Array.isArray(parsed['error-codes']) ? parsed['error-codes'] : []
          });
        } catch (_error) {
          resolve({ ok: false, reason: 'invalid_response' });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, reason: 'timeout' });
    });
    req.on('error', () => {
      resolve({ ok: false, reason: 'network_error' });
    });
    req.write(payload);
    req.end();
  });
}

function honeypotCheck(req, res, next) {
  if (req.body && req.body.website) {
    return res.status(400).json({ message: 'Bot detected' });
  }
  return next();
}

function submissionTimingCheck(req, res, next) {
  const submittedAt = Number(req.body?.submittedAt || 0);
  if (submittedAt && Date.now() - submittedAt < 800) {
    return res.status(429).json({ message: 'Submission too fast, suspected automation' });
  }
  return next();
}

async function recaptchaPresenceCheck(req, res, next) {
  try {
    const tokenRaw = req.body?.recaptchaToken || req.headers['x-recaptcha-token'];
    const token = String(tokenRaw || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'reCAPTCHA token required' });
    }

    if (token.length < 20 || token.length > 5000) {
      return res.status(400).json({ message: 'Invalid reCAPTCHA token format' });
    }

    pruneRecaptchaReplayMap();
    const tokenHash = hashValue(token);
    if (recaptchaReplayMap.has(tokenHash)) {
      return res.status(409).json({ message: 'reCAPTCHA token replay detected' });
    }

    const recaptchaSecret = String(env.recaptchaSecret || '').trim();
    const hasUsableSecret = Boolean(recaptchaSecret) && !isPlaceholderSecret(recaptchaSecret);

    if (env.recaptchaAllowPseudoTokens &&
      looksLikePseudoRecaptchaToken(token) &&
      isTrustedPseudoRecaptchaRequest(req)) {
      recaptchaReplayMap.set(tokenHash, { expiresAt: Date.now() + (5 * 60 * 1000), pseudo: true });
      return next();
    }

    if (!env.recaptchaVerifyServerSide || !hasUsableSecret) {
      recaptchaReplayMap.set(tokenHash, { expiresAt: Date.now() + (5 * 60 * 1000) });
      return next();
    }

    if (!env.recaptchaSecret) {
      if (env.recaptchaFailOpen) {
        return next();
      }
      return res.status(503).json({ message: 'reCAPTCHA verifier unavailable' });
    }

    const verify = await verifyRecaptchaToken(
      token,
      getClientIp(req),
      env.recaptchaVerifyTimeoutMs
    );

    if (!verify.ok) {
      if (env.recaptchaFailOpen) {
        return next();
      }
      return res.status(403).json({ message: 'reCAPTCHA verification failed' });
    }

    if (Number.isFinite(verify.score) && verify.score < env.recaptchaMinScore) {
      return res.status(403).json({ message: 'reCAPTCHA score too low' });
    }

    recaptchaReplayMap.set(tokenHash, {
      expiresAt: Date.now() + (10 * 60 * 1000),
      score: Number.isFinite(verify.score) ? verify.score : null
    });
    return next();
  } catch (_error) {
    if (env.recaptchaFailOpen) {
      return next();
    }
    return res.status(500).json({ message: 'reCAPTCHA validation error' });
  }
}

module.exports = {
  honeypotCheck,
  submissionTimingCheck,
  recaptchaPresenceCheck
};
