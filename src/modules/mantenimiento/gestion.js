import { fechaValida } from '../facturas/calidad.js';
export function validarGestion(g) {
  if (!g || typeof g.responsable !== 'string' || g.responsable.trim().length > 120) return 'Indica un responsable de hasta 120 caracteres.';
  if (typeof g.fecha_objetivo !== 'string' || (g.fecha_objetivo && (!fechaValida(g.fecha_objetivo) || g.fecha_objetivo.length !== 10))) return 'La fecha objetivo no es válida.';
  if (!Number.isInteger(g.version) || g.version < 0) return 'Recarga la incidencia antes de guardar.';
  return null;
}
export const GESTION_SCHEMA = `ALTER TABLE maintenance_issues ADD COLUMN IF NOT EXISTS responsable TEXT NOT NULL DEFAULT '';
ALTER TABLE maintenance_issues ADD COLUMN IF NOT EXISTS fecha_objetivo TEXT NOT NULL DEFAULT '';
ALTER TABLE maintenance_issues ADD COLUMN IF NOT EXISTS gestion_version INTEGER NOT NULL DEFAULT 0;`;
export function guardarGestion(x, id, estado, g) {
  return x.run(`UPDATE maintenance_issues SET responsable = ?, fecha_objetivo = ?, gestion_version = gestion_version + 1 WHERE id = ? AND estado = ? AND gestion_version = ? RETURNING id`, [g.responsable.trim(),g.fecha_objetivo,id,estado,g.version]);
}
