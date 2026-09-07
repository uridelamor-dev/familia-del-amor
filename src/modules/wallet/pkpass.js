// El empaquetado del `.pkpass`. PURO: el hash y la firma se inyectan, así que esto se puede
// probar entero sin certificados de Apple y sin openssl.
//
// Un .pkpass es un ZIP con:
//   pass.json       lo que dice la tarjeta
//   icon.png …      las imágenes (icon.png es OBLIGATORIO; sin él iOS rechaza el pase entero)
//   manifest.json   { "cada fichero": "su SHA-1 en hexadecimal" }
//   signature       PKCS#7 *detached* sobre los bytes de manifest.json
//
// El ZIP se monta con `crearZip()` de src/modules/facturas/zip.js, que ya está escrito a mano
// —aquí no se pueden añadir dependencias npm— y usa método «store». Apple no exige deflate: un
// pase con sus iconos son unos 40 KB, y los PNG ya vienen comprimidos, así que el compresor no
// ganaría nada aunque lo tuviéramos.
//
// Ojo con la tentación de usar `zlib.crc32`: existe desde Node 20.15 y Replit corre la rama 20.
// `zip.js` trae su propia tabla de CRC-32 y por eso funciona en cualquier versión.

import { crearZip } from "../facturas/zip.js";

/** Los ficheros que Apple exige que estén, pase lo que pase. */
export const IMAGENES_OBLIGATORIAS = ["icon.png", "icon@2x.png"];

/**
 * Monta el pase entero en memoria y devuelve un Buffer.
 *
 * `sha1(buffer) -> string hex` y `firmar(buffer) -> Buffer` se inyectan (mismo criterio que
 * `generarToken(rndBytes)` en rrhh/pulso.js): el módulo no importa `crypto` ni lanza procesos.
 *
 * `fecha` se pasa desde fuera y por defecto es fija, así que el mismo pase produce SIEMPRE los
 * mismos bytes. Eso es lo que permite que un test congele el resultado.
 */
export function construirPkpass({ pase, imagenes = [], sha1, firmar, fecha } = {}) {
  if (!pase || typeof pase !== "object") throw new Error("Falta pass.json");
  if (typeof sha1 !== "function") throw new Error("Falta sha1");
  if (typeof firmar !== "function") throw new Error("Falta el firmante");

  const faltan = IMAGENES_OBLIGATORIAS.filter((n) => !imagenes.some((i) => i.nombre === n));
  if (faltan.length) throw new Error(`Faltan imágenes del pase: ${faltan.join(", ")}`);

  // Se serializa UNA vez y se reutiliza el mismo Buffer para el hash y para el ZIP. Serializarlo
  // dos veces es lo que rompe estas cosas: bastaría que el orden de las claves cambiara entre
  // una llamada y otra para que el hash del manifest no cuadrara con el fichero, y iOS diría
  // «el pase no es válido» sin decir cuál de los diez ficheros falla.
  const passJson = Buffer.from(JSON.stringify(pase, null, 2), "utf8");

  const contenido = [{ nombre: "pass.json", datos: passJson }, ...imagenes];

  // El manifest lleva TODOS los ficheros del pase menos él mismo y la firma.
  const manifest = {};
  for (const f of contenido) manifest[f.nombre] = sha1(f.datos);
  const manifestJson = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");

  const firma = firmar(manifestJson);
  if (!firma || !firma.length) throw new Error("La firma salió vacía");

  return crearZip(
    [...contenido, { nombre: "manifest.json", datos: manifestJson }, { nombre: "signature", datos: firma }],
    fecha ? { fecha } : {});
}
