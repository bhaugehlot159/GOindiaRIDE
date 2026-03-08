const dotenv = require('dotenv');

dotenv.config();

const requiredEnv = ['MONGO_URI', 'JWT_SECRET', 'FIREBASE_KEY'];
requiredEnv.forEach((name) => {
  if (!process.env[name]) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }
});

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
  firebaseKey: process.env.FIREBASE_KEY,
  recaptchaSecret: process.env.RECAPTCHA_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || 'https://goindiaride.in',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || '30d',
  adminAllowedIps: splitCsv(process.env.ADMIN_ALLOWED_IPS),
  admin2FASecret: process.env.ADMIN_2FA_SECRET,

  strictSecurityMode: String(process.env.STRICT_SECURITY_MODE || 'true').toLowerCase() === 'true',
  maxJsonBodyKb: Number(process.env.MAX_JSON_BODY_KB || 128),
  requestAutoBlockScore: Number(process.env.REQUEST_AUTO_BLOCK_SCORE || 85),
  requestIncidentScore: Number(process.env.REQUEST_INCIDENT_SCORE || 55),
  securityAllowedOrigins: splitCsv(process.env.SECURITY_ALLOWED_ORIGINS),
  csrfCookieName: String(process.env.CSRF_COOKIE_NAME || 'gir_csrf_token'),
  csrfTokenTtlMinutes: Number(process.env.CSRF_TOKEN_TTL_MINUTES || 720)
};
