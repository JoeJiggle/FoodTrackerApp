// Service Worker: hält die App offline verfügbar.
// Bei jeder Änderung an App-Dateien CACHE erhöhen (und APP_VERSION in js/version.js),
// sonst bekommen installierte Apps das Update nicht.
const CACHE = 'personalfoodtracker-1.4.3';

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/version.js',
  'js/db.js',
  'js/settings.js',
  'js/state.js',
  'js/ui.js',
  'js/format.js',
  'js/nutrition.js',
  'js/text.js',
  'js/datasets.js',
  'js/foods.js',
  'js/log.js',
  'js/search.js',
  'js/off-api.js',
  'js/scanner.js',
  'js/views/today.js',
  'js/views/add.js',
  'js/views/manual.js',
  'js/views/scan.js',
  'js/views/own-foods.js',
  'js/views/history.js',
  'js/views/settings.js',
  'js/views/quick.js',
  'js/views/templates.js',
  'js/views/weight.js',
  'js/templates.js',
  'js/weight.js',
  'js/backup.js',
  'vendor/zxing-wasm/es/reader/index.js',
  'vendor/zxing-wasm/es/share.js',
  'vendor/zxing-wasm/reader/zxing_reader.wasm',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

// Datenbanken sind optional – fehlt eine, wird sie übersprungen.
const OPTIONAL_FILES = ['data/foods-de.json', 'data/foods-ch.json', 'data/foods-fi.json'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_FILES.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.all(OPTIONAL_FILES.map(async (u) => {
      try {
        const res = await fetch(u, { cache: 'reload' });
        if (res.ok) await cache.put(u, res);
      } catch { /* fehlt: egal */ }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Nur eigene Dateien; Open Food Facts & Co. gehen direkt ins Netz (network-only).
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') return (await cache.match('index.html')) ?? fetch(req);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  })());
});
