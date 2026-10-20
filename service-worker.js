const CACHE_NAME = 'panda-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.add(OFFLINE_URL);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(OFFLINE_URL);
      })
    );
  } else {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
  }
});

// 🚨 WHATSAPP-STYLE PUSH NOTIFICATIONS 🚨
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
