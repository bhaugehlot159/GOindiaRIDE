const xss = require('xss-clean');
const cookieParser = require('cookie-parser');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');

const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminFeatureControlRoutes = require('./routes/adminFeatureControlRoutes');
const admin2faRoutes = require('./routes/admin2faRoutes');
const securityRoutes = require('./routes/securityRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const walletRoutes = require('./routes/walletRoutes');
const liveTrackingRoutes = require('./routes/liveTrackingRoutes');
const gdprRoutes = require('./routes/gdprRoutes');
const futureRuntimeRoutes = require('./routes/futureRuntimeRoutes');
const futureBusinessRoutes = require('./routes/futureBusinessRoutes');
const { getFraudDetectionStatus } = require('./services/fraudDetectionService');
const { getGdprComplianceStatus } = require('./services/gdprComplianceService');
const { globalLimiter } = require('./middleware/rateLimiters');
const { globalAbuseDefenseMiddleware } = require('./middleware/globalAbuseDefenseMiddleware');
const { globalLockdownShieldMiddleware } = require('./middleware/globalLockdownShieldMiddleware');
const { adminAuditChainMiddleware } = require('./middleware/adminAuditChainMiddleware');
const { attackPatternQuarantineShieldMiddleware } = require('./middleware/attackPatternQuarantineShieldMiddleware');
const { authPersistentAbuseShieldMiddleware } = require('./middleware/authPersistentAbuseShieldMiddleware');
const { authAbuseShieldMiddleware } = require('./middleware/authAbuseShieldMiddleware');
const { credentialStuffingShieldMiddleware } = require('./middleware/credentialStuffingShieldMiddleware');
const { refreshTokenReplayShieldMiddleware } = require('./middleware/refreshTokenReplayShieldMiddleware');
const { routeGuardPolicyShieldMiddleware } = require('./middleware/routeGuardPolicyShieldMiddleware');
const { networkIntelPolicyShieldMiddleware } = require('./middleware/networkIntelPolicyShieldMiddleware');
const { denylistEnforcementMiddleware } = require('./middleware/denylistEnforcementMiddleware');
const { idempotencyEnforcementMiddleware } = require('./middleware/idempotencyEnforcementMiddleware');
const { securityControlPlaneShieldMiddleware } = require('./middleware/securityControlPlaneShieldMiddleware');
const { requestThreatShieldMiddleware } = require('./middleware/requestThreatShieldMiddleware');
const { apiSecurityHeadersMiddleware } = require('./middleware/apiSecurityHeadersMiddleware');
const { csrfShieldMiddleware, issueCsrfToken } = require('./middleware/csrfShieldMiddleware');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');
const logger = require('./utils/logger');

const app = express();

// ============================================================================
// STARTUP VALIDATION: Ensure all critical configuration is present
// ============================================================================
function validateProductionConfiguration() {
  const isProd = process.env.NODE_ENV === 'production';
  
  const criticalVars = {
    'JWT_SECRET': process.env.JWT_SECRET,
    'JWT_REFRESH_SECRET': process.env.JWT_REFRESH_SECRET,
    'MONGO_URI': process.env.MONGO_URI,
    'FIREBASE_API_KEY': process.env.FIREBASE_API_KEY
  };
  
  const missingVars = Object.entries(criticalVars)
    .filter(([name, value]) => !value)
    .map(([name]) => name);
  
  if (missingVars.length > 0) {
    const message = `❌ FATAL: Missing critical environment variables:\n${missingVars.map(v => `   - ${v}`).join('\n')}`;
    logger.error('startup_configuration_invalid', {
      missingVariables: missingVars,
      environment: process.env.NODE_ENV
    });
    
    if (isProd) {
      console.error(`\n${message}\n`);
      console.error('📋 Set these variables before starting:');
      console.error('   export JWT_SECRET=<your-jwt-secret>');
      console.error('   export JWT_REFRESH_SECRET=<your-jwt-refresh-secret>');
      console.error('   export MONGO_URI=<your-mongodb-uri>');
      console.error('   export FIREBASE_API_KEY=<your-firebase-api-key>\n');
      process.exit(1);
    }
  }
  
  // Log sanitized startup info
  logger.info('startup_configuration_valid', {
    environment: process.env.NODE_ENV,
    mongoUri: process.env.MONGO_URI?.substring(0, 30) + '...' || 'NOT_SET',
    jwtSecretSet: !!process.env.JWT_SECRET,
    firebaseKeySet: !!process.env.FIREBASE_API_KEY,
    port: env.port,
    corsOrigin: env.corsOrigin
  });
}

// Run validation when app starts
try {
  validateProductionConfiguration();
} catch (err) {
  logger.error('startup_validation_error', {
    message: err.message,
    environment: process.env.NODE_ENV
  });
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  return next();
});

