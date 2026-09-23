// Resumen operativo del cuadrante. No calcula nóminas ni modifica fichajes.
import { contratoVigente } from './conflictos.js';
import { coberturaFranja } from './cobertura.js';
export { coberturaFranja } from './cobertura.js';

export function validarTurno(a) {
  if (!a || !Number.isInteger(Number(a.inicio_min)) || a.inicio_min == null || a.inicio_min === '' ||
      !Number.isInteger(Number(a.fin_min)) || a.fin_min == null || a.fin_min === '' ||
      Number(a.inicio_min) < 0 || Number(a.inicio_min) >= 1440 ||
      Number(a.fin_min) < Number(a.inicio_min) || Number(a.fin_min) > 2160)
    return 'El horario no es válido';
  if (!['turno','libranza','vacaciones','baja','formacion','festivo'].includes(a.tipo || 'turno')) return 'Tipo de turno no válido';
  if ((a.tipo || 'turno') === 'turno' && Number(a.fin_min) === Number(a.inicio_min)) return 'El turno tiene que durar más de cero minutos';
  if (a.worker_id == null || a.worker_id === '') {
    if ((a.tipo || 'turno') !== 'turno') return 'Solo un turno de trabajo puede quedar sin asignar';
  } else if (!Number.isInteger(Number(a.worker_id)) || Number(a.worker_id) <= 0) return 'Persona no válida';
  return null;
}

export function resumenOperativo({ dias = [], equipo = [], contratos = [], asignaciones = [], necesidades = [], tramos = [], areas = [] }) {
  const turnos = asignaciones.filter(a => (a.tipo || 'turno') === 'turno');
  const personas = equipo.map(w => {
    const propios = turnos.filter(a => String(a.worker_id) === String(w.id));
    const vigentes = dias.filter(d => (!w.fecha_alta || d >= w.fecha_alta) && (!w.fecha_baja || d <= w.fecha_baja));
    const cs = vigentes.map(d => contratoVigente(contratos,w.id,d));
    const conocidos = cs.filter(Boolean);
    const objetivo = cs.length && cs.every(Boolean) ? Math.round(cs.reduce((n,c) => n + Number(c.horas_semana)*60/7,0)) : null;
    const minutos = propios.reduce((n,a) => n + Number(a.fin_min)-Number(a.inicio_min),0);
    return { worker_id:w.id, minutos, objetivo_min:objetivo, diferencia_min:objetivo == null ? null : minutos-objetivo,
      horas_contrato:[...new Set(conocidos.map(c => Number(c.horas_semana)))],
      proporcional: vigentes.length !== 7 || new Set(conocidos.map(c => c.id)).size > 1,
      hasta_cierre:propios.some(a => a.fin_abierto) };
  });
  const cobertura = necesidades.flatMap(n => {
    const dia = dias[Number(n.dow)];
    if (!dia || (n.desde && dia < n.desde) || (n.hasta && dia > n.hasta)) return [];
    const tramo = tramos.find(t => String(t.id) === String(n.tramo_id));
    // Los refuerzos flexibles se revisan con el motor de conflictos existente:
    // no convertir una necesidad de cuatro horas en cobertura durante toda su ventana.
    if (!tramo || tramo.tipo === 'descanso' || Number(n.duracion_min) > 0) return [];
    const segmentos = coberturaFranja({ asignaciones:turnos,dia,area_id:n.area_id,...tramo });
    const minimo = Number(n.minimo)||0, objetivo = n.objetivo == null ? minimo : Number(n.objetivo);
    return [{ dia, area_id:n.area_id, area:areas.find(a => String(a.id)===String(n.area_id))?.nombre || 'Área',
      tramo:tramo.nombre, minimo, objetivo, segmentos,
      cubierto:segmentos.length ? Math.min(...segmentos.map(s=>s.personas)) : 0,
      minutos_descubiertos:segmentos.reduce((v,s)=>v+(s.personas<minimo?s.fin_min-s.inicio_min:0),0) }];
  });
  return { personas, cobertura, sin_asignar:turnos.filter(a=>a.worker_id==null).length };
}
