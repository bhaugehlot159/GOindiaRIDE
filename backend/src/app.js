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
const admin2faRoutes = require('./routes/admin2faRoutes');
const securityRoutes = require('./routes/securityRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const walletRoutes = require('./routes/walletRoutes');
const futureRuntimeRoutes = require('./routes/futureRuntimeRoutes');
const futureBusinessRoutes = require('./routes/futureBusinessRoutes');
const { globalLimiter } = require('./middleware/rateLimiters');
const { globalAbuseDefenseMiddleware } = require('./middleware/globalAbuseDefenseMiddleware');
const { authPersistentAbuseShieldMiddleware } = require('./middleware/authPersistentAbuseShieldMiddleware');
const { authAbuseShieldMiddleware } = require('./middleware/authAbuseShieldMiddleware');
const { denylistEnforcementMiddleware } = require('./middleware/denylistEnforcementMiddleware');
const { idempotencyEnforcementMiddleware } = require('./middleware/idempotencyEnforcementMiddleware');
const { securityControlPlaneShieldMiddleware } = require('./middleware/securityControlPlaneShieldMiddleware');
const { requestThreatShieldMiddleware } = require('./middleware/requestThreatShieldMiddleware');
const { apiSecurityHeadersMiddleware } = require('./middleware/apiSecurityHeadersMiddleware');
const { csrfShieldMiddleware, issueCsrfToken } = require('./middleware/csrfShieldMiddleware');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

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

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

const allowedOrigins = new Set([
  env.corsOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Array.isArray(env.securityAllowedOrigins) ? env.securityAllowedOrigins : [])
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS blocked by security policy'));
  },
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'X-CSRF-Token',
    'X-XSRF-Token',
    'X-Request-Id',
    'X-Timestamp',
    'X-Signature',
    'X-OTP-Verified',
    'X-Recaptcha-Token',
    'X-Idempotency-Key'
  ],
  exposedHeaders: ['X-Request-Id', 'X-CSRF-Token'],
  credentials: true,
  maxAge: 600
}));

app.use(express.json({ limit: `${env.maxJsonBodyKb}kb` }));
app.use(express.urlencoded({ extended: false, limit: `${env.maxJsonBodyKb}kb` }));

app.get('/health', (req, res) => {
  return res.status(200).json({ status: 'ok', security: 'hardened' });
});

app.use('/api', globalAbuseDefenseMiddleware({
  enabled: env.securityGatewayEnabled,
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
app.use('/api', denylistEnforcementMiddleware({
  enabled: env.denylistShieldEnabled,
  failOpen: env.denylistShieldFailOpen,
  cacheTtlMs: env.denylistShieldCacheTtlMs,
  protectedPrefixes: env.denylistShieldProtectedPrefixes
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

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', admin2faRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/future-runtime', futureRuntimeRoutes);
app.use('/api/future-runtime-business', futureBusinessRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

