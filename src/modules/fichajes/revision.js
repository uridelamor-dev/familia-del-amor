// Fichajes — clasificar una jornada para poder revisar POR EXCEPCIONES. PURO.
//
// EL PROBLEMA: revisar un mes eran doscientas jornadas de una en una, y ciento ochenta de
// ellas no tenían nada que decidir. Cuando revisar cuesta eso, no se revisa; y sin validar,
// las horas no entran en la bolsa de nadie. El cuello de botella no era técnico, era que la
// pantalla trataba igual lo que necesita criterio y lo que no.
//
// ESTO NO DECIDE SI UNA JORNADA ES CORRECTA. Eso ya lo dice `construirJornada` con sus
// incidencias y sus dos niveles. Aquí solo se traduce eso a «¿hace falta una persona?».
//
// LA REGLA DE FONDO, y es la única que importa: en el lote solo entra lo que NO necesita
// criterio. Ante la duda, a revisión. Validar de más es escribir horas que nadie ha mirado.

import { REVISAR, horasCompletas } from "./jornadas.js";

export const LISTA = "lista_para_validar";
export const REVISION = "requiere_revision";
export const ABIERTA = "abierta";
export const VALIDADA = "validada";
export const CADUCADA = "validacion_caducada";

/** Por qué una jornada no puede ir en el lote. Se devuelve para poder explicarlo en pantalla. */
export const MOTIVOS = {
  incidencia: "Tiene una incidencia que hay que decidir",
  abierta: "El día todavía no ha terminado",
  manual: "Se ha corregido a mano y nadie ha confirmado las horas",
  caducada: "Se validó y después cambió el registro",
  validada: "Ya está validada",
  periodo_cerrado: "El periodo está cerrado",
  // Solo para el atajo de un clic: no dice que la jornada esté mal, dice que no hay ninguna
  // cifra que ofrecer sin que alguien la decida.
  horas_incompletas: "Falta una hora del registro: hay que decidirla",
};

/** ¿Tiene algún fichaje metido o corregido por una persona? Los anulados también cuentan. */
export function tieneCorreccionAMano(eventos = []) {
  return (eventos || []).some((e) => e && (e.origen === "manual" || e.anulado_por || e.anulado));
}

/**
 * En qué situación está una jornada.
 *
 *   jornada        lo que devuelve `construirJornada` (incidencias, minutos, tramos)
 *   eventos        los del día, tal cual salen de la base
 *   validacion     { minutos, firma } de fic_jornadas, o null
 *   firmaActual    firmaDeEventos(eventos) — se pasa hecha para no recalcularla dos veces
 *   diaCerrado     el día ya pasó (mismo criterio que usa `construirJornada`)
 *   periodoCerrado la nómina de ese día ya está cerrada
 *
 * → { estado, puedeLote, motivo }
 *
 * EL ORDEN DE LAS PREGUNTAS ES LA REGLA. Se mira primero si ya hay una decisión humana
 * —validada o caducada— porque eso manda sobre todo lo demás: una jornada validada no
 * vuelve a la cola por mucho que tenga una incidencia informativa.
 */
