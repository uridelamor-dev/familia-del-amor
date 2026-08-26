// «¿Qué tal fue?» al día siguiente de venir, y la reseña solo a quien salió contento. PURO.
//
// LO QUE HABÍA: un seguimiento que existía a medias y que nadie veía. Se programaba SOLO cuando
// alguien reservaba hablando con Sara por WhatsApp —las reservas del panel, que son casi todas,
// no programaban nada—, no respetaba la lista de bajas, contestaba siempre lo mismo dijera lo
// que dijera el cliente, y no dejaba rastro en ninguna pantalla. Un mecanismo que no se puede
// mirar es un mecanismo del que no se puede saber si funciona.
//
// LA REGLA DE FONDO: la reseña se pide SOLO a quien ha dicho que fue bien, y ante la duda no se
// pide. Pedirle una reseña pública a alguien que acaba de contarte que esperó cuarenta minutos
// es la forma más rápida de convertir una queja privada en una estrella pública.

/** Cada cuánto, como mucho, se le puede preguntar a la misma persona. */
export const CADA_DIAS = 90;

/** Si el mensaje no ha salido en este plazo, ya no se manda: «ayer estuviste» tiene caducidad. */
export const CADUCA_HORAS = 20;

const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
const dias = (a, b) => {
  const x = Date.parse(String(a).slice(0, 10) + "T00:00:00Z"), y = Date.parse(String(b).slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) : null;
};

/**
 * ¿Se le puede preguntar a esta persona?
 *
 * → { ok, motivo }
 *
 * `ultimo` es la última vez que se le preguntó (o null). Sin este freno, al mejor cliente —el
 * que viene cada semana— le llegaría un WhatsApp cada lunes, y acabaría bloqueando el número.
 */
export function puedePreguntarse({ telefono, baja = false, ultimo = null, hoy = null, cadaDias = CADA_DIAS } = {}) {
  if (soloDigitos(telefono).length < 9) return { ok: false, motivo: "sin_telefono" };
  // La lista de bajas se respeta SIEMPRE. El seguimiento de antes escribía directo, saltándosela.
  if (baja === true || baja === 1 || baja === "1") return { ok: false, motivo: "baja" };
  if (ultimo && hoy) {
    const d = dias(ultimo, hoy);
    if (d != null && d < cadaDias) return { ok: false, motivo: "preguntado_hace_poco", faltan: cadaDias - d };
  }
  return { ok: true, motivo: null };
}

/**
 * ¿Sigue teniendo sentido mandarlo?
 *
 * Si WhatsApp estuvo caído —lo normal tras cada redespliegue— el mensaje se queda esperando. Y
 * cuando vuelve, se mandaba igual: «ayer estuviste en Can Mateu» tres días después. Pasado el
 * plazo se descarta, porque un mensaje que miente es peor que ninguno.
 */
export function siguesATiempo({ enviarA, ahora, caducaHoras = CADUCA_HORAS } = {}) {
  const a = Date.parse(enviarA), b = Date.parse(ahora);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (b < a) return false;                                   // todavía no toca
  return (b - a) <= caducaHoras * 3600 * 1000;
}

/**
 * El enlace para escribir una reseña en Google, a partir del `place_id` que ya se guarda al
 * vincular la ficha. Sin ficha vinculada no hay enlace, y entonces no se pide reseña: mandar
 * «déjanos tu opinión» sin decir dónde es peor que no mandar nada.
 */
