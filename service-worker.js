// ============================================================
// PANDA CARD SERVICE WORKER
// Cache + WhatsApp-style stacked push notifications
// ============================================================

const CACHE_NAME = 'panda-offline-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache API / auth calls — always hit network
  if (
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/functions/') ||
    url.pathname.startsWith('/realtime/') ||
    url.hostname.endsWith('.supabase.co')
  ) {
    return;
  }

  // Navigation → network-first, offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Static assets → cache-first, network fallback
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});

// ============================================================
// PUSH — WhatsApp-style stacked notifications
// ============================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Panda Card', body: event.data.text() };
  }

  const title = data.title || 'Panda Card';
  const body = data.body || 'You have a new update.';
  const url = data.url || '/app.html';

  // ✅ FIXED: Force a unique tag so Live mode notifications stack properly.
  // (We ignore data.tag from the backend to prevent them from replacing each other)
  const uniqueTag = `pandacard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const options = {
    body,
    icon: data.icon || 'https://i.imgur.com/9aLmHyS.png',
    badge: data.badge || '/assets/icons/notification-icon.png',
    image: data.image || undefined, // big banner preview (WhatsApp-style)
    vibrate: data.vibrate || [200, 100, 200, 100, 200],
    data: {
      url,
      timestamp: Date.now(),
      ...(data.data || {}),
    },
    actions: [
      { action: 'open', title: 'Open App' },
    ],
    tag: uniqueTag,
    renotify: true, // vibrate/alert each time
    requireInteraction: false,
    timestamp: Date.now(),
  };

  // Remove undefined fields so browser doesn't reject options
  Object.keys(options).forEach((k) => {
    if (options[k] === undefined) delete options[k];
  });

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(
    (event.notification.data && event.notification.data.url) || '/app.html',
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if it's on the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise focus any existing window and navigate it
      if (windowClients.length > 0 && 'focus' in windowClients[0]) {
        const first = windowClients[0];
        first.focus();
        if ('navigate' in first) return first.navigate(targetUrl);
        return first;
      }
      // No window open → open new
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('notificationclose', () => {
  // Optional analytics hook — leave blank
});
