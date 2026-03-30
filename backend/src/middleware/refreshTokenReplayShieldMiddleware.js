const { inspectRefreshTokenReplay } = require('../services/refreshTokenReplayShieldService');

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function normalizeCsv(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
  }

  return String(input || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getRequestPath(req) {
  return String(req.path || req.url || '').trim().toLowerCase();
}

function resolveRefreshToken(req) {
  return String(
    req.cookies?.refreshToken
      || req.body?.refreshToken
      || req.headers['x-refresh-token']
      || ''
  ).trim();
}

function buildOptions(input = {}) {
  return {
    enabled: normalizeBoolean(input.enabled, true),
    failOpen: normalizeBoolean(input.failOpen, false),
    protectedPaths: normalizeCsv(input.protectedPaths).length
      ? normalizeCsv(input.protectedPaths)
      : ['/refresh', '/refresh-token', '/refresh-token-v2', '/refresh-secure']
  };
}

function isProtectedRefreshRoute(req, options) {
  if (String(req.method || '').toUpperCase() !== 'POST') {
    return false;
  }
  const targetPath = getRequestPath(req);
  return options.protectedPaths.some((prefix) => targetPath.startsWith(prefix));
}

function refreshTokenReplayShieldMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return async function refreshTokenReplayShield(req, res, next) {
    if (!options.enabled || !isProtectedRefreshRoute(req, options)) {
      return next();
    }

    try {
      const refreshToken = resolveRefreshToken(req);
      if (!refreshToken) {
        return next();
      }

      const replayState = await inspectRefreshTokenReplay({
        token: refreshToken,
        req
      });

      if (!replayState || replayState.ok === false) {
        return res.status(403).json({
          message: 'Refresh token blocked by replay shield',
          reason: String(replayState?.reason || 'refresh_token_replay_detected')
        });
      }

      return next();
    } catch (_error) {
      if (options.failOpen) {
        return next();
      }
      return res.status(503).json({ message: 'Refresh token replay shield unavailable' });
    }
  };
}

module.exports = {
  refreshTokenReplayShieldMiddleware
};
