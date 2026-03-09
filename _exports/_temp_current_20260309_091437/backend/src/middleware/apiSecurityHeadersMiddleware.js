const crypto = require('crypto');

function isHttpsRequest(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure === true || forwardedProto === 'https';
}

function buildRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function isSensitivePath(pathname) {
  const path = String(pathname || '');
  return path.startsWith('/api/auth') || path.startsWith('/api/admin') || path.startsWith('/api/security');
}

function apiSecurityHeadersMiddleware() {
  return (req, res, next) => {
    const requestId = String(req.headers['x-request-id'] || buildRequestId());

    req.securityContext = {
      ...(req.securityContext || {}),
      requestId
    };

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    if (isHttpsRequest(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    if (isSensitivePath(req.originalUrl)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    return next();
  };
}

module.exports = {
  apiSecurityHeadersMiddleware
};
