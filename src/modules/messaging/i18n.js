// Mensajería — i18n PURO: detección de idioma (offline, sin dependencias), agrupación de
// destinatarios por idioma, preservación de variables {nombre}/{local} y prompt de traducción.
// La traducción real (Claude) y la BD viven en server.js; aquí solo lógica testeable.

export const IDIOMA_BASE = "es";

export const NOMBRE_IDIOMA = {
  es: "español (castellano)", ca: "catalán", en: "inglés", fr: "francés", it: "italiano",
  pt: "portugués", de: "alemán", nl: "neerlandés", ru: "ruso", ar: "árabe", zh: "chino",
};

// Normaliza un código de idioma a 2 letras minúsculas conocidas, o null.
export function normalizarIdioma(code) {
  const c = String(code || "").toLowerCase().slice(0, 2);
  return NOMBRE_IDIOMA[c] ? c : null;
}

// Palabras muy frecuentes por idioma (marcadores). Catalán vs castellano es la distinción clave.
const MARCADORES = {
  es: ["el", "la", "los", "las", "de", "que", "y", "un", "una", "por", "con", "para", "está", "hola", "gracias", "buenos", "días", "quería", "reserva", "mañana", "también", "pero", "muy", "sí"],
  ca: ["el", "la", "els", "les", "de", "que", "i", "un", "una", "per", "amb", "està", "hola", "gràcies", "bon", "dia", "voldria", "reserva", "demà", "també", "però", "molt", "sí", "aquest", "això"],
  en: ["the", "and", "you", "for", "with", "hello", "hi", "thanks", "thank", "please", "would", "table", "booking", "tomorrow", "good", "morning", "have", "is", "we", "want"],
  fr: ["le", "la", "les", "de", "que", "et", "un", "une", "pour", "avec", "bonjour", "merci", "voudrais", "réservation", "demain", "aussi", "très", "vous", "nous", "s'il"],
  it: ["il", "la", "di", "che", "e", "un", "una", "per", "con", "ciao", "grazie", "buongiorno", "vorrei", "prenotazione", "domani", "anche", "molto", "sì", "noi"],
  pt: ["o", "a", "de", "que", "e", "um", "uma", "para", "com", "olá", "obrigado", "obrigada", "bom", "dia", "queria", "reserva", "amanhã", "também", "muito", "sim"],
  de: ["der", "die", "das", "und", "ich", "für", "mit", "hallo", "danke", "bitte", "möchte", "reservierung", "morgen", "guten", "auch", "sehr", "wir", "ist", "einen"],
};

// Detecta el idioma de un texto por marcadores. Devuelve código o null si no hay señal clara.
export function detectarIdioma(texto) {
  const t = String(texto || "").toLowerCase();
  if (!t.trim()) return null;
  const palabras = t.split(/[^a-zàâäáãçéèêëíïîìóòôöõúùûüñ']+/i).filter(Boolean);
  if (!palabras.length) return null;
  const set = new Set(palabras);
  const puntua = {};
  for (const [idioma, marks] of Object.entries(MARCADORES)) {
    let s = 0;
    for (const w of marks) if (set.has(w)) s++;
    puntua[idioma] = s;
  }
  // Señales de caracteres específicos (desempate suave).
  if (/[àèò·]|l'|d'|ç/.test(t)) puntua.ca += 1;
  if (/[ñ¿¡]/.test(t)) puntua.es += 1;
  if (/[ßäöü]/.test(t)) puntua.de += 1;
  let mejor = null, max = 0;
  for (const [idioma, s] of Object.entries(puntua)) if (s > max) { max = s; mejor = idioma; }
  return max >= 2 ? mejor : null; // umbral: al menos 2 marcadores para no adivinar a ciegas
}

// Idioma efectivo de un contacto: su idioma guardado (marketing_prefs) o el base.
export function idiomaDeContacto(contacto = {}, base = IDIOMA_BASE) {
  return normalizarIdioma(contacto.idioma) || base;
}

// ¿Hay que traducir? Solo si el idioma es conocido y distinto del base.
export function necesitaTraduccion(idioma, base = IDIOMA_BASE) {
  const n = normalizarIdioma(idioma);
  return !!n && n !== base;
}

// Agrupa destinatarios por idioma efectivo → { idioma: [contactos] }.
export function agruparPorIdioma(contactos = [], base = IDIOMA_BASE) {
  const grupos = {};
  for (const c of contactos) {
    const id = idiomaDeContacto(c, base);
    (grupos[id] || (grupos[id] = [])).push(c);
  }
  return grupos;
}

// Idiomas presentes (únicos) entre los destinatarios.
export function idiomasPresentes(contactos = [], base = IDIOMA_BASE) {
  return Object.keys(agruparPorIdioma(contactos, base));
}

// ── Preservación de variables de plantilla ({nombre}, {apellidos}, {local}, …) ──
const PLACEHOLDER_RE = /\{[a-z_]+\}/gi;

export function placeholdersDe(texto) {
  return (String(texto || "").match(PLACEHOLDER_RE) || []).map((s) => s.toLowerCase());
}

// ¿La traducción conserva TODAS las variables del original (mismo multiconjunto)?
export function placeholdersIntactos(original, traducido) {
  const a = placeholdersDe(original).sort();
  const b = placeholdersDe(traducido).sort();
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

// Construye el request para Claude que traduce el texto preservando variables y tono.
// nombreIdioma opcional (si no, se resuelve de NOMBRE_IDIOMA). Espejo del patrón draftRequest.
export function construirTraduccionRequest(texto, idiomaDestino, nombreIdioma) {
  const destino = nombreIdioma || NOMBRE_IDIOMA[normalizarIdioma(idiomaDestino)] || idiomaDestino;
  const vars = placeholdersDe(texto);
  const system = [
    `Eres un traductor profesional. Traduce el MENSAJE al ${destino}.`,
    "Conserva el tono cercano y comercial, y los emojis.",
    "NO traduzcas ni modifiques los marcadores entre llaves (por ejemplo {nombre}, {apellidos}, {local}); déjalos EXACTAMENTE igual.",
    vars.length ? `Marcadores que deben aparecer intactos: ${[...new Set(vars)].join(", ")}.` : "",
    "Devuelve ÚNICAMENTE el texto traducido, sin comillas ni explicaciones.",
  ].filter(Boolean).join(" ");
  return { system, messages: [{ role: "user", content: String(texto || "") }] };
}
