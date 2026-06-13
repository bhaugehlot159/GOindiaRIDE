const crypto = require('crypto');

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOW_HEADER_VALUE = Array.from(ALLOWED_METHODS).join(', ');

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

function isApiPath(pathname) {
  return String(pathname || '').startsWith('/api/');
}

function apiSecurityHeadersMiddleware() {
  return (req, res, next) => {
    const method = String(req.method || 'GET').toUpperCase();
    const requestId = String(req.headers['x-request-id'] || buildRequestId());

    req.securityContext = {
      ...(req.securityContext || {}),
      requestId
    };

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

    if (!ALLOWED_METHODS.has(method)) {
      res.setHeader('Allow', ALLOW_HEADER_VALUE);
      return res.status(405).json({
        message: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED'
      });
    }

    if (isHttpsRequest(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    if (isApiPath(req.originalUrl)) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
      );
      res.setHeader('Cache-Control', 'no-store');
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
  apiSecurityHeadersMiddleware,
  ALLOWED_METHODS,
  ALLOW_HEADER_VALUE
};
