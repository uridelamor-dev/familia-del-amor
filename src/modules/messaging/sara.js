// LAS DECISIONES DE SARA QUE NO LAS TOMA EL MODELO.
//
// Aquí vive lo que tiene que ser CIERTO pase lo que pase: si una conversación está en manos de
// una persona, si el cliente ha pedido hablar con alguien, y en qué idioma se le habla cuando su
// mensaje no da para decidirlo.
//
// Ni base de datos, ni red, ni modelo. Son reglas, y las reglas se prueban solas.
//
// ── POR QUÉ ESTO NO ES TRABAJO DEL MODELO ───────────────────────────────────────────────────
//
// Porque de dos de estas cosas depende que Sara CALLE. Dejarle decidir a un modelo si sigue
// hablando cuando una persona ha tomado la conversación es dejar que a veces no calle, y eso se
// nota en el móvil de un cliente que está esperando a alguien de verdad.
//
// El idioma sí lo decide el modelo —conversar con naturalidad no es traducir— pero la PISTA que
// se le da cuando el mensaje es «Hola» sale de aquí.

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  LA PAUSA
// ═════════════════════════════════════════════════════════════════════════════════════════════

export const ESTADO_IA = Object.freeze({ ACTIVA: "activa", PAUSADA: "pausada" });

/** Por qué se paró Sara. Sirve para que el equipo sepa qué le están pidiendo antes de abrirla. */
export const MOTIVO_PAUSA = Object.freeze({
  PIDIO_PERSONA: "pidio_persona",     // el cliente lo pidió con todas las letras
  CONSULTA: "consulta",               // Sara no sabía algo y lo pasó al equipo
  MANUAL: "manual",                   // alguien la paró desde el panel
});

export const ETIQUETA_MOTIVO = Object.freeze({
  [MOTIVO_PAUSA.PIDIO_PERSONA]: "Pidió hablar con una persona",
  [MOTIVO_PAUSA.CONSULTA]: "Sara no sabía la respuesta",
  [MOTIVO_PAUSA.MANUAL]: "Pausada desde el panel",
});

/**
 * ¿Está esta conversación en manos de una persona?
 *
 * FALLA HACIA LA PAUSA, y es deliberado al revés que casi todo lo demás de esta casa: solo la
 * cadena exacta `"pausada"` pausa, pero si la fila no se puede leer, quien llama decide. Aquí la
 * función es estricta y no adivina; el que consulta la base ya tiene su `try`.
 */
export const estaPausada = (fila) => String(fila?.estado_ia || "") === ESTADO_IA.PAUSADA;

/** Lo que se escribe al pausar. Un solo sitio, para que el panel y la herramienta coincidan. */
export function marcarPausa({ motivo = MOTIVO_PAUSA.MANUAL, por = "sara", ahora } = {}) {
  return {
    estado_ia: ESTADO_IA.PAUSADA,
    pausa_motivo: Object.values(MOTIVO_PAUSA).includes(motivo) ? motivo : MOTIVO_PAUSA.MANUAL,
    pausado_en: ahora || new Date().toISOString(),
    pausado_por: String(por || "sara").slice(0, 60),
  };
}

