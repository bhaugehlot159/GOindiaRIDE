const crypto = require('crypto');
const SecurityIncident = require('../models/SecurityIncident');
const AttackPatternQuarantineRecord = require('../models/AttackPatternQuarantineRecord');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');

const SHA256_REGEX = /^[a-f0-9]{64}$/i;

const ATTACK_FAMILY_PATTERNS = {
  sqli: [
    /\bunion\b[\s\S]{0,20}\bselect\b/i,
    /\binformation_schema\b/i,
    /\b(?:or|and)\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
    /\bsleep\s*\(/i,
    /\bbenchmark\s*\(/i,
    /\bdrop\s+table\b/i
  ],
  xss: [
    /<\s*script\b/i,
    /javascript:/i,
    /onerror\s*=/i,
    /onload\s*=/i,
    /<\s*svg\b/i,
    /<\s*iframe\b/i
  ],
  traversal: [
    /\.\.\//i,
    /\.\.\\/i,
    /%2e%2e%2f/i,
    /%2e%2e\\/i,
    /\/etc\/passwd/i,
    /windows\\system32/i
  ],
  rce: [
    /\$\{jndi:/i,
    /\bcmd\.exe\b/i,
    /\bpowershell\b[\s\S]{0,20}-enc/i,
    /;\s*(?:wget|curl)\b/i,
    /\b(?:bash|sh)\s+-c\b/i
  ],
  nosql: [
    /\$where/i,
    /\$ne/i,
    /\$gt/i,
    /\$regex/i
  ]
};

function nowTs() {
  return Date.now();
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCsv(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return String(input || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isSha256(value) {
  return SHA256_REGEX.test(String(value || ''));
}

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice('::ffff:'.length);
  }
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) {
    ip = match[1];
  }
  return ip;
}

function getTargetPath(req) {
  return String(req.originalUrl || req.url || '')
    .split('?')[0]
    .trim()
    .toLowerCase();
}

function resolvePathGroup(path) {
  const normalized = String(path || '').trim().toLowerCase();
  if (!normalized) return '/unknown';
  if (normalized.startsWith('/api/auth')) return '/api/auth';
  if (normalized.startsWith('/api/wallets')) return '/api/wallets';
  if (normalized.startsWith('/api/wallet')) return '/api/wallet';
  if (normalized.startsWith('/api/bookings')) return '/api/bookings';
  if (normalized.startsWith('/api/security')) return '/api/security';
  if (normalized.startsWith('/api/admin')) return '/api/admin';
  if (normalized.startsWith('/api/users')) return '/api/users';
  const parts = normalized.split('/').filter(Boolean).slice(0, 2);
  return `/${parts.join('/') || 'unknown'}`;
}

function shouldProtectPath(path, options) {
  const normalized = String(path || '').trim().toLowerCase();
  if (!normalized) return false;
  return options.protectedPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function buildRequestBlob(req) {
  const path = String(req.originalUrl || req.url || '');
  const query = req.query && typeof req.query === 'object' ? JSON.stringify(req.query).slice(0, 6000) : '';
  const body = req.body && typeof req.body === 'object' ? JSON.stringify(req.body).slice(0, 12000) : '';
  const headers = JSON.stringify({
    'user-agent': req.headers['user-agent'] || '',
    referer: req.headers.referer || '',
    origin: req.headers.origin || '',
    'x-forwarded-host': req.headers['x-forwarded-host'] || '',
    'x-real-ip': req.headers['x-real-ip'] || ''
  }).slice(0, 4000);

  return `${path}\n${query}\n${body}\n${headers}`;
}

function analyzeAttackPatterns(req) {
  const blob = buildRequestBlob(req);
  const matchedFamilies = [];
  const familyHits = {};
  let totalMatches = 0;

  Object.entries(ATTACK_FAMILY_PATTERNS).forEach(([family, patterns]) => {
    let hits = 0;
    for (let i = 0; i < patterns.length; i += 1) {
      const pattern = patterns[i];
      const found = blob.match(pattern);
      if (found && found.length) {
        hits += found.length;
      }
    }
    if (hits > 0) {
      matchedFamilies.push(family);
      familyHits[family] = hits;
      totalMatches += hits;
    }
  });

  const suspicious = matchedFamilies.length > 0;
  return {
    suspicious,
    matchedFamilies,
    familyHits,
    totalMatches
  };
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function buildOptions(input = {}) {
  const prefixes = normalizeCsv(input.protectedPrefixes)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  return {
    enabled: normalizeBoolean(input.enabled, true),
    failOpen: normalizeBoolean(input.failOpen, false),
    failWindowMs: normalizeNumber(input.failWindowMs, 15 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    hitMax: normalizeNumber(input.hitMax, 4, 1, 1000),
    quarantineMs: normalizeNumber(input.quarantineMs, 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(input.quarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(input.escalationFactor, 2, 1, 5),
    recordTtlMs: normalizeNumber(input.recordTtlMs, 7 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 60 * 24 * 60 * 60 * 1000),
    protectedPrefixes: prefixes.length
      ? prefixes
      : ['/api/auth', '/api/wallet', '/api/wallets', '/api/bookings', '/api/security', '/api/admin']
  };
}

function computeQuarantineMs(options, escalationLevel) {
  return Math.min(
    options.quarantineMaxMs,
    Math.round(options.quarantineMs * Math.pow(options.escalationFactor, Math.max(0, escalationLevel - 1)))
  );
}

function computeExpiry(options, quarantinedUntilMs = 0) {
  const ts = nowTs();
  const additional = quarantinedUntilMs > ts ? quarantinedUntilMs - ts : 0;
  return new Date(ts + Math.max(options.recordTtlMs, additional + options.recordTtlMs));
}

async function recordAttackIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'attack_pattern_quarantine_shield',
      userId: authUser.id || authUser.sub || authUser._id || null,
      email: authUser.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 82,
      severity: severityFromScore(payload.riskScore || 82),
      recommendedAction: payload.recommendedAction || 'block_request',
      autoResponse: {
        action: payload.action || 'block_request',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'attack_pattern_quarantine_triggered',
          note: payload.note || 'Attack pattern quarantine shield triggered'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function createRecordKey(ipHash, fingerprintHash, pathGroup) {
  return hashValue(`${ipHash}|${fingerprintHash}|${pathGroup}`);
}

async function getAttackPatternQuarantineSnapshot(options = {}) {
  const includeReleased = Boolean(options.includeReleased);
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 2000));
  const pathGroup = String(options.pathGroup || '').trim().toLowerCase();
  const query = {};
  if (!includeReleased) {
    query.status = { $ne: 'released' };
  }
  if (pathGroup) {
    query.pathGroup = pathGroup;
  }

  const rows = await AttackPatternQuarantineRecord.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    activeQuarantineCount: rows.filter((item) => {
      const qMs = item.quarantinedUntil ? new Date(item.quarantinedUntil).getTime() : 0;
      return qMs > nowTs() && item.status !== 'released';
    }).length,
    items: rows.map((item) => ({
      id: String(item._id || ''),
      keyHash: String(item.keyHash || ''),
      pathGroup: String(item.pathGroup || ''),
      status: String(item.status || ''),
      hitCount: Number(item.hitCount || 0),
      escalationLevel: Number(item.escalationLevel || 0),
      quarantinedUntil: item.quarantinedUntil ? new Date(item.quarantinedUntil).toISOString() : null,
      patternFamilies: Array.isArray(item.patternFamilies) ? item.patternFamilies : [],
      patternCount: Number(item.patternCount || 0),
      lastPath: String(item.lastPath || ''),
      lastMethod: String(item.lastMethod || ''),
      lastReason: String(item.lastReason || ''),
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString() : null
    }))
  };
}

async function releaseAttackPatternQuarantineRecords(payload = {}) {
  const clearAll = Boolean(payload.clearAll);
  const id = String(payload.id || '').trim();
  const keyHash = String(payload.keyHash || '').trim().toLowerCase();
  const pathGroup = String(payload.pathGroup || '').trim().toLowerCase();

  const query = {};
  if (!clearAll) {
    if (id) query._id = id;
    if (keyHash && isSha256(keyHash)) query.keyHash = keyHash;
    if (pathGroup) query.pathGroup = pathGroup;
  }

  const result = await AttackPatternQuarantineRecord.updateMany(
    clearAll ? {} : query,
    {
      $set: {
        status: 'released',
        quarantinedUntil: null,
        lastReason: clearAll ? 'manual_release_all' : 'manual_release'
      }
    }
  );

  return {
    clearAll,
    matchedCount: Number(result?.matchedCount || 0),
    updatedCount: Number(result?.modifiedCount || 0)
  };
}

function attackPatternQuarantineShieldMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return async (req, res, next) => {
    if (!options.enabled) {
      return next();
    }

    const path = getTargetPath(req);
    if (!shouldProtectPath(path, options)) {
      return next();
    }

    const ip = normalizeIp(getClientIp(req) || 'unknown');
    const fingerprint = String((req.headers['x-device-fingerprint'] || getDeviceMeta(req).fingerprint || '')).trim().toLowerCase() || 'unknown';
    const ipHash = hashValue(ip);
    const fingerprintHash = hashValue(fingerprint);
    const pathGroup = resolvePathGroup(path);
    const keyHash = createRecordKey(ipHash, fingerprintHash, pathGroup);
    const user = req.user || req.auth || {};
    const userId = String(user.id || user.sub || user._id || '').trim();

    try {
      const existing = await AttackPatternQuarantineRecord.findOne({ keyHash }).lean();
      const now = nowTs();
      const activeQuarantineMs = existing?.quarantinedUntil ? new Date(existing.quarantinedUntil).getTime() : 0;
      if (existing && existing.status !== 'released' && activeQuarantineMs > now) {
        return res.status(403).json({
          message: 'Request blocked by attack quarantine shield',
          quarantinedUntil: new Date(activeQuarantineMs).toISOString(),
          pathGroup
        });
      }

      const analysis = analyzeAttackPatterns(req);
      if (!analysis.suspicious) {
        return next();
      }

      const nowDate = new Date(now);
      const previousWindowMs = existing?.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
      const windowExpired = !previousWindowMs || (now - previousWindowMs) > options.failWindowMs;
      let hitCount = windowExpired ? 1 : Number(existing?.hitCount || 0) + 1;
      let escalationLevel = Number(existing?.escalationLevel || 0);
      let quarantinedUntil = null;
      let quarantineApplied = false;

      if (hitCount >= options.hitMax) {
        escalationLevel += 1;
        const durationMs = computeQuarantineMs(options, escalationLevel);
        quarantinedUntil = new Date(now + durationMs);
        quarantineApplied = true;
        hitCount = 0;
      }

      await AttackPatternQuarantineRecord.updateOne(
        { keyHash },
        {
          $set: {
            ipHash,
            fingerprintHash,
            pathGroup,
            status: 'active',
            lastSeenAt: nowDate,
            windowStartAt: windowExpired ? nowDate : (existing?.windowStartAt ? new Date(existing.windowStartAt) : nowDate),
            hitCount,
            escalationLevel,
            quarantinedUntil,
            lastPath: path,
            lastMethod: String(req.method || '').toUpperCase(),
            lastReason: quarantineApplied ? 'pattern_quarantine_applied' : 'pattern_probe_blocked',
            lastIp: ip,
            lastUserId: userId,
            patternFamilies: analysis.matchedFamilies,
            patternCount: analysis.totalMatches,
            metadata: {
              familyHits: analysis.familyHits
            },
            expiresAt: computeExpiry(options, quarantinedUntil ? quarantinedUntil.getTime() : 0)
          },
          $setOnInsert: {
            firstSeenAt: nowDate
          }
        },
        { upsert: true }
      );

      await recordAttackIncident(req, {
        eventType: quarantineApplied ? 'attack_pattern_quarantine_applied' : 'attack_pattern_probe_blocked',
        riskScore: quarantineApplied ? 93 : 84,
        recommendedAction: quarantineApplied ? 'temporary_quarantine' : 'block_request',
        action: quarantineApplied ? 'temporary_quarantine' : 'block_request',
        note: quarantineApplied ? 'Attack pattern threshold exceeded and quarantine applied' : 'Attack pattern request blocked',
        signals: {
          path,
          method: req.method,
          familyCount: analysis.matchedFamilies.length,
          patternCount: analysis.totalMatches,
          familyHits: analysis.familyHits,
          pathGroup
        },
        metadata: {
          keyHash,
          hitCount,
          escalationLevel,
          quarantineApplied,
          quarantinedUntil: quarantinedUntil ? quarantinedUntil.toISOString() : null
        }
      });

      return res.status(403).json({
        message: 'Request blocked by attack pattern shield',
        quarantineApplied,
        pathGroup,
        quarantinedUntil: quarantinedUntil ? quarantinedUntil.toISOString() : null
      });
    } catch (_error) {
      if (options.failOpen) {
        return next();
      }
      return res.status(503).json({ message: 'Attack pattern shield unavailable' });
    }
  };
}

module.exports = {
  attackPatternQuarantineShieldMiddleware,
  getAttackPatternQuarantineSnapshot,
  releaseAttackPatternQuarantineRecords,
  isAttackPatternQuarantineSha256: isSha256
};
