const CACHE_NAME = 'goindiaride-pwa-v7-20260416';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
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

