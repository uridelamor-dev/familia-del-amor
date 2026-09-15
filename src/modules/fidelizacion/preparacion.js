// ¿Hasta dónde está lanzado el programa de puntos? PURO: sin BD, sin Express, y SIN IMPORTS.
//
// ── LA PUERTA ES EXPLÍCITA, Y ESO ES LO QUE SE QUIERE ────────────────────────────────────────
//
// La versión anterior de este fichero deducía si se podía abrir preguntando si `agora.js`
// exportaba una función llamada `revertirDevolucionTotal`. Era peor: un esbozo, una función a
// medias o una exportación añadida un martes durante el desarrollo habrían abierto `conceder`,
// `ofrecer` y `consumir` solos, sin que nadie lo decidiera y sin salir en ningún diff.
//
// Ahora la puerta es UNA CONSTANTE CENTRAL. Subirla es un cambio de una línea — pero es una línea
// que aparece en el diff, que hay que revisar y que estos tests protegen. Eso es exactamente lo
// contrario de una condición que se cumple por accidente.
//
// ── ESTO NO ES EL INTERRUPTOR ────────────────────────────────────────────────────────────────
//
// El nivel dice hasta dónde llega EL CÓDIGO. Quien ENCIENDE es la puerta (`puerta.js`), que vive
// en la base, la firma Dirección escribiendo ACTIVAR y exige siete requisitos verdes.
//
// Con el nivel en `completo` y la puerta cerrada, no se concede, ni se ofrece, ni se consume
// absolutamente nada. Son dos llaves distintas y hacen falta las dos.
//
// ── SIN IMPORTS, A PROPÓSITO ─────────────────────────────────────────────────────────────────
//
// Este fichero no importa nada. Es el candado: si dependiera de `agora.js` —o de cualquier cosa
// que un día importe `agora.js`— un ciclo de imports podría dejarlo a medio cargar en el arranque,
// y un candado a medio cargar no es un candado.

/** Los niveles posibles, en orden. Congelados. */
export const NIVELES = Object.freeze(["sombra", "completo"]);

/**
 * EL NIVEL DE LANZAMIENTO: hasta dónde llega EL CÓDIGO.
 *
 * `completo` significa que está TODO ESCRITO —incluida la reversión de una devolución total, que
 * era lo que faltaba—. NO significa que el programa esté encendido.
 *
 * ── ESTO POR SÍ SOLO NO CONCEDE, NI OFRECE, NI CONSUME NADA ──────────────────────────────────
 *
 * Quien enciende es LA PUERTA (`puerta.js`), que se guarda en la base, la firma Dirección
 * escribiendo ACTIVAR y exige que los siete requisitos estén verdes. Mientras la puerta no esté en
 * `activo`, `fidInterruptores()` devuelve `conceder`, `ofrecer` y `consumir` a `false` pase lo que
 * pase aquí.
 *
 * Están separados a propósito: el nivel es una decisión de INGENIERÍA que viaja en un commit
 * revisado; la puerta es una decisión de NEGOCIO que se toma desde el panel, después de desplegar
 * y de mirar los números. Si fueran lo mismo, activar el programa exigiría un despliegue nuevo —y
 * desplegar para encender algo es la forma más fácil de encenderlo sin haberlo comprobado.
 */
export const NIVEL = "completo";

/** Qué interruptores se pueden tocar en cada nivel. Lo que no está aquí, no se enciende. */
export const PERMITIDOS_POR_NIVEL = Object.freeze({
  sombra: Object.freeze(["sombra"]),
  completo: Object.freeze(["sombra", "conceder", "ofrecer", "consumir"]),
});

/**
 * Lo que faltaría si el nivel NO estuviera completo. Hoy está vacío.
 *
 * Se conserva la lista —y no se borra el mecanismo— porque es lo que se enseñará la próxima vez
 * que haya que retener una capacidad a medio escribir. Vaciarla ahora y reescribirla entonces
 * significaría volver a discutir cómo se retiene algo.
 */
export const PENDIENTES = Object.freeze([]);

/** Los interruptores que este nivel permite tocar. */
export const permitidos = (nivel = NIVEL) => PERMITIDOS_POR_NIVEL[nivel] || PERMITIDOS_POR_NIVEL.sombra;

/** En qué punto estamos. `listo` solo es cierto en el nivel completo. */
export function estadoPreparacion(nivel = NIVEL) {
  const completo = nivel === "completo";
  return {
    nivel,
    listo: completo,
    permitidos: [...permitidos(nivel)],
    pendientes: completo ? [] : PENDIENTES.map(({ id, texto, detalle }) => ({ id, texto, detalle })),
  };
}

/**
 * ¿Se puede poner ESTE interruptor en ESTE valor?
 *
 * Apagar siempre se puede: si algo está encendido y no debería, la respuesta nunca es «no te dejo
 * apagarlo». Encender, solo lo que el nivel permita.
 */
export function puedeEncender(interruptor, valor, nivel = NIVEL) {
  if (valor === false) return { ok: true };
  if (permitidos(nivel).includes(interruptor)) return { ok: true };
  const e = estadoPreparacion(nivel);
  return { ok: false, nivel, pendientes: e.pendientes,
    error: "El programa de puntos todavía no puede activarse. " + e.pendientes.map((p) => p.texto).join(" · ") };
}

/**
 * Los interruptores que de verdad están en vigor.
 *
 * Se aplica ENCIMA de lo que haya guardado. Aunque alguien consiguiera escribir `fid_conceder = 1`
 * por cualquier vía —una migración, la consola de la base, un despiste—, aquí vuelve a apagarse.
 * La configuración es una intención; esto es lo que pasa.
 */
export function aplicarBloqueo(guardados, nivel = NIVEL) {
  const puede = permitidos(nivel);
  const out = {};
  for (const [k, v] of Object.entries(guardados || {})) out[k] = puede.includes(k) ? v : false;
  return out;
}
