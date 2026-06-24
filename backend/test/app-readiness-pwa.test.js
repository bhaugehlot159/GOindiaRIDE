process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-required-for-testing-only';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-min-32-chars-required-for-testing-only';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goindiaride-app-readiness-test';
if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(process.env.FIREBASE_API_KEY || '')) {
  process.env.FIREBASE_API_KEY = 'AIzaSyA123456789012345678901234567890123';
}
process.env.FIREBASE_KEY = process.env.FIREBASE_API_KEY;
process.env.FIREBASE_WEB_API_KEY = process.env.FIREBASE_API_KEY;
process.env.ANDROID_APP_PACKAGE_NAME = process.env.ANDROID_APP_PACKAGE_NAME || 'in.goindiaride.app';
process.env.ANDROID_APP_SHA256_CERT_FINGERPRINTS = process.env.ANDROID_APP_SHA256_CERT_FINGERPRINTS
  || '11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00';
process.env.GLOBAL_LOCKDOWN_SHIELD_ENABLED = 'false';
process.env.ROUTE_GUARD_POLICY_SHIELD_ENABLED = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const request = require('supertest');

const app = require('../src/app');
const { APP_READINESS_VERSION, getAppReadinessStatus } = require('../src/services/appReadinessService');
const { getAndroidAppConversionStatus } = require('../src/services/androidAppConversionService');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function readBinary(relativePath) {
  return fs.readFileSync(path.join(root, relativePath));
}

function readPngDimensions(relativePath) {
  const buffer = readBinary(relativePath);
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length
  };
}

function readIcoFirstImage(relativePath) {
  const buffer = readBinary(relativePath);
  assert.equal(buffer.readUInt16LE(0), 0);
  assert.equal(buffer.readUInt16LE(2), 1);
  assert.equal(buffer.readUInt16LE(4), 1);
  return {
    width: buffer[6] || 256,
    height: buffer[7] || 256,
    bytes: buffer.readUInt32LE(14)
  };
}

function createFakeNode(tagName) {
  const node = {
    tagName: String(tagName || 'div').toUpperCase(),
    id: '',
    hidden: false,
    disabled: false,
    className: '',
    textContent: '',
    attributes: {},
    children: [],
    parentNode: null,
    style: {},
    setAttribute(name, value = '') {
      this.attributes[name] = String(value);
      if (name === 'id') this.id = String(value);
      if (name === 'class') this.className = String(value);
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelector(selector) {
      return flattenFakeNodes(this.children).find((child) => matchesFakeSelector(child, selector)) || null;
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (selector.split(',').some((part) => matchesFakeSelector(current, part.trim()))) return current;
        current = current.parentNode;
      }
      return null;
    }
  };
  return node;
}

function flattenFakeNodes(nodes) {
  const output = [];
  for (const node of nodes) {
    output.push(node);
    output.push(...flattenFakeNodes(node.children || []));
  }
  return output;
}

function matchesFakeSelector(node, selector) {
  if (!node || !selector) return false;
  if (selector === 'span') return node.tagName === 'SPAN';
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const name = selector.slice(1, -1);
    return Object.prototype.hasOwnProperty.call(node.attributes || {}, name);
  }
  return false;
}

