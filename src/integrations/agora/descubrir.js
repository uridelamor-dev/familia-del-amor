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

/**
 * Los NOMBRES DE INFORME que conoce ese Ágora, sacados del JavaScript de su propia web de
 * administración.
 *
 * Es la forma de saber qué informes existe SIN adivinar: la web de administración los llama
 * todos, así que sus nombres están escritos en su código. La lista de mensajes candidatos que
 * sondeamos a mano es tirar a ver si suena; esto es leer el índice.
 *
 * Devuelve los nombres completos («IGT.POS.Bus.Reporting.Messages.GetXxxReportRequest») sin
 * repetir y ordenados.
 */
export function extraerClrTypes(texto) {
  const re = /IGT\.POS\.Bus\.[A-Za-z.]+\.Messages\.[A-Za-z0-9]+Request/g;
  return [...new Set(String(texto || "").match(re) || [])].sort();
}

/** Los que suenan a comensales: es lo que hace falta para el ticket medio por persona. */
export const OLOR_COMENSALES = /diner|comensal|cover|guest|people|persona|pax/i;

/**
 * Reparte los informes encontrados en los que ya usamos, los que huelen a comensales y el
 * resto. Sirve para mirar una lista de cincuenta nombres y saber dónde mirar.
 */
export function clasificarInformes(clrTypes = [], yaUsados = []) {
  const usados = new Set(yaUsados);
  const corto = (c) => String(c).split(".").pop().replace(/Request$/, "");
  const out = { usados: [], comensales: [], otros: [] };
  for (const c of clrTypes) {
    const fila = { clrType: c, corto: corto(c) };
    if (usados.has(c)) out.usados.push(fila);
    else if (OLOR_COMENSALES.test(c)) out.comensales.push(fila);
    else out.otros.push(fila);
  }
  return out;
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
