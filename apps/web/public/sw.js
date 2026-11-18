/*
 * Service worker de ClinAgenda — pensado para la Clínica Sur, donde el internet se cae seguido.
 * - Pantallas y archivos estáticos: se guardan para que la app abra aunque no haya conexión.
 * - Lecturas de la API (agenda, pacientes, médicos): primero la red; si no hay, la última copia guardada.
 * - Escrituras (agendar, cancelar): NUNCA se fingen. Agendar sin internet lo maneja la app con una
 *   cola visible de "pendientes"; cancelar o editar sin internet muestra un aviso claro.
 * Al cerrar sesión se borra la copia de datos de pacientes de este equipo.
 */
const VERSION = 'v1';
const SHELL = `ca-shell-${VERSION}`;
const STATIC = `ca-static-${VERSION}`;
const DATA = `ca-data-${VERSION}`;
const API_CACHEABLE = /^\/api\/(appointments|clinics|doctors|patients|waitlist|auth\/me)/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/offline.html', '/icon.svg', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'logout') event.waitUntil(caches.delete(DATA));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.match(/\.(svg|png|woff2?)$/)) {
    event.respondWith(cacheFirst(req, STATIC));
    return;
  }
  if (API_CACHEABLE.test(url.pathname)) {
    event.respondWith(networkFirst(req, DATA));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      networkFirst(req, SHELL).catch(async () => (await caches.match('/offline.html')) || Response.error()),
    );
  }
});

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(name)).put(req, res.clone());
  return res;
}

async function networkFirst(req, name) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(name)).put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await caches.match(req);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set('X-From-Cache', '1');
      return new Response(hit.body, { status: hit.status, headers });
    }
    throw e;
  }
}
