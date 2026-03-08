const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isMutatingMethod(method) {
  return !SAFE_METHODS.has(String(method || '').toUpperCase());
}

function getHostWithoutPort(value) {
  return String(value || '').split(':')[0].trim().toLowerCase();
}

function isSameOriginRequest(req) {
  const originHeader = req.headers.origin;
  if (!originHeader) {
    return true;
  }

  try {
    const originHost = getHostWithoutPort(new URL(originHeader).host);
    const requestHost = getHostWithoutPort(req.headers.host);
    return Boolean(originHost && requestHost && originHost === requestHost);
  } catch (error) {
    return false;
  }
}

function hasBearerToken(req) {
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ');
}

function hasAuthCookies(req) {
  const cookies = req.cookies || {};
  return Boolean(cookies.accessToken || cookies.refreshToken || cookies.rt);
}

function pathMatches(pathValue, patterns = []) {
  const path = String(pathValue || '');
  return patterns.some((item) => {
    if (!item) return false;
    if (item instanceof RegExp) return item.test(path);
    return path.startsWith(String(item));
  });
}

function issueCsrfToken(req, res, options = {}) {
  const cookieName = options.cookieName || 'gir_csrf_token';
  const tokenTtlMs = Number(options.tokenTtlMs || 12 * 60 * 60 * 1000);

  const cookieToken = req.cookies && req.cookies[cookieName];
  if (cookieToken) {
    res.setHeader('x-csrf-token', cookieToken);
    return cookieToken;
  }

  const token = createToken();
  res.cookie(cookieName, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    maxAge: tokenTtlMs
  });

  res.setHeader('x-csrf-token', token);
  return token;
}

function csrfShieldMiddleware(options = {}) {
  const {
    strict = true,
    ignorePaths = [],
    cookieName = 'gir_csrf_token',
    tokenTtlMs = 12 * 60 * 60 * 1000
  } = options;

  return (req, res, next) => {
    const token = issueCsrfToken(req, res, { cookieName, tokenTtlMs });

    if (!isMutatingMethod(req.method)) {
      return next();
    }

    if (pathMatches(req.originalUrl, ignorePaths)) {
      return next();
    }

    const bearerWithoutCookies = hasBearerToken(req) && !hasAuthCookies(req);
    if (bearerWithoutCookies) {
      return next();
    }

    const headerToken = String(req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || '');
    const validToken = Boolean(headerToken) && headerToken === token;

    if (validToken) {
      return next();
    }

    const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    const crossSite = fetchSite === 'cross-site' || !isSameOriginRequest(req);

    if (!strict && !crossSite) {
      req.securityContext = {
        ...(req.securityContext || {}),
        csrfBypass: true
      };
      return next();
    }

    if (!crossSite && !strict) {
      return next();
    }

    if (!crossSite && strict) {
      req.securityContext = {
        ...(req.securityContext || {}),
        csrfMissingToken: true
      };
      return next();
    }

    return res.status(403).json({
      message: 'CSRF shield blocked this request',
      code: 'CSRF_VALIDATION_FAILED'
    });
  };
}

module.exports = {
  csrfShieldMiddleware,
  issueCsrfToken
};
