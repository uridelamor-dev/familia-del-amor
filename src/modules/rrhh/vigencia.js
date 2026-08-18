// RR.HH. — ¿está esta persona laboralmente activa? PURO.
//
// EL PROBLEMA QUE RESUELVE: la auditoría encontró TRES criterios distintos de «activo»
// conviviendo en el mismo módulo, cada uno escrito a mano en su consulta:
//
//   · el kiosco:            activo = 1 AND fecha_baja IS NULL
//   · la semana de horario: activo = 1 AND (fecha_baja IS NULL OR fecha_baja >= lunes)
//   · el listado de equipo: sin filtro ninguno
//
// Y ninguno de los tres lo comprobaba el login, así que alguien de baja seguía entrando.
//
// NO SE UNIFICAN EN UN `esActivo()` A CIEGAS, y es a propósito: son TRES PREGUNTAS
// DISTINTAS y confundirlas rompe pantallas que hoy funcionan bien.
//
//   activoEnFecha(p, dia)          ¿trabajaba ESE día?        → cuadrante, fila de fiesta
//   activoAhora(p, hoy)            ¿trabaja HOY?              → login, kiosco, solver
//   pertenecioAlPeriodo(p, a, b)   ¿estuvo en algún momento?  → histórico, revisión, export
//
// CONVENIO DE `fecha_baja`: es el ÚLTIMO DÍA TRABAJADO, inclusive. Es lo que ya hacía
// `descansos.js` (`enRango(dia, fecha_alta, fecha_baja)`) y lo que dice una baja de la
// Seguridad Social. Quien causa baja el 31 de agosto trabaja el 31 y no el 1 de septiembre.

/** `activo` viene de la base como 1/0, como booleano o sin venir. Ausente = activo. */
export function marcadoActivo(persona) {
  const v = persona ? persona.activo : undefined;
  return !(v === 0 || v === false || v === "0");
}

const fecha = (v) => { const s = String(v == null ? "" : v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

/**
 * ¿Trabajaba esta persona el día `dia`?
 *
 * Es la pregunta del CUADRANTE: quien entró el jueves no debe salir «librando» el lunes
 * anterior, y quien se fue el miércoles tiene que seguir apareciendo en su parte de la
 * semana. `activo = 0` sin fecha de baja se trata como «ya no», porque no hay otra fecha
 * con la que situarlo.
 */
export function activoEnFecha(persona, dia) {
  if (!persona) return false;
  const d = fecha(dia);
  const alta = fecha(persona.fecha_alta);
  const baja = fecha(persona.fecha_baja);
  if (!marcadoActivo(persona) && !baja) return false;
  if (!d) return marcadoActivo(persona) && !baja;
  if (alta && d < alta) return false;
  if (baja && d > baja) return false;
  // Desactivado a mano Y con fecha de baja: manda la fecha, que es la que sitúa el corte.
  return marcadoActivo(persona) || !!baja;
}

/**
 * ¿Le ha llegado ya la baja?
 *
 * Existe aparte de `activoAhora` por un motivo concreto: para ENTRAR AL PANEL no se mira la
 * fecha de alta. A alguien contratado hoy con alta el día 1 del mes que viene hay que poder
 * darle su usuario, su PIN y que se lo mire antes de empezar; bloquearle el acceso hasta el
 * día del alta sería un efecto secundario que nadie ha pedido y que se descubriría el primer
 * día de trabajo, con la persona delante.
 */
export function bajaEfectiva(persona, hoy) {
  const baja = fecha(persona && persona.fecha_baja);
  const d = fecha(hoy);
  if (!baja) return false;
  return d ? d > baja : true;
}

/**
 * ¿Puede trabajar HOY? Es la pregunta del kiosco y del generador.
 *
 * Aquí `activo = 0` corta siempre, tenga o no fecha de baja: desactivar una cuenta es una
 * decisión del presente y tiene que surtir efecto ahora, no dentro de dos semanas.
 */
export function activoAhora(persona, hoy) {
  if (!persona || !marcadoActivo(persona)) return false;
  return activoEnFecha({ ...persona, activo: 1 }, hoy);
}

/**
 * ¿Estuvo en plantilla en algún momento entre `desde` y `hasta`?
 *
 * Es la pregunta del HISTÓRICO: la revisión de un periodo, el export legal y el libro de
 * horas tienen que seguir enseñando a quien ya se fue. Contestar aquí con `activoAhora`
 * haría desaparecer a alguien de su propio registro de jornada, que es justo lo que la ley
 * obliga a conservar cuatro años.
 */
export function pertenecioAlPeriodo(persona, desde, hasta) {
  if (!persona) return false;
  const a = fecha(desde), b = fecha(hasta);
  const alta = fecha(persona.fecha_alta), baja = fecha(persona.fecha_baja);
  if (alta && b && alta > b) return false;
  if (baja && a && baja < a) return false;
  return true;
}

/**
 * Sus asignaciones POSTERIORES a la baja. No borra nada: devuelve qué habría que mirar.
 *
 * Borrar turnos al dar de baja sería modificar en silencio un horario ya publicado, que es
 * exactamente lo que este sistema no hace nunca. Lo que sí puede hacer es AVISAR, separando
 * lo que está en un borrador —que se puede arreglar sin consecuencias— de lo que ya se
 * publicó y mandó al grupo, que exige una versión nueva.
 */
export function turnosTrasLaBaja(asignaciones = [], persona) {
  const baja = fecha(persona && persona.fecha_baja);
  const desactivado = !marcadoActivo(persona);
  if (!baja && !desactivado) return { borrador: [], publicados: [], total: 0 };
  const posterior = (a) => (baja ? String(a.dia) > baja : true);
  const suyas = (asignaciones || []).filter((a) => String(a.worker_id) === String(persona.id) && posterior(a));
  const borrador = suyas.filter((a) => a.estado === "borrador");
  const publicados = suyas.filter((a) => a.estado !== "borrador");
  return { borrador, publicados, total: suyas.length };
}
