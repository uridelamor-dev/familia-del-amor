// LA POLÍTICA DE PRIVACIDAD: su versión y sus direcciones. PURO: sin BD, sin Express, sin red.
//
// ── POR QUÉ LA VERSIÓN ES UNA CONSTANTE Y NO UNA FECHA CALCULADA ─────────────────────────────
//
// Con cada consentimiento se guarda QUÉ POLÍTICA aceptó esa persona. Si la versión se dedujera de
// la fecha del fichero o de un hash del HTML, cambiar una coma —o volver a desplegar— movería la
// versión de todo el mundo hacia atrás y hacia delante, y lo guardado dejaría de significar nada.
//
// Aquí la versión sube A MANO, en el mismo commit que cambia el texto. Es una línea que aparece en
// el diff y que hay que revisar, que es exactamente lo que se quiere de un dato que luego se
// enseña si alguien pregunta qué aceptó.
//
// ── SUBIRLA NO INVALIDA LO ANTERIOR ──────────────────────────────────────────────────────────
//
// Quien aceptó la v1 aceptó la v1, y así queda escrito. Subir a v2 no borra ni reescribe nada: el
// libro de consentimientos es de solo añadir.

/**
 * La versión vigente. SE SUBE A MANO cuando cambia el texto de la política.
 *
 * v2 (17/09/2026) — añade la sección del carné en la cartera del móvil: qué se guarda cuando se
 * añade a Apple Wallet (un identificador del dispositivo y un testigo de notificaciones), para
 * qué sirve, cuánto dura y qué papel tiene Apple. Antes no se decía, y el servicio de
 * actualización sí guarda esos dos datos.
 */
export const POLITICA_VERSION = 2;

/** Cuándo entró en vigor esta versión. Va impresa en la página, para que se pueda comprobar. */
export const POLITICA_FECHA = "2026-09-17";

/**
 * Dónde vive cada idioma.
 *
 * Son páginas estáticas de `public/`, no rutas del servidor: una política tiene que poder leerse
 * aunque la aplicación esté caída, y es lo que menos debería depender de que algo funcione.
 */
export const POLITICA_URL = Object.freeze({
  ca: "/privacitat.html",
  es: "/privacidad.html",
  en: "/privacidad.html",   // todavía no hay versión inglesa; se enseña la castellana
});

/** La dirección para un idioma. Lo que no esté, cae en castellano. */
export const politicaUrl = (idioma) => POLITICA_URL[String(idioma || "es")] || POLITICA_URL.es;

/** Cómo se llama el enlace en cada idioma. Es el texto que se subraya dentro de la frase. */
export const POLITICA_ENLACE = Object.freeze({
  ca: "Política de privacitat",
  es: "Política de privacidad",
  en: "Privacy policy",
});

export const politicaEnlace = (idioma) => POLITICA_ENLACE[String(idioma || "es")] || POLITICA_ENLACE.es;

/**
 * Lo que se guarda con cada consentimiento.
 *
 * Se devuelve como un objeto y no suelto para que no se pueda guardar la versión sin la fecha ni
 * la fecha sin la campaña: los cinco datos solo valen juntos. «Aceptó» sin decir QUÉ, CUÁNDO, EN
 * QUÉ CAMPAÑA y POR DÓNDE no sirve el día que alguien pregunte, que es justo cuando hace falta.
 */
export function selloConsentimiento({ texto, formularioVersion, campana, origen, ahora, idioma }) {
  return Object.freeze({
    texto: String(texto || ""),
    formulario_version: Number(formularioVersion) || null,
    politica_version: POLITICA_VERSION,
    politica_url: politicaUrl(idioma),
    campana: campana ? String(campana) : null,
    origen: String(origen || ""),
    creado_en: String(ahora || ""),
  });
}
