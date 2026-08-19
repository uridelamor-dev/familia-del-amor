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
    // Se juntan del todo: se lee y se ESCRIBE bajo el centro.
    juntos: ["ventas", "compras", "personal", "inventarios", "mantenimiento", "usuarios"],
    // Se juntan SOLO PARA VER. Dentro del panel, la agenda y las reseñas de las dos barras
    // salen en la misma pantalla —quien trabaja allí las lleva a la vez—, pero cada fila
    // conserva su barra y se escribe donde toca: una mesa reservada en la Cooperativa es una
    // mesa de la Cooperativa, y una reseña la deja un cliente en una ficha de Google concreta.
    // De cara al cliente siguen siendo dos locales; dentro del panel, uno.
    vistaJunta: ["reservas", "reviews"],
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
  // Una incidencia («se ha roto la cámara») la arregla la misma persona en las dos barras, y
  // un usuario pertenece al centro, no a una de ellas. Dentro del panel, uno.
  ["/api/maintenance", "mantenimiento"],
  ["/api/mantenimiento", "mantenimiento"],
  ["/api/usuarios", "usuarios"],
  // Estos dos NO están en `juntos`: se ven juntos pero cada fila conserva su barra, porque
  // una mesa y una reseña pasan en un sitio concreto.
  ["/api/reservas", "reservas"],
  ["/api/reviews", "reviews"],
  // Sin entrada, a propósito: /api/web y /api/whatsapp configuran lo que ve el cliente y
  // necesitan las dos barras enteras. Y /api/dashboard tampoco entra: junta ocho locales de
  // un vistazo y ahí el desglose por barra es justo lo que se está mirando.
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

/** ¿Se ven en la misma pantalla? Incluye lo que se junta del todo y lo que solo se junta al ver. */
export function seVeJunto(centro, ambito) {
  const a = texto(ambito);
  return esJunto(centro, ambito) || !!(centro && a && (centro.vistaJunta || []).includes(a));
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
  return seVeJunto(c, ambito) ? [...c.barras] : (l ? [l] : []);
}

/**
 * Qué establecimientos se ofrecen en la barra del panel para este ámbito: en los juntos, la
 * barra secundaria desaparece de la lista porque elegirla no querría decir nada —los datos
 * que enseñaría son los del centro entero—.
 */
export function visiblesEn(_ambito, lista = []) {
  // SIN mirar el ámbito, y es la corrección que pidió Uriel al ver «Blanes» y «Cooperativa -
  // Blanes» los dos en el selector: dentro del panel es UN establecimiento, en todas las
  // pantallas. Los dos locales separados son de cara al cliente —la web, la ficha de Google,
  // el sitio donde se sienta— y eso se configura en pantallas que tienen su propia lista
  // completa (Web, grupos de WhatsApp, alta de reserva), no en este selector.
  const fuera = new Set();
  for (const c of CENTROS) for (const b of c.barras) if (b !== c.principal) fuera.add(b);
  return (Array.isArray(lista) ? lista : []).filter((l) => !fuera.has(texto(l)));
}

/**
 * Lo que hay dentro, en una línea. Sin esto alguien mira el gasto de Blanes y piensa que falta
 * la mitad, porque la Cooperativa ya no sale por ningún lado.
 */
export function detalleCentro(local, ambito) {
  const c = centroDe(local);
  if (!seVeJunto(c, ambito) || texto(local) !== c.principal) return null;
  const otras = c.barras.filter((b) => b !== c.principal);
  if (!otras.length) return null;
  return `Incluye ${otras.join(" y ")}`;
}

/**
 * Agrupa filas «por local» bajo su centro, sumando lo que se le diga.
 *
 * Hace falta porque hay dos cosas que siguen escribiéndose con el nombre de cada barra y no se
 * pueden cambiar: las ventas (las manda el TPV de cada una) y las reservas (una mesa está
 * donde está). Sin esto, la Cooperativa reaparecía en los desgloses del Dashboard aunque ya no
 * se pudiera elegir en ninguna parte — que es justo la confusión que se quería quitar.
 *
 * `campos` son las columnas numéricas que se suman. El resto se queda con el de la primera fila.
 */
export function agruparPorCentro(filas = [], campos = [], { clave = "local" } = {}) {
  const out = [];
  const porNombre = new Map();
  for (const f of (Array.isArray(filas) ? filas : [])) {
    const c = centroDe(f && f[clave]);
    const destino = c ? c.principal : texto(f && f[clave]);
    if (!porNombre.has(destino)) {
      const copia = { ...f, [clave]: destino };
      porNombre.set(destino, copia); out.push(copia);
      continue;
    }
    const ya = porNombre.get(destino);
    for (const k of campos) ya[k] = (Number(ya[k]) || 0) + (Number(f[k]) || 0);
  }
  return out;
}

/** ¿Es una barra secundaria? Sirve para no ofrecerla donde ya no se puede elegir. */
export function esBarraSecundaria(local) {
  const c = centroDe(local);
  return !!c && texto(local) !== c.principal;
}
