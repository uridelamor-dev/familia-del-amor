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
