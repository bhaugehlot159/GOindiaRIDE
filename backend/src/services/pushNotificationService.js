const crypto = require('crypto');
const mongoose = require('mongoose');

const Notification = require('../models/Notification');
const PushRuntimeConfig = require('../models/PushRuntimeConfig');
const PushSubscription = require('../models/PushSubscription');
const { mirrorNotificationRealtimeUpdate } = require('./firebaseRealtimeDatabaseService');

const PHASE4_PUSH_NOTIFICATION_VERSION = 'goindiaride_push_notifications_phase4_v1';
const PUSH_POLICY_VERSION = '2026-06-13-push-engagement-v1';
const DEFAULT_VAPID_SUBJECT = 'mailto:support@goindiaride.in';
const MAX_PUSH_PAYLOAD_BYTES = 3200;
const MAX_BROADCAST_SUBSCRIPTIONS = 5000;

let webPushClient = null;
let inMemoryVapidKeys = null;

function getWebPushClient() {
  if (webPushClient) {
    return webPushClient;
  }

  // Lazy load keeps app startup resilient in test and diagnostic contexts.
  // eslint-disable-next-line global-require
  webPushClient = require('web-push');
  return webPushClient;
}

function isMongoReady() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function safeText(value, maxLength = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeAudience(value) {
  const audience = String(value || '').toLowerCase().trim();
  if (audience === 'admin' || audience === 'driver' || audience === 'customer') {
    return audience;
  }
  return 'customer';
}

function getAudienceScope(user = {}) {
  if (user.role === 'admin' || user.accountType === 'admin') {
    return 'admin';
  }

  if (user.accountType === 'driver') {
    return 'driver';
  }

  return 'customer';
}

function endpointHash(endpoint) {
  return crypto
    .createHash('sha256')
    .update(String(endpoint || ''), 'utf8')
    .digest('hex');
}

function redactSubscription(subscription) {
  if (!subscription) {
    return null;
  }

  return {
    id: String(subscription._id || ''),
    userId: subscription.userId ? String(subscription.userId) : null,
    audience: subscription.audience,
    endpointHash: subscription.endpointHash,
    status: subscription.status,
    failureCount: subscription.failureCount || 0,
    lastSuccessAt: subscription.lastSuccessAt || null,
    lastFailureAt: subscription.lastFailureAt || null,
    expirationTime: subscription.expirationTime || null,
    consentSource: subscription.consentSource || 'browser_permission',
    createdAt: subscription.createdAt || null,
    updatedAt: subscription.updatedAt || null
  };
}

function sanitizePushSubscription(input = {}) {
  const subscription = input.subscription && typeof input.subscription === 'object'
    ? input.subscription
    : input;

  const endpoint = safeText(subscription.endpoint, 2048);
  const keys = subscription.keys && typeof subscription.keys === 'object' ? subscription.keys : {};
  const p256dh = safeText(keys.p256dh, 512);
  const auth = safeText(keys.auth, 256);
  const expirationTime = subscription.expirationTime ? new Date(subscription.expirationTime) : null;

  if (!endpoint || !/^https:\/\/.+/i.test(endpoint)) {
    const error = new Error('A valid HTTPS push endpoint is required');
    error.statusCode = 400;
    throw error;
  }

  if (!p256dh || !auth) {
    const error = new Error('Push subscription encryption keys are required');
    error.statusCode = 400;
    throw error;
  }

  return {
    endpoint,
    endpointHash: endpointHash(endpoint),
    keys: { p256dh, auth },
    expirationTime: expirationTime && !Number.isNaN(expirationTime.getTime()) ? expirationTime : null
  };
}

function getEnvironmentVapidKeys() {
  const publicKey = safeText(process.env.VAPID_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY || '', 500);
  const privateKey = safeText(process.env.VAPID_PRIVATE_KEY || process.env.WEB_PUSH_PRIVATE_KEY || '', 500);
  const subject = safeText(process.env.VAPID_SUBJECT || process.env.WEB_PUSH_SUBJECT || DEFAULT_VAPID_SUBJECT, 240);

  if (publicKey && privateKey) {
    return {
      publicKey,
      privateKey,
      subject,
      source: 'environment'
    };
  }

  return null;
}

async function getApplicationServerKeys() {
  const envKeys = getEnvironmentVapidKeys();
  if (envKeys) {
    return envKeys;
  }

  const subject = safeText(process.env.VAPID_SUBJECT || process.env.WEB_PUSH_SUBJECT || DEFAULT_VAPID_SUBJECT, 240);

  if (isMongoReady()) {
    const existing = await PushRuntimeConfig
      .findOne({ key: 'vapid' })
      .select('+privateKey')
      .lean();

    if (existing && existing.publicKey && existing.privateKey) {
      return {
        publicKey: existing.publicKey,
        privateKey: existing.privateKey,
        subject: existing.subject || subject,
        source: 'database_auto_provision'
      };
    }

    const generated = getWebPushClient().generateVAPIDKeys();
    try {
      const created = await PushRuntimeConfig.create({
        key: 'vapid',
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
        subject,
        source: 'database_auto_provision'
      });
      return {
        publicKey: created.publicKey,
        privateKey: generated.privateKey,
        subject,
        source: 'database_auto_provision'
      };
    } catch (error) {
      if (error && error.code === 11000) {
        const raced = await PushRuntimeConfig
          .findOne({ key: 'vapid' })
          .select('+privateKey')
          .lean();
        if (raced && raced.publicKey && raced.privateKey) {
          return {
            publicKey: raced.publicKey,
            privateKey: raced.privateKey,
            subject: raced.subject || subject,
            source: 'database_auto_provision'
          };
        }
      }
      throw error;
    }
  }

  if (!inMemoryVapidKeys) {
    inMemoryVapidKeys = {
      ...getWebPushClient().generateVAPIDKeys(),
      subject,
      source: 'memory_auto_provision'
    };
  }

  return inMemoryVapidKeys;
}

async function getPushPublicKeyConfig() {
  const keys = await getApplicationServerKeys();
  return {
    ok: true,
    active: true,
    version: PHASE4_PUSH_NOTIFICATION_VERSION,
    publicKey: keys.publicKey,
    applicationServerKey: keys.publicKey,
    source: keys.source,
    policyVersion: PUSH_POLICY_VERSION
  };
}

function getPushNotificationStatus() {
  const envKeys = getEnvironmentVapidKeys();
  let webPushAvailable = true;

  try {
    getWebPushClient();
  } catch (_error) {
    webPushAvailable = false;
  }

  return {
    ok: webPushAvailable,
    active: webPushAvailable,
    productionReady: webPushAvailable,
    version: PHASE4_PUSH_NOTIFICATION_VERSION,
    mode: 'phase4-production-push-notifications',
    policyVersion: PUSH_POLICY_VERSION,
    standards: [
      'W3C Push API',
      'Notifications API',
      'ServiceWorkerRegistration.showNotification',
      'VAPID authenticated Web Push'
    ],
    controls: {
      browserPermission: 'user_gesture_required',
      serviceWorkerPushHandler: 'active',
      serviceWorkerClickHandler: 'active',
      subscriptionStorage: 'active',
      endpointRedaction: 'active',
      encryptedDelivery: webPushAvailable ? 'active' : 'missing_web_push_dependency',
      inAppFallback: 'active',
      csrfProtection: 'strict_csrf_with_bearer_subscription'
    },
    delivery: {
      provider: 'web-push',
      webPushAvailable,
      vapidSource: envKeys ? 'environment' : 'database_auto_provision',
      privateKeyExposed: false,
      maxPayloadBytes: MAX_PUSH_PAYLOAD_BYTES,
      broadcastLimit: MAX_BROADCAST_SUBSCRIPTIONS
    },
    endpoints: {
      publicHealth: '/health/push-notifications',
      publicKey: '/api/notifications/push/public-key',
      subscribe: 'POST /api/notifications/push/subscribe',
      unsubscribe: 'POST /api/notifications/push/unsubscribe',
      listSubscriptions: 'GET /api/notifications/push/subscriptions',
      test: 'POST /api/notifications/push/test',
      adminBroadcast: 'POST /api/notifications/admin/push/broadcast'
    },
    warningCount: webPushAvailable ? 0 : 1
  };
}

function buildPushPayload(input = {}) {
  const title = safeText(input.title || 'GOindiaRIDE update', 80) || 'GOindiaRIDE update';
  const body = safeText(input.body || input.message || 'Your ride update is ready.', 220);
  const url = safeText(input.url || input.link || '/', 500) || '/';
  const tag = safeText(input.tag || input.type || 'goindiaride-update', 64) || 'goindiaride-update';
  const payload = {
    title,
    body,
    icon: safeText(input.icon || '/icons/icon-192.png', 240),
    badge: safeText(input.badge || '/icons/icon-192.png', 240),
    tag,
    requireInteraction: Boolean(input.requireInteraction),
    data: {
      ...(input.data && typeof input.data === 'object' ? input.data : {}),
      url,
      type: safeText(input.type || 'engagement', 80),
      notificationId: safeText(input.notificationId || '', 80),
      policyVersion: PUSH_POLICY_VERSION
    }
  };

  let serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PUSH_PAYLOAD_BYTES) {
    payload.body = payload.body.slice(0, 140);
    serialized = JSON.stringify(payload);
  }

  return { payload, serialized };
}

