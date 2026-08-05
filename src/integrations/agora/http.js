// Cliente HTTP robusto para APIs externas (timeout con AbortController). Sin dependencias.
// Reutilizable por cualquier integración (Ágora, y en el futuro Skello/Haddock). Crítico frente
// a servidores que pueden estar apagados (el TPV de Ágora solo responde con el local abierto):
// cada llamada tiene timeout y errores claros; el orquestador reintenta en el siguiente ciclo.

export async function requestJSON(url, { method = "GET", headers = {}, body = null, timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const opt = { method, headers: { ...headers }, signal: ctrl.signal };
    if (body != null) {
      opt.headers["Content-Type"] = opt.headers["Content-Type"] || "application/json";
      opt.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const r = await fetch(url, opt);
    const text = await r.text();
    let json = null;
    if (text) { try { json = JSON.parse(text); } catch { /* respuesta no-JSON */ } }
    if (!r.ok) {
      const msg = (json && (json.error || json.message || json.Message)) || `HTTP ${r.status}`;
      const err = new Error(msg); err.status = r.status; err.body = json != null ? json : text;
      throw err;
    }
    return json;
  } catch (e) {
    if (e && e.name === "AbortError") { const err = new Error("timeout"); err.code = "TIMEOUT"; throw err; }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
