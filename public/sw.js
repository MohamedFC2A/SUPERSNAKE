/* Simple runtime-caching service worker for a Vite static build.
   Note: This is not a full precache setup, but it enables installability
   and offline-ish behavior by caching visited assets. */

const CACHE_NAME = 'supersnake-runtime-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([
        '/',
        '/index.html',
        '/manifest.webmanifest',
      ]);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))));
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && fresh.type === 'basic') {
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        if (req.mode === 'navigate') {
          const fallback = await cache.match('/index.html');
          if (fallback) return fallback;
        }
        throw e;
      }
    })()
  );
});

