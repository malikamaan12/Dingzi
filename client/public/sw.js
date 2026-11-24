/* Dingzi — Service Worker (PWA Shell + High-Priority Lock-Screen Web Push) */
const CACHE_NAME = 'dingzi-pwa-shell-v2';
const PRECACHE_URLS = ['/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg', '/favicon.svg'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS).catch(() => {})),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))),
      ),
    ]),
  );
});

// High-urgency push handler: wakes locked phone screen with OS sound + vibration + persistent banner
self.addEventListener('push', event => {
  let payload = {
    title: 'Order Ready for Pickup!',
    body: 'Please head to the counter and show your pager code.',
    tag: 'pager-ready-alarm',
    url: '/',
    urgent: true,
    ticketCode: '',
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: payload.tag || 'pager-ready-alarm',
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [500, 150, 500, 150, 800, 200, 800],
    data: { url: payload.url || '/', ticketCode: payload.ticketCode || '' },
    actions: [
      { action: 'open', title: 'Open Pager' },
      { action: 'ack', title: 'Stop Ringing' },
    ],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, options),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        for (const client of windowClients) {
          client.postMessage({ type: 'PUSH_ALARM_RECEIVED', payload });
        }
      }),
    ]),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        client.postMessage({ type: 'PUSH_ALARM_ACKNOWLEDGED', action: event.action });
        if (new URL(client.url).pathname === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

// Safe asset & navigation fetch handler: never returns HTML for JS/CSS assets
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/objects/') || url.pathname === '/sw.js') return;

  // HTML page navigations: always prefer live network, fall back to cached shell only when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put('/', clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/').then(cached => cached || Response.error())),
    );
    return;
  }

  // Hashed static assets & icons: never substitute index.html on miss or offline
  if (url.pathname.startsWith('/assets/') || PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const ct = res.headers.get('content-type') || '';
          if (res.ok && !ct.includes('text/html')) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || Response.error())),
    );
  }
});
