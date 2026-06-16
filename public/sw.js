const CACHE_NAME = 'mi-tienda-assets-v1';

function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|otf)$/.test(pathname)
    || pathname === '/manifest.json'
    || pathname.startsWith('/icons/');
}

function shouldPassthrough(url) {
  return url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/@')
    || url.pathname.startsWith('/__')
    || url.pathname.includes('hot-update')
    || url.hostname !== self.location.hostname;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (shouldPassthrough(url)) return;
  if (event.request.method !== 'GET') return;

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.ok && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
  }
});
