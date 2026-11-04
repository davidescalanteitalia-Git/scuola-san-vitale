/* ── Scuola San Vitale — Service Worker v2 ── */
const CACHE = 'ssv-v2';
const ASSETS = [
  '/',
  '/index.html',
];

/* Instalación: pre-cachear assets */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

/* Activación: limpiar caches viejas */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Fetch: Network-first para HTML, Cache-first para resto */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Solo interceptar misma origin
  if (url.origin !== location.origin) return;

  // Estrategia: intentar red, si falla usar caché
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Guardar copia fresca en caché
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
