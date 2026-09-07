// Lo que se lee y lo que se recibe en una campaña de captación. Lógica PURA.
//
// Tres idiomas escritos a mano, no traducidos al vuelo. Son cuatro frases, las escribe
// Marketing, y la frase con la que se le regala algo a un cliente es justo donde no interesa una
// sorpresa de una traducción automática. La maquinaria de traducir (Claude + caché) existe y se
// usa en campañas masivas; aquí no hace falta.

import { normalizarIdioma } from "../messaging/i18n.js";

export const IDIOMAS = ["es", "ca", "en"];

/**
 * En qué idioma le hablamos. Manda, por este orden:
 *
 *  1. Lo que YA sabíamos de esa persona (`marketing_prefs.idioma`), que sale de sus propios
 *     WhatsApps. Si nos ha escrito veinte veces en catalán, da igual cómo tenga el móvil.
 *  2. El idioma del móvil con el que ha rellenado el formulario.
 *  3. El de la campaña: en una de Girona, catalán.
 *
 * `navigator.language` llega como «ca-ES», «es-419», «en-GB»… y `normalizarIdioma` se queda con
 * las dos primeras letras si es un idioma conocido. Lo que no reconoce cae al siguiente escalón
 * en vez de colarse como idioma raro.
 */
export function elegirIdioma({ deFicha = "", delMovil = "", deCampana = "es" } = {}) {
  for (const cand of [deFicha, delMovil, deCampana]) {
    const n = normalizarIdioma(cand);
    if (n && IDIOMAS.includes(n)) return n;
  }
  return "es";
}

/** Los textos de la página, por si la campaña no trae los suyos. */
export const POR_DEFECTO = {
  es: {
    titular: "Tu regalo te espera",
    subtitulo: "Déjanos tu nombre y tu móvil y te mandamos el código por WhatsApp.",
    wa: "Hola {nombre} 👋\n\nGracias por confiar en nosotros. Aquí tienes tu {promocion}:\n{enlace}\n\nEnséñalo cuando vengas y te lo aplicamos.\n{donde}",
  },
  ca: {
    titular: "El teu regal t'espera",
    subtitulo: "Deixa'ns el teu nom i el teu mòbil i t'enviem el codi per WhatsApp.",
    wa: "Hola {nombre} 👋\n\nGràcies per confiar en nosaltres. Aquí tens el teu {promocion}:\n{enlace}\n\nEnsenya'l quan vinguis i te l'apliquem.\n{donde}",
  },
  en: {
    titular: "Your treat is waiting",
    subtitulo: "Leave us your name and mobile and we'll send the code on WhatsApp.",
    wa: "Hi {nombre} 👋\n\nThank you for trusting us. Here is your {promocion}:\n{enlace}\n\nShow it when you come and it's yours.\n{donde}",
  },
};

