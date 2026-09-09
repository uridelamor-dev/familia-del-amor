// ⚠️ CÓDIGO TEMPORAL Y VULNERABLE. SOLO LECTURA. SOLO PARA MIGRAR. ⚠️
//
// Este fichero reproduce, a propósito y byte a byte, el cifrado ROTO que se usó hasta la
// corrección R01. Existe por una razón y solo una: en producción hay valores reales cifrados
// así —las contraseñas de los cuatro TPV de Ágora, sus tokens y la configuración de la wallet—
// y sin esto no se pueden leer ni, por tanto, volver a cifrar bien.
//
// EL FALLO. `server.js` hacía:
//
//     derivarClave(resolveJwtSecret() || "tapeta", "agora-token-v1")
//
// `resolveJwtSecret()` devuelve `{ secret, status, source }`. Es un objeto, es verdadero, así
// que el `|| "tapeta"` nunca entraba, y el `String()` de `derivarClave` lo aplastaba a la cadena
// `"[object Object]"`. La clave AES no dependía del JWT_SECRET ni de nada: es una constante que
// se puede reconstruir leyendo el repositorio. Cifrado que no cifra.
//
// CÓMO SE BORRA ESTE FICHERO. Cuando `node scripts/migrar-cifrado.js --verificar` diga que no
// queda ni un valor en formato legado en producción, y haya pasado tiempo suficiente para
// descartar una vuelta atrás, se borra este módulo, se borra su rama en `abrir()` y se borra la
// tabla `cifrado_copia_v1`. Hasta entonces se queda, porque el día que haga falta restaurar una
// copia hará falta también saber leerla.
//
// AQUÍ NO HAY —Y NO PUEDE HABER— UNA FUNCIÓN DE CIFRAR. Ésa es la garantía de que ningún dato
// nuevo vuelve a escribirse con esto: no existe la herramienta.

import crypto from "crypto";

/**
 * El literal exacto que acababa dentro de scrypt. No es un ejemplo ni un valor de prueba: es la
 * cadena real con la que están cifrados los datos de producción ahora mismo.
 */
export const SECRETO_ROTO = "[object Object]";

/** Las sales que se usaron, una por uso. Es lo único que separaba Ágora de la wallet. */
export const SALES = { agora: "agora-token-v1", wallet: "wallet-v1" };

const cache = new Map();

/**
 * La clave rota de un dominio. Se cachea porque `scryptSync` con los parámetros por defecto
 * cuesta unos 100 ms y la migración la pide una vez por fila.
 */
export function claveLegada(sal) {
  const s = String(sal);
  if (!cache.has(s)) cache.set(s, crypto.scryptSync(SECRETO_ROTO, s, 32));
  return cache.get(s);
}

/** Formato antiguo: `enc:<iv-hex>:<tag-hex>:<ciphertext-hex>`. Cuatro trozos, sin versión. */
export function pareceLegado(s) {
  return typeof s === "string" && /^enc:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/.test(s);
}

/**
 * Descifra un valor del formato viejo. Devuelve la cadena o `null` si no abre.
 *
 * `null` significa «con esta clave no». Nunca lanza: durante la migración hay que poder contar
 * cuántos valores no descifran sin que el recuento se pare en el primero.
 */
export function descifrarLegado(guardado, sal) {
  if (!pareceLegado(guardado)) return null;
  try {
    const [, ivh, tagh, cth] = String(guardado).split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", claveLegada(sal), Buffer.from(ivh, "hex"));
    d.setAuthTag(Buffer.from(tagh, "hex"));
    return Buffer.concat([d.update(Buffer.from(cth, "hex")), d.final()]).toString("utf8");
  } catch { return null; }
}
