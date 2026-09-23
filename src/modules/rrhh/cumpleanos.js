import { activoAhora } from './vigencia.js';
import { instanteMadrid } from '../horarios/tiempo.js';
export const CUMPLE_CONFIG = { activo: false, hora: '09:00', telefono: '34622065974' };
export function cumpleanosHoy(personas, hoy) {
  return personas.filter(p => ['trabajador', 'encargado'].includes(p.rol) && activoAhora(p, hoy)
    && p.fecha_nac && p.fecha_nac.slice(5, 10) === hoy.slice(5, 10))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
export function textoCumpleanos(personas) {
  return 'Nerea, recuerda que hoy es el cumpleaños de:\n\n' + personas.map(p => `• ${p.nombre} de ${p.local}`).join('\n');
}
// Repositorio inyectado. La reserva diaria se persiste ANTES de enviar: un reinicio
// en mitad de la entrega deja «enviando», nunca repite un mensaje de resultado incierto.
export async function avisarCumpleanos({ ahora, config, conectado, personas, reservar, enviar, terminar }) {
  if (!config.activo || !conectado()) return 'inactivo';
  const { fecha, hora } = instanteMadrid(ahora);
  if (hora.slice(0, 5) < config.hora) return 'temprano';
  const lista = cumpleanosHoy(await personas(), fecha);
  if (!lista.length) return 'sin_cumpleanos';
  if (!await reservar(fecha)) return 'ya_reservado';
  try { await enviar(config.telefono, textoCumpleanos(lista)); }
  catch { await terminar(fecha, 'revisar'); return 'revisar'; }
  await terminar(fecha, 'enviado');
  return 'enviado';
}