async function savePushSubscription({ user, subscription, userAgent = '', ipAddress = '', consentSource = 'browser_permission' }) {
  if (!user || !user.id) {
    const error = new Error('Authenticated user is required');
    error.statusCode = 401;
    throw error;
  }

  const sanitized = sanitizePushSubscription(subscription);
  const audience = getAudienceScope(user);
  const updated = await PushSubscription.findOneAndUpdate(
    { endpointHash: sanitized.endpointHash },
    {
      $set: {
        userId: user.id,
        audience,
        endpoint: sanitized.endpoint,
        keys: sanitized.keys,
        expirationTime: sanitized.expirationTime,
        status: 'active',
        failureCount: 0,
        lastError: '',
        userAgent: safeText(userAgent, 260),
        ipAddress: safeText(ipAddress, 80),
        consentSource: safeText(consentSource, 80) || 'browser_permission'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return redactSubscription(updated);
}

async function listPushSubscriptionsForUser(user) {
  if (!user || !user.id) {
    const error = new Error('Authenticated user is required');
    error.statusCode = 401;
    throw error;
  }

  const items = await PushSubscription.find({
    userId: user.id,
    status: 'active'
  })
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();

  return items.map(redactSubscription);
}

async function disablePushSubscription({ user, endpoint }) {
  if (!user || !user.id) {
    const error = new Error('Authenticated user is required');
    error.statusCode = 401;
    throw error;
  }

  const cleanEndpoint = safeText(endpoint, 2048);
  if (!cleanEndpoint) {
    const error = new Error('Push endpoint is required');
    error.statusCode = 400;
    throw error;
  }

  const result = await PushSubscription.findOneAndUpdate(
    {
      endpointHash: endpointHash(cleanEndpoint),
      userId: user.id
    },
    {
      $set: {
        status: 'disabled',
        lastFailureAt: new Date(),
        lastError: 'user_unsubscribed'
      }
    },
    { new: true }
  ).lean();

  return {
    ok: true,
    disabled: Boolean(result),
    subscription: redactSubscription(result)
  };
}

async function markSendSuccess(subscriptionId) {
  await PushSubscription.updateOne(
    { _id: subscriptionId },
    {
      $set: {
        status: 'active',
        lastSuccessAt: new Date(),
        lastError: '',
        failureCount: 0
      }
    }
  );
}

async function markSendFailure(subscriptionId, error) {
  const statusCode = Number(error && error.statusCode);
  const stale = statusCode === 404 || statusCode === 410;
  await PushSubscription.updateOne(
    { _id: subscriptionId },
    {
      $set: {
        status: stale ? 'disabled' : 'failed',
        lastFailureAt: new Date(),
        lastError: safeText(error && (error.body || error.message || `status_${statusCode}`), 240)
      },
      $inc: { failureCount: 1 }
    }
  );
}

async function sendPushToSubscriptions({ filter, payload, limit = MAX_BROADCAST_SUBSCRIPTIONS }) {
  const keys = await getApplicationServerKeys();
  const client = getWebPushClient();
  client.setVapidDetails(keys.subject || DEFAULT_VAPID_SUBJECT, keys.publicKey, keys.privateKey);

  const subscriptions = await PushSubscription.find({
    ...filter,
    status: 'active'
  })
    .select('+endpoint +keys.p256dh +keys.auth')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const seen = new Set();
  const deduped = subscriptions.filter((subscription) => {
    if (!subscription.endpointHash || seen.has(subscription.endpointHash)) {
      return false;
    }
    seen.add(subscription.endpointHash);
    return true;
  });

  const { serialized } = buildPushPayload(payload);
  const summary = {
    attempted: deduped.length,
    sent: 0,
    failed: 0,
    disabled: 0,
    provider: 'web-push',
    vapidSource: keys.source
  };

  for (const subscription of deduped) {
    try {
      await client.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime).getTime() : null,
        keys: subscription.keys
      }, serialized, {
        TTL: 60 * 60,
        urgency: 'normal',
        topic: safeText(payload.tag || payload.type || 'goindiaride-update', 32)
      });
      summary.sent += 1;
      await markSendSuccess(subscription._id);
    } catch (error) {
      summary.failed += 1;
      if (Number(error && error.statusCode) === 404 || Number(error && error.statusCode) === 410) {
        summary.disabled += 1;
      }
      await markSendFailure(subscription._id, error);
    }
  }

  return summary;
}

