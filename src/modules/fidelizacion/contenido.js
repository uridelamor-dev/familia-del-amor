// Los textos que configura Marketing y lee un cliente. PURO: sin BD, sin Express, sin red.
//
// ── POR QUÉ ESTO EXISTE, Y NO ES PARANOIA ────────────────────────────────────────────────────
//
// Todo lo que hay aquí acaba pintado en una página PÚBLICA —el formulario de una campaña, la
// tarjeta que abre un cliente en su móvil— y lo escribe una persona desde el panel. Si se acepta
// HTML libre, se está aceptando que cualquiera con acceso a Marketing pueda meter un `<script>` en
// una página que abren cientos de clientes.
//
// LA REGLA: aquí dentro solo entra TEXTO. Los saltos de línea se conservan porque hacen falta para
// escribir un párrafo; todo lo demás que parezca una etiqueta se va.
//
// Y una segunda regla, para las URLs: solo `https`, y solo hacia donde ya vamos. Un enlace de
// «política de privacidad» que apunte a otro sitio es un enlace que alguien pinchará confiando.

/** Longitudes máximas por tipo de campo. Cortar es mejor que guardar un texto sin fin. */
export const LARGOS = Object.freeze({
  titulo: 120, subtitulo: 200, boton: 40, parrafo: 2000, legal: 4000, nombre: 120, url: 300,
});

/**
 * Texto y nada más.
 *
 * Se quitan las etiquetas ENTERAS, no solo los signos: dejar `&lt;script&gt;` escapado y pintarlo
 * con `innerHTML` en algún sitio lo volvería a convertir en una etiqueta. Aquí no queda nada que
 * pueda volver a serlo.
 */
export function textoSeguro(v, max = LARGOS.parrafo) {
  if (v === null || v === undefined || typeof v === "object" || typeof v === "boolean") return "";
  let t = String(v);
  // Fuera etiquetas y comentarios, con su contenido si son de script o estilo.
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<[^>]*>/g, " ");
  // Fuera entidades que pudieran reconstruir una etiqueta más adelante.
  t = t.replace(/&(lt|gt|#0*60|#0*62|#x0*3c|#x0*3e);/gi, " ");
  // Fuera controles, menos el salto de línea: un párrafo necesita saltos.
  t = t.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, "");
  // Como mucho dos saltos seguidos: un texto con cuarenta líneas en blanco rompe cualquier diseño.
  t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  return t.trim().slice(0, max);
}

/**
 * Una URL utilizable, o `null`.
 *
 * SOLO `https`. Un `javascript:` en un `href` ejecuta código al pinchar, y un `http://` en una
 * página servida por https lo bloquea el navegador sin decir nada — el enlace parecería roto.
 */
export function urlSegura(v, { permitirRelativa = true } = {}) {
  const t = textoSeguro(v, LARGOS.url).trim();
  if (!t) return null;
  if (permitirRelativa && t.startsWith("/") && !t.startsWith("//")) return t.slice(0, LARGOS.url);
  let u;
  try { u = new URL(t); } catch { return null; }
  if (u.protocol !== "https:") return null;
  return u.toString().slice(0, LARGOS.url);
}

/** La paleta. Cerrada: un color libre es un sitio donde escribir lo que sea dentro de un estilo. */
export const PALETAS = Object.freeze({
  verde:    { acento: "#1c6b4b", suave: "#e8f2ec", nombre: "Verde de la casa" },
  tierra:   { acento: "#8a5a1c", suave: "#f6efe4", nombre: "Tierra" },
  vino:     { acento: "#7a2233", suave: "#f6e9ec", nombre: "Vino" },
  pizarra:  { acento: "#33414d", suave: "#eaeef1", nombre: "Pizarra" },
});
export const paletaDe = (clave) => PALETAS[String(clave)] || PALETAS.verde;

// ── El formulario ────────────────────────────────────────────────────────────────────────────

/**
 * Los campos que se pueden pedir. Cerrado: si no está aquí, no se pide.
 *
 * `telefono` y `nombre` NO se pueden quitar de obligatorios. El teléfono ES la cuenta —normalizado,
 * es la identidad de todo el sistema— y sin nombre no hay forma de saludar a nadie en la barra.
 */
