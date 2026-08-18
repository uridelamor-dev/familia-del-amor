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

import { REVISAR } from "./jornadas.js";

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
export function clasificarJornada({
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
