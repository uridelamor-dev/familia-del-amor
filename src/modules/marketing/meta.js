// EL PÍXEL DE META Y EL CONSENTIMIENTO. PURO: sin BD, sin Express, sin red, sin DOM.
//
// ── POR QUÉ ESTO EXISTE ──────────────────────────────────────────────────────────────────────
//
// Hasta ahora el Píxel se instalaba DENTRO de `promo.js`: el identificador viajaba en la respuesta
// de una campaña, el fragmento de Meta se inyectaba a mano y los eventos se mandaban desde ahí.
//
// Eso tenía dos consecuencias, y las dos estaban pasando en producción:
//
//   1. SOLO LO CARGABA UNA PÁGINA. Toda la web pública —portada, locales, alta de tarjeta— no
//      mandaba nada a Meta, así que sus anuncios optimizaban a ciegas.
//   2. AL MIGRAR LOS FORMULARIOS SE PERDIÓ. `cargarPixel()` solo se llamaba desde el camino de la
//      campaña clásica. Los formularios configurables —los nuevos— no mandaban ni `PageView` ni
//      `Lead`. En silencio, sin ningún error.
//
// Aquí vive lo que deciden esas dos cosas, y NADA MÁS: el identificador, la versión del texto de
// consentimiento, y qué páginas llevan rastreo. Lo demás son dos ficheros de navegador.
//
// ── EL CONSENTIMIENTO DE COOKIES NO ES EL CONSENTIMIENTO DE WHATSAPP ─────────────────────────
//
// Son dos cosas distintas y no se mezclan nunca:
//
//   · El de los formularios («acepto recibir comunicaciones») permite ESCRIBIR a alguien. Es una
//     casilla del formulario, se guarda con el lead y viaja con su versión del texto legal.
//   · ESTE permite GUARDAR COSAS EN EL NAVEGADOR de quien visita y CEDER su navegación a un
//     tercero. En España lo rige el artículo 22.2 de la LSSI y exige consentimiento previo,
//     informado y revocable, con rechazar tan fácil como aceptar.
//
// Alguien puede aceptar el de WhatsApp y rechazar este. Y al revés.

/**
 * EL PÍXEL DE LA CASA. Escrito UNA sola vez en todo el proyecto.
 *
 * Es el valor de partida, no una constante de negocio: lo que manda es `config.meta_pixel_id`, y
 * esto es lo que se usa mientras nadie haya escrito nada ahí. Cambiarlo desde el panel lo pisa.
 */
export const PIXEL_POR_DEFECTO = "2277417329492563";

/**
 * LA VERSIÓN DEL TEXTO DE CONSENTIMIENTO.
 *
 * Se guarda junto a la decisión. Si algún día cambia lo que se le cuenta a la gente —otra
 * finalidad, otro tercero—, se sube este número y a todo el mundo se le vuelve a preguntar: un
 * «sí» a un texto no vale para otro.
 */
export const VERSION_CONSENTIMIENTO = 1;

/** Dónde se guarda la decisión en el navegador. */
export const CLAVE_CONSENTIMIENTO = "fda_cookies";

/** Las dos únicas decisiones posibles. No hay un tercer estado «medio sí». */
export const DECISIONES = Object.freeze(["aceptado", "rechazado"]);

/**
 * UN IDENTIFICADOR DE PÍXEL, O `null`.
 *
 * Solo dígitos: es lo que emite Meta y lo que ya hacía la ruta anterior. Se sanea aquí y no en el
 * navegador porque este valor acaba dentro de una llamada a `fbq`, y lo escribe una persona en un
 * panel.
 */
export function pixelValido(v) {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length >= 6 && s.length <= 20 ? s : null;
}

/** El que se va a usar: lo configurado si vale, y si no el de la casa. */
export const pixelEfectivo = (configurado) => pixelValido(configurado) || PIXEL_POR_DEFECTO;

