// Ágora — DIAGNÓSTICO de la API (los endpoints exactos no son públicos: Ágora remite a soporte).
// Genera una lista de peticiones candidatas (rutas + variantes de auth) para sondear contra un
// TPV ABIERTO y descubrir cuál devuelve ventas/documentos. PURO y testeable: solo construye las
// peticiones; la ejecución (fetch) vive en server.js.

// Construye las peticiones candidatas. base = "http://host:puerto" (ya normalizado).
export function candidatosDiagnostico(base, { token = "", localId = "", desde = "", hasta = "" } = {}) {
  const b = String(base || "").replace(/\/+$/, "");
  const hdr = { "Api-Token": token };
  const enc = encodeURIComponent;
  // Query con rango de fechas (nombres variables según endpoint) + local opcional.
  const rango = (dName, hName) => {
    const p = [];
    if (desde) p.push(`${dName}=${enc(desde)}`);
    if (hasta) p.push(`${hName}=${enc(hasta)}`);
    if (localId) p.push(`local=${enc(localId)}`);
    return p.length ? "?" + p.join("&") : "";
  };
  // Query con una sola fecha.
  const fecha = () => {
    const p = [];
    if (desde) p.push(`fecha=${enc(desde)}`);
    if (localId) p.push(`local=${enc(localId)}`);
    return p.length ? "?" + p.join("&") : "";
  };
  const G = (label, path, headers = hdr) => ({ label, method: "GET", url: b + path, headers });
  return [
    // 1) Descubrir raíz y esquema de autenticación (3 variantes sobre la raíz)
    G("root · header Api-Token", "/"),
    G("root · header Authorization Bearer", "/", { Authorization: `Bearer ${token}` }),
    G("root · query apiToken", `/?apiToken=${enc(token)}`, {}),
    G("api index", "/api"),
    G("status", "/api/status"),
    G("version", "/api/version"),
    G("info", "/api/info"),
    // 2) Candidatos de ventas / documentos / cierres de caja (lo que da la venta diaria)
    G("documents (from/to)", "/api/documents" + rango("from", "to")),
    G("documentos (desde/hasta)", "/api/documentos" + rango("desde", "hasta")),
    G("v1/documents (from/to)", "/api/v1/documents" + rango("from", "to")),
    G("export/documents (from/to)", "/api/export/documents" + rango("from", "to")),
    G("exportacion/documentos", "/api/exportacion/documentos" + rango("desde", "hasta")),
    G("ventas (fecha)", "/api/ventas" + fecha()),
    G("sales (date)", "/api/sales" + (desde ? `?date=${enc(desde)}` : "")),
    G("tickets (fecha)", "/api/tickets" + fecha()),
    // La ventana de Ágora indica que la venta sale de "cierres de caja" / "cierres de sistema".
    G("cierres (fecha)", "/api/cierres" + fecha()),
    G("cierrescaja (fecha)", "/api/cierrescaja" + fecha()),
    G("cierresdecaja (desde/hasta)", "/api/cierresdecaja" + rango("desde", "hasta")),
    G("cierres/caja (from/to)", "/api/cierres/caja" + rango("from", "to")),
    G("cierressistema (fecha)", "/api/cierressistema" + fecha()),
    G("export/cierrescaja (from/to)", "/api/export/cierrescaja" + rango("from", "to")),
    G("arqueos (fecha)", "/api/arqueos" + fecha()),
    G("facturas (desde/hasta)", "/api/facturas" + rango("desde", "hasta")),
    G("albaranes (desde/hasta)", "/api/albaranes" + rango("desde", "hasta")),
    // Por si la API HTTP espera POST (algunas versiones de Ágora): sondeos POST con cuerpo mínimo.
    { label: "POST root (json vacío)", method: "POST", url: b + "/", headers: hdr, body: {} },
    { label: "POST /api/documents (rango)", method: "POST", url: b + "/api/documents", headers: hdr, body: { desde, hasta, local: localId || undefined } },
  ];
}

// Clasifica el resultado crudo de una petición para ordenar por "promesa" (JSON 2xx con datos primero).
export function puntuarResultado(r = {}) {
  let s = 0;
  if (r.ok) s += 100;                 // 2xx
  else if (typeof r.status === "number" && r.status !== 404) s += 20; // respondió algo (401/403/500…)
  if (r.esJson) s += 50;
  if (r.status === 404) s -= 10;
  if ((r.bodySample || "").length > 2) s += 5;
  return s;
}

// Ordena resultados de más a menos prometedor (para que el usuario/nosotros veamos primero el bueno).
export function ordenarResultados(resultados = []) {
  return resultados.slice().sort((a, b) => puntuarResultado(b) - puntuarResultado(a));
}
