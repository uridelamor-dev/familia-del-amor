// ⚠️ ESTE MÓDULO ABRE EL PUERTO AL SER IMPORTADO, Y TIENE QUE SER EL PRIMER `import` DE server.js.
//
// No es un capricho de estilo: es la única forma de que ocurra pronto. En un módulo ESM los
// `import` se evalúan ANTES que cualquier otra línea del fichero, así que ninguna instrucción de
// `server.js` corre hasta que sus 118 imports —con el árbol entero de Baileys dentro— están
// cargados. Poniendo esto el primero, el socket se abre con `node:http` y `node:fs` cargados y
// nada más; el resto del árbol se carga con el puerto ya atendiendo.
//
// ANTES: Replit pedía `GET /` en bucle y recibía «connection refused» durante ~24 segundos,
// hasta que la evaluación de los módulos llegaba a `app.listen`. El despliegue se marcaba caído.
//
// AHORA: contesta desde el primer instante. Mientras no haya Express sirve la página pública
// —que es un fichero estático y nunca dependió de la base—, responde `/healthz` y devuelve 503
// con `Retry-After` a todo lo demás. Cuando `server.js` termina de montarse, `entregar()` cambia
// el manejador del MISMO socket y a partir de ahí todo es exactamente como era.
//
// Las dos líneas que escribe llevan el tiempo transcurrido desde que arrancó el proceso. Están
// puestas a propósito: son las que dicen dónde se van los segundos de un arranque.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearArranque } from "./modules/arranque/servidor.js";

export const PORT = process.env.PORT || 5000;

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INDEX = path.join(RAIZ, "public", "index.html");

// Se lee una vez y se guarda. Durante el arranque puede llegar una petición por segundo, y el
// fichero no cambia mientras el proceso viva.
let cacheIndex;
function leerIndex() {
  if (cacheIndex === undefined) {
    try { cacheIndex = fs.readFileSync(INDEX, "utf8"); }
    catch { cacheIndex = null; }   // sin página pública, `/` cae al 503 de «arrancando»
  }
  return cacheIndex;
}

const ARRANQUE = crearArranque({ puerto: PORT, leerIndex });

export const servidor = ARRANQUE.servidor;
export const entregar = (app, alListo) => ARRANQUE.entregar(app, alListo);
export const marcarEsquemaListo = () => ARRANQUE.marcarEsquemaListo();
