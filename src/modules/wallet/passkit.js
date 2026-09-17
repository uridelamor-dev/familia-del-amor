// EL PROTOCOLO DE ACTUALIZACIÓN DE PASES DE APPLE. PURO: sin BD, sin Express, sin red.
//
// ── LAS CINCO OPERACIONES, TAL Y COMO LAS DEFINE APPLE ───────────────────────────────────────
//
//   POST   /v1/devices/{dispositivo}/registrations/{passTypeId}/{serial}   dar de alta
//   GET    /v1/devices/{dispositivo}/registrations/{passTypeId}            qué ha cambiado
//   DELETE /v1/devices/{dispositivo}/registrations/{passTypeId}/{serial}   dar de baja
//   GET    /v1/passes/{passTypeId}/{serial}                                el pase al día
//   POST   /v1/log                                                        los errores de Wallet
//
// ── LA AUTORIZACIÓN ──────────────────────────────────────────────────────────────────────────
//
// `Authorization: ApplePass <authenticationToken>`. El token lo lleva DENTRO cada pase, así que
// es un secreto por pase y no una sesión: estas rutas no ven ninguna cookie del panel, y no
// pueden verla — el que llama es el iPhone de alguien, no un navegador con sesión.
//
// LA CONSULTA DE SERIALES NO LLEVA TOKEN, y no es un descuido nuestro. La guía de Apple lo dice:
// «Authorization tokens are specified by each pass, so there is no appropriate token in this
// case. The device identifier is sufficient to prove that the request is valid» — esa llamada
// pregunta por TODOS los pases de un dispositivo, y cada uno tiene un token distinto.
//
// ── POR QUÉ ESTO ES UN MÓDULO APARTE ─────────────────────────────────────────────────────────
//
// Porque lo que hay que blindar aquí son comparaciones y límites, no consultas. Un token que se
// compara con `===` filtra por tiempo; un identificador de dispositivo sin tope de longitud es
// una clave de tabla que escribe un desconocido; un `passTypeIdentifier` que no se comprueba deja
// que alguien pida el pase de otra casa. Todo eso se prueba sin levantar un servidor.

/** El único esquema de autorización que manda Wallet. */
export const ESQUEMA = "ApplePass";

// ── LÍMITES ──────────────────────────────────────────────────────────────────────────────────
//
// Los escribe un dispositivo ajeno y acaban en una clave de tabla. Apple no documenta un máximo,
// así que estos son NUESTROS, holgados para lo real y cerrados para lo absurdo.
export const MAX = Object.freeze({
  dispositivo: 128,   // el `deviceLibraryIdentifier`: en la práctica, 32 hex
  serial: 128,        // el nuestro son 43 caracteres base64url
  passTypeId: 128,
  token: 256,
  pushToken: 256,     // en la práctica, 64 hex
  log: 4096,          // por línea
  logLineas: 50,
  cuerpoLog: 16384,   // el cuerpo entero
});

/** Lo que admitimos en un identificador que llega de fuera y va a una clave de tabla. */
const SEGURO = /^[A-Za-z0-9._~-]+$/;

/** Un `pushToken` de APNs es hexadecimal. Nada más entra. */
const HEX = /^[0-9a-fA-F]+$/;

/**
 * COMPARACIÓN EN TIEMPO CONSTANTE, sin depender de `crypto`.
 *
 * `a === b` se para en el primer byte distinto, y esa diferencia de tiempo se mide: con suficientes
 * intentos se adivina un token carácter a carácter. Aquí se recorre SIEMPRE lo mismo.
 *
 * Se comparan los bytes UTF-8, no los caracteres: dos cadenas distintas pueden tener la misma
 * longitud en caracteres y distinta en bytes, y comparar caracteres filtraría esa diferencia.
 */
export function igualSeguro(a, b) {
  const A = Buffer.from(String(a ?? ""), "utf8");
  const B = Buffer.from(String(b ?? ""), "utf8");
  // La longitud SÍ se filtra, y no se puede evitar sin un hash. Se acumula en el mismo resultado
  // para no salir antes de tiempo.
  let dif = A.length ^ B.length;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) dif |= (A[i] ?? 0) ^ (B[i] ?? 0);
  return dif === 0;
}

/**
 * El token de una cabecera `Authorization: ApplePass <token>`.
 *
 * Devuelve `null` ante cualquier cosa que no sea exactamente eso. El esquema se compara sin
 * distinguir mayúsculas —Apple lo manda así, pero un proxy por medio puede recomponerlo— y el
 * token se coge entero, sin recortar por espacios: un token con un espacio dentro no es válido y
 * lo que hay que hacer es rechazarlo, no arreglarlo.
 */
export function tokenDeCabecera(cabecera) {
  const s = String(cabecera ?? "");
  if (s.length > MAX.token + ESQUEMA.length + 8) return null;
  const m = /^([A-Za-z]+)\s+(\S+)$/.exec(s.trim());
  if (!m) return null;
  if (m[1].toLowerCase() !== ESQUEMA.toLowerCase()) return null;
  return m[2].length && m[2].length <= MAX.token ? m[2] : null;
}

