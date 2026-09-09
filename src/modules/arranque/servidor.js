// El socket, abierto desde el primer instante. Sin efectos: aquí solo está la fábrica.
//
// El singleton —el que de verdad ocupa el puerto— vive en `src/arranque-temprano.js`, que es lo
// primero que importa `server.js`. Están separados para que esto se pueda probar sin que un test
// se quede con el puerto 5000 cogido.

import http from "node:http";
import { manejadorProvisional } from "./estado.js";
import { lineaError } from "../seguridad/redactar.js";

/**
 * Crea el servidor HTTP y —si se le deja— empieza a escuchar YA, con un manejador mínimo.
 *
 * La entrega a Express NO reabre el puerto: se cambia el manejador de peticiones del mismo
 * `http.Server`. Cerrar y volver a escuchar dejaría un hueco de milisegundos en el que las
 * conexiones se rechazan, que es justo el agujero que estamos tapando.
 *
 * @param {number|string} puerto
 * @param {() => string|null} leerIndex  la página pública, para servirla también al arrancar
 * @param {boolean} escuchar             `false` en los tests: crea el servidor y no ocupa nada
 */
export function crearArranque({ puerto, leerIndex, escuchar = true, log = console.log }) {
  let app = null;
  let entregado = false;
  let esquemaListo = false;

  const provisional = manejadorProvisional({
    leerIndex,
    fase: () => (esquemaListo ? "casi" : "arrancando"),
  });

  // Una sola función delante del socket durante toda la vida del proceso: mientras no haya
  // Express, contesta el provisional; en cuanto lo hay, contesta Express. Sin recolocar nada.
  const servidor = http.createServer((req, res) => (app || provisional)(req, res));

  // Un `error` sin oyente en un EventEmitter TIRA el proceso. Este puerto se abre durante la
  // evaluación de los módulos, mucho antes de que server.js llegue a su última línea, así que el
  // oyente tiene que estar aquí desde el principio.
  //
  // Y con él, EL REINTENTO POR PUERTO OCUPADO. Vivía en server.js, colgado del `app.listen` que
  // este módulo sustituye; si se hubiera quedado allí, entre la apertura del puerto y su registro
  // habría 24 segundos en los que un EADDRINUSE —el puerto que el proceso anterior todavía no ha
  // soltado, que es CUÁNDO ocurre— solo se habría escrito en el log, y el servidor no habría
  // llegado a escuchar nunca. Se muda con el listen porque es parte de él.
  servidor.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(`[arranque] Puerto ${puerto} ocupado. Esperando y reintentando...`);
      setTimeout(() => { servidor.close(); servidor.listen(puerto); }, 2000);
      return;
    }
    console.error(lineaError("[arranque] Error del socket", err));
  });

  if (escuchar) {
    servidor.listen(puerto, () => {
      log(`[arranque] Escuchando en :${puerto} a los ${Math.round(process.uptime() * 1000)} ms`);
    });
  }

  return {
    servidor,

    /** Pasa el mando a Express. Idempotente por la vía dura: la segunda llamada es un error. */
    entregar(expressApp, alListo) {
      if (entregado) throw new Error("[arranque] entregar() dos veces: el servidor ya está en manos de Express");
      if (typeof expressApp !== "function") throw new TypeError("[arranque] entregar() espera la aplicación Express");
      entregado = true;
      app = expressApp;
      log(`[arranque] Aplicación montada a los ${Math.round(process.uptime() * 1000)} ms`);
      // `setImmediate` para que la inicialización pesada corra DESPUÉS de que el manejador ya
      // esté puesto, igual que hacía el callback de `app.listen`.
      if (alListo) setImmediate(() => { alListo(); });
      return servidor;
    },

    /** Lo llama server.js cuando `initDB()` termina. Solo cambia la fase que se informa. */
    marcarEsquemaListo() { esquemaListo = true; },

    get entregado() { return entregado; },
    get esquemaListo() { return esquemaListo; },
  };
}
