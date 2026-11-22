// Network-first app shell with offline fallback. API calls are never cached.
const CACHE = 'americano-v1';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.add('/index.html')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { caches.open(CACHE).then(c => c.put('/index.html', r.clone())); return r; })
      .catch(() => caches.match('/index.html')));
  }
});
