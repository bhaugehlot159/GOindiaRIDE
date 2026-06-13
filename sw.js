const CACHE_NAME = 'goindiaride-pwa-v64-20260613-driver-gps';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './book-cab.html',
  './taxi-service.html',
  './css/quick-booking.css',
  './css/search-service.css',
  './css/professional-purple-theme.css',
  './js/global-ui.js',
  './js/data-preservation-guard.js',
  './js/push-notifications.js',
  './admin/js/admin-operations-center.js',
  './admin/js/realtime-matching-engine.js',
  './admin/js/live-location-operations.js',
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

function parsePushPayload(event) {
  const fallback = {
    title: 'GOindiaRIDE update',
    body: 'Your ride update is ready.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'goindiaride-update',
    data: { url: './' }
  };

  if (!event.data) {
    return fallback;
  }

  try {
    const parsed = event.data.json();
    return {
      ...fallback,
      ...parsed,
      data: {
        ...fallback.data,
        ...(parsed && parsed.data ? parsed.data : {})
      }
    };
  } catch (_error) {
    const body = event.data.text();
    return {
      ...fallback,
      body: body || fallback.body
    };
  }
}

function normalizeClientUrl(value) {
  try {
    const target = new URL(value || './', self.location.origin);
    if (target.origin !== self.location.origin) {
      return self.location.origin + '/';
    }
    return target.href;
  } catch (_error) {
    return self.location.origin + '/';
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const title = String(payload.title || 'GOindiaRIDE update').slice(0, 80);
  const options = {
    body: String(payload.body || payload.message || 'Your ride update is ready.').slice(0, 220),
    icon: payload.icon || './icons/icon-192.png',
    badge: payload.badge || './icons/icon-192.png',
    tag: String(payload.tag || 'goindiaride-update').slice(0, 64),
    renotify: true,
    requireInteraction: Boolean(payload.requireInteraction),
    data: {
      ...(payload.data || {}),
      url: normalizeClientUrl(payload.data && payload.data.url)
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = normalizeClientUrl(event.notification && event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
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

