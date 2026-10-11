// SmartCart service worker: lets the phone install SmartCart as an app.
// - Pages and /api/ data always come from the server (prices, stock and money must be live).
// - Versioned files (style.css?v=2.9.0, ui.js?v=2.9.0 ...) are kept, so the app opens fast.
// - With no connection, pages show offline.html instead of the browser's error.
const CACHE = 'smartcart-2.9.0';
const OFFLINE = 'offline.html';
const SHELL = [OFFLINE, 'css/style.css?v=2.9.0', 'favicon.svg?v=2.9.0', 'icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (url.searchParams.has('v')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
