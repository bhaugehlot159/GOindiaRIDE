const crypto = require('crypto');
const {
  resolveCredentialStuffingOptions,
  shouldTrackCredentialStuffingPath,
  resolveCredentialStuffingPathGroup,
  getCredentialStuffingBlockState,
  registerCredentialStuffingFailure
} = require('../services/credentialStuffingShieldService');
const { getClientIp } = require('../utils/device');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) ip = match[1];
  return ip;
}

function isMutatingMethod(method) {
  return !SAFE_METHODS.has(String(method || '').toUpperCase());
}

function getTargetPath(req) {
  const baseUrl = String(req.baseUrl || '').trim();
  const path = String(req.path || '').trim();
  return `${baseUrl}${path}`.toLowerCase();
}

function resolveIpHash(req) {
  const ip = normalizeIp(getClientIp(req) || '');
  return hashValue(ip || 'unknown_ip');
}

function credentialStuffingShieldMiddleware(userOptions = {}) {
  const options = {
    ...resolveCredentialStuffingOptions(),
    ...(userOptions || {})
  };

  return async (req, res, next) => {
    if (!options.enabled) {
      return next();
    }

    if (!isMutatingMethod(req.method)) {
      return next();
    }

    const targetPath = getTargetPath(req);
    if (!shouldTrackCredentialStuffingPath(targetPath, options)) {
      return next();
    }

    const ipHash = resolveIpHash(req);
    const pathGroup = resolveCredentialStuffingPathGroup(targetPath);

    try {
      const blockState = await getCredentialStuffingBlockState({ ipHash, pathGroup });
      if (blockState.blocked) {
        return res.status(429).json({
          message: 'Auth request blocked by credential stuffing shield',
          blockedUntil: blockState.quarantineUntil || null,
          remainingMs: Number(blockState.remainingMs || 0)
        });
      }
    } catch (_error) {
      if (!options.failOpen) {
        return res.status(503).json({ message: 'Credential stuffing shield unavailable' });
      }
    }

    res.on('finish', () => {
      const statusCode = Number(res.statusCode || 200);
      const isFailure = statusCode >= 400 && statusCode < 500;
      if (!isFailure) return;

      Promise.resolve(registerCredentialStuffingFailure({
        req,
        path: targetPath,
        statusCode,
        reason: `http_${statusCode}`
      })).catch(() => {});
    });

    return next();
  };
}

module.exports = {
  credentialStuffingShieldMiddleware
};
