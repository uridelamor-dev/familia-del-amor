// RECUPERAR LOS MENSAJES QUE NUNCA SALIERON.
//
// ── EL AGUJERO QUE ESTO TAPA ─────────────────────────────────────────────────────────────────
//
// La cola (`cap_cola`) sabe reintentar lo que falló. Lo que no sabía nadie es qué hacer con quien
// se apuntó y **no tiene ni fila en la cola**: si el encolado se cayó —la base ocupada, un
// despliegue a medias, el `INSERT` que revienta después de haber creado el lead y el cupón— esa
// persona queda con su alta, con su QR y sin nada que reintentar. No aparece como fallo, porque
// no hay fallo: no hay fila.
//
// Y encima, al volver a intentarlo, el camino clásico la reconoce por su cupón y le contesta «ya
// te lo mandamos en su día, míralo en tu WhatsApp» — una frase que en ese estado no es cierta.
//
// ── POR QUÉ ES UN MÓDULO PURO ────────────────────────────────────────────────────────────────
//
// Aquí no hay base de datos ni Express: solo la decisión de en qué estado está cada destinatario
// y qué se puede hacer con él. Es lo que hay que poder probar sin levantar nada y sin que salga
// ni un WhatsApp.

/**
 * LOS SEIS ESTADOS EN QUE PUEDE ESTAR UN DESTINATARIO.
 *
 * No son los estados de `cap_cola`: son los de la PERSONA. La diferencia importa porque los dos
 * casos que hay que arreglar —«tiene cupón y nadie le encoló nada» y «no llegó a tener cupón»—
 * no existen en la cola, justamente porque la cola no sabe de ellos.
 */
export const ESTADOS = Object.freeze({
  ENVIADO: "enviado",
  PENDIENTE: "pendiente",
  ERROR: "error",
  SIN_COLA: "sin_cola",
  SIN_QR: "sin_qr",
  SIN_TELEFONO: "sin_telefono",
  BAJA: "baja",
});

/** Lo que significa cada estado, para que la pantalla no lo escriba por su cuenta. */
export const ETIQUETAS = Object.freeze({
  [ESTADOS.ENVIADO]: "Enviado",
  [ESTADOS.PENDIENTE]: "En cola",
  [ESTADOS.ERROR]: "Con error",
  [ESTADOS.SIN_COLA]: "Sin encolar",
  [ESTADOS.SIN_QR]: "Sin código",
  [ESTADOS.SIN_TELEFONO]: "Teléfono no válido",
  [ESTADOS.BAJA]: "Pidió no recibir",
});

/**
 * Los estados de `cap_cola` que un reintento PUEDE tocar.
 *
 * `descartado` entra porque es donde acaba lo que se rindió tras agotar los intentos y lo que se
 * paró a mano; los dos son recuperables. `pendiente` NO entra: ya está en cola y volver a
 * ponerlo pendiente no adelanta nada. `enviado` tampoco, evidentemente.
 */
export const REINTENTABLES = Object.freeze(["fallido", "descartado"]);

/** ¿Este estado de cola admite un reintento? */
export const puedeReintentar = (estado) => REINTENTABLES.includes(String(estado || ""));

/**
 * LA CLAVE DE IDEMPOTENCIA DE UNA RECUPERACIÓN.
 *
 * ── POR QUÉ NO SIRVE LA CLAVE DEL ALTA ───────────────────────────────────────────────────────
 *
 * El camino clásico mete en `cap_cola.token` un valor ALEATORIO. Es único, sí, pero no dice nada
 * sobre QUIÉN es: dos filas del mismo cupón tienen tokens distintos y la base no puede saber que
 * son la misma persona. Así que una recuperación que se apoyara solo en el `ON CONFLICT` del
 * token duplicaría el mensaje de todos los que ya tienen fila.
 *
 * ── LA REGLA QUE SE USA EN SU LUGAR ──────────────────────────────────────────────────────────
 *
 * La idempotencia se decide por IDENTIDAD —campaña + cupón—, no por una cadena. Primero se mira
 * si esa persona YA tiene fila en esa campaña; solo si no la tiene se escribe, y entonces con
 * esta clave determinista, que protege del doble clic en el botón.
 *
 * Las dos capas hacen falta y hacen cosas distintas: la comprobación por identidad evita duplicar
 * lo que ya existía con otro token; la clave determinista evita duplicar la propia recuperación.
 */
export function claveRecuperacion({ campana, qrId }) {
  const c = String(campana || "").trim();
  const q = Number(qrId);
  if (!c || !Number.isFinite(q) || q <= 0) return null;
  return `rec:${c}:${q}`.slice(0, 180);
}

/** ¿Esta fila de cola nació de una recuperación? Sirve para contarlas aparte. */
export const esRecuperacion = (token) => /^rec:/.test(String(token || ""));

/**
 * EN QUÉ ESTADO ESTÁ UNA PERSONA.
 *
 * El orden de las comprobaciones ES la regla, y va de lo que no tiene arreglo a lo que sí:
 *
 *   1. Sin teléfono válido no hay nada que hacer: el código viaja por WhatsApp.
 *   2. Quien pidió que no le escribiéramos no recibe, ni siquiera esto. Va ANTES que la cola
 *      porque manda sobre cualquier estado: una fila pendiente suya no se debe mandar.
 *   3. Sin cupón no hay mensaje que componer — falta el dato que el mensaje lleva dentro.
 *   4. Con cupón y sin fila: es el agujero. Recuperable.
 *   5. Con fila, manda la fila.
 *
 * `enviado_en` gana a `estado`: si consta la fecha de salida, salió, diga lo que diga la columna
 * de estado. Es el único dato que registra un hecho y no una intención.
 */
