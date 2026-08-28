// Cachea el armazón de la app para que abra sin señal. Los datos NO se cachean
// acá: los borradores y el catálogo viven en IndexedDB, que es lo que permite
// seguir cargando un registro con el buque fuera de cobertura.
const CACHE = 'sgs-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return; // la API nunca se cachea

  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ??
        fetch(event.request)
          .then((res) => {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copia));
            return res;
          })
          .catch(() => caches.match('/')),
    ),
  );
});