export function enlaceResena(placeId) {
  const id = String(placeId || "").trim();
  if (!id) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}`;
}

/** Los tres veredictos posibles de una respuesta. */
export const CONTENTO = "contento";
export const DESCONTENTO = "descontento";
export const DUDOSO = "dudoso";

// Lo que se reconoce sin preguntarle a nadie. Es la red de seguridad para cuando la IA no está
// disponible: cubre las respuestas cortas, que son la mayoría («todo genial», «muy bien»).
const BUENAS = /\b(genial|estupend|fantastic|excelent|perfect|buenisim|riquisim|encant|repetir|volvere|volveremos|maravill|impecable|de dies?|molt be|molt bo|great|amazing|excellent|lovely|delicious)\b/;
const BUENAS_CORTAS = /^(muy bien|todo bien|todo perfecto|genial|perfecto|de lujo|inmejorable|10\/10|👍+|❤️+|😍+|👌+|molt be|molt bé|very good|all good)[\s!.😊🙂👍❤️]*$/;
const MALAS = /\b(mal|malisim|fatal|pesim|horrible|lent|tardar|tardaron|espera|esperamos|frio|fria|caro|carisim|sucio|desagradable|borde|maleducad|quej|reclamacion|nunca mas|decepcion|desastre|bad|terrible|awful|slow|cold|rude)\b/;
// LA NEGACIÓN DELANTE DE UNA PALABRA BUENA. Va aparte y con prefijos, no con palabra entera:
// «no volveremos» no acaba en «volver», así que un `\bno volver\b` no lo caza — y esa respuesta
// se estaba leyendo como CONTENTA por el «volveremos» de la lista de buenas. Justo al revés.
const NEGADAS = /\bno\s+(volv|repet|recomend|me gust|nos gust|estuvo bien|fue bien)/;

/**
 * ¿La respuesta suena a que fue bien?
 *
 * ANTE LA DUDA, DUDOSO — y a un dudoso no se le pide reseña. El coste de los dos errores no es
 * el mismo: no pedir una reseña a alguien contento se pierde una estrella; pedírsela a alguien
 * que no lo está convierte una queja privada en una pública. Por eso lo negativo manda sobre lo
 * positivo cuando aparecen los dos («estuvo bien pero tardaron mucho» NO es contento).
 */
export function clasificarRespuesta(texto) {
  const t = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!t) return DUDOSO;
  if (MALAS.test(t) || NEGADAS.test(t)) return DESCONTENTO;   // lo negativo manda
  if (BUENAS_CORTAS.test(t)) return CONTENTO;
  if (BUENAS.test(t)) return CONTENTO;
  return DUDOSO;
}

/** Une el veredicto de la IA con el determinista. La IA solo puede AFINAR, nunca ablandar. */
export function veredictoFinal({ deLaIA = null, delTexto = DUDOSO } = {}) {
  // Si el texto tiene una queja clara, no hay IA que lo convierta en contento: es el caso en el
  // que equivocarse cuesta caro, y la palabra escrita por el cliente pesa más que una opinión.
  if (delTexto === DESCONTENTO) return DESCONTENTO;
  if (deLaIA === CONTENTO || deLaIA === DESCONTENTO || deLaIA === DUDOSO) return deLaIA;
  return delTexto;
}

/**
 * Qué se le contesta y si se le pide reseña.
 *
 * → { texto, pideResena, avisar }
 */
export function respuestaASeguimiento({ veredicto, nombre = "", local = "", enlace = null } = {}) {
  const quien = String(nombre || "").trim().split(/\s+/)[0] || "";
  if (veredicto === CONTENTO && enlace) {
    return {
      pideResena: true, avisar: false,
      texto: `¡Qué alegría, ${quien}! 😊 Muchas gracias por contárnoslo.\n\n`
        + `Si te apetece y tienes un minuto, contarlo en Google nos ayuda muchísimo a que otros nos encuentren:\n${enlace}\n\n`
        + "¡Y a ver si te vemos pronto por aquí!",
    };
  }
  if (veredicto === CONTENTO) {
    // Contento pero sin ficha de Google vinculada: se agradece y punto. Pedir una reseña sin
    // decir dónde dejarla es hacerle perder el tiempo a quien acaba de hacerte un favor.
    return { pideResena: false, avisar: false,
      texto: `¡Qué alegría, ${quien}! 😊 Muchas gracias por contárnoslo. ¡A ver si te vemos pronto por aquí!` };
  }
  if (veredicto === DESCONTENTO) {
    return {
      pideResena: false, avisar: true,
      texto: `Gracias por decírnoslo, ${quien}, y siento que no saliera como esperabas. `
        + `Se lo paso ahora mismo al equipo de ${local || "la casa"} para que lo miren. `
        + "Si quieres contarme algo más, aquí estoy.",
    };
  }
  // Dudoso: se agradece, NO se pide reseña, y se avisa igual para que lo lea una persona.
  return { pideResena: false, avisar: true,
    texto: `¡Gracias por contárnoslo, ${quien}! 🙏 Se lo paso al equipo. ¡Hasta pronto!` };
}
