const CACHE = 'cm-v3';
// Static assets use content-hashed filenames (Vite), safe to cache-first
const STATIC_EXTS = /\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?)(\?.*)?$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  if (STATIC_EXTS.test(url.pathname)) {
    // Cache-first: hashed assets are immutable
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          caches.open(CACHE).then(c => c.put(request, res.clone()));
          return res;
        });
      })
    );
  } else {
    // Network-first: HTML must always be fresh
    e.respondWith(
      fetch(request)
        .then(res => {
          caches.open(CACHE).then(c => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'Cooking Master', {
      body:  data.body  ?? '오늘의 식단을 확인해보세요 🍱',
      icon:  '/icon-192.png',
      badge: '/icon-96.png',
      data:  { url: data.url ?? '/calendar' },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/calendar';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const match = list.find(c => new URL(c.url).pathname === url);
      if (match) return match.focus();
      return clients.openWindow(url);
    })
  );
});
