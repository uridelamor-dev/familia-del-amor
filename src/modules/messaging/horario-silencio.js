// HORARIO DE SILENCIO DE WHATSAPP. PURO: sin BD, sin red.
//
// EL CASO (13/11/2026): la campaña de las coques salía de madrugada. A las 00:00 se renueva el
// cupo diario, el reloj de campañas la retomaba y mandaba sus 40 mensajes entre las 00:00 y las
// 04:00. Nadie lo había decidido: simplemente no había ninguna hora prohibida.
//
// LA REGLA: de 22:00 a 9:00 (hora de Madrid) no se escribe a nadie por iniciativa nuestra.
// Sí se puede contestar a quien nos ha escrito (Sara, o el equipo desde Conversaciones), y sí
// sale lo que el propio cliente acaba de pedir (su tarjeta del club, su código de alta).
//
// Lo automático (campañas, cola de captación, cumpleaños, «¿qué tal fue?») no falla: ESPERA, y
// sigue solo a partir de las 9:00. Lo que se manda a mano desde el panel se rechaza con un
// mensaje claro, para que nadie crea que ha salido.

export const SILENCIO_DESDE = 22;   // hora en que empieza (incluida)
export const SILENCIO_HASTA = 9;    // hora en que acaba (desde las 9:00 ya se puede)

/** La hora (0–23) en Madrid de un instante. */
export function horaMadrid(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(d));
}

/** ¿Estamos en horario de silencio? */
export function enSilencio(d = new Date(), { desde = SILENCIO_DESDE, hasta = SILENCIO_HASTA } = {}) {
  const h = horaMadrid(d);
  return desde > hasta ? (h >= desde || h < hasta) : (h >= desde && h < hasta);
}

/** Cuánto vale «nos ha escrito»: un mensaje suyo en las últimas 24 h (la ventana de WhatsApp). */
export const VENTANA_RESPUESTA_HORAS = 24;

export const MENSAJE_FUERA_DE_HORARIO =
  "Fuera de horario: de 22:00 a 9:00 no se envían WhatsApp a quien no nos ha escrito. Inténtalo a partir de las 9:00.";

export class FueraDeHorarioError extends Error {
  constructor() { super(MENSAJE_FUERA_DE_HORARIO); this.code = "FUERA_DE_HORARIO"; }
}

/**
 * ¿Se puede mandar este mensaje AHORA?
 *  · fuera del silencio, siempre;
 *  · dentro, solo si es interno (al equipo), si lo acaba de pedir el cliente (transaccional) o
 *    si el cliente nos ha escrito hace poco (es una respuesta).
 */
export function puedeEnviar({ ahora = new Date(), interno = false, transaccional = false, clienteEscribio = false } = {}) {
  if (!enSilencio(ahora)) return true;
  return !!(interno || transaccional || clienteEscribio);
}