export const CAMPOS = Object.freeze({
  nombre:      { etiqueta: "Nombre", tipo: "text", siempre: true, autocomplete: "given-name" },
  apellidos:   { etiqueta: "Apellidos", tipo: "text", autocomplete: "family-name" },
  telefono:    { etiqueta: "Teléfono", tipo: "tel", siempre: true, autocomplete: "tel" },
  poblacion:   { etiqueta: "Población", tipo: "text", autocomplete: "address-level2" },
  email:       { etiqueta: "Correo electrónico", tipo: "email", autocomplete: "email" },
  nacimiento:  { etiqueta: "Fecha de nacimiento", tipo: "date", autocomplete: "bday" },
  codigo_postal: { etiqueta: "Código postal", tipo: "text", autocomplete: "postal-code" },
  local:       { etiqueta: "Local preferido", tipo: "select" },
  comercial:   { etiqueta: "Quiero recibir ofertas por WhatsApp", tipo: "check" },
});

/** Los obligatorios que no se negocian. */
export const CAMPOS_FORZOSOS = Object.freeze(["nombre", "telefono"]);

/** Los que NUNCA pueden ser obligatorios. Un consentimiento comercial forzoso no es consentimiento:
 *  si hay que aceptarlo para poder enviar el formulario, no se ha elegido nada. */
export const CAMPOS_NUNCA_OBLIGATORIOS = Object.freeze(["comercial"]);

/**
 * Normaliza la lista de campos configurada.
 *
 * `nombre` y `telefono` se meten SIEMPRE y SIEMPRE obligatorios, estén o no en lo que llegue: es
 * la identidad del sistema y no puede depender de que alguien no desmarque una casilla.
 *
 * `comercial` NUNCA nace marcado. Un consentimiento premarcado no es un consentimiento.
 */
export function normalizarCampos(lista) {
  const dentro = new Map();
  for (const c of Array.isArray(lista) ? lista : []) {
    const id = String(c?.id || c || "");
    if (!CAMPOS[id] || dentro.has(id)) continue;
    dentro.set(id, {
      id,
      visible: c?.visible !== false,
      obligatorio: CAMPOS_NUNCA_OBLIGATORIOS.includes(id) ? false
        : CAMPOS_FORZOSOS.includes(id) ? true : c?.obligatorio === true,
      etiqueta: textoSeguro(c?.etiqueta, LARGOS.nombre) || CAMPOS[id].etiqueta,
      // Solo para `comercial`, y siempre falso: no hay forma de configurarlo premarcado.
      ...(id === "comercial" ? { marcado: false } : {}),
    });
  }
  for (const id of CAMPOS_FORZOSOS) {
    if (!dentro.has(id)) dentro.set(id, { id, visible: true, obligatorio: true, etiqueta: CAMPOS[id].etiqueta });
    else dentro.set(id, { ...dentro.get(id), visible: true, obligatorio: true });
  }
  // El orden de configuración se respeta, pero los forzosos van primero.
  const orden = [...CAMPOS_FORZOSOS, ...[...dentro.keys()].filter((k) => !CAMPOS_FORZOSOS.includes(k))];
  return orden.map((k) => dentro.get(k));
}

/**
 * Los mensajes que puede ver un cliente. CERRADO, y con un valor por defecto para cada uno.
 *
 * Están aquí y no en `promo.js` porque un formulario en catalán que falla en castellano es un
 * formulario a medio traducir — y los errores son justo lo que más se lee cuando algo va mal.
 * Cada campaña guarda los suyos en su versión, así que cambiar una frase no toca el código.
 */
export const MENSAJES = Object.freeze({
  cargando: "Cargando…",
  enviando: "Enviando…",
  falta_campo: "Falta un dato obligatorio.",
  telefono_no_valido: "El teléfono no parece correcto.",
  fecha_futura: "Esa fecha todavía no ha llegado.",
  consentimiento: "Hay que aceptar para continuar.",
  sin_whatsapp: "Este número no está disponible en WhatsApp. Compruébalo e inténtalo otra vez.",
  whatsapp_caido: "Ahora mismo no podemos comprobar el número. Inténtalo dentro de unos minutos.",
  ya_registrado: "¡Listo! Ya estás dentro.",
  no_vigente: "Esta promoción no está disponible ahora mismo.",
  ya_utilizado: "Este beneficio ya se ha utilizado.",
  error: "No se ha podido guardar. Inténtalo otra vez.",
  // El estado de SU mensaje. Tres, y cada uno dice exactamente lo que consta: pendiente es
  // «está en la cola» y enviado es «consta la fecha en que salió». Nunca al revés.
  pendiente_envio: "Te lo estamos enviando por WhatsApp. Llega en unos minutos.",
  enviado_wa: "Ya te lo hemos enviado por WhatsApp.",
  fallo_envio: "No hemos podido enviártelo por WhatsApp. Escríbenos y te lo damos.",
});