/** Un identificador que llega de fuera: con forma, con tope y sin sorpresas. */
export const idValido = (v, max) => {
  const s = String(v ?? "");
  return s.length > 0 && s.length <= max && SEGURO.test(s);
};

export const dispositivoValido = (v) => idValido(v, MAX.dispositivo);
export const serialValido = (v) => idValido(v, MAX.serial);

/**
 * ¿Es NUESTRO `passTypeIdentifier`?
 *
 * Se compara con el configurado, no con un patrón. Aceptar «cualquier cosa que empiece por
 * pass.» dejaría que alguien preguntara por los pases de otra casa y midiera qué contestamos.
 */
export function passTypeValido(recibido, configurado) {
  if (!idValido(recibido, MAX.passTypeId)) return false;
  if (!configurado) return false;
  return igualSeguro(recibido, configurado);
}

/** Un `pushToken` de APNs: hexadecimal, con tope, y se guarda en minúsculas para no duplicar. */
export function normalizarPushToken(v) {
  const s = String(v ?? "").trim();
  if (!s || s.length > MAX.pushToken || !HEX.test(s)) return null;
  return s.toLowerCase();
}

/** El cuerpo del alta: `{"pushToken": "..."}`. Nada más se mira. */
export function leerAlta(cuerpo) {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  return normalizarPushToken(cuerpo.pushToken);
}

// ── LA ETIQUETA DE ACTUALIZACIÓN ─────────────────────────────────────────────────────────────
//
// Apple la llama `lastUpdated` y la trata como una CADENA OPACA: se la devolvemos, y nos la
// vuelve a mandar tal cual en `passesUpdatedSince`. No tiene por qué ser una fecha, y es mejor
// que no lo sea: con dos cambios en el mismo segundo, una marca de tiempo pierde uno.
//
// Aquí es un contador que solo sube. Cada vez que el estado visible de un pase cambia, se le pone
// el siguiente número, y `passesUpdatedSince=N` contesta todo lo que tenga una etiqueta mayor.

/** ¿Es una etiqueta que hayamos podido emitir nosotros? */
export function etiquetaValida(v) {
  if (v === undefined || v === null || v === "") return true;   // la primera vez no la mandan
  const s = String(v);
  return s.length <= 24 && /^\d+$/.test(s);
}

/** La etiqueta como número. Lo que no entendamos vale 0: se contesta todo, que es lo seguro. */
export function etiquetaNumero(v) {
  if (!etiquetaValida(v)) return 0;
  const n = Number(String(v ?? "0"));
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/**
 * La respuesta de «qué ha cambiado».
 *
 * `204 No Content` cuando no hay ninguno, y NO un 200 con la lista vacía: Apple lo distingue, y
 * un 200 vacío hace que el dispositivo se lo tome como una respuesta con contenido.
 */
export function respuestaSeriales(filas) {
  const lista = (filas || []).filter((f) => f && f.serial);
  if (!lista.length) return { codigo: 204, cuerpo: null };
  const ultima = lista.reduce((a, f) => Math.max(a, Number(f.etiqueta) || 0), 0);
  return {
    codigo: 200,
    cuerpo: {
      lastUpdated: String(ultima),
      serialNumbers: lista.map((f) => String(f.serial)),
    },
  };
}

// ── EL REGISTRO DE ERRORES DE WALLET ─────────────────────────────────────────────────────────
//
// Lo manda el iPhone cuando algo le sale mal, y es lo único que explica por qué un pase no se
// actualiza. Pero lo escribe un dispositivo ajeno: sin tope, es un sitio donde cualquiera escribe
// lo que quiera en nuestros registros.
//
// Se recorta, se limita el número de líneas y SE REDACTA: los mensajes de Wallet llevan la URL
// completa, y en nuestra URL va el serial — que es la credencial del carné.

/** Lo que nunca puede acabar en un registro. El serial va en la ruta, así que se tapa entero. */
export function redactarLog(linea) {
  return String(linea ?? "")
    .slice(0, MAX.log)
    // Cualquier ruta de pase o de registro: se conserva la forma, se tapa el identificador.
    .replace(/(\/v1\/passes\/[^/\s]+\/)[^/\s?]+/gi, "$1«serial»")
    .replace(/(\/v1\/devices\/)[^/\s]+/gi, "$1«dispositivo»")
    // Y por si acaso, cualquier `?t=` o `serialNumber=` suelto.
    .replace(/([?&](?:t|serialNumber|token)=)[^&\s]+/gi, "$1«tapado»")
    // Los caracteres de control ensucian un registro que después lee una persona.
    .replace(/[ -]/g, " ")
    .trim();
}

/** Las líneas de un cuerpo `{"logs": [...]}`, saneadas, recortadas y con tope. */
export function leerLogs(cuerpo) {
  if (!cuerpo || typeof cuerpo !== "object" || !Array.isArray(cuerpo.logs)) return [];
  return cuerpo.logs
    .slice(0, MAX.logLineas)
    .map((l) => redactarLog(typeof l === "string" ? l : JSON.stringify(l)))
    .filter(Boolean);
}
