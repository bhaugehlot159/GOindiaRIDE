const fs = require('fs');
const path = require('path');

const ANDROID_APP_CONVERSION_VERSION = '2026-06-22-android-app-conversion-v1';
const DEFAULT_ANDROID_PACKAGE_NAME = 'in.goindiaride.app';
const DEFAULT_APP_ORIGIN = 'https://goindiaride.in';
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function readFile(relativePath) {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
  } catch (_error) {
    return '';
  }
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFile(relativePath));
  } catch (_error) {
    return null;
  }
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function getAndroidPackageName() {
  return firstEnv([
    'ANDROID_APP_PACKAGE_NAME',
    'GOINDIARIDE_ANDROID_PACKAGE_NAME',
    'TWA_PACKAGE_NAME'
  ]) || DEFAULT_ANDROID_PACKAGE_NAME;
}

function isValidAndroidPackageName(packageName) {
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(String(packageName || ''));
}

function normalizeSha256Fingerprint(value) {
  const compact = String(value || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (compact.length !== 64) return '';
  return compact.match(/.{2}/g).join(':');
}

function getConfiguredSha256Fingerprints() {
  const raw = firstEnv([
    'ANDROID_APP_SHA256_CERT_FINGERPRINTS',
    'GOINDIARIDE_ANDROID_SHA256_CERT_FINGERPRINTS',
    'TWA_SHA256_CERT_FINGERPRINTS',
    'PLAY_APP_SIGNING_SHA256_CERT_FINGERPRINTS'
  ]);
  const fingerprints = String(raw || '')
    .split(/[\s,;]+/)
    .map(normalizeSha256Fingerprint)
    .filter(Boolean);
  return [...new Set(fingerprints)];
}

function getAppOrigin() {
  return firstEnv([
    'PUBLIC_APP_ORIGIN',
    'GOINDIARIDE_PUBLIC_ORIGIN',
    'APP_PUBLIC_ORIGIN'
  ]) || DEFAULT_APP_ORIGIN;
}

function getDigitalAssetLinks() {
  const packageName = getAndroidPackageName();
  const fingerprints = getConfiguredSha256Fingerprints();
  if (!isValidAndroidPackageName(packageName) || fingerprints.length === 0) {
    return [];
  }

  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints
      }
    }
  ];
}