function runPwaShellInFakeDom({ pathname = '/', includeHomeInstallButton = true } = {}) {
  const pwaShellSource = read('js/pwa-app-shell.js');
  const windowListeners = {};
  const documentListeners = {};
  const html = createFakeNode('html');
  const head = createFakeNode('head');
  const body = createFakeNode('body');
  let homeInstallButton = null;
  let homeInstallLabel = null;

  if (includeHomeInstallButton) {
    homeInstallButton = createFakeNode('button');
    homeInstallButton.id = 'installAppBtn';
    homeInstallButton.hidden = true;
    homeInstallButton.setAttribute('data-goi-pwa-install', '');
    homeInstallLabel = createFakeNode('span');
    homeInstallLabel.setAttribute('data-goi-pwa-install-label', '');
    homeInstallLabel.textContent = 'Install app';
    homeInstallButton.appendChild(homeInstallLabel);
    body.appendChild(homeInstallButton);
  }

  function allNodes() {
    return [html, head, body, ...flattenFakeNodes(head.children), ...flattenFakeNodes(body.children)];
  }

  const document = {
    readyState: 'complete',
    documentElement: html,
    head,
    body,
    createElement: createFakeNode,
    getElementById(id) {
      return allNodes().find((node) => node.id === id) || null;
    },
    querySelectorAll(selector) {
      const parts = selector.split(',').map((part) => part.trim());
      return allNodes().filter((node, index, nodes) => (
        nodes.indexOf(node) === index && parts.some((part) => matchesFakeSelector(node, part))
      ));
    },
    addEventListener(name, callback) {
      documentListeners[name] = documentListeners[name] || [];
      documentListeners[name].push(callback);
    }
  };

  const localStore = {};
  const window = {
    document,
    location: { origin: 'https://goindiaride.in', pathname },
    navigator: { onLine: true, standalone: false, userAgent: 'Mozilla/5.0 Chrome', platform: 'Win32' },
    isSecureContext: false,
    localStorage: {
      setItem(key, value) { localStore[key] = String(value); },
      getItem(key) { return localStore[key] || null; }
    },
    matchMedia() { return { matches: false }; },
    addEventListener(name, callback) {
      windowListeners[name] = windowListeners[name] || [];
      windowListeners[name].push(callback);
    },
    alert(message) { localStore.alert = String(message); }
  };

  vm.runInNewContext(pwaShellSource, {
    window,
    document,
    navigator: window.navigator,
    URL,
    Promise,
    Date,
    console
  });

  return { window, document, windowListeners, documentListeners, homeInstallButton, homeInstallLabel, localStore };
}

test('PWA manifests are valid JSON and expose separate public customer driver admin apps', () => {
  const publicManifest = readJson('manifest.webmanifest');
  const publicManifestJson = readJson('manifest.json');
  const customerManifest = readJson('customer/manifest.webmanifest');
  const driverManifest = readJson('driver/manifest.webmanifest');
  const adminManifest = readJson('admin/manifest.webmanifest');

  assert.equal(publicManifest.id, '/?app=goindiaride-public');
  assert.deepEqual(publicManifestJson, publicManifest);
  assert.equal(customerManifest.id, '/customer/?app=goindiaride-customer');
  assert.equal(driverManifest.id, '/driver/?app=goindiaride-driver');
  assert.equal(adminManifest.id, '/admin/?app=goindiaride-admin');
  assert.equal(customerManifest.name, 'GO India RIDE Customer App');
  assert.equal(driverManifest.name, 'GO India RIDE Driver Partner App');
  assert.equal(driverManifest.short_name, 'Driver Partner');
  assert.ok(publicManifest.shortcuts.some((shortcut) => shortcut.name === 'Customer App'));
  assert.ok(publicManifest.shortcuts.some((shortcut) => shortcut.name === 'Driver Partner App'));

  for (const manifest of [publicManifest, customerManifest, driverManifest, adminManifest]) {
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.start_url.startsWith('/'));
    assert.ok(Array.isArray(manifest.icons));
    assert.ok(manifest.icons.some((icon) => String(icon.sizes).includes('192x192')));
    assert.ok(manifest.icons.some((icon) => String(icon.sizes).includes('512x512')));
    assert.ok(manifest.icons.some((icon) => String(icon.purpose || '').includes('maskable')));
  }

  assert.ok(publicManifest.shortcuts.some((shortcut) => shortcut.url.includes('/book-cab.html')));
  assert.ok(customerManifest.shortcuts.some((shortcut) => shortcut.url.includes('/pages/booking.html')));
  assert.ok(driverManifest.shortcuts.some((shortcut) => shortcut.url.includes('/driver/index.html')));
  assert.ok(adminManifest.shortcuts.some((shortcut) => shortcut.url.includes('/admin/app.html')));
});

