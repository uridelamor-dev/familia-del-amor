// Cargar un módulo la primera vez que hace falta, y una sola vez. PURO salvo por el log.
//
// POR QUÉ EXISTE. En un módulo ESM los `import` se evalúan ANTES que cualquier línea de código,
// así que `server.js` no ejecutaba nada hasta tener cargado su árbol entero: 262 módulos, de los
// cuales 99 son de Baileys y 91 del SDK de Anthropic —el 73 %—. En un portátil con la caché de
// disco caliente eso son 350 ms; en el disco frío de un Reserved VM, unos 24 segundos, durante los
// cuales no hay nadie escuchando el puerto y el healthcheck del despliegue falla en bucle.
//
// Ninguno de esos dos paquetes hace falta para arrancar. Baileys se usa dentro de
// `connectToWhatsApp()`, que ya se llamaba después de escuchar; el SDK de Anthropic, dentro de los
// manejadores que responden a un mensaje. Solo el `import` era ansioso.
//
// Ya había precedente en la casa: `facturas.js` carga `pdf-lib` así desde que su import estático
// impedía probar el módulo donde el paquete no estuviera instalado.
//
// LAS DOS REGLAS QUE HACE CUMPLIR:
//
//  1. UNA SOLA CARGA POR PROCESO, aunque haya llamadas concurrentes. Se cachea la PROMESA, no el
//     resultado: dos reconexiones de WhatsApp a la vez comparten el mismo `import()` en vuelo en
//     vez de lanzar dos.
//  2. UN FALLO NO SE CACHEA PARA SIEMPRE. Si la carga se rompe —disco, paquete ausente— la promesa
//     se descarta y el siguiente intento vuelve a probar. Cachear el rechazo dejaría WhatsApp
//     muerto hasta el siguiente despliegue, y su reconexión automática no serviría de nada.

import { lineaError } from "../seguridad/redactar.js";

/**
 * Envuelve un `() => import("...")` en un cargador cacheado.
 *
 * @param {() => Promise<any>} cargar   la función que hace el import
 * @param {string} contexto             para el log si falla; nunca se imprime el objeto de error
 */
export function cargaDiferida(cargar, contexto = "[carga]") {
  let promesa = null;

  return function cargador() {
    if (!promesa) {
      // `Promise.resolve().then(...)` en vez de llamar a `cargar()` a pelo: así un `throw`
      // síncrono también acaba en el `catch` de abajo y no se escapa por otro camino.
      promesa = Promise.resolve().then(cargar).catch((err) => {
        promesa = null;   // ← la regla 2: el siguiente intento vuelve a probar
        console.error(lineaError(`${contexto} no se pudo cargar`, err));
        throw err;
      });
    }
    return promesa;
  };
}
