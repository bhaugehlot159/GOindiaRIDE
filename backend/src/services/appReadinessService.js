const fs = require('fs');
const path = require('path');

const { getRealtimeConfig } = require('./firebaseRealtimeDatabaseService');
const { getLiveLocationTrackingStatus } = require('./liveLocationTrackingService');
const { getPushNotificationStatus } = require('./pushNotificationService');
const { getAndroidAppConversionStatus } = require('./androidAppConversionService');

const APP_READINESS_VERSION = '2026-06-22-app-readiness-v4';
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

function readFile(relativePath) {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
  } catch (_error) {
    return '';
  }
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function hasAll(source, patterns) {
  return patterns.every((pattern) => pattern.test(source));
}

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function buildSurfaceStatus() {
  const publicHome = readFile('index.html');
  const publicBooking = readFile('book-cab.html');
  const customer = readFile('customer/index.html');
  const driver = readFile('driver/index.html');
  const admin = readFile('admin/app.html');
  const customerDashboard = readFile('pages/customer-dashboard.html');
  const driverDashboard = readFile('pages/driver-dashboard.html');
  const booking = readFile('pages/booking.html');

  return {
    public: {
      manifestLinked: /rel="manifest"\s+href="\.\/manifest\.webmanifest"/.test(publicHome),
      bookingManifestLinked: /rel="manifest"\s+href="\.\/manifest\.webmanifest"/.test(publicBooking),
      pwaBootstrap: /pwa-app-shell\.js\?v=20260622-app-readiness3/.test(publicHome)
        && /pwa-app-shell\.js\?v=20260622-app-readiness3/.test(publicBooking)
    },
    customer: {
      dedicatedManifest: fileExists('customer/manifest.webmanifest'),
      portalLinked: /rel="manifest"\s+href="\.\/manifest\.webmanifest"/.test(customer),
      dashboardLinked: /rel="manifest"\s+href="\.\.\/customer\/manifest\.webmanifest"/.test(customerDashboard),
      bookingLinked: /rel="manifest"\s+href="\.\.\/customer\/manifest\.webmanifest"/.test(booking),
      pushClient: /push-notifications\.js\?v=20260613-push-phase4/.test(customerDashboard)
        && /push-notifications\.js\?v=20260613-push-phase4/.test(customer)
        && /push-notifications\.js\?v=20260613-push-phase4/.test(booking)
    },
    driver: {
      dedicatedManifest: fileExists('driver/manifest.webmanifest'),
      portalLinked: /rel="manifest"\s+href="\.\/manifest\.webmanifest"/.test(driver),
      dashboardLinked: /rel="manifest"\s+href="\.\.\/driver\/manifest\.webmanifest"/.test(driverDashboard),
      pushClient: /push-notifications\.js\?v=20260613-push-phase4/.test(driver)
        && /push-notifications\.js\?v=20260613-push-phase4/.test(driverDashboard)
    },
    admin: {
      dedicatedManifest: fileExists('admin/manifest.webmanifest'),
      appLinked: /rel="manifest"\s+href="\.\/manifest\.webmanifest"/.test(admin),
      privateSurface: /requireAdminSessionForApp/.test(admin),
      pushClient: /push-notifications\.js\?v=20260613-push-phase4/.test(admin)
    }
  };
}

