/* SUPERSNAKE Service Worker
   Versioned by build id via query param: /sw.js?v=<BUILD_ID>
   Strategy:
   - Navigations (HTML): network-first, cache fallback (prevents stale index.html)
   - Assets (JS/CSS/images/fonts/workers): cache-first for performance/offline
   - build.json: network-only (update checks) */

const url = new URL(self.location.href);
const VERSION = url.searchParams.get('v') || 'dev';
const CACHE_PREFIX = 'supersnake-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

function isBuildJson(reqUrl) {
  try {
    const u = new URL(reqUrl);
    return u.pathname.endsWith('/build.json') || u.pathname.endsWith('build.json');
  } catch {
    return false;
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Do not call skipWaiting() here.
      // Updates are activated via an explicit user action (Settings → Update) using SKIP_WAITING.
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Cleanup old caches.
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) return caches.delete(k);
          return Promise.resolve(false);
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const destination = req.destination || '';
  const isNavigate =
    req.mode === 'navigate' ||
    (destination === '' && req.headers.get('accept') && req.headers.get('accept').includes('text/html'));

  // Never cache build.json (update checks must reflect the network).
  if (isBuildJson(req.url)) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  if (isNavigate) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const res = await fetch(req, { cache: 'no-store' });
          if (res && res.ok) {
            // Cache navigations under '/' to keep a stable key across hash routes.
            await cache.put('/', res.clone());
          }
          return res;
        } catch {
          const cached = await cache.match('/');
          if (cached) return cached;
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  const cacheableDestinations = new Set(['script', 'style', 'image', 'font', 'worker']);
  if (cacheableDestinations.has(destination)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok) {
          try {
            await cache.put(req, res.clone());
          } catch {
            // ignore
          }
        }
        return res;
      })()
    );
    return;
  }

  // Default: network-only.
  event.respondWith(fetch(req));
});
