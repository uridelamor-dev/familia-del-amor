// La cobertura es simultánea, no el número de turnos que tocan una franja.
// Un turno partido y dos filas solapadas del mismo empleado cuentan como UNA persona.
export function coberturaFranja({ asignaciones = [], dia, area_id, inicio_min, fin_min }) {
  const ini = Number(inicio_min), fin = Number(fin_min);
  if (!Number.isFinite(ini) || !Number.isFinite(fin) || fin <= ini) return [];
  const turnos = asignaciones.filter(a => (a.tipo || 'turno') === 'turno' &&
    String(a.dia) === dia && String(a.area_id) === String(area_id) &&
    Number(a.inicio_min) < fin && Number(a.fin_min) > ini);
  const limites = [...new Set([ini, fin, ...turnos.flatMap(a =>
    [Math.max(ini, Number(a.inicio_min)), Math.min(fin, Number(a.fin_min))])])].sort((a,b) => a-b);
  return limites.slice(0,-1).map((desde,i) => {
    const hasta = limites[i+1], presentes = turnos.filter(a => Number(a.inicio_min) <= desde && Number(a.fin_min) >= hasta);
    return { inicio_min: desde, fin_min: hasta,
      personas: new Set(presentes.filter(a => a.worker_id != null).map(a => String(a.worker_id))).size,
      sin_asignar: presentes.filter(a => a.worker_id == null).length };
  });
}