function situacionDe({
  jornada, eventos = [], validacion = null, firmaActual = null,
  diaCerrado = false, periodoCerrado = false,
} = {}) {
  const salida = (estado, puedeLote, motivo) => ({ estado, puedeLote, motivo: motivo || null });

  // 1. ¿Ya la miró alguien? Si la firma sigue siendo la misma, está decidida y punto.
  if (validacion && validacion.minutos != null) {
    if (firmaActual != null && validacion.firma !== firmaActual) {
      // Se validó y DESPUÉS llegó o se anuló un fichaje. La validación no se borra —es una
      // decisión con nombre y fecha— pero deja de valer sola y vuelve a pedir una mirada.
      return salida(CADUCADA, false, MOTIVOS.caducada);
    }
    return salida(VALIDADA, false, MOTIVOS.validada);
  }

  // 2. El día que todavía corre no se valida. Es la misma filosofía que evita que a media
  //    tarde todo el que está dentro aparezca como incidencia.
  if (!diaCerrado) return salida(ABIERTA, false, MOTIVOS.abierta);

  // 3. Cualquier incidencia de nivel `revisar` pide una decisión. Las de nivel `informa`
  //    —entrar cinco minutos tarde, salir siete pronto— NO: para eso está la tolerancia, y
  //    obligar a abrir doscientas jornadas por eso es lo que hace que no se revise ninguna.
  if ((jornada?.incidencias || []).some((i) => i.nivel === REVISAR)) {
    return salida(REVISION, false, MOTIVOS.incidencia);
  }

  // 4. Un fichaje metido o anulado a mano significa que ALGO no cuadraba y alguien lo tocó.
  //    Meterlo en el lote enterraría esa corrección sin que nadie confirme las horas que
  //    salen de ella. No es un segundo sistema de aprobación: en cuanto se valide una vez,
  //    pasa a `validada` y no vuelve a aparecer.
  if (tieneCorreccionAMano(eventos)) return salida(REVISION, false, MOTIVOS.manual);

  // 5. Limpia. Pero si la nómina de ese día ya está cerrada, no se toca: para incorporarla
  //    hay que reabrir el periodo a propósito, y eso lo decide una persona.
  if (periodoCerrado) return salida(LISTA, false, MOTIVOS.periodo_cerrado);

  return salida(LISTA, true, null);
}

/**
 * ¿Se puede validar esta jornada de un solo clic, desde la lista y sin abrirla?
 *
 * ES UN PERMISO DISTINTO DE `puedeLote`, y la diferencia es quién decide:
 *
 *   · `puedeLote` es un AUTOMATISMO. Se lleva por delante decenas de jornadas de golpe, así
 *     que solo puede tocar lo que no necesita criterio de nadie.
 *   · `unClic` tiene UNA PERSONA DELANTE que está leyendo esa fila. Por eso sí puede aceptar
 *     una incidencia: quien fichó un día que no le tocaba tiene algo que decidir, pero sus
 *     horas se saben, y obligar a abrir el modal para pulsar el mismo botón no protege nada.
 *
 * Lo que NUNCA entra es aquello de lo que no hay cifra: si falta la entrada, la salida o el
 * fichaje entero, no hay nada que contar y hace falta escribir una hora a mano, con su motivo.
 * Ahí el modal no es un trámite, es el sitio donde se toma la decisión.
 */
function permisoUnClic(base, { jornada, periodoCerrado = false } = {}) {
  if (base.estado === VALIDADA) return { puede: false, motivo: MOTIVOS.validada };
  if (base.estado === ABIERTA) return { puede: false, motivo: MOTIVOS.abierta };
  if (periodoCerrado) return { puede: false, motivo: MOTIVOS.periodo_cerrado };
  if (!horasCompletas(jornada)) return { puede: false, motivo: MOTIVOS.horas_incompletas };
  return { puede: true, motivo: null };
}

/** En qué situación está una jornada, y si se puede resolver desde la lista. */
export function clasificarJornada(args = {}) {
  const base = situacionDe(args);
  const uc = permisoUnClic(base, args);
  return { ...base, unClic: uc.puede, motivoUnClic: uc.motivo };
}

/**
 * La tercera magnitud: LO QUE CUENTA. Ni el cuadrante ni el reloj.
 *
 * Son tres cosas distintas y hasta ahora solo se veían dos. Lo que se paga y lo que se apunta
 * en la bolsa sale de aquí: mientras nadie ha decidido, es una propuesta —lo que marcó el
 * reloj, descontadas las pausas—; en cuanto alguien valida, es su decisión, con su nombre.
 *
 * Enseñarla al lado de las otras dos es lo que convierte la pantalla en una comparación de
 * verdad. Verla NO es poder editarla: cambiarla exige un motivo escrito y eso se hace en el
 * detalle, donde además se puede elegir la hora de entrada y de salida de cada turno.
 */