/**
 * LOS MISMOS MENSAJES EN CADA IDIOMA, y por qué existen.
 *
 * Un formulario publicado en catalán con los errores en castellano no está en catalán: el cliente
 * lee «A La Tapeta et convidem a esmorzar!» y, en cuanto se equivoca de tecla, «El teléfono no
 * parece correcto». Dejar eso en manos de que Marketing rellene doce casillas a mano es dejar que
 * se olvide una —y la que se olvide será justo la que vea el cliente, porque los mensajes de error
 * son los que nadie prueba.
 *
 * Por eso el respaldo va POR IDIOMA. Lo escrito en el panel manda siempre; esto es lo que sale
 * cuando esa casilla está vacía.
 */
export const MENSAJES_POR_IDIOMA = Object.freeze({
  es: MENSAJES,
  ca: Object.freeze({
    cargando: "Carregant…",
    enviando: "Enviant…",
    falta_campo: "Falta una dada obligatòria.",
    telefono_no_valido: "El telèfon no sembla correcte.",
    fecha_futura: "Aquesta data encara no ha arribat.",
    consentimiento: "Cal acceptar-ho per continuar.",
    sin_whatsapp: "Aquest número no està disponible a WhatsApp. Comprova'l i torna-ho a provar.",
    whatsapp_caido: "Ara mateix no podem comprovar el número. Torna-ho a provar d'aquí a uns minuts.",
    ya_registrado: "Ja està! Ja hi ets.",
    no_vigente: "Aquesta promoció no està disponible ara mateix.",
    ya_utilizado: "Aquest avantatge ja s'ha fet servir.",
    error: "No s'ha pogut desar. Torna-ho a provar.",
    pendiente_envio: "T'ho estem enviant per WhatsApp. Arriba d'aquí a uns minuts.",
    enviado_wa: "Ja te l'hem enviat per WhatsApp.",
    fallo_envio: "No hem pogut enviar-t'ho per WhatsApp. Escriu-nos i te'l donem.",
  }),
  en: Object.freeze({
    cargando: "Loading…",
    enviando: "Sending…",
    falta_campo: "A required field is missing.",
    telefono_no_valido: "That phone number doesn't look right.",
    fecha_futura: "That date hasn't happened yet.",
    consentimiento: "You need to accept to continue.",
    sin_whatsapp: "This number isn't available on WhatsApp. Check it and try again.",
    whatsapp_caido: "We can't check the number right now. Please try again in a few minutes.",
    ya_registrado: "All set! You're in.",
    no_vigente: "This offer isn't available right now.",
    ya_utilizado: "This benefit has already been used.",
    error: "We couldn't save it. Please try again.",
    pendiente_envio: "We are sending it to you on WhatsApp. It arrives in a few minutes.",
    enviado_wa: "We have already sent it to you on WhatsApp.",
    fallo_envio: "We could not send it on WhatsApp. Write to us and we will give it to you.",
  }),
});

/** El juego por defecto de un idioma. Uno desconocido cae en castellano, que es el de la casa. */
export const mensajesDefecto = (idioma) => MENSAJES_POR_IDIOMA[String(idioma || "es")] || MENSAJES;

/**
 * Los de una versión, con los que falten rellenados por defecto EN SU IDIOMA.
 *
 * El idioma se pasa aparte —y no se lee de `guardados`— porque quien llama lo tiene en la fila del
 * formulario (`f.idioma`), que es donde vive de verdad; los mensajes son solo un JSON de textos.
 */
export function mensajesDe(guardados, idioma) {
  let m = {};
  if (guardados && typeof guardados === "object") m = guardados;
  else if (typeof guardados === "string" && guardados.trim()) {
    try { const j = JSON.parse(guardados); if (j && typeof j === "object") m = j; } catch { m = {}; }
  }
  const def = mensajesDefecto(idioma);
  const out = {};
  for (const k of Object.keys(MENSAJES)) out[k] = textoSeguro(m[k], LARGOS.subtitulo) || def[k];
  return out;
}