test('app icon assets stay production sized, polished, and linked by all PWA manifests', () => {
  const icon192 = readPngDimensions('icons/icon-192.png');
  const icon512 = readPngDimensions('icons/icon-512.png');
  const icon1024 = readPngDimensions('assets/brand/goindiaride-app-icon-1024.png');
  const favicon = readIcoFirstImage('favicon.ico');
  const icon192Svg = read('icons/icon-192.svg');
  const icon512Svg = read('icons/icon-512.svg');
  const manifests = [
    readJson('manifest.json'),
    readJson('manifest.webmanifest'),
    readJson('customer/manifest.webmanifest'),
    readJson('driver/manifest.webmanifest'),
    readJson('admin/manifest.webmanifest')
  ];

  assert.deepEqual(
    { width: icon192.width, height: icon192.height },
    { width: 192, height: 192 }
  );
  assert.deepEqual(
    { width: icon512.width, height: icon512.height },
    { width: 512, height: 512 }
  );
  assert.deepEqual(
    { width: icon1024.width, height: icon1024.height },
    { width: 1024, height: 1024 }
  );
  assert.ok(icon192.bytes > 20000, '192px launcher icon should not regress to a tiny placeholder');
  assert.ok(icon512.bytes > 90000, '512px launcher icon should retain polished raster detail');
  assert.ok(icon1024.bytes > 250000, '1024px app-store icon should retain high-resolution brand detail');
  assert.deepEqual(favicon, { width: 192, height: 192, bytes: icon192.bytes });
  assert.match(icon192Svg, /GO India RIDE international app icon/);
  assert.match(icon512Svg, /GO India RIDE international app icon/);

  for (const manifest of manifests) {
    const iconSources = (manifest.icons || []).map((icon) => icon.src);
    assert.ok(iconSources.includes('/icons/icon-192.png'));
    assert.ok(iconSources.includes('/icons/icon-512.png'));
    assert.ok(iconSources.includes('/assets/brand/goindiaride-app-icon-1024.png'));
    assert.ok((manifest.icons || []).some((icon) => (
      icon.src === '/icons/icon-512.png' && /maskable/.test(icon.purpose || '')
    )));
  }
});

