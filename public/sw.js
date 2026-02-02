/* Service worker shutdown script.
   The app no longer uses a service worker because runtime caching caused stale builds.
   This SW exists only to unregister older installs and clear caches. */

const CACHE_NAME = 'supersnake-runtime-v3-shutdown';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove all caches created by previous versions.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));

      self.clients.claim();

      // Unregister this SW so the app runs without local caching.
      try {
        await self.registration.unregister();
      } catch {
        // ignore
      }
    })()
  );
});

self.addEventListener('fetch', (event) => {
  // Network-only: no runtime caching.
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