/** Lo que se escribe al reactivar. El historial NO se toca: es lo que hace que no empiece de cero. */
export const marcarActiva = () => ({
  estado_ia: ESTADO_IA.ACTIVA, pausa_motivo: null, pausado_en: null, pausado_por: null,
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  EL IDIOMA
// ═════════════════════════════════════════════════════════════════════════════════════════════

export const IDIOMAS = Object.freeze(["ca", "es", "en"]);
export const IDIOMA_POR_DEFECTO = "es";

/**
 * ¿Da este mensaje para decidir el idioma?
 *
 * «Hola», «Sí», «Ok», «👍» valen igual en tres idiomas. Con eso no se decide nada, y decidir con
 * eso es lo que hace que Sara cambie de idioma a mitad de conversación por un «vale».
 */
export function esAmbiguo(texto) {
  const t = String(texto || "").trim();
  if (!t) return true;
  const palabras = t.replace(/[^\p{L}\p{N}\s'’·]/gu, " ").split(/\s+/).filter(Boolean);
  return palabras.length < 3;
}

/**
 * UNA PISTA DEL IDIOMA DE UN TEXTO. No es un detector, y no pretende serlo.
 *
 * Solo mira marcas que NO se comparten: «·l» geminada o «amb» solo existen en catalán; «the» o
 * «I'm» solo en inglés. Lo que no cae claramente en ninguna devuelve `null`, y `null` significa
 * «no lo sé», que es una respuesta válida y mejor que una equivocada.
 *
 * ── POR QUÉ NO SE TRADUCE AQUÍ ──────────────────────────────────────────────────────────────
 *
 * Porque esto NO decide en qué idioma responde Sara: eso lo decide el modelo leyendo el mensaje,
 * que es lo que hace bien. Esta pista solo se le pasa cuando el mensaje de ahora es «Hola» y hay
 * que desempatar con lo anterior.
 */
export function pistaIdioma(texto) {
  const t = ` ${String(texto || "").toLowerCase()} `;
  if (!t.trim()) return null;

  const marcas = {
    // Catalán: geminada, apóstrofos característicos y palabras que el castellano no tiene.
    ca: [/l·l/, /\bamb\b/, /\baixò\b/, /\baixí\b/, /\bperò\b/, /\bmolt\b/, /\bvull\b/, /\bpuc\b/,
         /\btreballo\b/, /\bdia\b.*\bmatí\b/, /\bsi us plau\b/, /\bgràcies\b/, /\bendavant\b/,
         /\bnosaltres\b/, /\bqualsevol\b/, /\bd'un\b|\bd'una\b|\bl'altre\b|\bm'agrada\b/, /\bquè\b/,
         /\bpersona\b.*\bparlar\b|\bparlar\b/],
    en: [/\bthe\b/, /\bi'm\b/, /\bcan i\b/, /\bcould\b/, /\bwould\b/, /\banother\b/, /\bplease\b/,
         /\bthanks\b/, /\bspeak\b/, /\bsomeone\b/, /\bwhat\b/, /\bwhen\b/, /\bdoes\b/, /\byour\b/],
    es: [/\bpero\b/, /\bmuy\b/, /\bpuedo\b/, /\btrabajo\b/, /\bgracias\b/, /\bpersona\b.*\bhablar\b|\bhablar\b/,
         /\botro día\b/, /\bmañana\b/, /\bquiero\b/, /\busted\b/, /\bqué\b/, /\bcómo\b/],
  };

  const puntos = {};
  for (const [idioma, res] of Object.entries(marcas)) {
    puntos[idioma] = res.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  }
  const orden = Object.entries(puntos).sort((a, b) => b[1] - a[1]);
  // Sin marcas, o con empate en cabeza, no se dice nada: un empate es no saberlo.
  if (!orden[0][1] || orden[0][1] === orden[1][1]) return null;
  return orden[0][0];
}

/**
 * EL IDIOMA QUE SE LE SUGIERE A SARA, con la prioridad que pidió el usuario:
 *
 *   1. el último mensaje del cliente que dé para decidirlo;
 *   2. si el de ahora es ambiguo, el predominante de los suyos anteriores;
 *   3. el que sepamos del contacto o de la campaña;
 *   4. castellano.
 *
 * Y lo importante: el idioma del CLIENTE gana al de la campaña. Un mensaje automático en catalán
 * seguido de «Can I use it another day?» se contesta en inglés, no en catalán.
 *
 * Devuelve `{ idioma, fuente }`: la fuente hace falta para poder decirle al modelo si esto es una
 * certeza o una suposición, que no es lo mismo.
 */
export function idiomaSugerido({ mensajesCliente = [], idiomaContacto = null, idiomaCampana = null } = {}) {
  const suyos = mensajesCliente.filter((m) => String(m || "").trim()).reverse(); // del más nuevo

  // 1 · El último que dé para decidir. Los ambiguos —«Ok», «Sí»— se saltan: no dicen nada, y
  //     pararse en ellos es justo lo que hace que Sara cambie de idioma por un «vale».
  for (let i = 0; i < suyos.length; i += 1) {
    if (esAmbiguo(suyos[i])) continue;
    const p = pistaIdioma(suyos[i]);
    // La FUENTE distingue si lo decidió el mensaje de ahora o uno anterior, y no es cosmética:
    // solo lo que dice el mensaje de ahora se guarda en la ficha como dato del cliente.
    if (p) return { idioma: p, fuente: i === 0 ? "mensaje" : "historial" };
    break;   // el último significativo manda; si no se reconoce, no se sigue hacia atrás
  }

  // 2 · El predominante de los suyos, cuando el de ahora no dice nada.
  const votos = {};
  for (const m of suyos) {
    const p = pistaIdioma(m);
    if (p) votos[p] = (votos[p] || 0) + 1;
  }
  const masVotado = Object.entries(votos).sort((a, b) => b[1] - a[1])[0];
  if (masVotado) return { idioma: masVotado[0], fuente: "historial" };

  // 3 · Lo que sepamos de él, y si no, de la campaña por la que llegó.
  if (IDIOMAS.includes(idiomaContacto)) return { idioma: idiomaContacto, fuente: "contacto" };
  if (IDIOMAS.includes(idiomaCampana)) return { idioma: idiomaCampana, fuente: "campana" };

  // 4 · Y si no hay nada, el de la casa.
  return { idioma: IDIOMA_POR_DEFECTO, fuente: "defecto" };
}

const NOMBRE_IDIOMA = Object.freeze({ ca: "catalán", es: "castellano", en: "inglés" });

/**
 * La línea de contexto sobre el idioma.
 *
 * Se le dice como PISTA, no como orden, y se deja claro que manda el mensaje que tiene delante:
 * si el cliente acaba de cambiar a otro idioma —incluso a uno que esta función no reconoce— el
 * modelo lo ve y debe seguirle. Una orden rígida aquí haría lo contrario de lo que se quiere.
 */
export function lineaIdioma({ idioma, fuente } = {}) {
  const nombre = NOMBRE_IDIOMA[idioma] || idioma || NOMBRE_IDIOMA.es;
  const porque = fuente === "mensaje" ? "por lo que acaba de escribir"
    : fuente === "historial" ? "por sus mensajes anteriores"
    : fuente === "contacto" ? "por lo que sabemos de este contacto"
    : fuente === "campana" ? "por la campaña por la que llegó"
    : "por defecto, al no tener nada mejor";
  return `[CONTEXTO INTERNO: este cliente parece hablar ${nombre} (${porque}). `
    + `Respóndele en SU idioma, conversando con naturalidad — no traduzcas literalmente. `
    + `Si el mensaje que tienes delante está en otro idioma, incluso uno distinto de estos, `
    + `manda ese: el idioma del cliente siempre gana al de cualquier campaña anterior.]`;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
//  PEDIR HABLAR CON UNA PERSONA
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ¿Está pidiendo hablar con alguien de verdad?
 *
 * ── POR QUÉ ADEMÁS DE LA HERRAMIENTA ────────────────────────────────────────────────────────
 *
 * Sara tiene una herramienta para derivar y el prompt le dice que la intención manda. Pero un
 * modelo puede no llamarla, y entonces seguiría intentando resolver a alguien que ya ha dicho
 * tres veces que quiere una persona. Esto es la red: se mira ANTES de llamar al modelo y, si es
 * inequívoco, se deriva sin preguntarle.
 *
 * Se busca lo INEQUÍVOCO en los tres idiomas y nada más. «Hay alguien ahí» no entra: puede ser
 * simplemente comprobar si el chat está vivo, y derivar a quien no lo pidió también molesta.
 */
const PIDE_PERSONA = [
  // castellano
  /\b(hablar|habl(o|ar)e?|pasame|pásame|p[áa]same con|contactar)\b[^.?!]{0,30}\b(persona|alguien|humano|human[oa]|encargad[oa]|trabajador|responsable|jefe)\b/i,
  /\b(quiero|puedo|podr[íi]a|necesito|me gustar[íi]a)\b[^.?!]{0,30}\b(persona|alguien|humano|encargad[oa]|trabajador|responsable)\b/i,
  /\bno (quiero|me sirve)\b[^.?!]{0,20}\b(bot|m[áa]quina|robot|ia)\b/i,
  // catalán
  /\b(parlar|parla|passa'?m|contactar)\b[^.?!]{0,30}\b(persona|alg[úu]|hum[àa]|encarregat|treballador|responsable)\b/i,
  /\b(vull|puc|podria|necessito|m'agradaria)\b[^.?!]{0,30}\b(persona|alg[úu]|hum[àa]|encarregat|treballador|responsable)\b/i,
  // inglés
  /\b(talk|speak|chat)\b[^.?!]{0,30}\b(person|someone|somebody|human|agent|manager|staff)\b/i,
  /\b(can|could|may) i\b[^.?!]{0,30}\b(person|someone|somebody|human|agent|manager)\b/i,
  /\breal (person|human)\b/i,
];

export function pidePersona(texto) {
  const t = String(texto || "");
  if (!t.trim()) return false;
  return PIDE_PERSONA.some((re) => re.test(t));
}