/** Los idiomas en los que se puede publicar. Cerrado: lo que no esté aquí no se ofrece. */
export const IDIOMAS = Object.freeze({ es: "Castellano", ca: "Català", en: "English" });

/** ¿Se puede publicar este formulario? Lo que falta, en frases que dicen qué hacer. */
export function validarFormulario(cfg) {
  const falta = [];
  if (!textoSeguro(cfg?.titulo, LARGOS.titulo)) falta.push("Falta el título.");
  if (!textoSeguro(cfg?.texto_boton, LARGOS.boton)) falta.push("Falta el texto del botón.");
  if (!textoSeguro(cfg?.mensaje_exito, LARGOS.parrafo)) falta.push("Falta el mensaje que se ve al enviar.");
  // Sin consentimiento no se pide un teléfono a nadie.
  if (!textoSeguro(cfg?.consentimiento_texto, LARGOS.legal)) falta.push("Falta el texto de consentimiento.");
  if (!urlSegura(cfg?.privacidad_url)) falta.push("Falta el enlace a la política de privacidad (tiene que ser https).");
  if (cfg?.abre_en && cfg?.cierra_en && String(cfg.abre_en) > String(cfg.cierra_en)) {
    falta.push("La fecha de apertura es posterior a la de cierre.");
  }
  const campos = normalizarCampos(cfg?.campos);
  if (!campos.some((c) => c.id === "telefono" && c.obligatorio)) falta.push("El teléfono tiene que ser obligatorio.");
  return { ok: falta.length === 0, falta, campos };
}

/** ¿Está abierto ahora? Se usa la fecha en Madrid, que la calcula quien llama. */
export function formularioAbierto(cfg, { fechaMadrid }) {
  if (!cfg) return { ok: false, motivo: "no_existe" };
  if (cfg.estado !== "publicado") return { ok: false, motivo: "no_publicado" };
  if (cfg.abre_en && fechaMadrid < String(cfg.abre_en).slice(0, 10)) return { ok: false, motivo: "aun_no_abre" };
  if (cfg.cierra_en && fechaMadrid > String(cfg.cierra_en).slice(0, 10)) return { ok: false, motivo: "ya_cerrado" };
  return { ok: true, motivo: null };
}

// ── Las comunicaciones ───────────────────────────────────────────────────────────────────────

/**
 * Las variables que se pueden usar en una plantilla. CERRADO.
 *
 * Nada de sustituir con lo que haya en un objeto: una plantilla con `{telefono}` mandaría el
 * teléfono del cliente dentro de su propio mensaje, y `{token}` mandaría su credencial por
 * WhatsApp. Lo que no está en esta lista se queda escrito tal cual, a la vista, para que quien lo
 * escribió lo corrija.
 */
export const VARIABLES = Object.freeze(["nombre", "enlace", "fecha", "local", "premio"]);

export function renderPlantilla(plantilla, ctx) {
  const base = textoSeguro(plantilla, LARGOS.parrafo);
  return base.replace(/\{([a-z_]+)\}/g, (entera, clave) => {
    if (!VARIABLES.includes(clave)) return entera;        // se queda a la vista, sin sustituir
    const v = ctx ? ctx[clave] : null;
    return v === null || v === undefined ? "" : textoSeguro(v, LARGOS.nombre);
  });
}

/** Las variables que la plantilla usa y no existen. Se enseñan antes de aprobar nada. */
export function variablesDesconocidas(plantilla) {
  const usadas = [...String(plantilla || "").matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
  return [...new Set(usadas.filter((v) => !VARIABLES.includes(v)))];
}

/**
 * ¿Se le puede escribir a esta persona?
 *
 * Tres motivos de exclusión, y los tres se cuentan y se enseñan: sin el desglose, «500 personas,
 * se enviarán 300» es un número que nadie puede comprobar.
 */
export function puedeRecibir(persona) {
  if (!persona?.telefono) return { ok: false, motivo: "sin_telefono" };
  if (persona.baja) return { ok: false, motivo: "de_baja" };
  if (!persona.consiente) return { ok: false, motivo: "sin_consentimiento" };
  if (persona.ya_enviado) return { ok: false, motivo: "ya_enviado" };
  return { ok: true, motivo: null };
}

export const MOTIVOS_EXCLUSION = Object.freeze({
  sin_telefono: "sin teléfono",
  de_baja: "se ha dado de baja",
  sin_consentimiento: "no ha dado su consentimiento",
  ya_enviado: "ya ha recibido este mensaje",
});