app.use(cookieParser());
app.use(apiSecurityHeadersMiddleware());

// Meta sends dotted query keys like hub.mode, so this route must run before query sanitizers.
app.get(['/webhook', '/api/webhook'], verifyWhatsAppWebhook);
app.post(
  ['/webhook', '/api/webhook'],
  express.json({ limit: `${env.maxJsonBodyKb}kb` }),
  receiveWhatsAppWebhook
);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

const allowedOrigins = new Set([
  env.corsOrigin,
  'https://goindiaride.in',
  'https://www.goindiaride.in',
  'https://goindiaride.onrender.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Array.isArray(env.securityAllowedOrigins) ? env.securityAllowedOrigins : [])
]);

// SECURITY: WhatsApp webhook token must be configured via environment
// Never use hardcoded tokens - they expose the webhook to unauthorized requests
const whatsappWebhookVerifyToken = String(
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    || process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN
    || ''
).trim();

if (!whatsappWebhookVerifyToken && process.env.NODE_ENV === 'production') {
  logger.warn('security_warning_missing_whatsapp_token', {
    message: 'WhatsApp webhook token not configured. Webhook will reject all requests.',
    environment: 'production',
    recommendation: 'Set WHATSAPP_WEBHOOK_VERIFY_TOKEN environment variable'
  });
}

function verifyWhatsAppWebhook(req, res) {
  const mode = String(req.query['hub.mode'] || '').trim();
  const token = String(req.query['hub.verify_token'] || '').trim();
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === whatsappWebhookVerifyToken && challenge !== undefined) {
    logger.info('whatsapp_webhook_verified', { path: req.path });
    return res.status(200).type('text/plain').send(String(challenge));
  }

  logger.warn('whatsapp_webhook_verification_failed', {
    path: req.path,
    mode,
    hasToken: Boolean(token),
    hasChallenge: challenge !== undefined
  });
  return res.sendStatus(403);
}

function receiveWhatsAppWebhook(req, res) {
  logger.info('whatsapp_webhook_received', {
    path: req.path,
    object: req.body && req.body.object,
    entries: Array.isArray(req.body && req.body.entry) ? req.body.entry.length : 0
  });
  return res.sendStatus(200);
}

const authGatewayBypassPrefixes = ['/api/auth'];
function withApiMountVariants(paths = []) {
  const variants = new Set();
  for (const value of paths) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    variants.add(raw);
    if (raw === '/api') {
      variants.add('/');
      continue;
    }
    if (raw.startsWith('/api/')) {
      variants.add(raw.slice(4));
    }
  }
  return [...variants];
}

const sharedGatewayBypassPaths = withApiMountVariants([
  '/api/bookings/fallback/admin-alert-email',
  '/api/bookings/fallback/admin-review-queue',
  ...authGatewayBypassPrefixes
]);

function removeAuthPrefix(prefixes = []) {
  const list = Array.isArray(prefixes) ? prefixes : [];
  return list.filter((prefix) => String(prefix || '').trim().toLowerCase() !== '/api/auth');
}

