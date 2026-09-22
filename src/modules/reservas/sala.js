// Datos de sala independientes de la confirmación y de los mensajes de WhatsApp.
export const ESTADOS_SALA = ['prevista', 'llegada', 'sentada', 'finalizada', 'no_presentada'];
export function validarSala(input = {}) {
  if (!input || typeof input !== 'object') return { error:'Datos de reserva inválidos.' };
  if (!ESTADOS_SALA.includes(input.estado_sala)) return { error: 'Elige un estado de sala válido.' };
  if (typeof input.mesa !== 'string' || input.mesa.trim().length > 80) return { error: 'La mesa admite hasta 80 caracteres.' };
  if (typeof input.notas_sala !== 'string' || input.notas_sala.trim().length > 2000) return { error: 'Las notas admiten hasta 2.000 caracteres.' };
  if (!Number.isInteger(input.version_sala) || input.version_sala < 0) return { error: 'Recarga la reserva antes de guardar.' };
  return { data: { estado_sala: input.estado_sala, mesa: input.mesa.trim(), notas_sala: input.notas_sala.trim(), version_sala: input.version_sala } };
}
export function puedeGestionarSala(local, permitidos) {
  return permitidos === null || (Array.isArray(permitidos) && permitidos.includes(local));
}
export const SALA_SCHEMA = `
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS estado_sala TEXT NOT NULL DEFAULT 'prevista';
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS mesa TEXT NOT NULL DEFAULT '';
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS notas_sala TEXT NOT NULL DEFAULT '';
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS version_sala INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS reservas_sala_historial (
 id BIGSERIAL PRIMARY KEY, reserva_id INTEGER NOT NULL, autor TEXT NOT NULL,
 antes JSONB NOT NULL, despues JSONB NOT NULL, creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
// Una cancelación o un «no se presentó» no puede acabar en «ayer estuviste aquí».
export function visitaCompatibleConSeguimiento(reservas) {
  return reservas.some(r => r.estado_sala !== 'no_presentada');
}
export function validarEdicionReserva(reserva, entrada, ahora) {
  if (entrada === undefined) return { data:reserva, cambia:false };
  if (!entrada || !entrada.original || ['nombre_reserva','personas','dia','hora'].some(k => String(entrada.original[k]) !== String(reserva[k]))) return { error:'Los datos de la reserva han cambiado. Cierra y vuelve a abrirla.', status:409 };
  const {nombre_reserva,personas,dia,hora}=entrada;
  if(typeof nombre_reserva!=='string' || !nombre_reserva.trim() || nombre_reserva.trim().length>160) return {error:'Indica un nombre de hasta 160 caracteres.'};
  if(!Number.isInteger(personas) || personas<1 || personas>100) return {error:'Indica entre 1 y 100 personas.'};
  if(typeof dia!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || !Number.isFinite(Date.parse(dia+'T12:00:00Z')) || new Date(dia+'T12:00:00Z').toISOString().slice(0,10)!==dia) return {error:'La fecha no es válida.'};
  if(typeof hora!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return {error:'La hora no es válida.'};
  const cambiaTurno=dia!==reserva.dia || hora!==reserva.hora;
  if(cambiaTurno && (dia<ahora.fecha || (dia===ahora.fecha && hora<ahora.hora.slice(0,5)))) return {error:'No puedes trasladar la reserva a una fecha u hora pasada.'};
  const data={...reserva,nombre_reserva:nombre_reserva.trim(),personas,dia,hora};
  return {data,cambiaTurno,cambia:['nombre_reserva','personas','dia','hora'].some(k=>String(data[k])!==String(reserva[k]))};
}
