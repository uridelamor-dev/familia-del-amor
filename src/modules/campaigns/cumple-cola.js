import { hoyMadrid, esCumpleHoy } from './campaigns.service.js';
import { aplicarVariables } from '../messaging/queue.js';

export function estadoCumple(token, activo, now = new Date()) {
  if (!String(token).startsWith('cumple:')) return 'ajeno';
  if (String(token).split(':')[1] !== hoyMadrid(now).iso) return 'caducado';
  return activo ? 'enviar' : 'pausado';
}

// La clave única conserva el progreso tras reinicios y evita duplicar contactos.
export async function encolarCumples({ contactos, plantilla, resolverMensaje, dbRun, now = new Date() }) {
  const hoy = hoyMadrid(now);
  for (const c of contactos) {
    if (Number(c.baja) === 1 || !esCumpleHoy(c.nacimiento, hoy)) continue;
    const telefono = String(c.telefono || '').replace(/\D/g, '').slice(-9);
    if (telefono.length !== 9) continue;
    const base = resolverMensaje ? resolverMensaje(c) : plantilla;
    if (/\{cupon\}/i.test(base)) throw new Error('La felicitación no admite cupones automáticos');
    await dbRun(`INSERT INTO cap_cola (token, campana, telefono, texto, proximo_ms, creado_en, prioridad)
      VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT (token) DO NOTHING`,
      [`cumple:${hoy.iso}:${telefono}`, `cumple:${hoy.iso}`, telefono,
        aplicarVariables(base, c), now.getTime(), now.toISOString()]);
  }
}