async function createEngagementNotification({
  userId = null,
  audience = 'customer',
  type = 'engagement',
  title,
  message,
  bookingId = null,
  metadata = {},
  url = '/'
}) {
  const normalizedAudience = normalizeAudience(audience);
  const notification = await Notification.create({
    userId,
    audience: normalizedAudience,
    bookingId: bookingId ? safeText(bookingId, 80) : null,
    type: safeText(type, 80) || 'engagement',
    title: safeText(title, 120) || 'GOindiaRIDE update',
    message: safeText(message, 400) || 'Your ride update is ready.',
    metadata: {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      channel: 'push',
      url: safeText(url, 500),
      pushPolicyVersion: PUSH_POLICY_VERSION
    }
  });
  await mirrorNotificationRealtimeUpdate(notification, {
    eventType: 'push_engagement_notification',
    source: 'push_notification_service'
  });

  const filter = userId
    ? { userId }
    : { audience: normalizedAudience };

  const push = await sendPushToSubscriptions({
    filter,
    payload: {
      title: notification.title,
      message: notification.message,
      type: notification.type,
      tag: notification.bookingId || notification.type,
      notificationId: notification._id,
      url,
      data: {
        audience: normalizedAudience,
        bookingId: notification.bookingId || null
      }
    }
  });

  return {
    notification: {
      id: String(notification._id),
      audience: notification.audience,
      userId: notification.userId ? String(notification.userId) : null,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      createdAt: notification.createdAt
    },
    push
  };
}

module.exports = {
  PHASE4_PUSH_NOTIFICATION_VERSION,
  PUSH_POLICY_VERSION,
  buildPushPayload,
  createEngagementNotification,
  disablePushSubscription,
  getAudienceScope,
  getPushNotificationStatus,
  getPushPublicKeyConfig,
  listPushSubscriptionsForUser,
  normalizeAudience,
  redactSubscription,
  savePushSubscription,
  sanitizePushSubscription,
  sendPushToSubscriptions
};