function getAndroidAppConversionStatus() {
  const packageName = getAndroidPackageName();
  const fingerprints = getConfiguredSha256Fingerprints();
  const appOrigin = getAppOrigin();
  const twaConfig = readJson('app/android/goindiaride-twa-config.json') || {};
  const playListing = readJson('app/play-store-listing.json') || {};
  const playDataSafety = readJson('app/play-data-safety.json') || {};
  const runtimePage = readFile('pages/app-runtime-check.html');
  const conversionDoc = readFile('docs/android-app-conversion.md');
  const dataSafetyPage = readFile('pages/legal/data-safety.html');

  const digitalAssetLinks = {
    endpoint: '/.well-known/assetlinks.json',
    configured: fingerprints.length > 0,
    packageName,
    packageNameValid: isValidAndroidPackageName(packageName),
    fingerprintCount: fingerprints.length,
    relationReady: getDigitalAssetLinks().length > 0,
    requiredEnv: [
      'ANDROID_APP_PACKAGE_NAME',
      'ANDROID_APP_SHA256_CERT_FINGERPRINTS'
    ]
  };

  const twa = {
    configFile: fileExists('app/android/goindiaride-twa-config.json'),
    packageNameMatches: twaConfig.packageName === packageName || twaConfig.packageName === DEFAULT_ANDROID_PACKAGE_NAME,
    host: twaConfig.host === 'goindiaride.in',
    manifestUrl: twaConfig.manifestUrl === `${appOrigin}/manifest.json`,
    startUrl: twaConfig.startUrl === `${appOrigin}/index.html?source=twa`,
    fallbackApiBase: twaConfig.fallbackApiBase === 'https://goindiaride.onrender.com',
    displayMode: twaConfig.display === 'standalone'
  };

  const playStore = {
    listingSource: fileExists('app/play-store-listing.json'),
    dataSafetySource: fileExists('app/play-data-safety.json'),
    titleReady: playListing.title === 'GO India RIDE',
    categoryReady: String(playListing.category || '').toLowerCase().includes('travel'),
    supportReady: /support@goindiaride\.in/.test(JSON.stringify(playListing)),
    privacyUrlReady: playListing.privacyPolicyUrl === `${appOrigin}/pages/legal/privacy-policy.html`,
    accountDeletionUrlReady: playListing.accountDeletionUrl === `${appOrigin}/pages/legal/account-deletion.html`,
    dataSafetyCoversLocation: /location/i.test(JSON.stringify(playDataSafety)),
    dataSafetyCoversPayments: /payment|financial/i.test(JSON.stringify(playDataSafety)),
    dataSafetyCoversDeviceIds: /device/i.test(JSON.stringify(playDataSafety))
  };

  const policy = {
    runtimePermissionDisclosure: /Device permissions used by this check/.test(runtimePage)
      && /Location permission/.test(runtimePage)
      && /Notification permission/.test(runtimePage)
      && /Phone OTP/.test(runtimePage),
    dataSafetyPage: /Data Safety Details/.test(dataSafetyPage)
      && /Driver GPS/.test(dataSafetyPage)
      && /Razorpay/.test(dataSafetyPage)
      && /PayPal/.test(dataSafetyPage),
    conversionRunbook: fileExists('docs/android-app-conversion.md')
      && /Digital Asset Links/.test(conversionDoc)
      && /bubblewrap/.test(conversionDoc)
      && /target SDK/.test(conversionDoc)
  };

  const websiteChecks = {
    pwaManifest: fileExists('manifest.json'),
    serviceWorker: fileExists('sw.js') && fileExists('service-worker.js'),
    offlineFallback: fileExists('offline.html'),
    runtimeVerifier: fileExists('pages/app-runtime-check.html') && fileExists('js/app-runtime-verifier.js'),
    privacyPolicy: fileExists('pages/legal/privacy-policy.html'),
    terms: fileExists('pages/legal/terms-and-conditions.html'),
    refundPolicy: fileExists('pages/legal/refund-policy.html'),
    accountDeletion: fileExists('pages/legal/account-deletion.html'),
    contactSupport: fileExists('pages/contact.html')
  };

  const websiteReady = [
    ...Object.values(twa),
    ...Object.values(playStore),
    ...Object.values(policy),
    ...Object.values(websiteChecks)
  ].every(Boolean);
  const digitalAssetLinksReady = digitalAssetLinks.relationReady;

  return {
    version: ANDROID_APP_CONVERSION_VERSION,
    checkedAt: new Date().toISOString(),
    ok: websiteReady && digitalAssetLinksReady,
    websiteReady,
    digitalAssetLinksReady,
    appOrigin,
    packageName,
    digitalAssetLinks,
    twa,
    playStore,
    policy,
    websiteChecks,
    endpoints: {
      assetLinks: '/.well-known/assetlinks.json',
      health: '/health/android-app-conversion',
      manifest: '/manifest.json',
      runtimeVerification: '/pages/app-runtime-check.html',
      twaConfig: '/app/android/goindiaride-twa-config.json',
      playStoreListing: '/app/play-store-listing.json',
      playDataSafety: '/app/play-data-safety.json',
      runbook: '/docs/android-app-conversion.md'
    },
    externalInputsRequired: digitalAssetLinksReady ? [] : [
      {
        env: 'ANDROID_APP_SHA256_CERT_FINGERPRINTS',
        source: 'Google Play App Signing certificate SHA-256 or upload key SHA-256',
        reason: 'Trusted Web Activity verification needs Digital Asset Links to prove goindiaride.in owns the Android package.'
      }
    ]
  };
}

module.exports = {
  ANDROID_APP_CONVERSION_VERSION,
  DEFAULT_ANDROID_PACKAGE_NAME,
  getAndroidAppConversionStatus,
  getDigitalAssetLinks,
  getConfiguredSha256Fingerprints,
  normalizeSha256Fingerprint
};