export function clasificar({ telefono, qrId, baja, cola } = {}) {
  if (!telefonoValido(telefono)) return ESTADOS.SIN_TELEFONO;
  if (baja) return ESTADOS.BAJA;
  if (!qrId) return ESTADOS.SIN_QR;
  if (!cola) return ESTADOS.SIN_COLA;
  if (cola.enviado_en) return ESTADOS.ENVIADO;
  const e = String(cola.estado || "");
  if (e === "enviado") return ESTADOS.ENVIADO;
  if (puedeReintentar(e)) return ESTADOS.ERROR;
  return ESTADOS.PENDIENTE;
}

/**
 * Un teléfono español de móvil, reducido a sus nueve cifras.
 *
 * Se comprueba lo MISMO que comprueba el alta (`proTel9`): nueve dígitos. No se valida el prefijo
 * ni se consulta a nadie — averiguar si un número existe es cosa de `numeroTieneWhatsApp()`, y
 * eso vive en el envío, nunca en un contador.
 */
export function telefonoValido(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  return d.length >= 9;
}

/**
 * EL CENSO. Cuenta por estado, y nada más.
 *
 * Devuelve números, nunca personas: esta función es la que alimenta el informe, y un informe con
 * teléfonos dentro acaba en un correo, en una carpeta compartida y en un portátil ajeno.
 */
export function censar(destinatarios = []) {
  const cuenta = Object.fromEntries(Object.values(ESTADOS).map((e) => [e, 0]));
  for (const d of destinatarios) cuenta[clasificar(d)] += 1;
  const total = destinatarios.length;
  return {
    total,
    ...cuenta,
    // Lo que cada botón haría AHORA MISMO. Va calculado aquí para que la pantalla no vuelva a
    // decidirlo y para que el botón pueda decir cuántos, en vez de «enviar» a secas.
    recuperables: cuenta[ESTADOS.SIN_COLA],
    reintentables: cuenta[ESTADOS.ERROR],
  };
}

/**
 * POR QUÉ NO SALE NADA, DICHO EN UNA FRASE.
 *
 * Los tres frenos del worker —WhatsApp caído, interruptor de pánico y cupo agotado— dejan las
 * filas en `pendiente` SIN error: no ha fallado nada, es que no se ha intentado. Desde el panel
 * eso se veía como una cola que no avanza y ninguna pista de por qué.
 *
 * El orden es el mismo en que el worker se para, porque es el que hay que arreglar primero.
 */
export function motivoParada({ whatsappListo, colaParada, cupoLibre } = {}) {
  if (colaParada) {
    return { parado: true, motivo: "cola_parada",
      texto: "La cola está parada con el interruptor de pánico. Nada saldrá hasta que se quite." };
  }
  if (!whatsappListo) {
    return { parado: true, motivo: "whatsapp_caido",
      texto: "WhatsApp está desconectado. Los mensajes se guardan y salen solos al reconectar." };
  }
  if (Number(cupoLibre) <= 0) {
    return { parado: true, motivo: "sin_cupo",
      texto: "Se ha agotado el tope diario de mensajes. La cola sigue y continúa mañana." };
  }
  return { parado: false, motivo: null, texto: "" };
}

/**
 * QUÉ FILAS TOCA CADA ACCIÓN.
 *
 * Una sola función para las dos, porque la diferencia entre ellas es un filtro y tenerlas
 * separadas significaba que una regla nueva se añadía en una y se olvidaba en la otra.
 *
 *   · `pendientes`  — a quien tiene cupón y NADIE le encoló nada. No toca lo ya encolado.
 *   · `reintentar`  — a quien tiene fila en `fallido` o `descartado`. No toca lo pendiente ni
 *                     lo enviado.
 *
 * Ninguna de las dos alcanza jamás a un `enviado`. Es la propiedad que hace que pulsar dos veces,
 * refrescar o volver mañana no le cueste un segundo mensaje a nadie.
 */
export function aQuienAlcanza(accion, destinatarios = []) {
  const quiero = accion === "pendientes" ? ESTADOS.SIN_COLA
    : accion === "reintentar" ? ESTADOS.ERROR
    : null;
  if (!quiero) return [];
  return destinatarios.filter((d) => clasificar(d) === quiero);
}

/**
 * LA PUERTA DE LA RECUPERACIÓN HISTÓRICA.
 *
 * Arreglar las altas NUEVAS y recuperar las VIEJAS son dos cosas distintas, y solo la primera
 * puede ocurrir sola. La segunda significa escribirle hoy a gente que se apuntó hace semanas, y
 * eso no lo puede decidir un despliegue: lo decide una persona, después de mirar a cuántos
 * afecta.
 *
 * ── FALLA CERRADO, POR CONSTRUCCIÓN ─────────────────────────────────────────────────────────
 *
 * Solo la cadena exacta `"1"` abre. Ausente, vacía, `"0"`, `"true"`, `"si"`, un objeto o un error
 * de lectura dan todos lo mismo: cerrado. No hay ninguna entrada rara que pueda abrirla por
 * accidente, y esa es la propiedad que hace que el valor por defecto —que es no tener valor— sea
 * el seguro.
 */
export const GATE_HISTORICO = "captacion_reconciliar_historico";
export const historicoAbierto = (valor) => valor === "1";

/** Las dos acciones que existen. Cualquier otra cosa no se ejecuta. */
export const ACCIONES = Object.freeze(["pendientes", "reintentar"]);
export const accionValida = (a) => ACCIONES.includes(String(a || ""));
