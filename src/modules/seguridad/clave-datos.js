// DATA_ENC_KEY: la clave con la que se cifran los secretos guardados en la base.
//
// POR QUÉ EXISTE ESTE FICHERO (R01). Antes la clave se derivaba así:
//
//     derivarClave(resolveJwtSecret() || "tapeta", "agora-token-v1")
//
// `resolveJwtSecret()` devuelve un OBJETO (`{ secret, status, source }`), no una cadena. El
// `String()` de dentro de `derivarClave` lo convertía en el literal `"[object Object]"`, así que
// las contraseñas del TPV y los certificados de la wallet llevaban años cifrados con una clave
// derivada de una constante pública, reproducible por cualquiera que lea el repositorio. No
// dependía del JWT_SECRET: era la misma clave en todas las instalaciones del mundo.
//
// La corrección no es «pasarle bien el secreto». Es que **el cifrado de datos no debe compartir
// llave con la autenticación**: rotar el JWT_SECRET —algo que se hace por otros motivos y sin
// pensárselo— dejaría ilegibles todas las credenciales del TPV, sin excepción y sin aviso.
// De ahí una clave propia, en su propio Secret, que solo sirve para esto.
//
// LA CLAVE NO SE IMPRIME NUNCA. Ni entera, ni a trozos, ni en un error. Lo único que sale de
// aquí hacia un log o hacia el panel es el `kid`, que es un hash truncado y no se puede deshacer.

import crypto from "crypto";

/** AES-256: la clave son 32 bytes exactos. Ni 31 ni 33. */
export const LONGITUD_CLAVE = 32;

/** Nombres de los Secrets. El «anterior» solo hace falta el día que se rote. */
export const VAR_ACTUAL = "DATA_ENC_KEY";
export const VAR_ANTERIOR = "DATA_ENC_KEY_ANTERIOR";

/**
 * El identificador público de una clave.
 *
 * SHA-256 de la clave con un prefijo de dominio, en hexadecimal y cortado a 12 caracteres. Sirve
 * para saber CON CUÁL de las claves se cifró un valor —y por tanto para poder rotar— sin que el
 * identificador diga nada de la clave: SHA-256 no se invierte, y con 12 caracteres ni siquiera
 * se puede usar para confirmar una clave adivinada con certeza.
 *
 * El prefijo `kid-v2:` es lo que impide que este valor coincida con el hash que pudiera calcular
 * cualquier otra herramienta sobre el mismo material.
 */
export function kidDe(clave) {
  if (!Buffer.isBuffer(clave)) throw new TypeError("kidDe espera un Buffer");
  return crypto.createHash("sha256").update("kid-v2:").update(clave).digest("hex").slice(0, 12);
}

/**
 * ¿Es esto una clave válida? Devuelve la clave o el motivo, NUNCA el valor examinado.
 *
 * Es deliberadamente estricto y no hace ni una conversión por su cuenta:
 *
 *  - Solo cadenas. Un objeto, un número o un `undefined` se rechazan diciéndolo. Ésta es
 *    exactamente la puerta por la que entró R01: un `String(objeto)` silencioso.
 *  - Base64 de verdad: se vuelve a codificar y se compara. `Buffer.from(x, "base64")` ignora
 *    todo lo que no sea del alfabeto, así que «no es base64» y «es base64 con basura dentro»
 *    dan el mismo Buffer si no se comprueba la vuelta.
 *  - 32 bytes exactos.
 */
export function validarClave(crudo, { nombre = VAR_ACTUAL } = {}) {
  if (crudo === undefined || crudo === null) return { ok: false, motivo: `${nombre} no está definida` };
  if (typeof crudo !== "string") return { ok: false, motivo: `${nombre} no es texto (llegó un ${typeof crudo})` };

  const s = crudo.trim();
  if (!s) return { ok: false, motivo: `${nombre} está vacía` };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return { ok: false, motivo: `${nombre} no es Base64 válido` };

  let clave;
  try { clave = Buffer.from(s, "base64"); } catch { return { ok: false, motivo: `${nombre} no es Base64 válido` }; }
  if (clave.toString("base64") !== s) return { ok: false, motivo: `${nombre} no es Base64 válido` };
  if (clave.length !== LONGITUD_CLAVE) {
    return { ok: false, motivo: `${nombre} debe decodificar ${LONGITUD_CLAVE} bytes y decodifica ${clave.length}` };
  }
  return { ok: true, clave, kid: kidDe(clave) };
}

