// Fichajes — PIN. La parte PURA: formato, bloqueo progresivo y el reloj de los intentos.
// El bcrypt vive en el servidor (esto no importa nada, para poder probarlo sin base de datos).
//
// Un PIN de 4 dígitos tiene 10.000 combinaciones: sin freno, un crío con la tablet las
// prueba todas en una tarde. Con este bloqueo, llegar a 1.000 intentos cuesta más de seis
// horas de estar delante de la pantalla tecleando. Eso es lo que lo hace suficiente.
//
// El contador y el «bloqueado hasta» se guardan EN LA BASE, no en memoria: reiniciar el
// servidor (o que Replit redespliegue) no debe reiniciar el ataque.

export const LONGITUD_MIN = 4;
export const LONGITUD_MAX = 6;
export const FALLOS_POR_BLOQUEO = 5;
// Cada bloque de 5 fallos castiga más; a partir del tercero se queda en media hora.
export const CASTIGOS_SEG = [60, 300, 1800];

// PINes que no se aceptan ni aunque los pida el trabajador: son los primeros que
// prueba cualquiera que coja la tablet.
const PROHIBIDOS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "0123", "1122", "2580", "1212",
  "000000", "111111", "123456", "654321", "121212", "112233",
]);

export function validarFormatoPin(pin) {
  const s = String(pin ?? "");
  if (!/^\d+$/.test(s)) return { ok: false, error: "El PIN solo puede tener números." };
  if (s.length < LONGITUD_MIN || s.length > LONGITUD_MAX) {
    return { ok: false, error: `El PIN debe tener entre ${LONGITUD_MIN} y ${LONGITUD_MAX} dígitos.` };
  }
  if (PROHIBIDOS.has(s)) return { ok: false, error: "Ese PIN es demasiado fácil de adivinar. Elige otro." };
  if (/^(\d)\1+$/.test(s)) return { ok: false, error: "Ese PIN es demasiado fácil de adivinar. Elige otro." };
  if (esCorrelativo(s)) return { ok: false, error: "Ese PIN es demasiado fácil de adivinar. Elige otro." };
  return { ok: true };
}

function esCorrelativo(s) {
  let sube = true, baja = true;
  for (let i = 1; i < s.length; i++) {
    const d = Number(s[i]) - Number(s[i - 1]);
    if (d !== 1) sube = false;
    if (d !== -1) baja = false;
  }
  return sube || baja;
}

// ¿Está bloqueado ahora mismo? Se mira ANTES de comparar el hash: si no, cada intento
// bloqueado seguiría costando los ~100 ms de bcrypt y el bloqueo no protegería de nada.
export function estadoBloqueo(usuario = {}, ahoraMs = Date.now()) {
  const hasta = usuario.pin_bloqueado_hasta ? Date.parse(usuario.pin_bloqueado_hasta) : 0;
  if (!hasta || !Number.isFinite(hasta) || hasta <= ahoraMs) return { bloqueado: false, segundos: 0 };
  const segundos = Math.ceil((hasta - ahoraMs) / 1000);
  return { bloqueado: true, segundos, mensaje: `Demasiados intentos. Prueba otra vez en ${textoEspera(segundos)}.` };
}

export function textoEspera(segundos) {
  if (segundos < 60) return `${segundos} segundos`;
  const min = Math.ceil(segundos / 60);
  return min === 1 ? "1 minuto" : `${min} minutos`;
}

// Qué escribir en `users` después de un PIN equivocado.
export function trasFallo(usuario = {}, ahoraMs = Date.now()) {
  const intentos = Number(usuario.pin_intentos || 0) + 1;
  if (intentos % FALLOS_POR_BLOQUEO !== 0) {
    const quedan = FALLOS_POR_BLOQUEO - (intentos % FALLOS_POR_BLOQUEO);
    return {
      pin_intentos: intentos,
      pin_bloqueado_hasta: usuario.pin_bloqueado_hasta || null,
      mensaje: quedan <= 2
        ? `PIN incorrecto. Te quedan ${quedan} intento${quedan === 1 ? "" : "s"}.`
        : "PIN incorrecto.",
    };
  }
  const escalon = Math.min(Math.floor(intentos / FALLOS_POR_BLOQUEO) - 1, CASTIGOS_SEG.length - 1);
  const segundos = CASTIGOS_SEG[escalon];
  return {
    pin_intentos: intentos,
    pin_bloqueado_hasta: new Date(ahoraMs + segundos * 1000).toISOString(),
    bloqueado: true,
    segundos,
    mensaje: `PIN incorrecto. Espera ${textoEspera(segundos)} antes de volver a probar.`,
  };
}

// Y después de acertar: se borra el rastro entero, incluido el bloqueo.
export const trasAcierto = () => ({ pin_intentos: 0, pin_bloqueado_hasta: null });
