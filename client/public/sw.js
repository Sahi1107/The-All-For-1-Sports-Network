/* All For 1 service worker — offline app shell + web push.
   Bump CACHE on shipping changes to this file to roll the cache. */
const CACHE = 'af1-shell-v2';
// Clean URLs: /index.html → /, /offline.html → /offline. Precache the served
// paths, or cache.addAll rejects on the redirect and the SW never installs.
// /app.html is the SPA-fallback shell (empty #root → loading spinner) — the same
// neutral shell app routes get online, so offline navigations don't flash the landing.
const CORE = ['/', '/app', '/offline', '/manifest.json', '/icons/icon-192.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache dynamic/cross-origin: API, OG cards, share pages, other origins.
  if (url.origin !== location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/og') || url.pathname.startsWith('/s/')) return;

  // Navigations: network-first (always fresh online) → the neutral app shell →
  // offline page. Falls back to /app.html (not the landing) so an offline app route
  // never flashes marketing content.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/app').then((r) => r || caches.match('/offline'))));
    return;
  }

  // Hashed, immutable static assets: cache-first, then populate.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  // Everything else: network, fall back to any cache.
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

// ── Web push — plugs into the server notification dispatcher (deliverPush) ──
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'All For 1', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'All For 1', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag,
    data: { url: d.url || '/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { try { w.navigate(target); } catch (_) { /* ignore */ } return w.focus(); }
      }
      return self.clients.openWindow(target);
    }),
  );
});
