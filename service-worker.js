// ============================================
// PANDA CARD — SERVICE WORKER
// ============================================

const CACHE_VERSION = 'pandacard-v1.0.7'; // Bumped version
const STATIC_ASSETS = [
  '/',
  '/auth.html',
  '/app.html',
  '/bamboo-view.html',
  '/offline.html',
  '/404.html',
  '/manifest.json',
  '/css/style.css',
  '/js/config.js',
  '/js/utils.js',
  '/js/auth.js',
  '/js/app.js',
  '/js/bamboo.js'
];

const BYPASS_HOSTS = [
  'supabase.co',
  'paystack.co',
  'flutterwave.com',
  'er-api.com',
  'googleapis.com',
  'jsdelivr.net',
  'imgur.com',
  'pixabay.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.all(
        STATIC_ASSETS.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn('⚠️ Failed to cache:', url);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (BYPASS_HOSTS.some((h) => url.hostname.includes(h))) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => {
        if (req.destination === 'document') return caches.match('/offline.html');
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ============================================
// PUSH NOTIFICATIONS
// ============================================

self.addEventListener('push', function(event) {
  if (event.data) {
    let data = {};
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Panda Card', body: event.data.text() };
    }

    const options = {
      body: data.body || 'You have a new update.',
      icon: 'https://i.imgur.com/9aLmHyS.png',
      badge: 'https://i.imgur.com/9aLmHyS.png',
      vibrate: [200, 100, 200, 100, 200],
      data: { url: data.url || '/app.html' },
      actions: [{ action: 'open', title: 'Open App' }],
      tag: data.tag || 'pandacard-notification',
      renotify: true
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Panda Card', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