export function cuentaDeJornada({ jornada = null, validacion = null, caducada = false } = {}) {
  const propuesto = Math.max(0, Number(jornada?.minEfectivo) || 0);
  const decidido = validacion && validacion.minutos != null ? Number(validacion.minutos) || 0 : null;
  // CADUCADA: se validó y DESPUÉS llegó o se anuló un fichaje. La cifra vieja ya no describe
  // lo que pasó ese día, así que lo que se ofrece es la nueva —que es la que se escribiría al
  // volver a validar—. Enseñar la vieja haría que el botón dijera una cantidad y guardara otra.
  // La anterior se conserva al lado para poder ver de dónde se viene.
  if (caducada) return { minutos: propuesto, origen: "propuesto", propuesto, decididoAntes: decidido };
  if (decidido != null) return { minutos: decidido, origen: "validado", propuesto, decididoAntes: null };
  return { minutos: propuesto, origen: "propuesto", propuesto, decididoAntes: null };
}

/**
 * Cuelga de la fila la ausencia aprobada que cubría ese día. CONTEXTO, NO EXCUSA.
 *
 * El caso: alguien tenía turno publicado, se le aprobó después una baja, y la revisión decía
 * «tenía turno y no consta ningún fichaje» sin más. Quien revisa abría la jornada, no veía
 * nada, y se quedaba sin saber si faltó al trabajo o estaba en el médico.
 *
 * LA INCIDENCIA SIGUE AHÍ Y SIGUE PIDIENDO DECISIÓN, y es a propósito: un turno publicado
 * durante una ausencia aprobada es una incoherencia real del cuadrante, y se arregla
 * republicando el horario, no escondiendo el aviso. Lo único que cambia es que ahora se lee
 * el porqué sin salir de la pantalla.
 *
 * Esta función existe —aunque solo añada un campo— para que haya UN SOLO SITIO al que apuntar
 * el test que dice «esto no silencia nada». El día que alguien intente filtrar por ausencia,
 * tendrá que hacerlo aquí, y saltará.
 */
export function conContextoDeAusencia(fila, ausencia = null) {
  return { ...fila, ausencia: ausencia || null };
}

/**
 * ¿Merece la pena que esta jornada salga siquiera en la lista?
 *
 * Un día en el que alguien ni tenía turno ni fichó no es una jornada: es un día libre. Si
 * entraran, un mes de doce personas serían trescientas setenta filas vacías que hay que
 * mirar para descubrir que no dicen nada.
 */
export function mereceSalir(jornada, { validacion = null, eventos = [] } = {}) {
  if (!jornada) return false;
  if (jornada.minPlanificado > 0 || jornada.minFichado > 0) return true;
  if ((jornada.incidencias || []).length) return true;
  if (validacion && validacion.minutos != null) return true;
  return (eventos || []).some((e) => !(e.anulado_por || e.anulado));
}

/** Los números de la cabecera. Salen de la MISMA clasificación que decide el lote. */
export function resumirRevision(filas = []) {
  const r = {
    total: filas.length,
    listas_para_validar: 0, requieren_revision: 0, abiertas: 0, validadas: 0, caducadas: 0,
    // Limpias pero intocables porque su nómina ya está cerrada. Aparte, para que el botón
    // no prometa validar algo que va a rechazar.
    bloqueadas_por_cierre: 0,
    minutos_a_validar: 0,
  };
  for (const f of filas) {
    if (f.estado === LISTA && f.puedeLote) { r.listas_para_validar++; r.minutos_a_validar += Number(f.minEfectivo) || 0; }
    else if (f.estado === LISTA) r.bloqueadas_por_cierre++;
    else if (f.estado === REVISION) r.requieren_revision++;
    else if (f.estado === ABIERTA) r.abiertas++;
    else if (f.estado === VALIDADA) r.validadas++;
    else if (f.estado === CADUCADA) r.caducadas++;
  }
  return r;
}

/** Las que el lote va a tocar. Nunca sale de aquí ninguna que no pueda validarse. */
export const candidatasDeLote = (filas = []) => filas.filter((f) => f.estado === LISTA && f.puedeLote);
