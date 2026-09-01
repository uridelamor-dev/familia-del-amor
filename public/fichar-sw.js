/* Service Worker del kiosco de fichaje.
 *
 * Hace UNA sola cosa: que la pantalla siga abriéndose cuando se cae internet. La tablet
 * está clavada en la barra y la wifi del local aguanta; lo que falla de verdad es la línea
 * de subida. Si en ese momento alguien recarga la página sin esto, se queda con el
 * dinosaurio y no puede fichar.
 *
 * Lo que NO hace, a propósito:
 *
 *  · NO cachea ninguna respuesta de /api/. Un listado de gente guardado de ayer diría que
 *    está dentro quien ya se fue, y el estado que enseña el kiosco sería mentira.
 *  · NO acepta la hora del cliente para nada. Los fichajes pendientes se guardan con el
 *    reloj de la tablet SOLO como dato de diagnóstico; la hora buena la sigue poniendo el
 *    servidor cuando la cola sube. Un service worker que hiciera autoritativo el reloj
 *    local sería el camino más corto para falsificar un registro de jornada.
 */

const CACHE = "fichar-v2";
const ESTATICOS = [
  "/fichar.html",
  "/fichar.js",
  "/fichar.css",
  "/styles.css",
];

self.addEventListener("install", (e) => {
  // skipWaiting: la tablet no se cierra nunca, así que sin esto una versión nueva podría
  // tardar semanas en entrar.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;                 // los fichajes NO pasan por aquí
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;           // nunca se cachea el estado

  // Red primero y caché como red de seguridad: mientras haya línea se sirve lo último,
  // y solo cuando no la hay se tira de lo guardado.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/fichar.html")))
  );
});
