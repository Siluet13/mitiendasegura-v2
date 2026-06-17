const CACHE_VERSION = 'v2';
const SHELL_CACHE = `mi-tienda-shell-${CACHE_VERSION}`;
const ASSETS_CACHE = `mi-tienda-assets-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSETS_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isApiOrDev(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/__') ||
    url.pathname.includes('hot-update') ||
    url.hostname !== self.location.hostname
  );
}

function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|otf)$/.test(pathname)
    || pathname === '/manifest.json'
    || pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (isApiOrDev(url) || event.request.method !== 'GET') return;

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response?.ok) {
            caches.open(ASSETS_CACHE)
              .then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        }).catch(() => cached ?? new Response('', { status: 503 }));
      })
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response?.ok) {
            caches.open(SHELL_CACHE)
              .then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match('/'))
        )
    );
  }
});
