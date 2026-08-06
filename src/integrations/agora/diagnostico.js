// Ágora — DIAGNÓSTICO de la API (los endpoints exactos no son públicos: Ágora remite a soporte).
// Genera peticiones candidatas (rutas × variantes de auth) para sondear contra un TPV ABIERTO y
// descubrir cuál devuelve ventas/cierres. PURO y testeable; la ejecución (fetch) vive en server.js.
//
// Pistas del manual oficial: el :8984 es la WEB de administración; los endpoints usan estilo
// query-flag ("http://servidor:8984/?orders-monitor"), NO "/api/...". Los datos de venta salen
// como "cierre de caja" / "cierre de sistema" / documentos (facturas, movimientos de caja).

// Variantes de cómo puede viajar la clave (apiToken). Devuelve { name, headers, query }.
export function variantesAuth(token = "") {
  const enc = encodeURIComponent(token);
  return [
    { name: "header Api-Token", headers: { "Api-Token": token }, query: "" },
    { name: "header ApiToken", headers: { ApiToken: token }, query: "" },
    { name: "header X-Api-Token", headers: { "X-Api-Token": token }, query: "" },
    { name: "header Authorization Bearer", headers: { Authorization: `Bearer ${token}` }, query: "" },
    { name: "header Authorization raw", headers: { Authorization: token }, query: "" },
    { name: "query apiToken", headers: {}, query: `apiToken=${enc}` },
    { name: "query token", headers: {}, query: `token=${enc}` },
    { name: "query key", headers: {}, query: `key=${enc}` },
  ];
}

// Une un path con una query (respeta si el path ya trae "?").
function conQuery(path, query) {
  if (!query) return path;
  return path + (path.includes("?") ? "&" : "?") + query;
}

// Construye las peticiones candidatas. base = "http://host:puerto" (ya normalizado).
export function candidatosDiagnostico(base, { token = "", localId = "", desde = "", hasta = "" } = {}) {
  const b = String(base || "").replace(/\/+$/, "");
  const enc = encodeURIComponent;
  const hdr = { "Api-Token": token };
  const auth = variantesAuth(token);
  const out = [];
  const add = (label, method, path, headers = hdr, body = null) => out.push({ label, method, url: b + path, headers, ...(body != null ? { body } : {}) });

  // Rango de fechas con nombres variables + local opcional.
  const rango = (dName, hName) => {
    const p = [];
    if (desde) p.push(`${dName}=${enc(desde)}`);
    if (hasta) p.push(`${hName}=${enc(hasta)}`);
    if (localId) p.push(`local=${enc(localId)}`);
    return p.join("&");
  };
  const fechaQ = () => {
    const p = [];
    if (desde) p.push(`fecha=${enc(desde)}`);
    if (localId) p.push(`local=${enc(localId)}`);
    return p.join("&");
  };

  // 1) RAÍZ con TODAS las variantes de auth → detecta el esquema de autenticación.
  for (const a of auth) add(`root · ${a.name}`, "GET", conQuery("/", a.query), a.headers);

  // 2) Estilo QUERY-FLAG en la raíz (patrón confirmado por el manual: /?orders-monitor).
  const flags = [
    "documents", "documentos", "document", "ventas", "sales", "exportdocuments", "export-documents",
    "exportdata", "export", "cashcount", "cashclose", "cierres", "cierrecaja", "cierredecaja",
    "cierrescaja", "cierresistema", "arqueos", "facturas", "invoices", "tickets", "data", "api",
    "getdocuments", "salesdata", "documentsdata",
  ];
  for (const f of flags) {
    const extra = rango("from", "to") || fechaQ();
    add(`/?${f}`, "GET", conQuery("/?" + f, extra), hdr);
  }

  // 3) Bases de tipo PATH (por si no fuese query-flag). Con Api-Token.
  const bases = ["/api", "/apiservice", "/service", "/rest", "/ws", "/integration", "/integracion", "/export", "/data"];
  const recursos = ["documents", "ventas", "cierres", "cierrescaja"];
  for (const bp of bases) {
    add(`${bp} (índice)`, "GET", bp, hdr); // ¿existe la base?
    for (const rsrc of recursos) {
      add(`${bp}/${rsrc}`, "GET", conQuery(`${bp}/${rsrc}`, rango("from", "to") || fechaQ()), hdr);
    }
  }

  // 4) Sondeos POST (algunas versiones de la API HTTP esperan POST con cuerpo).
  add("POST / (json rango)", "POST", "/", hdr, { desde, hasta, local: localId || undefined });
  add("POST /?documents (rango)", "POST", "/?documents", hdr, { desde, hasta, local: localId || undefined });

  return out;
}

// Clasifica el resultado crudo de una petición para ordenar por "promesa" (JSON/XML 2xx con datos).
export function puntuarResultado(r = {}) {
  let s = 0;
  if (r.ok) s += 100;                                   // 2xx
  else if (typeof r.status === "number" && r.status !== 404) s += 25; // respondió algo (401/403/500…)
  if (r.esJson) s += 60;
  if (r.esXml) s += 55;
  if (/venta|cierre|document|ticket|factura|importe|total/i.test(r.bodySample || "")) s += 40;
  if (r.status === 404) s -= 10;
  if ((r.bodySample || "").length > 2) s += 5;
  return s;
}

// Ordena resultados de más a menos prometedor.
export function ordenarResultados(resultados = []) {
  return resultados.slice().sort((a, b) => puntuarResultado(b) - puntuarResultado(a));
}
