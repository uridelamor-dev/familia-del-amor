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
// ── POR QUÉ ESTÁ EN «sombra» ─────────────────────────────────────────────────────────────────
//
// Una devolución total todavía NO revierte puntos. Con `conceder` encendido, un cliente compra por
// 200 €, se lleva 200 puntos, lo devuelve todo al día siguiente y se los queda. Con `consumir`,
// además se los gasta en descuentos reales.
//
// PARA SUBIR DE NIVEL hay que: implementar la reversión de una devolución total, validarla contra
// una devolución REAL, y solo entonces cambiar `NIVEL` en un commit revisado.
//
// ── SIN IMPORTS, A PROPÓSITO ─────────────────────────────────────────────────────────────────
//
// Este fichero no importa nada. Es el candado: si dependiera de `agora.js` —o de cualquier cosa
// que un día importe `agora.js`— un ciclo de imports podría dejarlo a medio cargar en el arranque,
// y un candado a medio cargar no es un candado.

/** Los niveles posibles, en orden. Congelados. */
export const NIVELES = Object.freeze(["sombra", "completo"]);

/**
 * ⚠️ EL NIVEL DE LANZAMIENTO. Cambiar esto ENCIENDE EL PROGRAMA DE PUNTOS EN PRODUCCIÓN.
 *
 * No se sube hasta que la reversión de una devolución total esté implementada Y validada contra
 * una devolución real. Subirlo antes significa regalar puntos por compras devueltas.
 */
export const NIVEL = "sombra";

/** Qué interruptores se pueden tocar en cada nivel. Lo que no está aquí, no se enciende. */
export const PERMITIDOS_POR_NIVEL = Object.freeze({
  sombra: Object.freeze(["sombra"]),
  completo: Object.freeze(["sombra", "conceder", "ofrecer", "consumir"]),
});

/** Lo que falta para poder subir de nivel. Es lo que se enseña en la pantalla. */
export const PENDIENTES = Object.freeze([
  Object.freeze({
    id: "devolucion_total",
    texto: "Los puntos no pueden activarse hasta validar una devolución total real",
    detalle: "Hoy una devolución total no revierte los puntos ganados ni restaura los consumidos. "
      + "Sin eso, un cliente puede comprar, llevarse los puntos, devolverlo todo y quedárselos. "
      + "Cuando esté implementado y probado contra una devolución real, se sube el nivel de "
      + "lanzamiento en un commit revisado.",
  }),
]);

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