/**
 * La decisión guardada, leída de lo que haya en el navegador.
 *
 * DEVUELVE `null` ANTE CUALQUIER DUDA, y `null` significa «todavía no ha decidido», que es el
 * estado en el que NO se carga nada. Un JSON roto, una versión vieja o un valor desconocido no se
 * interpretan «a favor»: se vuelve a preguntar.
 */
export function leerDecision(crudo, version = VERSION_CONSENTIMIENTO) {
  if (!crudo) return null;
  let j = crudo;
  if (typeof crudo === "string") {
    try { j = JSON.parse(crudo); } catch { return null; }
  }
  if (!j || typeof j !== "object") return null;
  if (Number(j.v) !== Number(version)) return null;   // el texto cambió: ese «sí» ya no vale
  return DECISIONES.includes(j.d) ? j.d : null;
}

/**
 * ¿SE CARGA META? La única función que lo decide.
 *
 * Hace falta TODO: una decisión explícita de aceptar y un píxel utilizable. Sin decisión no se
 * carga —el silencio no es un sí—, y con un rechazo tampoco.
 */
export function debeCargarMeta({ decision, pixel } = {}) {
  return decision === "aceptado" && !!pixelValido(pixel);
}

// ── QUÉ PÁGINAS LLEVAN RASTREO ───────────────────────────────────────────────────────────────
//
// Esta lista es LA decisión, y está aquí —en datos— y no repartida por veinte etiquetas `<script>`
// en veinte HTML. Hay un test que abre cada fichero y comprueba que lo que lleva dentro coincide
// con lo que dice esta tabla; si alguien añade una página y se olvida, el test lo dice.
//
// El criterio es de negocio, no técnico: se mide la navegación de quien AÚN NO ES CLIENTE y puede
// llegar de un anuncio. En cuanto alguien entra en su propia cuenta, deja de ser audiencia.

/** Páginas públicas que SÍ miden: la web comercial y las entradas de campaña. */
export const PAGINAS_CON_META = Object.freeze([
  "index.html",      // la portada
  "nosotros.html",
  "locales.html",
  "eventos.html",
  "local.html",      // la ficha de un local
  "trabaja.html",    // trabaja con nosotros
  "promo.html",      // la landing de una campaña de pago
  "alta.html",       // alta de la tarjeta de cliente
]);

/**
 * Páginas que NO miden, con el motivo. Cada una está aquí por una razón distinta, y por eso se
 * escribe: dentro de seis meses, «¿por qué la tarjeta no mide?» tiene respuesta.
 */
export const PAGINAS_SIN_META = Object.freeze({
  "tarjeta.html": "la cuenta del cliente: ya es cliente, y ahí mira sus puntos",
  "cupon.html": "el cupón de alguien concreto, abierto desde su propio enlace",
  "privacidad.html": "página legal: medir a quien viene a leer qué hacemos con sus datos, no",
  "privacitat.html": "página legal",
  "login.html": "acceso interno",
  "fichar.html": "kiosco de fichajes del personal",
  "pulso.html": "kiosco",
  "direccion.html": "pantalla interna",
  "encargados.html": "pantalla interna",
  "rrhh.html": "pantalla interna",
  "contabilidad.html": "pantalla interna",
  "marketing.html": "pantalla interna",
  "trabajadores.html": "pantalla interna",
  "logo-preview.html": "herramienta de trabajo",
});

/**
 * Páginas que cargan el gestor de consentimiento SIN cargar Meta.
 *
 * Son las legales: no miden a nadie, pero son justo donde alguien va a buscar cómo cambiar de
 * opinión. Si el gestor no estuviera ahí, «revocar» exigiría volver a la portada.
 */
export const PAGINAS_SOLO_CONSENTIMIENTO = Object.freeze(["privacidad.html", "privacitat.html"]);

/** Los eventos que mandamos. CERRADO: lo que no esté aquí no se manda. */
export const EVENTOS = Object.freeze({
  PageView: "una visita a una página pública. Lo manda el cargador, una sola vez por página",
  Lead: "alguien ha completado un formulario público y ha quedado dado de alta",
});
