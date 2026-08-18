// RR.HH. — el circuito humano de una ausencia. PURO.
//
// LO QUE YA HABÍA Y LO QUE FALTABA: `hor_ausencias` llevaba desde el principio haciendo bien
// su trabajo del lado de Horarios —los descansos, los conflictos y el generador ya filtraban
// `estado = 'aprobada'`, así que una pendiente nunca ha bloqueado nada—. Lo que no existía era
// el circuito: el trabajador no podía pedir nada y no había forma de aprobar ni de rechazar.
//
// DOS ORÍGENES, Y NO SE FUERZA UNO EN EL OTRO:
//
//   solicitada  → la pide el trabajador. Nace `pendiente` y alguien la resuelve.
//   adjudicada  → la mete un responsable un hecho ya acordado (una baja, un permiso hablado).
//                 Nace `aprobada`. Obligar a dirección a solicitarse algo a sí misma para
//                 luego aprobárselo sería un trámite inventado.
//
// UNA AUSENCIA NO ES DISPONIBILIDAD. La ausencia es una restricción real y bloquea; la
// disponibilidad es lo que alguien declara que le va bien. Mezclarlas haría que «no disponible
// los lunes» valiera como vacaciones, que es justo lo que no puede pasar.

export const ESTADOS = ["pendiente", "aprobada", "rechazada", "cancelada"];
export const TIPOS = ["vacaciones", "baja", "permiso", "asuntos_propios"];

/**
 * Lo que un trabajador puede pedirse a sí mismo. `baja` NO está, y es a propósito: una baja
 * médica la abre un parte, no un formulario, y dejar que alguien se la autodeclare aquí
 * confundiría un documento oficial con una casilla. Se sigue metiendo administrativamente.
 */
export const TIPOS_SOLICITABLES = ["vacaciones", "permiso", "asuntos_propios"];

export const ETIQUETA_TIPO = {
  vacaciones: "Vacaciones", baja: "Baja médica",
  permiso: "Permiso", asuntos_propios: "Asuntos propios",
};
export const ETIQUETA_ESTADO = {
  pendiente: "Pendiente de aprobación", aprobada: "Aprobada",
  rechazada: "Rechazada", cancelada: "Cancelada",
};

// Solo desde `pendiente` se va a algún sitio. Una aprobada no se rechaza por detrás: se
// cancela, que deja constancia de que hubo una decisión y de que se deshizo.
const TRANSICIONES = {
  pendiente: { aprobar: "aprobada", rechazar: "rechazada", cancelar: "cancelada" },
  aprobada: { cancelar: "cancelada" },
  rechazada: {},
  cancelada: {},
};

export function puedeTransitar(estado, accion) {
  return !!(TRANSICIONES[estado] && TRANSICIONES[estado][accion]);
}
export function transitar(estado, accion) {
  const destino = TRANSICIONES[estado] && TRANSICIONES[estado][accion];
  if (!destino) {
    return { error: estado === accion + "da" || estado === "aprobada" && accion === "aprobar"
      ? `Esa ausencia ya estaba ${ETIQUETA_ESTADO[estado].toLowerCase()}.`
      : `No se puede «${accion}» una ausencia ${ETIQUETA_ESTADO[estado].toLowerCase()}.` };
  }
  return { estado: destino };
}

/** LA regla que conecta esto con Horarios: solo una aprobada es una restricción real. */
export const bloqueaHorario = (a) => !!a && (a.estado || "aprobada") === "aprobada";

const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

/**
 * Comprueba una solicitud del trabajador. Devuelve el error EN CASTELLANO y sin tecnicismos:
 * lo va a leer alguien con el móvil en la mano y prisa.
 */
export function sanearSolicitud({ tipo, desde, hasta, comentario } = {}, { hoy = null, maxDias = 60 } = {}) {
  if (!TIPOS_SOLICITABLES.includes(String(tipo))) {
    return { error: "Elige qué tipo de ausencia pides." };
  }
  if (!esFecha(desde) || !esFecha(hasta)) return { error: "Faltan las fechas." };
  if (String(hasta) < String(desde)) return { error: "La fecha de fin es anterior a la de inicio." };
  // Un tope alto, solo para que un dedo torpe no pida cinco años. No es una regla de negocio.
  const dias = Math.round((Date.parse(hasta + "T12:00:00Z") - Date.parse(desde + "T12:00:00Z")) / 86400000) + 1;
  if (dias > maxDias) return { error: `Son ${dias} días seguidos. Si de verdad es tan largo, háblalo con tu responsable.` };
  if (hoy && String(hasta) < String(hoy)) return { error: "Esas fechas ya han pasado. Para arreglar algo del pasado, habla con tu responsable." };
  return {
    ok: true,
    tipo: String(tipo), desde: String(desde), hasta: String(hasta),
    comentario: String(comentario || "").trim().slice(0, 300) || null,
    dias,
  };
}

