const CACHE_NAME = 'goindiaride-pwa-v49-20260607-booking-seo';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './book-cab.html',
  './css/quick-booking.css',
  './css/professional-purple-theme.css',
  './js/global-ui.js',
  './js/data-preservation-guard.js',
  './js/wallet-core.js',
  './js/quick-booking.js',
  './assets/images/quick-booking-hero.png',
  './optimization.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => {
      if (key !== CACHE_NAME && key.startsWith('goindiaride-pwa-')) {
        return caches.delete(key);
      }
      return Promise.resolve();
    }))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const path = String(requestUrl.pathname || '').toLowerCase();
  const destination = String(event.request.destination || '').toLowerCase();
  const isCriticalLiveControlAsset = isSameOrigin && (
    path.startsWith('/admin/') ||
    path.startsWith('/customer/') ||
    path.startsWith('/driver/') ||
    path === '/js/admin-control-bridge.js' ||
    path === '/js/customer-dashboard-live-bridge.js' ||
    path === '/pages/customer-dashboard.html' ||
    path === '/pages/booking.html'
  );
  const shouldUseNetworkFirst = event.request.mode === 'navigate' || (
    isSameOrigin && (
      destination === 'script' ||
      destination === 'style' ||
      destination === 'document' ||
      path.endsWith('.html') ||
      path.endsWith('.js') ||
      path.endsWith('.css') ||
      path.startsWith('/pages/')
    )
  );

  if (isCriticalLiveControlAsset) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'reload' }))
        .then((response) => {
          if (response && response.status === 200 && event.request.url.startsWith('http')) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Keep HTML/pages/scripts/styles fresh so latest deploy appears immediately.
  if (shouldUseNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const isHttp = event.request.url.startsWith('http');
          if (response && response.status === 200 && isHttp) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const isHttp = event.request.url.startsWith('http');
          if (!response || response.status !== 200 || !isHttp) {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

