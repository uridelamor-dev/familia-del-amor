// Lógica pura de campañas (sin BD ni red): parseo de cumpleaños y resumen de envíos.

// Extrae {mm, dd} de una fecha de nacimiento en texto (ISO YYYY-MM-DD o DD/MM/AAAA).
export function parseFechaNac(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { mm: +m[2], dd: +m[3] };
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) return { mm: +m[2], dd: +m[1] };
  return null;
}

// ¿Cumple años hoy? hoy = { mm, dd } (1-based). Robusto a formatos y a valores vacíos.
export function esCumpleHoy(nacimiento, hoy) {
  const f = parseFechaNac(nacimiento);
  if (!f || !hoy) return false;
  return f.mm === hoy.mm && f.dd === hoy.dd;
}

// Fecha de hoy en Europe/Madrid como { mm, dd, iso } — inyectable en tests vía `now`.
export function hoyMadrid(now) {
  const d = now || new Date();
  const iso = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }); // YYYY-MM-DD
  const [, , mm, dd] = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return { mm: +mm, dd: +dd, iso };
}

// Resumen de una lista de envíos por destinatario.
export function resumenEnvios(envios = []) {
  let enviados = 0, errores = 0;
  for (const e of envios) { if (e.estado === "error") errores++; else enviados++; }
  return { enviados, errores, total: envios.length };
}

// Normaliza el estado de una campaña a un valor conocido.
export function normalizarEstado(e) {
  const v = String(e || "").toLowerCase();
  return ["borrador", "programada", "enviando", "enviada"].includes(v) ? v : "borrador";
}

// Claves de segmentación válidas (audiencia). Todo lo demás se ignora al construir el segmento.
export const CLAVES_SEGMENTO = ["q", "genero", "poblacion", "local", "idioma", "origen", "from", "to"];

// Construye un objeto de audiencia limpio desde el formulario del panel o una audiencia guardada.
// - Elimina cadenas vacías. `cumple_mes` (checkbox) → mes actual "MM" si viene activo.
// - `con_email`/`con_telefono` solo se conservan si son verdaderos.
// - `excluir_telefonos` siempre array. `soloOptIn` booleano.
// `mesActual` es inyectable (1-based) para tests deterministas.
export function construirSegmento(input = {}, { mesActual } = {}) {
  const seg = {};
  for (const k of CLAVES_SEGMENTO) {
    const v = input[k];
    if (v != null && String(v).trim() !== "") seg[k] = typeof v === "string" ? v.trim() : v;
  }
  if (input.con_email) seg.con_email = 1;
  if (input.con_telefono) seg.con_telefono = 1;
  if (input.cumple_mes) seg.cumple_mes = String(mesActual != null ? mesActual : new Date().getMonth() + 1).padStart(2, "0");
  const excl = Array.isArray(input.excluir_telefonos) ? input.excluir_telefonos.filter(Boolean) : [];
  if (excl.length) seg.excluir_telefonos = excl;
  if (input.soloOptIn) seg.soloOptIn = true;
  return seg;
}

// Descripción humana corta de una audiencia (para chips/etiquetas en el panel).
export function describirAudiencia(filtros = {}) {
  const p = [];
  if (filtros.local) p.push(`Local: ${filtros.local}`);
  if (filtros.poblacion) p.push(`Pobl.: ${filtros.poblacion}`);
  if (filtros.genero) p.push(filtros.genero === "M" ? "Hombres" : filtros.genero === "F" ? "Mujeres" : `Género ${filtros.genero}`);
  if (filtros.idioma) p.push(`Idioma: ${filtros.idioma}`);
  if (filtros.origen) p.push(`Origen: ${filtros.origen}`);
  if (filtros.con_email) p.push("Con email");
  if (filtros.con_telefono) p.push("Con teléfono");
  if (filtros.cumple_mes) p.push(`Cumple mes ${filtros.cumple_mes}`);
  if (filtros.from || filtros.to) p.push(`Actividad ${filtros.from || "…"}→${filtros.to || "…"}`);
  if (filtros.soloOptIn) p.push("Solo opt-in");
  const n = Array.isArray(filtros.excluir_telefonos) ? filtros.excluir_telefonos.length : 0;
  if (n) p.push(`Excluye ${n}`);
  return p.length ? p.join(" · ") : "Todos los contactos";
}