/** ¿Se pisan dos ausencias? Rangos inclusivos por los dos lados. */
export const solapan = (a, b) =>
  String(a.desde) <= String(b.hasta) && String(b.desde) <= String(a.hasta);

/**
 * Las que ya tiene y se pisarían con la nueva. Solo cuentan las vivas: una rechazada o una
 * cancelada no ocupan sitio.
 */
export function solapesVivos(nueva, suyas = []) {
  return (suyas || []).filter((a) =>
    ["pendiente", "aprobada"].includes(a.estado || "aprobada") &&
    String(a.id) !== String(nueva.id) && solapan(nueva, a));
}

/**
 * Los turnos que esa persona tiene DENTRO de la ausencia, separados por si la semana está
 * publicada o en borrador.
 *
 * NO SE BORRA NINGUNO, y esa es toda la decisión. Un turno publicado se mandó al grupo y hay
 * gente organizada con él; quitarlo al aprobar unas vacaciones sería cambiar en silencio un
 * horario oficial. Y uno en borrador se arregla en dos clics, pero lo tiene que decidir quien
 * cuadra la semana, que sabe con quién lo va a tapar.
 */
export function turnosDurante(asignaciones = [], { desde, hasta, worker_id }) {
  const dentro = (asignaciones || []).filter((a) =>
    String(a.worker_id) === String(worker_id) &&
    (a.tipo || "turno") === "turno" &&
    String(a.dia) >= String(desde) && String(a.dia) <= String(hasta));
  const publicados = dentro.filter((a) => a.estado_semana === "publicado");
  const borrador = dentro.filter((a) => a.estado_semana !== "publicado");
  return {
    total: dentro.length, publicados, borrador,
    semanas: [...new Set(dentro.map((a) => a.lunes).filter(Boolean))],
    aviso: dentro.length
      ? (publicados.length
        ? `Tiene ${dentro.length} turno(s) en esas fechas y ${publicados.length} están en semanas YA PUBLICADAS. No se tocan: para quitarlos hay que crear una versión nueva de esa semana.`
        : `Tiene ${dentro.length} turno(s) en esas fechas, todos en borrador. Quítalos desde el cuadrante.`)
      : null,
  };
}

/**
 * Lo que ve el TRABAJADOR de su propia ausencia.
 *
 * Sale `respuesta` —lo que le contestó quien la resolvió— y NO sale `motivo`, que es la nota
 * interna de quien la creó. En una baja médica ahí puede haber cualquier cosa.
 */
export function paraTrabajador(a) {
  return {
    id: a.id, tipo: a.tipo, etiquetaTipo: ETIQUETA_TIPO[a.tipo] || a.tipo,
    desde: a.desde, hasta: a.hasta,
    estado: a.estado, etiquetaEstado: ETIQUETA_ESTADO[a.estado] || a.estado,
    origen: a.origen || "adjudicada",
    comentario: a.comentario || null,
    respuesta: a.respuesta || null,
    solicitadoEn: a.solicitado_en || a.creado_en || null,
    resueltoEn: a.resuelto_en || null,
    // Se puede cancelar lo que todavía está pendiente. Una aprobada la deshace un responsable:
    // el cuadrante ya se ha hecho contando con ella.
    puedeCancelar: (a.estado === "pendiente") && (a.origen || "adjudicada") === "solicitada",
  };
}

/**
 * Lo que ve un ENCARGADO. Necesita saber que Juan no está del 18 al 22 para cuadrar la semana;
 * no necesita saber por qué. En una baja médica se le quita la nota interna: es dato de salud
 * y para planificar no aporta nada.
 */
export function paraResponsable(a, { verSensible = false } = {}) {
  const base = {
    id: a.id, worker_id: a.worker_id, nombre: a.nombre || null,
    tipo: a.tipo, etiquetaTipo: ETIQUETA_TIPO[a.tipo] || a.tipo,
    desde: a.desde, hasta: a.hasta,
    estado: a.estado, etiquetaEstado: ETIQUETA_ESTADO[a.estado] || a.estado,
    origen: a.origen || "adjudicada",
    comentario: a.comentario || null,
    respuesta: a.respuesta || null,
    solicitadoPor: a.solicitado_por || null, solicitadoEn: a.solicitado_en || a.creado_en || null,
    resueltoPor: a.resuelto_por || null, resueltoEn: a.resuelto_en || null,
    canceladoPor: a.cancelado_por || null,
  };
  const sensible = a.tipo === "baja" && !verSensible;
  return { ...base, motivo: sensible ? null : (a.motivo || null), motivoOculto: sensible && !!a.motivo };
}

/** Los números de la bandeja. */
export function resumirBandeja(lista = []) {
  const r = { pendientes: 0, aprobadas: 0, rechazadas: 0, canceladas: 0, total: lista.length };
  for (const a of lista) {
    if (a.estado === "pendiente") r.pendientes++;
    else if (a.estado === "aprobada") r.aprobadas++;
    else if (a.estado === "rechazada") r.rechazadas++;
    else if (a.estado === "cancelada") r.canceladas++;
  }
  return r;
}
