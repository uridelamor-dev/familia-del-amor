// Cola de envío de mensajería (WhatsApp hoy, email mañana): lógica PURA y testeable.
// El envío real (sendMensajeLibre) y los timers viven en server.js; aquí solo decidimos
// A QUIÉN se envía (consentimiento), EN QUÉ ORDEN/RITMO (jitter + tope diario) y CON QUÉ
// TEXTO (sustitución de variables). Sin dependencias de red ni de BD.

// Normaliza un teléfono a formato España (dígitos, prefijo 34). Espejo de formatPhone (whatsapp.js).
export function formatTelefonoES(raw) {
  let s = String(raw || "").replace(/\D/g, "");
  if (!s) return "";
  s = s.replace(/^00/, "");
  if (s.startsWith("34")) return s;
  if (s.length === 9 && /^[679]/.test(s)) return "34" + s;
  return s;
}

// ¿Este teléfono es de alguien de la casa (trabajador, encargado, dirección…)?
// Se compara por los últimos 9 dígitos, como en el resto del sistema: el mismo móvil
// puede llegar como "600112233", "+34 600 11 22 33" o "34600112233".
// `internos` es un Set de claves de 9 dígitos ya normalizadas.
// Devuelve false si no hay teléfono o si el Set está vacío: ante la duda, NO se excluye
// (fallar cerrado dejaría a clientes reales sin respuesta, que es peor).
export function clave9(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}
export function esTelefonoInterno(telefono, internos) {
  const k = clave9(telefono);
  if (!k || !internos) return false;
  return typeof internos.has === "function" ? internos.has(k) : false;
}

// Sustituye variables de plantilla en el texto. Reutilizable por Campañas.
// Soporta {nombre} {apellidos} {nombre_completo} {local}. Sin valor → cadena vacía.
export function aplicarVariables(texto, contacto = {}) {
  const nombre = (contacto.nombre || "").trim();
  const apellidos = (contacto.apellidos || "").trim();
  const local = (contacto.local || contacto.ultimo_local || "").trim();
  const completo = `${nombre} ${apellidos}`.trim();
  return String(texto == null ? "" : texto)
    .replace(/\{nombre_completo\}/gi, completo)
    .replace(/\{nombre\}/gi, nombre)
    .replace(/\{apellidos\}/gi, apellidos)
    .replace(/\{local\}/gi, local)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([!?.,;:])/g, "$1")
    // Una variable vacía deja su puntuación huérfana: «{nombre}, hace tiempo…» se convierte
    // en «, hace tiempo…» cuando la ficha no tiene nombre, y hay fichas sin nombre (las que
    // vienen de una reserva por teléfono, por ejemplo). Se limpia lo que queda colgando al
    // principio y en medio, y se recupera la mayúscula.
    .replace(/^[\s,;:.]+/, "")
    .replace(/([¡¿])\s*[,;:]+\s*/g, "$1")
    // La coma también puede quedar colgando por delante: «¡Felicidades, {nombre}!» sin
    // nombre daba «¡Felicidades,!». Una coma pegada a un cierre o al final sobra siempre.
    .replace(/[,;:]+(?=\s*[!?.…]|$)/g, "")
    .replace(/\s+,/g, ",")
    .trim()
    .replace(/^([a-záéíóúüñ])/, (c) => c.toUpperCase());
}

// ¿Se puede enviar por WhatsApp a este contacto? Regla legal: nunca a bajas.
// soloOptIn (opcional) restringe además a quienes dieron consentimiento explícito.
export function contactoEnviableWA(c = {}, { soloOptIn = false } = {}) {
  const tel = formatTelefonoES(c.telefono);
  if (!tel) return { ok: false, motivo: "sin_telefono" };
  if (c.baja === 1 || c.baja === true || c.baja === "1") return { ok: false, motivo: "baja" };
  if (soloOptIn && !(c.opt_in_wa === 1 || c.opt_in_wa === true || c.opt_in_wa === "1")) return { ok: false, motivo: "sin_optin" };
  return { ok: true };
}

// Filtra una lista de contactos a los enviables por WhatsApp; devuelve aptos + desglose de omitidos.
export function filtrarEnviablesWA(contactos = [], opts = {}) {
  const aptos = [];
  const omitidos = { baja: 0, sin_telefono: 0, sin_optin: 0 };
  for (const c of contactos) {
    const r = contactoEnviableWA(c, opts);
    if (r.ok) aptos.push(c);
    else if (omitidos[r.motivo] != null) omitidos[r.motivo]++;
  }
  return { aptos, omitidos };
}

// Aplica el tope diario: separa lo que entra hoy de lo que se pospone.
// maxDiario<=0 o null ⇒ sin tope. yaEnviadosHoy descuenta del cupo.
export function dividirPorTope(contactos = [], { maxDiario = 0, yaEnviadosHoy = 0 } = {}) {
  if (!maxDiario || maxDiario <= 0) return { aEnviar: contactos.slice(), pospuestos: [] };
  const cupo = Math.max(0, maxDiario - Math.max(0, yaEnviadosHoy));
  return { aEnviar: contactos.slice(0, cupo), pospuestos: contactos.slice(cupo) };
}

// Retardo entre envíos con jitter (anti-baneo). rnd inyectable para tests deterministas.
export function delayConJitter(minMs = 6000, maxMs = 15000, rnd = Math.random) {
  const lo = Math.min(minMs, maxMs), hi = Math.max(minMs, maxMs);
  return Math.round(lo + rnd() * (hi - lo));
}
