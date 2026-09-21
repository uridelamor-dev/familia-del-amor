// EL CONTEXTO QUE RECIBE SARA.
//
// ── EL PROBLEMA QUE ESTO ARREGLA ─────────────────────────────────────────────────────────────
//
// Un cliente recibió el código de una promoción y al día siguiente contestó «el dia 1 treballo
// al matí». Sara preguntó de qué mes hablaba y ofreció horarios de comida y cena.
//
// No fue un fallo de comprensión: fue que no se le dio el contexto. El historial se reconstruía
// con `creado_en > NOW() - INTERVAL '4 hours'`, así que el mensaje de la víspera no entraba. Sara
// vio una frase suelta, en catalán, sin nada delante.
//
// ── LO QUE DECIDE ESTE MÓDULO, Y POR QUÉ ES PURO ─────────────────────────────────────────────
//
// Qué filas entran en el contexto, en qué orden, con qué etiqueta y hasta qué tamaño. Ni base de
// datos, ni red, ni modelo: son reglas, y las reglas se prueban solas. La consulta la hace quien
// llama; aquí llegan filas y salen turnos.
//
// ── LO QUE NO HACE ───────────────────────────────────────────────────────────────────────────
//
// No cambia cómo razona Sara. La FORMA de los turnos es exactamente la de antes —un `user` con
// la marca de que recibió algo y un `assistant` con el texto— porque el objetivo de esta fase es
// que reciba mejor información, no que decida distinto.

/**
 * LOS LÍMITES, Y POR QUÉ SON POR NÚMERO Y POR TAMAÑO A LA VEZ.
 *
 * Quitar la ventana de horas sin poner otra cosa cambia un problema por otro: una conversación
 * de meses acabaría metiendo cien mensajes en cada petición, y el coste y la latencia crecen con
 * cada uno. Pero contar solo mensajes tampoco basta: dieciséis mensajes cortos no pesan nada y
 * dieciséis textos de campaña con su enlace, sí.
 *
 * Así que se acota lo uno y lo otro, y se recorta siempre por el PRINCIPIO: lo último dicho es
 * lo que explica el mensaje de ahora.
 */
export const LIMITES = Object.freeze({
  FILAS: 16,              // intercambios, no turnos: cada fila son dos turnos
  CARACTERES_MENSAJE: 1200,
  CARACTERES_TOTAL: 12000,
});

/** Los tipos de fila que sabemos leer. Lo que no esté aquí se trata como un intercambio. */
export const SALIENTES = Object.freeze(["saliente", "manual"]);
export const esSaliente = (tipo) => SALIENTES.includes(String(tipo || ""));

/** Quién escribió un mensaje nuestro. Lo dice la fila; nunca se adivina del texto. */
export const ORIGEN = Object.freeze({
  SARA: "sara", OPERADOR: "operador", SISTEMA: "sistema", CAMPANA: "campana",
});

const COMO_SE_LLAMA = Object.freeze({
  [ORIGEN.SARA]: "Sara",
  [ORIGEN.OPERADOR]: "una persona del equipo",
  [ORIGEN.SISTEMA]: "el sistema",
  [ORIGEN.CAMPANA]: "una campaña automática",
});

/**
 * DE QUÉ TIPO ES UN MENSAJE DE LA COLA, LEÍDO DE SU PROPIO TOKEN.
 *
 * `cap_cola.token` ya distingue los caminos y no hay que añadir ninguna columna para saberlo:
 *
 *   alta:…  el alta de un formulario configurable   → entrega
 *   rec:…   una recuperación de esa misma entrega   → entrega
 *   com:…   una comunicación comercial              → comercial
 *   (otro)  el alta del formulario clásico, cuyo token es aleatorio → entrega
 *
 * Todo lo que NO es una comunicación es una entrega: el alta clásica usa un token aleatorio
 * porque es el identificador público con el que la pantalla de gracias consulta su estado, así
 * que aquí no hay prefijo que mirar y la regla se define por exclusión.
 */
export function tipoPorToken(token) {
  return /^com:/.test(String(token || "")) ? "comercial" : "entrega";
}

/** Un texto acotado, sin cortar a media palabra si se puede evitar. */
export function recortar(texto, max = LIMITES.CARACTERES_MENSAJE) {
  const t = String(texto ?? "").trim();
  if (t.length <= max) return t;
  const corte = t.lastIndexOf(" ", max - 1);
  return `${t.slice(0, corte > max * 0.6 ? corte : max - 1)}…`;
}

/**
 * LA ETIQUETA DE UN MENSAJE NUESTRO.
 *
 * Antes era una frase fija: «[El cliente recibió un mensaje del equipo de Familia del Amor]». Con
 * eso, Sara sabía que le habíamos escrito, pero no por qué, y todo le parecía igual: una
 * confirmación de reserva y el código de una promoción.
 *
 * Ahora se compone con lo que la fila SABE. Ni una campaña concreta aparece escrita aquí: la
 * clave sale del dato, así que este código vale igual para la promoción de un desayuno que para
 * cualquier cosa que se invente el año que viene.
 */
