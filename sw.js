// Service worker — mantiene VOIDRIFT jugable offline y detecta actualizaciones.
//
// IMPORTANTE: CACHE_VERSION debe subirse a la vez que BUILD_VERSION en voiddrift.html,
// en CADA cambio. El navegador detecta una versión nueva comparando este fichero byte
// a byte con el que ya tiene instalado — si CACHE_VERSION no cambia, no hay forma de
// que se entere de que hay una actualización disponible.
const CACHE_VERSION = '260810-0015';
const CACHE_NAME = 'voidrift-' + CACHE_VERSION;

const CORE_ASSETS = [
  './',
  './voiddrift.html',
  'https://cdn.jsdelivr.net/npm/pixi.js@7/dist/pixi.min.js',
  'https://cdn.jsdelivr.net/npm/nipplejs@0.10.2/dist/nipplejs.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {}) // no bloquear la instalación si un asset externo falla al cachear
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La página envía esto cuando el jugador acepta actualizar (ver voiddrift.html) —
// deja que el SW nuevo (en estado "waiting") tome el control inmediatamente.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Sirve la caché al instante; refresca en segundo plano para la próxima vez
        fetch(event.request).then((resp) => {
          if (resp && resp.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resp));
        }).catch(() => {}); // sin conexión: no pasa nada, ya hemos servido la caché
        return cached;
      }
      // No estaba en caché: intenta red, y si falla (offline) cae al shell cacheado
      return fetch(event.request).catch(() => caches.match('./voiddrift.html'));
    })
  );
});
