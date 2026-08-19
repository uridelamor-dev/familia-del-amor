// Centros: dos barras que son un mismo negocio. Lógica PURA.
//
// EL CASO: La Tapeta de Blanes y la Cooperativa están pegadas y son lo mismo — mismo equipo,
// mismos proveedores, misma sociedad y mismo CIF. El sistema las trataba como dos
// establecimientos independientes, así que había que mirar dos veces todo: dos listas de
// gasto, dos plantillas, dos cuadrantes, dos inventarios.
//
// LO QUE SE JUNTA Y LO QUE NO, y es a propósito:
//
//   Juntos     ventas · compras · personal · inventarios
//   Separados  reservas · web pública · reseñas · WhatsApp
//
// Separado se queda lo que es FÍSICAMENTE de cada barra. Son dos direcciones, con dos cartas,
// dos fichas de Google y dos agendas de mesas: una reserva en la Cooperativa no es una mesa
// libre en La Tapeta, y juntarlas sentaría a dos grupos en el mismo sitio.
//
// POR QUÉ AQUÍ Y NO EN CADA CONSULTA: hay 190 consultas que filtran con `local = ?`. Tocarlas
// una a una es la forma segura de equivocarse —un fallo ahí no se ve, salen menos facturas o
// las de otro—. Pero el local entra por SEIS funciones (`localScope`, `horLocal`,
// `rrhhLocalScope`…), y traducirlo ahí hace que las 190 operen solas sobre el centro.
//
// CONVENIO: el valor que se GUARDA sigue siendo "La Tapeta - Blanes", el de siempre. No se
// renombra ni una fila. En pantalla se ve «Blanes» porque `nombreCortoLocal` ya le quita el
// «La Tapeta - » delante.

/** Un centro es un grupo de barras que comparten negocio. `principal` es lo que se escribe. */
export const CENTROS = [
  {
    id: "blanes",
    nombre: "Blanes",
    principal: "La Tapeta - Blanes",
    barras: ["La Tapeta - Blanes", "Cooperativa - Blanes"],
    juntos: ["ventas", "compras", "personal", "inventarios"],
  },
];

/**
 * De qué ámbito es una ruta de la API.
 *
 * Mapa PROPIO y no `MODULO_POR_RUTA` (usuarios/permisos.js) a propósito: aquella la consume
 * `requireAuth` como allowlist de módulos, y añadirle entradas endurecería permisos de gente
 * que hoy entra — un efecto secundario que nadie ha pedido y que se descubriría con alguien
 * delante de una pantalla en blanco.
 *
 * Va por prefijo y es DELIBERADAMENTE incompleto: lo que no está aquí devuelve null y se
 * comporta EXACTAMENTE como antes, sin juntar nada. Añadir una entrada junta; no añadirla no
 * rompe. Es la forma segura de hacer esto por partes.
 */
export const AMBITO_POR_RUTA = [
  ["/api/ventas", "ventas"],
  ["/api/agora", "ventas"],
  ["/api/analitica", "ventas"],
  ["/api/facturas", "compras"],
  ["/api/compras", "compras"],
  ["/api/productos", "compras"],
  ["/api/rrhh", "personal"],
  ["/api/hr/", "personal"],
  ["/api/horarios", "personal"],
  ["/api/fichajes", "personal"],
  ["/api/inventario", "inventarios"],
  ["/api/inv/", "inventarios"],
  // Sin entrada, y es una decisión: /api/reservas, /api/web, /api/reviews y /api/whatsapp
  // siguen viendo las dos barras por separado. Y /api/dashboard tampoco entra: mezcla gasto
  // con reservas en la misma pantalla, así que juntarlo entero juntaría también las mesas.
];

/** El ámbito de una ruta, o null si no está mapeada (entonces no se junta nada). */
export function ambitoDeRuta(ruta) {
  const r = String(ruta || "").split("?")[0];
  for (const [pre, amb] of AMBITO_POR_RUTA) if (r === pre || r.startsWith(pre)) return amb;
  return null;
}

const texto = (v) => String(v == null ? "" : v).trim();

/** El centro al que pertenece una barra, o null si esa barra va por libre. */
export function centroDe(local) {
  const l = texto(local);
  if (!l) return null;
  return CENTROS.find((c) => c.barras.includes(l)) || null;
}

/** ¿Este centro se comporta como uno solo en este ámbito? Sin ámbito, NO: no se junta a ciegas. */
export function esJunto(centro, ambito) {
  const a = texto(ambito);
  return !!(centro && a && centro.juntos.includes(a));
}

/**
 * El nombre con el que hay que leer y escribir en este ámbito.
 *
 * «Cooperativa - Blanes» + compras → «La Tapeta - Blanes» (la factura es del centro)
 * «Cooperativa - Blanes» + reservas → «Cooperativa - Blanes» (la mesa es de esa barra)
 * Cualquier otro local → tal cual, siempre.
 */
export function canonico(local, ambito) {
  const l = texto(local);
  const c = centroDe(l);
  return esJunto(c, ambito) ? c.principal : l;
}

/**
 * Las barras que hay que MIRAR para responder en este ámbito. Para lo que no se puede
 * reescribir y hay que leer sumando: los fichajes —`fic_eventos` es inmutable por ley— y las
 * ventas diarias, que las escribe el TPV de cada barra con su propio nombre.
 *
 * Devuelve siempre un array, también cuando es una sola: quien lo usa hace `local = ANY(?)`
 * y no tiene que preguntarse si hoy hay centro o no.
 */
export function barras(local, ambito) {
  const l = texto(local);
  const c = centroDe(l);
  return esJunto(c, ambito) ? [...c.barras] : (l ? [l] : []);
}

/**
 * Qué establecimientos se ofrecen en la barra del panel para este ámbito: en los juntos, la
 * barra secundaria desaparece de la lista porque elegirla no querría decir nada —los datos
 * que enseñaría son los del centro entero—.
 */
export function visiblesEn(ambito, lista = []) {
  const fuera = new Set();
  for (const c of CENTROS) {
    if (!esJunto(c, ambito)) continue;
    for (const b of c.barras) if (b !== c.principal) fuera.add(b);
  }
  return (Array.isArray(lista) ? lista : []).filter((l) => !fuera.has(texto(l)));
}

/**
 * Lo que hay dentro, en una línea. Sin esto alguien mira el gasto de Blanes y piensa que falta
 * la mitad, porque la Cooperativa ya no sale por ningún lado.
 */
export function detalleCentro(local, ambito) {
  const c = centroDe(local);
  if (!esJunto(c, ambito) || texto(local) !== c.principal) return null;
  const otras = c.barras.filter((b) => b !== c.principal);
  if (!otras.length) return null;
  return `Incluye ${otras.join(" y ")}`;
}

/** ¿Es una barra secundaria? Sirve para no ofrecerla donde ya no se puede elegir. */
export function esBarraSecundaria(local) {
  const c = centroDe(local);
  return !!c && texto(local) !== c.principal;
}
