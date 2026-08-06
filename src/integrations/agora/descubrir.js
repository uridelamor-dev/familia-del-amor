// Ágora — DESCUBRIMIENTO de rutas de API a partir de la propia web de administración.
// El puerto 8984 sirve la "Aplicación Web para la Administración de Ágora" (un SPA). Su JavaScript
// llama a los endpoints reales de datos. Aquí (PURO) extraemos los scripts del HTML y las rutas
// candidatas del JS; el fetch vive en server.js.

// Resuelve una URL relativa contra la base http://host:puerto.
export function resolverUrl(base, src) {
  const s = String(src || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const b = String(base || "").replace(/\/+$/, "");
  return s.startsWith("/") ? b + s : b + "/" + s.replace(/^\.?\//, "");
}

// Extrae las URLs de <script src> y <link href="*.js"> del HTML, ya absolutas.
export function extraerScripts(html, base) {
  const out = [];
  const push = (u) => { const r = resolverUrl(base, u); if (r) out.push(r); };
  let m;
  const reScript = /<script[^>]+src=["']([^"']+)["']/gi;
  while ((m = reScript.exec(String(html || "")))) push(m[1]);
  const reLink = /<link[^>]+href=["']([^"']+\.js[^"']*)["']/gi;
  while ((m = reLink.exec(String(html || "")))) push(m[1]);
  return [...new Set(out)];
}

const ASSET_RE = /\.(js|css|png|jpe?g|gif|svg|woff2?|ttf|eot|ico|map|html|json|webp)(\?|#|$)/i;

// Extrae cadenas que parecen rutas ("/algo/...") de un texto (HTML o JS), sin assets estáticos.
export function extraerRutasApi(texto) {
  const s = String(texto || "");
  const found = new Set();
  const re = /["'`](\/?[a-zA-Z0-9][a-zA-Z0-9/_\-.{}:]{2,90})["'`]/g;
  let m;
  while ((m = re.exec(s))) {
    const p = m[1];
    if (!p.includes("/")) continue;      // debe parecer una ruta
    if (ASSET_RE.test(p)) continue;      // fuera imágenes/js/css…
    if (/^https?:\/\//i.test(p)) continue;
    found.add(p);
  }
  return [...found];
}

// Palabras que "huelen" a datos de venta/reporte (para priorizar).
const OLOR = /api|rest|serv|integr|venta|cierre|document|ticket|sale|export|arqueo|factura|albaran|resumen|report|caja|dashboard|informe|estadist/i;

// Separa las rutas en candidatas de API (prometedoras) y el resto.
export function clasificarRutas(rutas) {
  const api = [], otras = [];
  for (const p of [...new Set(rutas || [])]) (OLOR.test(p) ? api : otras).push(p);
  api.sort((a, b) => a.localeCompare(b));
  otras.sort((a, b) => a.localeCompare(b));
  return { api, otras };
}