/** Las etiquetas del formulario y las respuestas, en los tres idiomas. */
export const ETIQUETAS = {
  es: {
    nombre: "Nombre", apellidos: "Apellidos", nacimiento: "Fecha de nacimiento",
    poblacion: "Población", telefono: "Teléfono", correo: "Correo",
    consent: "Acepto recibir comunicaciones y la política de privacidad.",
    enviar: "Quiero mi código", enviando: "Un momento…",
    gracias_titulo: "¡Gracias!",
    gracias_enviando: "Te estamos mandando el código por WhatsApp al {telefono}.",
    gracias_enviado: "Ya te ha llegado. Míralo en tu WhatsApp.",
    gracias_tarda: "Te llegará por WhatsApp en unos minutos.",
    ya_registrado_titulo: "Ya estás registrado",
    ya_registrado: "Te mandamos tu código en su día. Búscalo en tu WhatsApp.",
    sin_whatsapp: "Ese número no tiene WhatsApp, y el código se manda por ahí. ¿Nos das otro?",
    error: "No hemos podido. Prueba otra vez en un momento.",
    falta_nombre: "Dinos cómo te llamas.", falta_telefono: "El teléfono no está completo.",
    pedir_wa: "Pídenoslo por WhatsApp",
  },
  ca: {
    nombre: "Nom", apellidos: "Cognoms", nacimiento: "Data de naixement",
    poblacion: "Població", telefono: "Telèfon", correo: "Correu",
    consent: "Accepto rebre comunicacions i la política de privacitat.",
    enviar: "Vull el meu codi", enviando: "Un moment…",
    gracias_titulo: "Gràcies!",
    gracias_enviando: "T'estem enviant el codi per WhatsApp al {telefono}.",
    gracias_enviado: "Ja t'ha arribat. Mira-t'ho al WhatsApp.",
    gracias_tarda: "T'arribarà per WhatsApp d'aquí a uns minuts.",
    ya_registrado_titulo: "Ja estàs registrat",
    ya_registrado: "Et vam enviar el codi al seu dia. Busca'l al teu WhatsApp.",
    sin_whatsapp: "Aquest número no té WhatsApp, i el codi s'envia per aquí. Ens en dones un altre?",
    error: "No ho hem pogut fer. Torna-ho a provar d'aquí a un moment.",
    falta_nombre: "Digues-nos com et dius.", falta_telefono: "El telèfon no està complet.",
    pedir_wa: "Demana'ns-el per WhatsApp",
  },
  en: {
    nombre: "First name", apellidos: "Surname", nacimiento: "Date of birth",
    poblacion: "Town", telefono: "Phone", correo: "Email",
    consent: "I agree to receive messages and to the privacy policy.",
    enviar: "Send me my code", enviando: "One moment…",
    gracias_titulo: "Thank you!",
    gracias_enviando: "We're sending your code on WhatsApp to {telefono}.",
    gracias_enviado: "It's there. Check your WhatsApp.",
    gracias_tarda: "It'll reach you on WhatsApp in a few minutes.",
    ya_registrado_titulo: "You're already registered",
    ya_registrado: "We sent your code back then. Look for it in your WhatsApp.",
    sin_whatsapp: "That number has no WhatsApp, and that's how the code travels. Got another one?",
    error: "That didn't work. Please try again in a moment.",
    falta_nombre: "Tell us your name.", falta_telefono: "That phone number is incomplete.",
    pedir_wa: "Ask us on WhatsApp",
  },
};

/** Los textos de una campaña en un idioma, con los de por defecto rellenando los huecos. */
export function textosDe(campana, idioma) {
  const i = IDIOMAS.includes(idioma) ? idioma : "es";
  let propios = {};
  try {
    const t = typeof campana?.textos === "string" ? JSON.parse(campana.textos) : (campana?.textos || {});
    propios = t[i] || {};
  } catch { propios = {}; }
  return { ...POR_DEFECTO[i], ...propios, etiquetas: ETIQUETAS[i] };
}

/**
 * El mensaje de WhatsApp, ya compuesto.
 *
 * `{donde}` sale de `dondeVale()` sobre los locales de la promoción, igual que en el resto del
 * sistema: escrito a mano se queda mintiendo en cuanto alguien limita la promoción a una barra.
 *
 * Y NO SE MENCIONAN LOS DATOS que nos ha dado. Se le está haciendo un regalo, no cobrando un
 * peaje; recordárselo convierte el detalle en una transacción. Hay un test que lo comprueba.
 */
export function textoWhatsApp({ plantilla = "", nombre = "", promocion = "", enlace = "", donde = "" } = {}) {
  const pila = String(plantilla || POR_DEFECTO.es.wa);
  return pila
    .replace(/\{nombre\}/g, String(nombre || "").split(" ")[0])
    .replace(/\{promocion\}/g, String(promocion || ""))
    .replace(/\{enlace\}/g, String(enlace || ""))
    .replace(/\{donde\}/g, String(donde || ""))
    // Si algún hueco se queda vacío no debe dejar una línea en blanco suelta ni un espacio
    // delante del salto: se nota, y en un mensaje de cuatro líneas se nota mucho.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** El teléfono como se le enseña a él mismo: «666 12 34 56». Nunca completo en un log. */
export function telefonoBonito(tel) {
  const d = String(tel || "").replace(/\D/g, "").slice(-9);
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : d;
}
