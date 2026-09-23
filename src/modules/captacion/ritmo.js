// Horario peninsular y cadencia compartidos por toda la cola de campañas.
export const RITMO_INICIAL = Object.freeze({ desde: '09:00', hasta: '21:00', minutos: 5, cantidad: 1 });
export function validarRitmo(d = {}) {
  const hora = v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!hora(d.desde) || !hora(d.hasta) || d.desde >= d.hasta) throw new Error('La hora final debe ser posterior a la inicial.');
  const minutos = Number(d.minutos), cantidad = Number(d.cantidad);
  if (!Number.isInteger(minutos) || minutos < 5 || minutos > 120) throw new Error('El intervalo debe ser de 5 a 120 minutos.');
  if (![1, 2].includes(cantidad)) throw new Error('Elige uno o dos mensajes por intervalo.');
  return { desde: d.desde, hasta: d.hasta, minutos, cantidad };
}
export function enHorario(ritmo, ahora = Date.now()) {
  const hora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ahora));
  return hora >= ritmo.desde && hora < ritmo.hasta;
}
export const intervaloMs = ritmo => Number(ritmo.minutos) * 60000 / Number(ritmo.cantidad);

// Una reserva atómica por intento: no acumula turnos durante una caída o una pausa.
// Dos mensajes cada cinco minutos se separan 150 segundos, nunca salen juntos.
export async function reservarSalida(dbGet, ahora = Date.now()) {
  return dbGet(`UPDATE cap_envio_control SET proximo_ms = CAST(? AS BIGINT) + minutos * 60000 / cantidad
    WHERE id = 1 AND proximo_ms <= ?
      AND to_char(timezone('Europe/Madrid', CURRENT_TIMESTAMP), 'HH24:MI') >= desde
      AND to_char(timezone('Europe/Madrid', CURRENT_TIMESTAMP), 'HH24:MI') < hasta
      AND NOT EXISTS (SELECT 1 FROM config WHERE key = 'captacion_cola_parada' AND value = '1')
    RETURNING id`, [ahora, ahora]);
}
