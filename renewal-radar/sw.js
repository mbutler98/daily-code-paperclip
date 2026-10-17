// Cache-first app shell. Bump VERSION on every deploy that changes a shell file;
// the new cache installs silently and takes over on the next cold launch.
const VERSION = 'renewal-radar-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './core.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('renewal-radar-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(request).catch(() =>
        request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
    }),
  );
});
