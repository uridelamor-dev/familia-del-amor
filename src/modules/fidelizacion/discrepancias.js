// Aviso de Workplace discrepante, ACOTADO. PURO: sin BD, sin Express, sin red.
//
// QUÉ PROBLEMA RESUELVE: un token pegado en la caja equivocada no es un incidente puntual. Se
// descubre a la primera factura y sigue igual hasta que alguien lo cambia. Auditar cada factura
// llenaría `fic_auditoria` de cientos de filas idénticas en una tarde y enterraría todo lo demás,
// que es justo lo que se irá a mirar cuando se investigue.
//
// ── POR QUÉ ESTÁ ACOTADO, Y NO ES UNA PRECAUCIÓN TEÓRICA ─────────────────────────────────────
//
// El `Workplace.Id` y el `Workplace.Name` LOS ESCRIBE EL TPV. Llegan dentro del JSON de una
// petición externa, y aunque para entrar haga falta un token válido, eso no los convierte en
// valores de confianza: un TPV mal configurado, una versión distinta de Ágora o un campo que
// cambie de forma bastan para que aquí llegue algo que no esperábamos.
//
// Un `Map` sin límite con una clave que sale de ahí es una fuga de memoria esperando: bastan
// facturas con `Workplace.Id` distintos para dejar entradas que no se borran nunca. Por eso:
//
//   · los valores se saneen a escalares cortos, sin caracteres de control;
//   · la clave es una HUELLA SHA-256 del trío (integración, Id, nombre), nunca los valores;
//   · lo vencido se tira;
//   · hay un techo de entradas, y al llegar se expulsa lo más viejo.
//
// LO QUE NUNCA ENTRA AQUÍ: el JSON, el MemberId, ni un solo dato del cliente. Solo el Id y el
// nombre del puesto de venta, que es lo que hace falta para decir «esto viene de otro sitio».

import { createHash } from "node:crypto";

/** Un `Workplace.Id` de Ágora es corto. 64 deja sitio de sobra sin permitir un campo enorme. */
export const MAX_ID = 64;
/** El nombre es un rótulo escrito por una persona. 120 es más de lo que cabe en una pantalla. */
export const MAX_NOMBRE = 120;
/** Techo de avisos distintos vivos a la vez. Con siete locales, llegar aquí ya es la señal. */
export const MAX_ENTRADAS = 500;
/** Un servicio largo. Pasado esto, el problema vuelve a merecer una línea. */
export const VENTANA_MS = 6 * 60 * 60 * 1000;

/**
 * Deja un valor del TPV en algo que se puede guardar y escribir en la auditoría.
 *
 * Devuelve `null` —y entonces no se avisa— si no es un escalar, si viene vacío o si se pasa de
 * largo. Recortar un valor excesivo sería peor que descartarlo: dos Workplace distintos podrían
 * quedar iguales al cortarlos y se confundirían entre sí.
 *
 * Los caracteres de control se quitan siempre: un `\n` o un `\r` metidos en el nombre parten una
 * línea de registro en dos y ensucian cualquier cosa que la lea después.
 */
export function sanear(valor, max) {
  if (valor === null || valor === undefined) return null;
  // Un objeto o un array no son un identificador. `String({})` daría "[object Object]", que es
  // exactamente el disfraz que ya nos costó un incidente con la clave de cifrado.
  if (typeof valor === "object" || typeof valor === "function") return null;
  if (typeof valor === "boolean") return null;
  const limpio = String(valor).replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  if (!limpio) return null;
  return limpio.length > max ? null : limpio;
}