const relaxedAttackPatternProtectedPrefixes = removeAuthPrefix(env.attackPatternShieldProtectedPrefixes);
const relaxedNetworkIntelProtectedPrefixes = removeAuthPrefix(env.networkIntelPolicyProtectedPrefixes);
const relaxedDenylistProtectedPrefixes = removeAuthPrefix(env.denylistShieldProtectedPrefixes);
const relaxedGlobalLockdownBypassPrefixes = Array.from(new Set([
  ...(Array.isArray(env.globalLockdownBypassPrefixes) ? env.globalLockdownBypassPrefixes : []),
  ...authGatewayBypassPrefixes
]));
const relaxedRouteGuardBypassPrefixes = Array.from(new Set([
  ...(Array.isArray(env.routeGuardPolicyBypassPrefixes) ? env.routeGuardPolicyBypassPrefixes : []),
  ...authGatewayBypassPrefixes
]));

function isDevLocalOrigin(origin) {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const parsed = new URL(String(origin || ''));
    const host = String(parsed.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch (_error) {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    if (isDevLocalOrigin(origin)) return callback(null, true);
    return callback(new Error('CORS blocked by security policy'));
  },
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'X-CSRF-Token',
    'X-XSRF-Token',
    'X-Booking-Client',
    'X-GoindiaRide-Runtime',
    'X-GoindiaRide-Dashboard-Live',
    'X-GoindiaRide-Live-Runner',
    'X-GoindiaRide-Live-Tracking',
    'X-Request-Id',
    'X-Timestamp',
    'X-Signature',
    'X-OTP-Verified',
    'X-Recaptcha-Token',
    'X-Idempotency-Key',
    'Idempotency-Key',
    'X-Device-Fingerprint',
    'X-Refresh-Token',
  ],
  exposedHeaders: ['X-Request-Id', 'X-CSRF-Token'],
  credentials: true,
  maxAge: 600
}));

app.use(express.json({ limit: `${env.maxJsonBodyKb}kb` }));
app.use(express.urlencoded({ extended: false, limit: `${env.maxJsonBodyKb}kb` }));

app.get('/', (req, res) => {
  return res.status(200).json({
    service: 'GO India RIDE API',
    status: 'ok',
    health: '/health',
    auth: '/api/auth',
    webhook: '/webhook'
  });
});

app.get('/health', (req, res) => {
  return res.status(200).json({ status: 'ok', security: 'hardened' });
});

app.get('/health/fraud-detection', (req, res) => {
  return res.status(200).json(getFraudDetectionStatus());
});

app.get('/health/gdpr-compliance', (req, res) => {
  return res.status(200).json(getGdprComplianceStatus());
});

app.get('/api/auth', (req, res) => {
  return res.status(200).json({
    service: 'GO India RIDE Auth API',
    status: 'ok',
    endpoints: {
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      refresh: 'POST /api/auth/refresh',
      requestOtp: 'POST /api/auth/request-otp'
    }
  });
});

