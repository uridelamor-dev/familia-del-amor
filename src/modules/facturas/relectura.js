// Releer el detalle de las facturas que se quedaron sin él. PURO.
//
// POR QUÉ EXISTE: durante nueve días, un fallo en el alta dejó cada factura guardada pero sin su
// desglose de líneas. Se recuperaban pulsando un botón, y eso tiene dos problemas: hay que
// acordarse, y hay que estar seguro de que se ha pulsado hasta el final. Un trabajo que depende
// de que alguien se acuerde no está hecho, está pendiente.
//
// Ahora se repasa solo. Lo que decide CUÁNDO y SOBRE QUÉ está aquí, separado de la lectura en
// sí, porque son las dos preguntas que hay que poder cambiar sin tocar nada que llame a Google.

/** Cuántas se leen de una vez. Cada una es una descarga de Drive más una lectura de IA. */
export const TANDA = 20;

/**
 * Cada cuánto se repasa.
 *
 * Seis horas y no una semana, y no es un capricho: con un repaso semanal de veinte, vaciar un
 * atasco de trescientas facturas llevaría meses, así que habría que pulsar el botón igualmente
 * — y entonces el automatismo no sirve de nada. Cada seis horas, un fallo suelto se arregla el
 * mismo día y un atasco se deshace en unos días, sin picos de gasto.
 *
 * Y si no hay nada pendiente NO SE GASTA NADA: la consulta devuelve cero filas y se acabó.
 */
export const CADA_HORAS = 6;

/** Cuántas veces se reintenta una que falló por algo pasajero antes de rendirse. */
export const MAX_INTENTOS = 3;

/**
 * ¿Toca repasar?
 *
 * NO es un temporizador semanal, y esa es la parte importante. En Replit el proceso se reinicia
 * a menudo —cada despliegue, y a veces solo—, así que un `setInterval` de una semana no llega a
 * dispararse NUNCA: la cuenta vuelve a empezar de cero cada vez. Lo que sobrevive es preguntar
 * cada poco «¿cuánto hace de la última?» contra una marca guardada en la base. Es el mismo
 * patrón que usa la sincronización de Ágora.
 */
export function tocaRepasar({ ultimo = null, ahora = null, cadaHoras = CADA_HORAS } = {}) {
  const t = Date.parse(ahora || "");
  if (!Number.isFinite(t)) return false;          // sin reloj no se decide nada
  if (!ultimo) return true;                        // nunca se ha hecho: se hace
  const u = Date.parse(ultimo);
  if (!Number.isFinite(u)) return true;            // marca ilegible: como si no hubiera
  return t - u >= Math.max(1, cadaHoras) * 3600 * 1000;
}

/**
 * Motivos por los que una lectura falla y NO es culpa del documento.
 *
 * La distinción es todo el punto: hoy cualquier fallo marca la factura como ilegible para
 * siempre. Si la IA estaba saturada durante dos minutos, esa factura se queda sin detalle el
 * resto de su vida y nadie se entera. Un error de red no dice nada sobre el PDF.
 */
const PASAJEROS = [
  /\b429\b|rate.?limit|too many requests/i,
  /\b5\d\d\b|overloaded|unavailable|internal|bad gateway|gateway timeout/i,
  /timeout|timed out|etimedout|socket|econnreset|econnrefused|enotfound|network|fetch failed/i,
  /token|unauthorized|\b401\b|invalid_grant/i,      // la conexión con Google se renueva sola
  /aborted|premature close/i,
];

/** Motivos que sí son del documento: por más que se reintente, va a volver a fallar. */
const DEFINITIVOS = [
  /no encontrado|not found|\b404\b|file not found/i,
  /trashed|papelera|deleted/i,
  /no se pudo descargar el archivo|sin archivo/i,
  /corrupt|no es un pdf|unsupported|encrypted|password/i,
];

export function esFalloPasajero(motivo) {
  const t = String(motivo || "");
  if (!t.trim()) return false;                      // sin motivo no se afirma que sea pasajero
  if (DEFINITIVOS.some((re) => re.test(t))) return false;   // lo definitivo manda
  return PASAJEROS.some((re) => re.test(t));
}

/**
 * Qué hacer con una factura cuya lectura acaba de fallar.
 *
 * → { estado, intentos, seReintenta, motivo }
 *
 * `estado: null` significa «sigue pendiente», que es lo que hace que vuelva a la cola. Solo se
 * marca `no_leible` cuando ya no tiene sentido volver a intentarlo: o el fallo es del documento,
 * o se ha probado tres veces. Rendirse a la primera pierde facturas por un hipo de la red;
 * no rendirse nunca deja la cola dando vueltas para siempre y gastando en cada vuelta.
 */
export function estadoTrasFallo({ motivo, intentos = 0, maxIntentos = MAX_INTENTOS } = {}) {
  const n = (Number(intentos) || 0) + 1;
  const pasajero = esFalloPasajero(motivo);
  const seReintenta = pasajero && n < Math.max(1, maxIntentos);
  return {
    estado: seReintenta ? null : "no_leible",
    intentos: n,
    seReintenta,
    motivo: String(motivo || "").slice(0, 300),
  };
}

/** La frase de estado del repaso automático, a partir de lo que quedó anotado. */
export function resumirRepaso({ ultimo = null, leidas = null, quedan = null, rendidas = null } = {}) {
  if (!ultimo) return { nivel: "warn", texto: `Todavía no se ha repasado. Se hace solo cada ${CADA_HORAS} horas.` };
  const trozos = [];
  if (leidas != null) trozos.push(`${leidas} ${Number(leidas) === 1 ? "leída" : "leídas"} en el último repaso`);
  if (quedan != null) trozos.push(Number(quedan) === 0 ? "no queda ninguna" : `quedan ${quedan}`);
  if (rendidas) trozos.push(`${rendidas} sin poder leer`);
  return {
    nivel: Number(quedan) > 0 ? "warn" : "ok",
    texto: trozos.join(" · ") || "Al día.",
  };
}