/**
 * La huella que identifica un aviso. SHA-256, de los de la casa.
 *
 * POR QUÉ SHA-256 Y NO ALGO CASERO: aquí entra material que escribe el TPV. Un hash de 32 bits
 * —un FNV-1a, por ejemplo— tiene colisiones al alcance de cualquiera, y una colisión aquí significa
 * que dos Workplace distintos comparten aviso: el segundo se callaría creyendo que ya se avisó del
 * primero. El proyecto ya usa SHA-256 en todas partes; no hace falta inventar nada.
 *
 * ENTRA EL NOMBRE, NO SOLO EL Id. El mismo Id con otro rótulo es otra cosa observada y merece su
 * propio aviso: es la señal de que alguien ha tocado la configuración del TPV.
 *
 * SEPARADOR INEQUÍVOCO, por longitud. Concatenar a secas juntaría `("12", "3")` y `("1", "23")` en
 * el mismo `123`, y un separador suelto solo aguanta mientras ningún valor lo contenga. Prefijando
 * cada trozo con su longitud —`2:12|1:3` frente a `1:1|2:23`— no hay forma de que dos ternas
 * distintas produzcan la misma entrada, contengan lo que contengan.
 */
function huella(integracionId, id, nombre) {
  const trozo = (v) => { const t = String(v ?? ""); return `${t.length}:${t}`; };
  return createHash("sha256")
    .update(`${trozo(integracionId)}|${trozo(id)}|${trozo(nombre)}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * El acumulador. Se crea uno y se le va preguntando.
 *
 * `anota()` devuelve lo que hay que auditar, o `null` si toca callar:
 *
 *   · la PRIMERA de una ventana → `{ n: 1, desde }`, se audita al momento;
 *   · las siguientes de esa ventana → `null`, se cuentan en silencio;
 *   · la primera después de vencer → `{ n: acumulado, desde }`, con lo que se calló.
 *
 * Perder el recuento sería perder el tamaño del problema: «una discrepancia» y «trescientas en un
 * servicio» son cosas muy distintas para quien lo investigue.
 */
export function crearAcumulador({ maxEntradas = MAX_ENTRADAS, ventanaMs = VENTANA_MS } = {}) {
  const mapa = new Map();

  /** Tira lo vencido. Se llama en cada anotación: no hace falta un temporizador. */
  const limpia = (ahora) => {
    for (const [k, v] of mapa) if (ahora - v.t0 >= ventanaMs) mapa.delete(k);
  };

  return {
    get tamano() { return mapa.size; },
    /** Las claves vivas: huellas opacas, nada del TPV. Sirven para comprobar justo eso. */
    get claves() { return [...mapa.keys()]; },

    anota(integracionId, idCrudo, nombreCrudo, ahora = Date.now()) {
      const id = sanear(idCrudo, MAX_ID);
      // Sin un Id utilizable no hay nada que acumular ni nada que decir.
      if (id === null) return null;
      const nombre = sanear(nombreCrudo, MAX_NOMBRE);

      // LA CLAVE ES SOLO UNA HUELLA. Ni el Id ni el nombre entran en crudo: así no depende de lo
      // largo que sea lo que mande el TPV, y lo que se guarda en memoria no es material del TPV.
      const k = huella(integracionId, id, nombre);

      // SE LEE ANTES DE LIMPIAR, y el orden importa: `limpia` tira lo vencido, y esta entrada
      // puede ser justo una de esas. Limpiando primero se perdería el recuento que el aviso de
      // cierre tiene que informar, y saldría un «n: 1» cuando habían sido trescientas.
      // Con la referencia ya en la mano, que se borre del Map da igual.
      const v = mapa.get(k);
      limpia(ahora);

      const abre = () => {
        // El techo: al llegar se expulsa la más antigua. `Map` conserva el orden de inserción, así
        // que la primera clave es la que lleva más tiempo sin renovarse.
        if (!mapa.has(k) && mapa.size >= maxEntradas) {
          const vieja = mapa.keys().next().value;
          if (vieja !== undefined) mapa.delete(vieja);
        }
        mapa.set(k, { t0: ahora, n: 1, desde: new Date(ahora).toISOString() });
      };

      if (!v) { abre(); return { n: 1, desde: new Date(ahora).toISOString(), id, nombre }; }
      if (ahora - v.t0 >= ventanaMs) {
        const cerrada = { n: v.n + 1, desde: v.desde, id, nombre };
        abre();
        return cerrada;
      }
      v.n += 1;
      return null;
    },

    /** Para las pruebas y para un reinicio controlado. Vaciarlo solo provoca un aviso más. */
    vacia() { mapa.clear(); },
  };
}