/**
 * El llavero del proceso: la clave con la que se escribe, la anterior (si se está rotando) y el
 * lector del formato viejo.
 *
 * DECISIÓN DE ARRANQUE, y es la que permite desplegar esto sin coordinar nada: **si falta la
 * clave, el servidor arranca igual**. Sigue leyendo todo lo que ya está guardado (el formato
 * legado no necesita esta clave) y lo único que no puede hacer es ESCRIBIR un secreto nuevo.
 *
 * La alternativa —negarse a arrancar— convertiría un Secret olvidado en un restaurante sin
 * reservas, sin Sara y sin comandas, por un fallo que no afecta a nada de eso. Y obligaría a
 * poner el Secret antes de desplegar el código que lo entiende, que es justo el orden que
 * queremos poder elegir.
 *
 * Lo que NO se hace, pase lo que pase: inventarse una clave de reserva. Sin clave no se cifra;
 * no existe un «cifrado por defecto» que luego nadie sabría cómo descifrar.
 */
export function cargarLlavero({ env = process.env, entorno = null } = {}) {
  const actualCruda = Object.prototype.hasOwnProperty.call(env, VAR_ACTUAL) ? env[VAR_ACTUAL] : undefined;
  const anteriorCruda = Object.prototype.hasOwnProperty.call(env, VAR_ANTERIOR) ? env[VAR_ANTERIOR] : undefined;

  const llavero = { estado: "ausente", motivo: null, actual: null, anterior: null, entorno: entorno || entornoDe(env) };

  if (actualCruda === undefined) {
    llavero.motivo = `${VAR_ACTUAL} no está en los Secrets: se puede leer, no se puede cifrar`;
  } else {
    const r = validarClave(actualCruda, { nombre: VAR_ACTUAL });
    if (r.ok) { llavero.estado = "ok"; llavero.actual = { clave: r.clave, kid: r.kid }; }
    else { llavero.estado = "invalida"; llavero.motivo = r.motivo; }
  }

  if (anteriorCruda !== undefined) {
    const r = validarClave(anteriorCruda, { nombre: VAR_ANTERIOR });
    // Una clave anterior mal escrita no puede tumbar la actual: se ignora y se dice.
    if (r.ok) llavero.anterior = { clave: r.clave, kid: r.kid };
    else llavero.motivo = (llavero.motivo ? llavero.motivo + " · " : "") + r.motivo;
  }

  llavero.puedeCifrar = llavero.estado === "ok";
  return llavero;
}

/** Producción, test o desarrollo. Se usa para decidir cuánto se grita, no para inventar claves. */
export function entornoDe(env = process.env) {
  if (env.NODE_ENV === "test") return "test";
  if (env.APP_ENV === "production" || env.NODE_ENV === "production" || env.REPLIT_DEPLOYMENT === "1") return "produccion";
  return "desarrollo";
}

/**
 * La línea que se escribe en el arranque. Nunca lleva la clave ni parte de ella.
 *
 * El `kid` sí: es lo único que permite responder «¿ha cogido el Secret nuevo o el viejo?» sin
 * abrir la base, y responder eso a los treinta segundos de un despliegue vale mucho.
 */
export function lineaArranque(llavero) {
  if (llavero.estado === "ok") {
    const rot = llavero.anterior ? ` · anterior kid ${llavero.anterior.kid}` : "";
    return `[cifrado] ${VAR_ACTUAL}: cargada (kid ${llavero.actual.kid})${rot}`;
  }
  if (llavero.estado === "invalida") return `[cifrado] ${VAR_ACTUAL} INVÁLIDA: ${llavero.motivo} — no se cifrará nada nuevo`;
  const grave = llavero.entorno === "produccion" ? "AVISO: " : "";
  return `[cifrado] ${grave}${llavero.motivo}`;
}
