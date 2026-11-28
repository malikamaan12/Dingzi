/* dingzi — Service Worker (PWA Shell + High-Urgency Lock-Screen Web Push + 1-Tap Acknowledge) */
const CACHE_NAME = 'dingzi-pwa-shell-v3';
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/brand/dingzi-favicon-192.png',
  '/brand/dingzi-app-icon-512.png',
  '/icon-192.svg',
  '/icon-512.svg',
  '/favicon.svg',
];

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

function resolveAckRequest(targetUrl) {
  if (typeof targetUrl !== 'string') return null;
  const pagerMatch = targetUrl.match(/^\/pager\/([a-f0-9-]{36})/i);
  if (pagerMatch) {
    return {
      url: '/api/public/pager/' + pagerMatch[1] + '/ack',
      body: '{}',
    };
  }
  const waitlistMatch = targetUrl.match(/^\/waitlist\/([a-f0-9-]{36})/i);
  if (waitlistMatch) {
    return {
      url: '/api/public/waitlist-ticket/' + waitlistMatch[1] + '/respond',
      body: JSON.stringify({ action: 'on_my_way' }),
    };
  }
  return null;
}

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
    // Raster PNG icons are required for iOS 16.4+ Web Push and Android OEM lock screens
    icon: '/brand/dingzi-favicon-192.png',
    badge: '/brand/dingzi-favicon-192.png',
    tag: payload.tag || 'pager-ready-alarm',
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 120, 300, 120, 500, 160, 600],
    data: {
      url: payload.url || '/',
      ticketCode: payload.ticketCode || '',
    },
    actions: [
      { action: 'open', title: 'Open Pass' },
      { action: 'ack', title: 'On My Way · Silence' },
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
  const ackSpec = resolveAckRequest(targetUrl);

  const ackNetworkPromise = ackSpec
    ? fetch(ackSpec.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ackSpec.body,
      }).catch(() => {})
    : Promise.resolve();

  event.waitUntil(
    Promise.all([
      ackNetworkPromise,
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        for (const client of windowClients) {
          client.postMessage({ type: 'PUSH_ALARM_ACKNOWLEDGED', action: event.action, url: targetUrl });
        }
        // If the guest tapped "On My Way · Silence" directly on the lock screen, silence without forcing browser open
        if (event.action === 'ack') {
          return;
        }
        for (const client of windowClients) {
          if (new URL(client.url).pathname === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        if (windowClients.length > 0 && 'navigate' in windowClients[0] && 'focus' in windowClients[0]) {
          return windowClients[0].navigate(targetUrl).then(c => (c ? c.focus() : undefined));
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
    ]),
  );
});

// Safe asset & navigation fetch handler: never returns HTML for JS/CSS assets
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/objects/') || url.pathname === '/sw.js') return;

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