test('service worker and app shell provide offline, push, install and Firebase messaging readiness', () => {
  const serviceWorker = read('sw.js');
  const serviceWorkerAlias = read('service-worker.js');
  const pwaShell = read('js/pwa-app-shell.js');
  const firebaseMessagingWorker = read('firebase-messaging-sw.js');
  const offlinePage = read('offline.html');

  assert.match(serviceWorker, /goindiaride-pwa-v67-20260622-app-readiness3/);
  assert.match(serviceWorker, /const OFFLINE_URL = '\.\/offline\.html'/);
  assert.match(serviceWorker, /apiOfflineResponse/);
  assert.match(serviceWorker, /isApiRequest/);
  assert.match(serviceWorker, /addEventListener\('push'/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(serviceWorker, /customer\/manifest\.webmanifest/);
  assert.match(serviceWorker, /driver\/manifest\.webmanifest/);
  assert.match(serviceWorker, /admin\/manifest\.webmanifest/);
  assert.match(serviceWorker, /pages\/legal\/account-deletion\.html/);
  assert.match(serviceWorker, /manifest\.json/);
  assert.match(serviceWorkerAlias, /importScripts\('\/sw\.js\?v=20260622-app-readiness3'\)/);

  assert.match(pwaShell, /beforeinstallprompt/);
  assert.match(pwaShell, /data-goi-pwa-install/);
  assert.match(pwaShell, /bindInstallControls/);
  assert.match(pwaShell, /ensureInstallUi/);
  assert.match(pwaShell, /navigator\.serviceWorker\.register/);
  assert.match(pwaShell, /GoIndiaRidePWA/);
  assert.match(pwaShell, /getSurface/);
  assert.match(firebaseMessagingWorker, /importScripts\('\/sw\.js\?v=20260622-app-readiness3'\)/);
  assert.match(offlinePage, /You are offline/);
});

test('runtime verifier exposes the four compulsory app conversion checks', () => {
  const verifierPage = read('pages/app-runtime-check.html');
  const verifierScript = read('js/app-runtime-verifier.js');
  const phoneVerification = read('js/phone-verification.js');
  const pushNotifications = read('js/push-notifications.js');

  assert.match(verifierPage, /data-app-runtime-run/);
  assert.match(verifierPage, /app-runtime-verifier\.js\?v=20260622-appverify1/);
  assert.match(verifierPage, /manifest\.json \+ service worker/);
  assert.match(verifierPage, /Device permissions used by this check/);
  assert.match(verifierPage, /Location permission/);
  assert.match(verifierPage, /Notification permission/);
  assert.match(verifierPage, /Phone OTP/);

  assert.match(verifierScript, /checkPwaFiles/);
  assert.match(verifierScript, /\/manifest\.json/);
  assert.match(verifierScript, /\/service-worker\.js/);
  assert.match(verifierScript, /checkOtpWebView/);
  assert.match(verifierScript, /\/api\/auth\/firebase\/client-config/);
  assert.match(verifierScript, /checkPushTokenFlow/);
  assert.match(verifierScript, /Notification\.requestPermission/);
  assert.match(verifierScript, /\/api\/notifications\/push\/public-key/);
  assert.match(verifierScript, /checkLiveGpsTracking/);
  assert.match(verifierScript, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(verifierScript, /\/api\/live-tracking\/location/);

  assert.match(phoneVerification, /getReadinessStatus/);
  assert.match(phoneVerification, /recaptchaVerifierAvailable/);
  assert.match(pushNotifications, /getReadinessStatus/);
  assert.match(pushNotifications, /publicKeyEndpoint/);
});

test('Render backend serves direct public app conversion artifacts without exposing source files', async () => {
  const manifest = await request(app)
    .get('/manifest.json')
    .expect('Content-Type', /application\/json/)
    .expect(200);
  assert.equal(manifest.body.id, '/?app=goindiaride-public');

  const serviceWorkerAlias = await request(app)
    .get('/service-worker.js')
    .expect('Service-Worker-Allowed', '/')
    .expect(200);
  assert.match(serviceWorkerAlias.text, /importScripts\('\/sw\.js\?v=20260622-app-readiness3'\)/);

  const serviceWorker = await request(app)
    .get('/sw.js?v=20260622-app-readiness3')
    .expect('Service-Worker-Allowed', '/')
    .expect(200);
  assert.match(serviceWorker.text, /goindiaride-pwa-v67-20260622-app-readiness3/);

  const runtimePage = await request(app)
    .get('/pages/app-runtime-check.html')
    .expect('Content-Type', /text\/html/)
    .expect(200);
  assert.match(runtimePage.text, /data-app-runtime-run/);

  const runtimeVerifier = await request(app)
    .get('/js/app-runtime-verifier.js?v=20260622-appverify1')
    .expect('Content-Type', /application\/javascript/)
    .expect(200);
  assert.match(runtimeVerifier.text, /checkLiveGpsTracking/);

  const homeInternationalStyles = await request(app)
    .get('/css/home-international.css?v=20260623-home-safety-fare1')
    .expect('Content-Type', /text\/css/)
    .expect(200);
  assert.match(homeInternationalStyles.text, /home-safety-action/);
  assert.match(homeInternationalStyles.text, /goi-global-theme\.home-international/);

  const fitScreenStyles = await request(app)
    .get('/fit-screen.css?v=20260508-mobile1')
    .expect('Content-Type', /text\/css/)
    .expect(200);
  assert.match(fitScreenStyles.text, /fit-screen/);

  const sharedHomeStyles = await request(app)
    .get('/shared/chunks/home/styles/index.css?v=20260528-inline-split1')
    .expect('Content-Type', /text\/css/)
    .expect(200);
  assert.match(sharedHomeStyles.text, /\.hero/);

  const firebaseClientConfig = await request(app)
    .get('/api/auth/firebase/client-config')
    .expect('Content-Type', /application\/json/)
    .expect(200);
  assert.equal(firebaseClientConfig.body.ok, true);
  assert.match(firebaseClientConfig.body.config.apiKey, /^AIza/);

  const assetLinks = await request(app)
    .get('/.well-known/assetlinks.json')
    .expect('Content-Type', /application\/json/)
    .expect(200);
  assert.equal(assetLinks.body[0].target.package_name, 'in.goindiaride.app');
  assert.equal(assetLinks.body[0].target.sha256_cert_fingerprints.length, 1);

  const twaConfig = await request(app)
    .get('/app/android/goindiaride-twa-config.json')
    .expect('Content-Type', /application\/json/)
    .expect(200);
  assert.equal(twaConfig.body.packageName, 'in.goindiaride.app');

  const playListing = await request(app)
    .get('/app/play-store-listing.json')
    .expect('Content-Type', /application\/json/)
    .expect(200);
  assert.equal(playListing.body.title, 'GO India RIDE');

  const playDataSafety = await request(app)
    .get('/app/play-data-safety.json')
    .expect('Content-Type', /application\/json/)
    .expect(200);
  assert.ok(playDataSafety.body.categories.some((category) => category.category === 'Location'));

  const runbook = await request(app)
    .get('/docs/android-app-conversion.md')
    .expect('Content-Type', /text\/markdown/)
    .expect(200);
  assert.match(runbook.text, /Digital Asset Links/);

  await request(app)
    .get('/backend/src/app.js')
    .expect(404);
});

test('PWA app shell reveals install controls only after a real install prompt is available', async () => {
  const home = runPwaShellInFakeDom({ pathname: '/', includeHomeInstallButton: true });
  assert.equal(home.homeInstallButton.hidden, true);

  let preventDefaultCalled = false;
  let promptCalled = false;
  home.windowListeners.beforeinstallprompt[0]({
    preventDefault() { preventDefaultCalled = true; },
    prompt() { promptCalled = true; },
    userChoice: Promise.resolve({ outcome: 'accepted' })
  });

  assert.equal(preventDefaultCalled, true);
  assert.equal(home.homeInstallButton.hidden, false);
  assert.equal(home.homeInstallLabel.textContent, 'Install app');

  const result = await home.window.GoIndiaRidePWA.promptInstall();
  assert.equal(promptCalled, true);
  assert.equal(result.ok, true);
  assert.equal(home.homeInstallButton.hidden, true);

  const customer = runPwaShellInFakeDom({
    pathname: '/pages/customer-dashboard.html',
    includeHomeInstallButton: false
  });
  const dock = customer.document.getElementById('goiPwaInstallDock');
  const customerInstallButton = customer.document
    .querySelectorAll('[data-goi-pwa-install]')
    .find((node) => node !== dock);

  assert.ok(dock);
  assert.equal(dock.hidden, true);
  customer.windowListeners.beforeinstallprompt[0]({
    preventDefault() {},
    prompt() {},
    userChoice: Promise.resolve({ outcome: 'dismissed' })
  });

  assert.equal(dock.hidden, false);
  assert.equal(customerInstallButton.hidden, false);
  assert.equal(customerInstallButton.textContent, 'Install Customer App');

  const driver = runPwaShellInFakeDom({
    pathname: '/driver/index.html',
    includeHomeInstallButton: false
  });
  const driverDock = driver.document.getElementById('goiPwaInstallDock');
  const driverInstallButton = driver.document
    .querySelectorAll('[data-goi-pwa-install]')
    .find((node) => node !== driverDock);
  driver.windowListeners.beforeinstallprompt[0]({
    preventDefault() {},
    prompt() {},
    userChoice: Promise.resolve({ outcome: 'dismissed' })
  });

  assert.ok(driverDock);
  assert.equal(driverDock.hidden, false);
  assert.equal(driverInstallButton.hidden, false);
  assert.equal(driverInstallButton.textContent, 'Install Driver Partner App');
});

test('main app pages link the correct manifests, splash asset, push client and PWA bootstrap', () => {
  const files = {
    home: read('index.html'),
    publicBooking: read('book-cab.html'),
    customer: read('customer/index.html'),
    driver: read('driver/index.html'),
    admin: read('admin/app.html'),
    booking: read('pages/booking.html'),
    customerDashboard: read('pages/customer-dashboard.html'),
    driverDashboard: read('pages/driver-dashboard.html'),
    login: read('pages/login.html')
  };

  assert.match(files.home, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.home, /href="\.\/customer\/manifest\.webmanifest" data-goi-pwa-manifest="customer-app"/);
  assert.match(files.home, /href="\.\/driver\/manifest\.webmanifest" data-goi-pwa-manifest="driver-partner-app"/);
  assert.doesNotMatch(files.home, /data-goi-app-entry="customer"/);
  assert.doesNotMatch(files.home, /data-goi-app-entry="driver-partner"/);
  assert.doesNotMatch(files.home, /home_customer_app/);
  assert.doesNotMatch(files.home, /home_driver_partner_app/);
  assert.match(files.publicBooking, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.customer, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.driver, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.admin, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.booking, /href="\.\.\/customer\/manifest\.webmanifest"/);
  assert.match(files.customerDashboard, /href="\.\.\/customer\/manifest\.webmanifest"/);
  assert.match(files.driverDashboard, /href="\.\.\/driver\/manifest\.webmanifest"/);
  assert.match(files.login, /href="\.\.\/manifest\.webmanifest"/);
  assert.match(files.home, /id="installAppBtn"/);
  assert.match(files.home, /data-goi-pwa-install/);
  assert.match(files.driver, /Driver Partner App/);
  assert.match(files.driverDashboard, /Driver Partner App/);

  for (const [name, source] of Object.entries(files)) {
    assert.match(source, /apple-touch-startup-image/, `${name} missing startup image`);
    assert.match(source, /pwa-app-shell\.js\?v=20260623-app-entry1/, `${name} missing PWA shell`);
  }

  assert.match(files.customer, /push-notifications\.js\?v=20260613-push-phase4/);
  assert.match(files.driver, /push-notifications\.js\?v=20260613-push-phase4/);
  assert.match(files.admin, /push-notifications\.js\?v=20260613-push-phase4/);
  assert.match(files.booking, /push-notifications\.js\?v=20260613-push-phase4/);
});

test('legal and app-store data safety disclosure pages are linked and indexed', () => {
  const home = read('index.html');
  const dataSafety = read('pages/legal/data-safety.html');
  const accountDeletion = read('pages/legal/account-deletion.html');
  const contact = read('pages/contact.html');
  const privacy = read('pages/legal/privacy-policy.html');
  const customerDashboard = read('pages/customer-dashboard.html');
  const sitemap = read('sitemap.xml');

  assert.match(home, /pages\/legal\/privacy-policy\.html/);
  assert.match(home, /pages\/legal\/terms-and-conditions\.html/);
  assert.match(home, /pages\/legal\/refund-policy\.html/);
  assert.match(home, /pages\/legal\/data-safety\.html/);
  assert.match(home, /pages\/legal\/account-deletion\.html/);
  assert.match(dataSafety, /Data Safety Details/);
  assert.match(dataSafety, /Driver GPS/);
  assert.match(dataSafety, /Razorpay/);
  assert.match(dataSafety, /PayPal/);
  assert.match(dataSafety, /account-deletion\.html/);
  assert.match(accountDeletion, /Account Deletion/);
  assert.match(accountDeletion, /mailto:privacy@goindiaride\.in/);
  assert.match(accountDeletion, /GO%20India%20RIDE%20account%20deletion%20request/);
  assert.match(contact, /legal\/account-deletion\.html/);
  assert.match(privacy, /account-deletion\.html/);
  assert.match(customerDashboard, /data-account-deletion-link/);
  assert.match(customerDashboard, /\.\/legal\/account-deletion\.html/);
  assert.doesNotMatch(customerDashboard, /data-profile-feature="account/);
  assert.match(sitemap, /pages\/legal\/data-safety\.html/);
  assert.match(sitemap, /pages\/legal\/account-deletion\.html/);
});

test('TWA and Play Store app conversion metadata is present and policy-aligned', async () => {
  const twaConfig = readJson('app/android/goindiaride-twa-config.json');
  const playListing = readJson('app/play-store-listing.json');
  const playDataSafety = readJson('app/play-data-safety.json');
  const runbook = read('docs/android-app-conversion.md');
  const renderBlueprint = read('render.yaml');
  const androidStatus = getAndroidAppConversionStatus();

  assert.equal(twaConfig.packageName, 'in.goindiaride.app');
  assert.equal(twaConfig.host, 'goindiaride.in');
  assert.equal(twaConfig.manifestUrl, 'https://goindiaride.in/manifest.json');
  assert.equal(twaConfig.startUrl, 'https://goindiaride.in/index.html?source=twa');
  assert.equal(twaConfig.assetLinksUrl, 'https://goindiaride.in/.well-known/assetlinks.json');

  assert.equal(playListing.title, 'GO India RIDE');
  assert.equal(playListing.privacyPolicyUrl, 'https://goindiaride.in/pages/legal/privacy-policy.html');
  assert.equal(playListing.accountDeletionUrl, 'https://goindiaride.in/pages/legal/account-deletion.html');
  assert.match(JSON.stringify(playListing), /support@goindiaride\.in/);

  assert.ok(playDataSafety.encryptedInTransit);
  assert.ok(playDataSafety.categories.some((category) => category.category === 'Location'));
  assert.ok(playDataSafety.categories.some((category) => category.category === 'Financial info'));
  assert.ok(playDataSafety.categories.some((category) => category.category === 'Device or other IDs'));
  assert.match(JSON.stringify(playDataSafety.runtimePermissionDisclosure), /notifications/i);

  assert.match(runbook, /bubblewrap init --manifest=https:\/\/goindiaride\.in\/manifest\.json/);
  assert.match(runbook, /ANDROID_APP_SHA256_CERT_FINGERPRINTS/);
  assert.match(runbook, /target SDK/);
  assert.match(renderBlueprint, /ANDROID_APP_PACKAGE_NAME/);
  assert.match(renderBlueprint, /ANDROID_APP_SHA256_CERT_FINGERPRINTS/);

  assert.equal(androidStatus.websiteReady, true);
  assert.equal(androidStatus.digitalAssetLinksReady, true);
  assert.equal(androidStatus.ok, true);

  const response = await request(app)
    .get('/health/android-app-conversion')
    .expect(200);

  assert.equal(response.body.websiteReady, true);
  assert.equal(response.body.digitalAssetLinks.configured, true);
  assert.equal(response.body.twa.configFile, true);
  assert.equal(response.body.playStore.dataSafetyCoversLocation, true);
  assert.equal(response.body.policy.runtimePermissionDisclosure, true);
});

test('app readiness health contract reports all app-conversion wiring', async () => {
  const directStatus = getAppReadinessStatus();
  assert.equal(directStatus.version, APP_READINESS_VERSION);
  assert.equal(directStatus.ok, true);
  assert.equal(directStatus.warningCount, 0);
  assert.equal(directStatus.pwa.rootManifest, true);
  assert.equal(directStatus.pwa.rootManifestJsonAlias, true);
  assert.equal(directStatus.pwa.serviceWorkerPublicAlias, true);
  assert.equal(directStatus.pwa.offlineFallback, true);
  assert.equal(directStatus.pwa.firebaseMessagingWorker, true);
  assert.equal(directStatus.pwa.accountDeletionOfflineCached, true);
  assert.equal(directStatus.surfaces.customer.pushClient, true);
  assert.equal(directStatus.surfaces.driver.pushClient, true);
  assert.equal(directStatus.payment.routes.razorpayVerify, true);
  assert.equal(directStatus.payment.routes.paypalCapture, true);
  assert.equal(directStatus.otp.recaptchaVerifier, true);
  assert.equal(directStatus.legal.dataSafety, true);
  assert.equal(directStatus.legal.accountDeletionPage, true);
  assert.equal(directStatus.legal.customerAccountDeletionPath, true);
  assert.equal(directStatus.legal.storeDeletionDisclosure, true);
  assert.equal(directStatus.runtimeVerification.verificationPage, true);
  assert.equal(directStatus.runtimeVerification.permissionDisclosure, true);
  assert.equal(directStatus.runtimeVerification.pwaDirectProbe, true);
  assert.equal(directStatus.runtimeVerification.otpWebViewProbe, true);
  assert.equal(directStatus.runtimeVerification.pushTokenProbe, true);
  assert.equal(directStatus.runtimeVerification.liveGpsProbe, true);
  assert.equal(directStatus.androidAppConversion.websiteReady, true);
  assert.equal(directStatus.androidAppConversion.digitalAssetLinksReady, true);
  assert.equal(directStatus.androidAppConversion.twa.configFile, true);
  assert.equal(directStatus.androidAppConversion.playStore.listingSource, true);
  assert.equal(directStatus.androidAppConversion.policy.runtimePermissionDisclosure, true);

  const response = await request(app)
    .get('/health/app-readiness')
    .expect(200);

  assert.equal(response.body.version, APP_READINESS_VERSION);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.appStores.googlePlayDataSafetyPage, '/pages/legal/data-safety.html');
  assert.equal(response.body.appStores.androidAssetLinksUrl, '/.well-known/assetlinks.json');
  assert.equal(response.body.appStores.androidConversionHealthUrl, '/health/android-app-conversion');
  assert.equal(response.body.appStores.androidTwaConfigUrl, '/app/android/goindiaride-twa-config.json');
  assert.equal(response.body.appStores.playStoreListingSource, '/app/play-store-listing.json');
  assert.equal(response.body.appStores.playDataSafetySource, '/app/play-data-safety.json');
  assert.equal(response.body.appStores.accountDeletionUrl, '/pages/legal/account-deletion.html');
  assert.equal(response.body.appStores.accountDeletionReady, true);
  assert.equal(response.body.appStores.runtimeVerificationUrl, '/pages/app-runtime-check.html');
});
