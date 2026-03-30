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
  apiSignatureSecret: process.env.API_SIGNATURE_SECRET || process.env.JWT_SECRET,
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
  securityControlPlaneShieldEnabled: String(process.env.SECURITY_CONTROL_PLANE_SHIELD_ENABLED || 'true').toLowerCase() === 'true',
  securityControlPlaneStrictSignature: String(process.env.SECURITY_CONTROL_PLANE_STRICT_SIGNATURE || 'true').toLowerCase() === 'true',
  securityControlPlaneEnforceAdminIp: String(process.env.SECURITY_CONTROL_PLANE_ENFORCE_ADMIN_IP || 'true').toLowerCase() === 'true',
  securityControlPlaneCriticalRateLimitEnabled: String(process.env.SECURITY_CONTROL_PLANE_CRITICAL_RATE_LIMIT_ENABLED || 'true').toLowerCase() === 'true',
  securityControlPlaneFailOpen: String(process.env.SECURITY_CONTROL_PLANE_FAIL_OPEN || 'false').toLowerCase() === 'true',
  securityControlPlaneProtectedPrefixes: splitCsv(process.env.SECURITY_CONTROL_PLANE_PROTECTED_PREFIXES || '/api/security/incidents,/api/security/shield,/api/security/runtime/security,/api/security/policy'),
  idempotencyShieldEnabled: String(process.env.IDEMPOTENCY_SHIELD_ENABLED || 'true').toLowerCase() === 'true',
  idempotencyShieldRequireHeader: String(process.env.IDEMPOTENCY_SHIELD_REQUIRE_HEADER || 'true').toLowerCase() === 'true',
  idempotencyShieldStrictPayloadMatch: String(process.env.IDEMPOTENCY_SHIELD_STRICT_PAYLOAD_MATCH || 'true').toLowerCase() === 'true',
  idempotencyShieldFailOpen: String(process.env.IDEMPOTENCY_SHIELD_FAIL_OPEN || 'false').toLowerCase() === 'true',
  idempotencyShieldMinKeyLength: Number(process.env.IDEMPOTENCY_SHIELD_MIN_KEY_LENGTH || 16),
  idempotencyShieldMaxKeyLength: Number(process.env.IDEMPOTENCY_SHIELD_MAX_KEY_LENGTH || 128),
  idempotencyShieldTtlMs: Number(process.env.IDEMPOTENCY_SHIELD_TTL_MS || 24 * 60 * 60 * 1000),
  idempotencyShieldProcessingTtlMs: Number(process.env.IDEMPOTENCY_SHIELD_PROCESSING_TTL_MS || 2 * 60 * 1000),
  idempotencyShieldProtectedPrefixes: splitCsv(process.env.IDEMPOTENCY_SHIELD_PROTECTED_PREFIXES || '/api/wallet,/api/wallets,/api/bookings,/api/security/shield,/api/security/runtime/security,/api/security/incidents,/api/security/policy'),
  denylistShieldEnabled: String(process.env.DENYLIST_SHIELD_ENABLED || 'true').toLowerCase() === 'true',
  denylistShieldFailOpen: String(process.env.DENYLIST_SHIELD_FAIL_OPEN || 'false').toLowerCase() === 'true',
  denylistShieldCacheTtlMs: Number(process.env.DENYLIST_SHIELD_CACHE_TTL_MS || 5000),
  denylistDefaultDurationMs: Number(process.env.DENYLIST_DEFAULT_DURATION_MS || 0),
  denylistShieldProtectedPrefixes: splitCsv(process.env.DENYLIST_SHIELD_PROTECTED_PREFIXES || '/api/auth,/api/wallet,/api/wallets,/api/bookings,/api/security,/api/admin'),
  adminAuditChainEnabled: String(process.env.ADMIN_AUDIT_CHAIN_ENABLED || 'true').toLowerCase() === 'true',
  adminAuditChainSecret: process.env.ADMIN_AUDIT_CHAIN_SECRET || process.env.JWT_SECRET,
  adminAuditChainTrackReadOps: String(process.env.ADMIN_AUDIT_CHAIN_TRACK_READ_OPS || 'false').toLowerCase() === 'true',
  adminAuditChainTrackPrefixes: splitCsv(process.env.ADMIN_AUDIT_CHAIN_TRACK_PREFIXES || '/api/security,/api/admin'),
  adminAuditChainMaxVerifyLimit: Number(process.env.ADMIN_AUDIT_CHAIN_MAX_VERIFY_LIMIT || 10000),
  accessTokenRevocationEnabled: String(process.env.ACCESS_TOKEN_REVOCATION_ENABLED || 'true').toLowerCase() === 'true',
  accessTokenCutoffEnabled: String(process.env.ACCESS_TOKEN_CUTOFF_ENABLED || 'true').toLowerCase() === 'true',
  accessTokenRevocationFailOpen: String(process.env.ACCESS_TOKEN_REVOCATION_FAIL_OPEN || 'false').toLowerCase() === 'true',
  accessTokenRevocationDefaultTtlMs: Number(process.env.ACCESS_TOKEN_REVOCATION_DEFAULT_TTL_MS || 24 * 60 * 60 * 1000),
  csrfCookieName: String(process.env.CSRF_COOKIE_NAME || 'gir_csrf_token'),
  csrfTokenTtlMinutes: Number(process.env.CSRF_TOKEN_TTL_MINUTES || 720),

  securityGatewayEnabled: String(process.env.SECURITY_GATEWAY_ENABLED || 'true').toLowerCase() === 'true',
  securityGatewayMaxUrlLength: Number(process.env.SECURITY_GATEWAY_MAX_URL_LENGTH || 2048),
  securityGatewayMaxHeaderCount: Number(process.env.SECURITY_GATEWAY_MAX_HEADER_COUNT || 120),
  securityGatewayMaxBodyDepth: Number(process.env.SECURITY_GATEWAY_MAX_BODY_DEPTH || 10),
  securityGatewayMaxBodyKeys: Number(process.env.SECURITY_GATEWAY_MAX_BODY_KEYS || 800),
  securityGatewayMaxArrayLength: Number(process.env.SECURITY_GATEWAY_MAX_ARRAY_LENGTH || 5000),
  securityGatewayMaxStringLength: Number(process.env.SECURITY_GATEWAY_MAX_STRING_LENGTH || 10000),
  securityGatewayRequireKnownContentType: String(process.env.SECURITY_GATEWAY_REQUIRE_KNOWN_CONTENT_TYPE || 'true').toLowerCase() === 'true',
  securityGatewayPrincipalFailWindowMs: Number(process.env.SECURITY_GATEWAY_PRINCIPAL_FAIL_WINDOW_MS || 10 * 60 * 1000),
  securityGatewayPrincipalFailMax: Number(process.env.SECURITY_GATEWAY_PRINCIPAL_FAIL_MAX || 15),
  securityGatewayPrincipalBlockMs: Number(process.env.SECURITY_GATEWAY_PRINCIPAL_BLOCK_MS || 30 * 60 * 1000),
  securityGatewayPrincipalBlockMaxMs: Number(process.env.SECURITY_GATEWAY_PRINCIPAL_BLOCK_MAX_MS || 24 * 60 * 60 * 1000),
  securityGatewayPrincipalEscalationFactor: Number(process.env.SECURITY_GATEWAY_PRINCIPAL_ESCALATION_FACTOR || 2),

  recaptchaVerifyServerSide: String(process.env.RECAPTCHA_VERIFY_SERVER_SIDE || 'true').toLowerCase() === 'true',
  recaptchaFailOpen: String(process.env.RECAPTCHA_FAIL_OPEN || 'false').toLowerCase() === 'true',
  recaptchaMinScore: Number(process.env.RECAPTCHA_MIN_SCORE || 0.5),

  authAbuseShieldEnabled: String(process.env.AUTH_ABUSE_SHIELD_ENABLED || 'true').toLowerCase() === 'true',
  authAbusePersistentEnabled: String(process.env.AUTH_ABUSE_PERSISTENT_ENABLED || 'true').toLowerCase() === 'true',
  authAbusePersistentFailOpen: String(process.env.AUTH_ABUSE_PERSISTENT_FAIL_OPEN || 'true').toLowerCase() === 'true',
  authAbusePersistentRetentionMs: Number(process.env.AUTH_ABUSE_PERSISTENT_RETENTION_MS || 14 * 24 * 60 * 60 * 1000),
  authAbuseFailWindowMs: Number(process.env.AUTH_ABUSE_FAIL_WINDOW_MS || 15 * 60 * 1000),
  authAbusePrincipalFailMax: Number(process.env.AUTH_ABUSE_PRINCIPAL_FAIL_MAX || 8),
  authAbuseIpFailMax: Number(process.env.AUTH_ABUSE_IP_FAIL_MAX || 25),
  authAbuseBlockMs: Number(process.env.AUTH_ABUSE_BLOCK_MS || 30 * 60 * 1000),
  authAbuseBlockMaxMs: Number(process.env.AUTH_ABUSE_BLOCK_MAX_MS || 24 * 60 * 60 * 1000),
  authAbuseEscalationFactor: Number(process.env.AUTH_ABUSE_ESCALATION_FACTOR || 2),
  authAbuseResetOnSuccess: String(process.env.AUTH_ABUSE_RESET_ON_SUCCESS || 'true').toLowerCase() === 'true',
  authAbuseTrackPaths: splitCsv(process.env.AUTH_ABUSE_TRACK_PATHS),
  recaptchaVerifyTimeoutMs: Number(process.env.RECAPTCHA_VERIFY_TIMEOUT_MS || 3500)
};