export function etiquetaSaliente(fila = {}) {
  const partes = [];
  const quien = COMO_SE_LLAMA[String(fila.origen || "")];
  partes.push(quien
    ? `El cliente recibió un mensaje de Familia del Amor, enviado por ${quien}`
    : "El cliente recibió un mensaje de Familia del Amor");

  // La clave va ENTRECOMILLADA y sin interpretar: es un identificador nuestro, y el modelo no
  // tiene que deducir nada de ella — la explicación está en el texto del propio mensaje.
  if (fila.clave_campana) partes.push(`campaña «${recortar(fila.clave_campana, 60)}»`);
  if (fila.tipo_mensaje) partes.push(String(fila.tipo_mensaje));
  const dia = String(fila.creado_en || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) partes.push(`enviado el ${dia}`);

  return `[CONTEXTO INTERNO: ${partes.join(" · ")}]`;
}

/**
 * EL MENSAJE CITADO, CUANDO EL CLIENTE USA «RESPONDER».
 *
 * Es la señal más fuerte que existe y hasta ahora se tiraba: WhatsApp nos dice a QUÉ mensaje está
 * contestando, señalado por la propia persona. Va DELANTE del historial, porque desempata: si en
 * la conversación hay tres mensajes nuestros, este es el que importa.
 *
 * Degrada solo: si el citado no trae texto interpretable, se devuelve `null` y no pasa nada — el
 * historial normal sigue estando.
 */
export function turnosDelCitado(citado) {
  const texto = recortar(citado?.texto, LIMITES.CARACTERES_MENSAJE);
  if (!texto) return [];
  const de = citado?.deNosotros
    ? "un mensaje que le mandamos nosotros"
    : "un mensaje suyo anterior";
  return [
    { role: "user", content: `[CONTEXTO INTERNO: el cliente está RESPONDIENDO expresamente a ${de}. `
        + `Es a esto a lo que se refiere:]\n${texto}` },
    { role: "assistant", content: "Entendido, tengo presente ese mensaje." },
  ];
}

/** ¿Este texto ya está en el historial? Se compara recortado, que es como va a ir al prompt. */
const yaEsta = (turnos, texto) => {
  const t = recortar(texto);
  return !!t && turnos.some((x) => typeof x.content === "string" && x.content.includes(t));
};

/**
 * ANTEPONER LA CITA A UNOS TURNOS YA CONSTRUIDOS.
 *
 * Existe porque el historial le llega a Sara por DOS caminos —el `Map` en memoria si la sesión
 * sigue viva, y la base si el proceso se reinició— y la cita tiene que entrar en los dos. Si se
 * resolviera solo al leer de la base, un cliente que responde citando dentro de la misma sesión
 * se quedaría sin ella.
 *
 * Un solo sitio, y con su deduplicación: si ese texto ya está en el historial, se deja donde está.
 */
export function anteponerCitado(turnos = [], citado = null) {
  if (!citado || yaEsta(turnos, citado.texto)) return turnos;
  return [...turnosDelCitado(citado), ...turnos];
}

/**
 * EL CONTEXTO COMPLETO, EN ORDEN.
 *
 * `filas` llegan de la base, de la MÁS RECIENTE a la más antigua (es como se consultan: por `id`
 * descendente con un `LIMIT`). Aquí se recortan a los límites, se les da la vuelta y se convierten
 * en turnos.
 *
 * El citado va el PRIMERO y no se repite: si ese mismo texto ya aparece en el historial, se deja
 * solo en su sitio. Duplicarlo haría que el modelo lo leyera dos veces y creyera que se lo hemos
 * mandado dos veces.
 */
export function construirContexto(filas = [], { citado = null } = {}) {
  // 1 · Acotar. Se recorre de lo más nuevo a lo más viejo y se para al llegar a cualquiera de los
  //     dos topes: así lo que se tira es siempre lo más antiguo.
  const elegidas = [];
  let gastado = 0;
  for (const fila of filas) {
    if (elegidas.length >= LIMITES.FILAS) break;
    const entrada = recortar(fila?.mensaje);
    const salida = recortar(fila?.respuesta);
    const pesa = entrada.length + salida.length;
    if (gastado + pesa > LIMITES.CARACTERES_TOTAL && elegidas.length) break;
    gastado += pesa;
    elegidas.push({ ...fila, _entrada: entrada, _salida: salida });
  }

  // 2 · Del más antiguo al más reciente, que es como lee una conversación.
  const turnos = [];
  for (const fila of elegidas.reverse()) {
    if (esSaliente(fila.tipo)) {
      // Un mensaje NUESTRO. La marca va en el turno del cliente porque el modelo necesita saber
      // que eso no lo dijo él; el texto va en el turno de Sara, que es quien lo mandó.
      turnos.push({ role: "user", content: etiquetaSaliente(fila) });
      turnos.push({ role: "assistant", content: fila._salida });
    } else {
      turnos.push({ role: "user", content: fila._entrada });
      turnos.push({ role: "assistant", content: fila._salida });
    }
  }

  // 3 · El citado, delante y sin repetir. Misma función que usa el camino de memoria.
  return anteponerCitado(turnos, citado);
}

/**
 * Cuánto ocupa un contexto. Para poder afirmar en un test que los límites se respetan de verdad,
 * en vez de confiar en que sí.
 */
export const pesoDe = (turnos = []) =>
  turnos.reduce((n, t) => n + (typeof t.content === "string" ? t.content.length : 0), 0);
