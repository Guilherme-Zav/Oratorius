/**
 * Service worker.
 *
 * Estrategia deliberadamente simples: stale-while-revalidate para tudo do proprio
 * dominio. Nao ha lista de precache gerada em build porque nao ha build de
 * bundler — os arquivos sao servidos como estao, e o cache se enche na primeira
 * visita. O resultado pratico e o mesmo: depois de abrir uma vez, o app funciona
 * offline para sempre.
 *
 * Navegacao usa network-first com queda para o cache, para que um deploy novo
 * apareca sem precisar limpar nada.
 */

const CACHE = 'oratorius-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Se algum destes falhar, a instalacao inteira falharia — por isso cada um
      // e tolerado individualmente.
      Promise.allSettled([
        cache.add('./'),
        cache.add('./index.html'),
        cache.add('./styles.css'),
        cache.add('./manifest.webmanifest'),
        cache.add('./app/main.js'),
        cache.add('./app/workers/analysis.worker.js'),
        cache.add('./worklets/pcm-recorder.js'),
      ]),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
