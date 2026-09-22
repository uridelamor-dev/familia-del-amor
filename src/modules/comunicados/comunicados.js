import { fechaValida } from '../facturas/calidad.js';
export const COM_SCHEMA = `ALTER TABLE announcements ADD COLUMN IF NOT EXISTS hasta TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS announcement_reads (
 announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 leido_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(announcement_id,user_id)
);`;
export function validarComunicado(body, hoy) {
  if(typeof body.mensaje!=='string' || !body.mensaje.trim() || body.mensaje.trim().length>5000) return 'Escribe un mensaje de hasta 5.000 caracteres.';
  if(body.rol!=='trabajadores') return 'Elige el equipo destinatario.';
  if(body.hasta && (typeof body.hasta!=='string' || body.hasta.length!==10 || !fechaValida(body.hasta) || body.hasta<hoy)) return 'La vigencia debe terminar hoy o más adelante.';
  return null;
}
