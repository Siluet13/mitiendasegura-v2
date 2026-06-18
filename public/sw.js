const CACHE_VERSION = 'v4';
const SHELL_CACHE = `mi-tienda-shell-${CACHE_VERSION}`;
const ASSETS_CACHE = `mi-tienda-assets-${CACHE_VERSION}`;

const STATIC_PRECACHE = [
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch('/')
      .then(async (shellResponse) => {
        const html = await shellResponse.text();

        const jsUrls  = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
        const cssUrls = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map((m) => m[1]);
        const discovered = [...new Set([...jsUrls, ...cssUrls])];

        const cache = await caches.open(SHELL_CACHE);

        await cache.put('/', new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }));

        await Promise.all(
          STATIC_PRECACHE.map((url) =>
            fetch(url).then((r) => (r.ok ? cache.put(url, r) : null)).catch(() => null)
          )
        );

        await Promise.all(
          discovered.map((url) =>
            fetch(url).then((r) => (r.ok ? cache.put(url, r) : null)).catch(() => null)
          )
        );

        console.log(`[SW v4] install: shell + ${STATIC_PRECACHE.length} static + ${discovered.length} asset bundles cached`);
      })
      .catch(() =>
        caches.open(SHELL_CACHE)
          .then((cache) => cache.addAll([...STATIC_PRECACHE]).catch(() => {}))
      )
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

function isExcluded(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@react') ||
    url.pathname.startsWith('/node_modules') ||
    url.pathname.includes('hot-update') ||
    url.hostname !== self.location.hostname
  );
}

function isStaticAsset(pathname) {
  return (
    /\.(js|mjs|cjs|css|png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|otf)$/.test(pathname) ||
    pathname === '/manifest.json' ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/assets/')
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (isExcluded(url) || event.request.method !== 'GET') return;

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response?.ok) {
            const clone = response.clone();
            caches.open(ASSETS_CACHE).then((cache) => cache.put(event.request, clone));
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
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match('/'))
            .then((cached) => cached || caches.match('/offline.html'))
        )
    );
  }
});
