const env = require('../config/env');
const { ALLOW_HEADER_VALUE } = require('../middleware/apiSecurityHeadersMiddleware');

const PHASE3_SECURITY_HARDENING_VERSION = 'goindiaride_security_hardening_phase3_v1';
const SECURITY_POLICY_VERSION = '2026-06-13-security-phase3';

function enabled(value) {
  return value === true;
}

function pass(id, label, evidence) {
  return {
    id,
    label,
    status: 'pass',
    evidence
  };
}

function warn(id, label, evidence) {
  return {
    id,
    label,
    status: 'warning',
    evidence
  };
}

function getSecurityHardeningStatus() {
  const checks = [
    enabled(env.strictSecurityMode)
      ? pass('strict_csrf', 'Strict CSRF shield enabled', 'Mutating browser requests require CSRF validation unless bearer-only API auth is used.')
      : warn('strict_csrf', 'Strict CSRF shield disabled', 'Set STRICT_SECURITY_MODE=true for production.'),
    enabled(env.securityGatewayEnabled)
      ? pass('api_gateway_limits', 'API gateway limits enabled', `URL ${env.securityGatewayMaxUrlLength}, body depth ${env.securityGatewayMaxBodyDepth}, keys ${env.securityGatewayMaxBodyKeys}, string ${env.securityGatewayMaxStringLength}.`)
      : warn('api_gateway_limits', 'API gateway limits disabled', 'Set SECURITY_GATEWAY_ENABLED=true for production.'),
    enabled(env.securityGatewayRequireKnownContentType)
      ? pass('content_type_allowlist', 'Mutating API content-type allowlist enabled', 'Unknown payload content types are blocked before protected route handlers.')
      : warn('content_type_allowlist', 'Content-type allowlist disabled', 'Set SECURITY_GATEWAY_REQUIRE_KNOWN_CONTENT_TYPE=true.'),
    Number(env.maxJsonBodyKb) > 0 && Number(env.maxJsonBodyKb) <= 512
      ? pass('body_size_limit', 'JSON body size limit configured', `MAX_JSON_BODY_KB=${env.maxJsonBodyKb}.`)
      : warn('body_size_limit', 'JSON body size limit needs review', `MAX_JSON_BODY_KB=${env.maxJsonBodyKb}.`),
    enabled(env.globalLockdownShieldEnabled)
      ? pass('global_lockdown', 'Global lockdown shield enabled', 'Admin-controlled lockdown can block API traffic during incidents.')
      : warn('global_lockdown', 'Global lockdown shield disabled', 'Set GLOBAL_LOCKDOWN_SHIELD_ENABLED=true.'),
    enabled(env.authAbuseShieldEnabled) && enabled(env.authAbusePersistentEnabled)
      ? pass('auth_abuse_shields', 'Authentication abuse shields enabled', 'Login, persistent abuse, credential stuffing and replay controls are mounted on /api/auth.')
      : warn('auth_abuse_shields', 'Authentication abuse shields need review', 'Enable AUTH_ABUSE_SHIELD and AUTH_ABUSE_PERSISTENT controls.'),
    enabled(env.idempotencyShieldEnabled)
      ? pass('idempotency', 'Idempotency enforcement enabled', 'High-risk payment, booking and admin writes require replay-safe request keys.')
      : warn('idempotency', 'Idempotency enforcement disabled', 'Set IDEMPOTENCY_SHIELD_ENABLED=true.'),
    enabled(env.adminAuditChainEnabled)
      ? pass('admin_audit_chain', 'Admin audit chain enabled', 'Admin and security reads/writes can be integrity chained for investigation.')
      : warn('admin_audit_chain', 'Admin audit chain disabled', 'Set ADMIN_AUDIT_CHAIN_ENABLED=true.')
  ];

  const warningCount = checks.filter((item) => item.status !== 'pass').length;

  return {
    ok: true,
    active: true,
    version: PHASE3_SECURITY_HARDENING_VERSION,
    policyVersion: SECURITY_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'phase3-production-security-audit-and-hardening',
    productionReady: warningCount === 0,
    warningCount,
    standards: [
      'OWASP REST Security Cheat Sheet',
      'OWASP HTTP Security Response Headers Cheat Sheet',
      'OWASP API Security Top 10 2023',
      'Express production security best practices'
    ],
    endpoints: {
      publicHealth: '/health/security-hardening',
      adminStatus: '/api/security/hardening/status',
      csrfToken: '/api/security/csrf-token',
      incidentQueue: '/api/security/incidents',
      shieldSnapshots: '/api/security/shield/*'
    },
    controls: {
      httpsRedirect: 'production_http_redirect_to_https',
      hsts: 'max-age=31536000; includeSubDomains; preload',
      methodAllowlist: ALLOW_HEADER_VALUE,
      contentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      apiCachePolicy: 'no-store',
      permissionsPolicy: 'high-risk browser features disabled for API responses',
      corsAllowlist: [
        env.corsOrigin,
        'https://goindiaride.in',
        'https://www.goindiaride.in',
        'https://goindiaride.onrender.com'
      ],
      requestLimits: {
        maxJsonBodyKb: env.maxJsonBodyKb,
        maxUrlLength: env.securityGatewayMaxUrlLength,
        maxHeaderCount: env.securityGatewayMaxHeaderCount,
        maxBodyDepth: env.securityGatewayMaxBodyDepth,
        maxBodyKeys: env.securityGatewayMaxBodyKeys,
        maxArrayLength: env.securityGatewayMaxArrayLength,
        maxStringLength: env.securityGatewayMaxStringLength
      },
      rateLimits: {
        globalApiWindow: '15m',
        globalApiMax: 200,
        loginWindow: '15m',
        loginMax: 5,
        otpWindow: '15m',
        otpMax: 3
      },
      authHardening: {
        jwtAlgorithm: 'HS256 allowlisted',
        tokenRevocation: enabled(env.accessTokenRevocationEnabled),
        refreshReplayShield: enabled(env.refreshTokenReplayShieldEnabled),
        credentialStuffingShield: enabled(env.credentialStuffingShieldEnabled),
        stepUpAuthShield: enabled(env.stepUpAuthShieldEnabled)
      },
      auditAndMonitoring: {
        securityIncidents: 'gateway, auth, token, role and admin events write SecurityIncident records',
        adminAuditChain: enabled(env.adminAuditChainEnabled),
        behaviorEvents: 'high-risk user actions are tracked for anomaly detection'
      },
      dependencyAudit: {
        command: 'npm --prefix backend audit --omit=dev',
        policy: 'Run before production deploys and after dependency changes.'
      }
    },
    checks
  };
}

module.exports = {
  PHASE3_SECURITY_HARDENING_VERSION,
  SECURITY_POLICY_VERSION,
  getSecurityHardeningStatus
};