app.use('/api', globalAbuseDefenseMiddleware({
  enabled: env.securityGatewayEnabled,
  bypassPaths: sharedGatewayBypassPaths,
  maxUrlLength: env.securityGatewayMaxUrlLength,
  maxHeaderCount: env.securityGatewayMaxHeaderCount,
  maxBodyDepth: env.securityGatewayMaxBodyDepth,
  maxBodyKeys: env.securityGatewayMaxBodyKeys,
  maxArrayLength: env.securityGatewayMaxArrayLength,
  maxStringLength: env.securityGatewayMaxStringLength,
  requireKnownContentType: env.securityGatewayRequireKnownContentType,
  principalFailWindowMs: env.securityGatewayPrincipalFailWindowMs,
  principalFailMax: env.securityGatewayPrincipalFailMax,
  principalBlockMs: env.securityGatewayPrincipalBlockMs,
  principalBlockMaxMs: env.securityGatewayPrincipalBlockMaxMs,
  principalEscalationFactor: env.securityGatewayPrincipalEscalationFactor
}));
app.use('/api', globalLimiter);
app.use('/api', requestThreatShieldMiddleware({
  autoBlockScore: env.requestAutoBlockScore,
  incidentScore: env.requestIncidentScore
}));
app.use('/api', globalLockdownShieldMiddleware({
  enabled: env.globalLockdownShieldEnabled,
  failOpen: env.globalLockdownFailOpen,
  cacheTtlMs: env.globalLockdownCacheTtlMs,
  logThrottleMs: env.globalLockdownLogThrottleMs,
  bypassPrefixes: relaxedGlobalLockdownBypassPrefixes
}));
app.use('/api', adminAuditChainMiddleware({
  enabled: env.adminAuditChainEnabled,
  trackReadOps: env.adminAuditChainTrackReadOps,
  prefixes: env.adminAuditChainTrackPrefixes
}));
app.use('/api', attackPatternQuarantineShieldMiddleware({
  enabled: env.attackPatternShieldEnabled,
  failOpen: env.attackPatternShieldFailOpen,
  failWindowMs: env.attackPatternShieldFailWindowMs,
  hitMax: env.attackPatternShieldHitMax,
  quarantineMs: env.attackPatternShieldQuarantineMs,
  quarantineMaxMs: env.attackPatternShieldQuarantineMaxMs,
  escalationFactor: env.attackPatternShieldEscalationFactor,
  recordTtlMs: env.attackPatternShieldRecordTtlMs,
  protectedPrefixes: relaxedAttackPatternProtectedPrefixes
}));
app.use('/api', networkIntelPolicyShieldMiddleware({
  enabled: env.networkIntelPolicyShieldEnabled,
  failOpen: env.networkIntelPolicyShieldFailOpen,
  cacheTtlMs: env.networkIntelPolicyCacheTtlMs,
  protectedPrefixes: relaxedNetworkIntelProtectedPrefixes,
  defaultBlockedIpPrefixes: env.networkIntelDefaultBlockedIpPrefixes,
  defaultBlockedAsnHints: env.networkIntelDefaultBlockedAsnHints,
  enforceHostConsistency: env.networkIntelEnforceHostConsistency,
  blockHeaderInjection: env.networkIntelBlockHeaderInjection
}));
app.use('/api', denylistEnforcementMiddleware({
  enabled: env.denylistShieldEnabled,
  failOpen: env.denylistShieldFailOpen,
  cacheTtlMs: env.denylistShieldCacheTtlMs,
  protectedPrefixes: relaxedDenylistProtectedPrefixes
}));
app.use('/api', routeGuardPolicyShieldMiddleware({
  enabled: env.routeGuardPolicyShieldEnabled,
  failOpen: env.routeGuardPolicyShieldFailOpen,
  cacheTtlMs: env.routeGuardPolicyCacheTtlMs,
  bypassPrefixes: relaxedRouteGuardBypassPrefixes
}));
app.use('/api', idempotencyEnforcementMiddleware({
  enabled: env.idempotencyShieldEnabled,
  requireHeader: env.idempotencyShieldRequireHeader,
  strictPayloadMatch: env.idempotencyShieldStrictPayloadMatch,
  failOpen: env.idempotencyShieldFailOpen,
  minKeyLength: env.idempotencyShieldMinKeyLength,
  maxKeyLength: env.idempotencyShieldMaxKeyLength,
  ttlMs: env.idempotencyShieldTtlMs,
  processingTtlMs: env.idempotencyShieldProcessingTtlMs,
  protectedPrefixes: env.idempotencyShieldProtectedPrefixes
}));

const strictCsrfShield = csrfShieldMiddleware({
  strict: env.strictSecurityMode,
  ignorePaths: [
    '/api/bookings/fallback/admin-alert-email',
    '/api/bookings/fallback/admin-review-queue'
  ],
  cookieName: env.csrfCookieName,
  tokenTtlMs: env.csrfTokenTtlMinutes * 60 * 1000
});

