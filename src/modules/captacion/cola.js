// La cola de envíos por WhatsApp. Lógica PURA: aquí solo se decide QUÉ sale, CUÁNDO y CUÁNDO
// se deja de intentar. El envío de verdad y los relojes viven en server.js, como en
// `messaging/queue.js`.
//
// Existe porque a un cliente se le promete en pantalla que le llegará el código, y hasta ahora
// el envío se hacía en línea: si WhatsApp estaba caído —y cada redespliegue de Replit lo
// tumba— la promesa se rompía sin dejar rastro de a quién había que reenviarle nada.

/** Cuántas veces se intenta antes de rendirse. */
export const MAX_INTENTOS = 5;

/**
 * Cuánto se espera antes del siguiente intento, en milisegundos.
 *
 * Creciente y con un primer reintento CORTO: el fallo más común aquí no es un número malo, es
 * WhatsApp reconectando después de un despliegue, y eso se arregla solo en un minuto. Los
 * escalones largos del final son para el caso contrario —algo está roto de verdad— y ahí lo que
 * hace falta es no machacar el socket cada minuto durante seis horas.
 */
export const ESPERAS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export function esperaTrasFallo(intentos) {
  const i = Math.max(0, Number(intentos || 0));
  return ESPERAS_MS[Math.min(i, ESPERAS_MS.length - 1)];
}

/** ¿Se ha agotado la paciencia con esta fila? */
export const seRinde = (intentos) => Number(intentos || 0) >= MAX_INTENTOS;

/**
 * Lo que hay que escribir en la fila después de intentarlo.
 *
 * Devuelve el cambio, no lo aplica: así se puede probar sin base de datos, y así el que llama
 * ve en una sola línea qué va a pasar.
 *
 * NADA SE BORRA. La cola de reservas que ya existía (`pending_whatsapp`) borraba la fila después
 * de intentar el envío, y como las funciones de envío se tragan sus propios errores, borraba
 * también las que no habían salido: el mensaje desaparecía sin que nadie se enterara. Aquí una
 * fila solo cambia de estado, y la que se rinde queda como `fallido` para que se vea en el panel
 * y se pueda reenviar a mano.
 */
export function trasIntento({ ok, intentos = 0, error = "", ahora = Date.now() }) {
  if (ok) {
    return { estado: "enviado", enviado_en: new Date(ahora).toISOString(), ultimo_error: null };
  }
  const n = Number(intentos || 0) + 1;
  if (seRinde(n)) {
    return { estado: "fallido", intentos: n, ultimo_error: String(error || "").slice(0, 200) };
  }
  return {
    estado: "pendiente",
    intentos: n,
    ultimo_error: String(error || "").slice(0, 200),
    proximo_ms: ahora + esperaTrasFallo(n - 1),
  };
}

/**
 * Cuántas filas se pueden sacar en esta pasada.
 *
 * El tope diario de WhatsApp manda por encima de todo: es lo único que separa una campaña que
 * funciona de un número baneado, y ese número es el mismo que lleva las reservas, Sara y los
 * grupos internos. Lo que no sale hoy NO se pierde — sigue pendiente y sale mañana.
 */
export function cuantasSacar({ pendientes = 0, cupoQuedan = 0, porPasada = 12 } = {}) {
  return Math.max(0, Math.min(Number(pendientes || 0), Number(cupoQuedan || 0), Number(porPasada || 0)));
}

/** Lo que la pantalla de gracias necesita saber, y nada más. Ni el código, ni el teléfono. */
export function estadoParaCliente(fila) {
  if (!fila) return "desconocido";
  if (fila.estado === "enviado") return "enviado";
  if (fila.estado === "fallido") return "fallido";
  if (fila.estado === "descartado") return "descartado";
  return "enviando";
}