function buildPwaStatus() {
  const rootManifest = readFile('manifest.webmanifest');
  const manifestJson = readFile('manifest.json');
  const serviceWorker = readFile('sw.js');
  const serviceWorkerAlias = readFile('service-worker.js');
  const pwaShell = readFile('js/pwa-app-shell.js');
  const firebaseMessaging = readFile('firebase-messaging-sw.js');

  return {
    rootManifest: hasAll(rootManifest, [
      /"id":\s*"\/\?app=goindiaride-public"/,
      /"start_url":\s*"\/index\.html\?source=pwa_public"/,
      /"display":\s*"standalone"/,
      /"icons"\s*:/,
      /"shortcuts"\s*:/,
      /"screenshots"\s*:/
    ]),
    rootManifestJsonAlias: hasAll(manifestJson, [
      /"id":\s*"\/\?app=goindiaride-public"/,
      /"start_url":\s*"\/index\.html\?source=pwa_public"/,
      /"display":\s*"standalone"/,
      /"icons"\s*:/
    ]),
    customerManifest: fileExists('customer/manifest.webmanifest'),
    driverManifest: fileExists('driver/manifest.webmanifest'),
    adminManifest: fileExists('admin/manifest.webmanifest'),
    serviceWorker: hasAll(serviceWorker, [
      /goindiaride-pwa-v67-20260622-app-readiness3/,
      /OFFLINE_URL/,
      /addEventListener\('push'/,
      /notificationclick/,
      /isApiRequest/,
      /apiOfflineResponse/
    ]),
    serviceWorkerPublicAlias: /importScripts\('\/sw\.js\?v=20260622-app-readiness3'\)/.test(serviceWorkerAlias),
    offlineFallback: fileExists('offline.html') && /You are offline/.test(readFile('offline.html')),
    firebaseMessagingWorker: /importScripts\('\/sw\.js\?v=20260622-app-readiness3'\)/.test(firebaseMessaging),
    pwaBootstrap: hasAll(pwaShell, [
      /beforeinstallprompt/,
      /data-goi-pwa-install/,
      /bindInstallControls/,
      /ensureInstallUi/,
      /navigator\.serviceWorker\.register/,
      /GoIndiaRidePWA/,
      /getSurface/
    ]),
    accountDeletionOfflineCached: /pages\/legal\/account-deletion\.html/.test(serviceWorker),
    splashReady: /apple-touch-startup-image/.test(readFile('index.html'))
      && /apple-touch-startup-image/.test(readFile('customer/index.html'))
      && /apple-touch-startup-image/.test(readFile('driver/index.html'))
      && /apple-touch-startup-image/.test(readFile('admin/app.html'))
  };
}

function buildRuntimeVerificationStatus() {
  const verifierPage = readFile('pages/app-runtime-check.html');
  const verifierScript = readFile('js/app-runtime-verifier.js');
  const phoneVerification = readFile('js/phone-verification.js');
  const pushNotifications = readFile('js/push-notifications.js');
  const serviceWorker = readFile('sw.js');

  return {
    verificationPage: fileExists('pages/app-runtime-check.html')
      && /data-app-runtime-run/.test(verifierPage)
      && /app-runtime-verifier\.js\?v=20260622-appverify1/.test(verifierPage),
    permissionDisclosure: /Device permissions used by this check/.test(verifierPage)
      && /Location permission/.test(verifierPage)
      && /Notification permission/.test(verifierPage)
      && /Phone OTP/.test(verifierPage),
    pwaDirectProbe: /checkPwaFiles/.test(verifierScript)
      && /\/manifest\.json/.test(verifierScript)
      && /\/service-worker\.js/.test(verifierScript)
      && /goindiaride-pwa-v67-20260622-app-readiness3/.test(serviceWorker),
    otpWebViewProbe: /checkOtpWebView/.test(verifierScript)
      && /getReadinessStatus/.test(phoneVerification)
      && /RecaptchaVerifier/.test(phoneVerification)
      && /\/api\/auth\/firebase\/client-config/.test(verifierScript),
    pushTokenProbe: /checkPushTokenFlow/.test(verifierScript)
      && /getReadinessStatus/.test(pushNotifications)
      && /Notification\.requestPermission/.test(verifierScript)
      && /\/api\/notifications\/push\/public-key/.test(verifierScript)
      && /\/api\/notifications\/push\/subscribe/.test(pushNotifications),
    liveGpsProbe: /checkLiveGpsTracking/.test(verifierScript)
      && /navigator\.geolocation\.getCurrentPosition/.test(verifierScript)
      && /\/health\/live-location-tracking/.test(verifierScript)
      && /\/api\/live-tracking\/location/.test(verifierScript)
  };
}

function buildPaymentStatus() {
  const walletRoutes = readFile('backend/src/routes/walletRoutes.js');
  const razorpayConfigured = Boolean(firstEnv([
    'RAZORPAY_KEY_ID',
    'RAZORPAY_LIVE_KEY_ID',
    'RAZORPAY_KEYID',
    'RAZORPAY_KEY'
  ]) && firstEnv([
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_LIVE_KEY_SECRET',
    'RAZORPAY_SECRET_KEY',
    'RAZORPAY_SECRET'
  ]));
  const paypalConfigured = Boolean(firstEnv([
    'PAYPAL_CLIENT_ID',
    'PAYPAL_LIVE_CLIENT_ID',
    'PAYPAL_APP_CLIENT_ID'
  ]) && firstEnv([
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_LIVE_CLIENT_SECRET',
    'PAYPAL_SECRET'
  ]));
  const upiConfigured = Boolean(firstEnv([
    'UPI_MERCHANT_VPA',
    'UPI_MERCHANT_UPI_ID',
    'PAYMENT_UPI_ID',
    'PAYMENT_UPI_VPA',
    'GOINDIARIDE_UPI_ID'
  ]));

  return {
    routes: {
      createTopupOrder: /router\.post\('\/topup\/order'/.test(walletRoutes),
      razorpayVerify: /router\.post\('\/topup\/razorpay\/verify'/.test(walletRoutes)
        && /verifyRazorpayPaymentSignature/.test(walletRoutes),
      razorpayLinkVerify: /router\.post\('\/topup\/razorpay-link\/verify'/.test(walletRoutes),
      paypalCapture: /router\.post\('\/topup\/paypal\/capture'/.test(walletRoutes)
        && /\/v2\/checkout\/orders\/\$\{encodeURIComponent\(paypalOrderId\)\}\/capture/.test(walletRoutes),
      upiRedirect: /upi_app_redirect/.test(walletRoutes)
    },
    configured: {
      razorpay: razorpayConfigured,
      paypal: paypalConfigured,
      upi: upiConfigured
    },
    requiredEnv: {
      razorpay: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
      paypal: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
      upi: ['UPI_MERCHANT_VPA']
    }
  };
}

function buildOtpStatus() {
  const phoneVerification = readFile('js/phone-verification.js');
  const firebaseConfig = readFile('js/firebase-config.js');
  const authRoutes = readFile('backend/src/routes/authRoutes.js');
  const booking = readFile('pages/booking.html');
  const bookingPhoneVerification = readFile('customer/chunks/booking/scripts/page/submit/phone-verification.js');
  const customerDashboard = readFile('pages/customer-dashboard.html');
  const profileLoader = readFile('customer/chunks/dashboard/scripts/page/profile/load-profile.js');

  return {
    firebaseWebConfigResolver: /resolveGoIndiaFirebaseConfig/.test(firebaseConfig)
      && /\/api\/auth\/firebase\/client-config/.test(firebaseConfig),
    recaptchaVerifier: /RecaptchaVerifier/.test(phoneVerification)
      && /signInWithPhoneNumber/.test(phoneVerification),
    bookingOtpHooks: /page\/submit\/phone-verification\.js/.test(booking)
      && /GoIndiaPhoneVerification\.sendOtp/.test(bookingPhoneVerification)
      && /GoIndiaPhoneVerification\.verifyOtp/.test(bookingPhoneVerification)
      && /\/api\/auth\/otp\/verify/.test(bookingPhoneVerification),
    profileOtpHooks: /page\/profile\/load-profile\.js/.test(customerDashboard)
      && /GoIndiaPhoneVerification\.sendOtp/.test(profileLoader)
      && /GoIndiaPhoneVerification\.verifyOtp/.test(profileLoader)
      && /\/api\/auth\/profile-phone\/verify-otp/.test(profileLoader),
    backendOtpRoutes: /router\.post\(["']\/request-otp["']/.test(authRoutes)
      && /router\.post\(["']\/otp\/verify["']/.test(authRoutes)
      && /router\.post\(["']\/profile-phone\/verify-otp["'], authenticate/.test(authRoutes)
  };
}

function buildLegalStatus() {
  const home = readFile('index.html');
  const contact = readFile('pages/contact.html');
  const privacy = readFile('pages/legal/privacy-policy.html');
  const dataSafety = readFile('pages/legal/data-safety.html');
  const accountDeletion = readFile('pages/legal/account-deletion.html');
  const customerDashboard = readFile('pages/customer-dashboard.html');
  return {
    privacyPolicy: fileExists('pages/legal/privacy-policy.html'),
    terms: fileExists('pages/legal/terms-and-conditions.html'),
    refundPolicy: fileExists('pages/legal/refund-policy.html'),
    contactSupport: fileExists('pages/contact.html') && /support@goindiaride\.in/.test(home),
    driverAgreement: fileExists('pages/legal/driver-agreement.html'),
    dataSafety: fileExists('pages/legal/data-safety.html')
      && /Data Safety Details/.test(dataSafety)
      && /pages\/legal\/data-safety\.html/.test(home),
    accountDeletionPage: fileExists('pages/legal/account-deletion.html')
      && /Account Deletion/.test(accountDeletion)
      && /mailto:privacy@goindiaride\.in/.test(accountDeletion)
      && /GO%20India%20RIDE%20account%20deletion%20request/.test(accountDeletion),
    customerAccountDeletionPath: /data-account-deletion-link/.test(customerDashboard)
      && /\.\/legal\/account-deletion\.html/.test(customerDashboard)
      && !/data-profile-feature="account/.test(customerDashboard),
    storeDeletionDisclosure: /pages\/legal\/account-deletion\.html/.test(home)
      && /account-deletion\.html/.test(contact)
      && /account-deletion\.html/.test(privacy)
      && /account-deletion\.html/.test(dataSafety)
  };
}

function flattenBooleans(prefix, input, output = []) {
  Object.entries(input || {}).forEach(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenBooleans(name, value, output);
      return;
    }
    if (typeof value === 'boolean') {
      output.push({ name, ok: value });
    }
  });
  return output;
}

function getAppReadinessStatus() {
  const pwa = buildPwaStatus();
  const surfaces = buildSurfaceStatus();
  const payment = buildPaymentStatus();
  const otp = buildOtpStatus();
  const legal = buildLegalStatus();
  const runtimeVerification = buildRuntimeVerificationStatus();
  const androidAppConversion = getAndroidAppConversionStatus();
  const realtimeConfig = getRealtimeConfig();
  const liveTracking = getLiveLocationTrackingStatus();
  const push = getPushNotificationStatus();
  const checks = [
    ...flattenBooleans('pwa', pwa),
    ...flattenBooleans('surfaces', surfaces),
    ...flattenBooleans('payment.routes', payment.routes),
    ...flattenBooleans('otp', otp),
    ...flattenBooleans('legal', legal),
    ...flattenBooleans('runtimeVerification', runtimeVerification),
    ...flattenBooleans('androidAppConversion.twa', androidAppConversion.twa),
    ...flattenBooleans('androidAppConversion.playStore', androidAppConversion.playStore),
    ...flattenBooleans('androidAppConversion.policy', androidAppConversion.policy),
    ...flattenBooleans('androidAppConversion.websiteChecks', androidAppConversion.websiteChecks)
  ];
  const failed = checks.filter((row) => !row.ok);

  return {
    ok: failed.length === 0,
    version: APP_READINESS_VERSION,
    mode: 'web-pwa-app-conversion-readiness',
    checkedAt: new Date().toISOString(),
    pwa,
    surfaces,
    liveTracking: {
      active: Boolean(liveTracking && liveTracking.active !== false),
      status: liveTracking
    },
    firebaseRealtime: {
      enabled: realtimeConfig.enabled,
      configured: Boolean(realtimeConfig.databaseURL),
      namespace: realtimeConfig.namespace,
      authConfigured: Boolean(
        process.env.FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN
          || process.env.FIREBASE_DATABASE_ACCESS_TOKEN
          || process.env.GOOGLE_OAUTH_ACCESS_TOKEN
          || process.env.FIREBASE_SERVICE_ACCOUNT_JSON
          || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
          || process.env.GOOGLE_APPLICATION_CREDENTIALS
          || process.env.FIREBASE_SERVICE_ACCOUNT_FILE
          || (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
          || process.env.FIREBASE_REALTIME_DATABASE_AUTH_TOKEN
          || process.env.FIREBASE_DATABASE_AUTH_TOKEN
          || process.env.FIREBASE_DATABASE_SECRET
      )
    },
    push: {
      active: Boolean(push && push.active),
      provider: push && push.delivery && push.delivery.provider,
      privateKeyExposed: Boolean(push && push.delivery && push.delivery.privateKeyExposed),
      endpoints: push && push.endpoints
    },
    otp,
    payment,
    legal,
    runtimeVerification,
    androidAppConversion,
    appStores: {
      privacyDetailsReady: legal.privacyPolicy && legal.dataSafety && legal.accountDeletionPage,
      googlePlayDataSafetyPage: '/pages/legal/data-safety.html',
      applePrivacyDetailsSource: '/pages/legal/data-safety.html',
      androidAssetLinksUrl: '/.well-known/assetlinks.json',
      androidConversionHealthUrl: '/health/android-app-conversion',
      androidTwaConfigUrl: '/app/android/goindiaride-twa-config.json',
      playStoreListingSource: '/app/play-store-listing.json',
      playDataSafetySource: '/app/play-data-safety.json',
      accountDeletionUrl: '/pages/legal/account-deletion.html',
      accountDeletionReady: legal.accountDeletionPage && legal.customerAccountDeletionPath,
      runtimeVerificationUrl: '/pages/app-runtime-check.html',
      supportUrl: '/pages/contact.html',
      refundPolicyUrl: '/pages/legal/refund-policy.html'
    },
    failedChecks: failed,
    warningCount: failed.length
  };
}

module.exports = {
  APP_READINESS_VERSION,
  getAppReadinessStatus
};