app.get('/api/security/csrf-token', (req, res) => {
  const csrfToken = issueCsrfToken(req, res, {
    cookieName: env.csrfCookieName,
    tokenTtlMs: env.csrfTokenTtlMinutes * 60 * 1000
  });

  return res.status(200).json({
    csrfToken,
    ttlMinutes: env.csrfTokenTtlMinutes
  });
});

app.use('/api/admin', strictCsrfShield);
app.use('/api/bookings', strictCsrfShield);
app.use('/api/security', strictCsrfShield);
app.use('/api/security', securityControlPlaneShieldMiddleware({
  enabled: env.securityControlPlaneShieldEnabled,
  strictSignature: env.securityControlPlaneStrictSignature,
  enforceAdminIp: env.securityControlPlaneEnforceAdminIp,
  criticalRateLimitEnabled: env.securityControlPlaneCriticalRateLimitEnabled,
  failOpen: env.securityControlPlaneFailOpen,
  protectedPrefixes: env.securityControlPlaneProtectedPrefixes,
  adminAllowedIps: env.adminAllowedIps
}));
app.use('/api/notifications', strictCsrfShield);
app.use('/api/wallet', strictCsrfShield);
app.use('/api/wallets', strictCsrfShield);
app.use('/api/live-tracking', strictCsrfShield);
app.use('/api/gdpr', strictCsrfShield);
app.use('/api/auth', authPersistentAbuseShieldMiddleware({
  enabled: env.authAbusePersistentEnabled,
  failOpen: env.authAbusePersistentFailOpen,
  retentionMs: env.authAbusePersistentRetentionMs,
  failWindowMs: env.authAbuseFailWindowMs,
  principalFailMax: env.authAbusePrincipalFailMax,
  ipFailMax: env.authAbuseIpFailMax,
  blockMs: env.authAbuseBlockMs,
  blockMaxMs: env.authAbuseBlockMaxMs,
  escalationFactor: env.authAbuseEscalationFactor,
  resetOnSuccess: env.authAbuseResetOnSuccess,
  trackPaths: env.authAbuseTrackPaths
}));
app.use('/api/auth', authAbuseShieldMiddleware({
  enabled: env.authAbuseShieldEnabled,
  failWindowMs: env.authAbuseFailWindowMs,
  principalFailMax: env.authAbusePrincipalFailMax,
  ipFailMax: env.authAbuseIpFailMax,
  blockMs: env.authAbuseBlockMs,
  blockMaxMs: env.authAbuseBlockMaxMs,
  escalationFactor: env.authAbuseEscalationFactor,
  resetOnSuccess: env.authAbuseResetOnSuccess,
  trackPaths: env.authAbuseTrackPaths
}));
app.use('/api/auth', credentialStuffingShieldMiddleware({
  enabled: env.credentialStuffingShieldEnabled,
  failOpen: env.credentialStuffingShieldFailOpen,
  failWindowMs: env.credentialStuffingFailWindowMs,
  failureMax: env.credentialStuffingFailureMax,
  uniquePrincipalMax: env.credentialStuffingUniquePrincipalMax,
  quarantineMs: env.credentialStuffingQuarantineMs,
  quarantineMaxMs: env.credentialStuffingQuarantineMaxMs,
  escalationFactor: env.credentialStuffingEscalationFactor,
  recordTtlMs: env.credentialStuffingRecordTtlMs,
  trackPaths: env.credentialStuffingTrackPaths
}));
app.use('/api/auth', refreshTokenReplayShieldMiddleware({
  enabled: env.refreshTokenReplayShieldEnabled,
  failOpen: env.refreshTokenReplayShieldFailOpen,
  protectedPaths: env.refreshTokenReplayShieldProtectedPaths
}));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/feature-control', adminFeatureControlRoutes);
app.use('/api/admin', admin2faRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/live-tracking', liveTrackingRoutes);
app.use('/api/gdpr', gdprRoutes);
app.use('/api/future-runtime', futureRuntimeRoutes);
app.use('/api/future-runtime-business', futureBusinessRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
