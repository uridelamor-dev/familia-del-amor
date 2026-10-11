// Encargo explícito de dirección, persistido en config; nunca selecciona clientes por su cuenta.
export const CLAVE_RECUPERACION = 'sara_respuesta_recuperacion_v1';
export async function recuperarRespuestaAutorizada({ dbGet, dbRun, enviar, listo, ahora = Date.now() }) {
  if (!listo()) return;
  const fila = await dbGet('SELECT value FROM config WHERE key = ?', [CLAVE_RECUPERACION]);
  if (!fila?.value) return;
  const tarea = JSON.parse(fila.value);
  if (tarea.estado !== 'pendiente') return;
  if (!/^34[67]\d{8}$/.test(tarea.telefono) || !tarea.texto || tarea.texto.length > 1500
    || !Number.isFinite(Date.parse(tarea.desde)) || !Number.isFinite(Date.parse(tarea.caduca))) throw Error('Recuperación inválida');
  const atendido = await dbGet(`SELECT id FROM whatsapp_messages WHERE
    (telefono = ? OR telefono = ? OR jid = ? OR jid IN (SELECT jid FROM wa_clientes WHERE telefono = ? OR telefono = ?))
    AND creado_en::timestamptz >= ?::timestamptz
    AND (tipo = 'saliente' OR (NULLIF(respuesta, '') IS NOT NULL AND respuesta != '(sin respuesta registrada)')) LIMIT 1`,
    [tarea.telefono, tarea.telefono.slice(-9), tarea.telefono+'@s.whatsapp.net', tarea.telefono, tarea.telefono.slice(-9), tarea.desde]);
  const pausa = await dbGet("SELECT jid FROM wa_clientes WHERE (telefono = ? OR telefono = ?) AND estado_ia = 'pausada' LIMIT 1", [tarea.telefono,tarea.telefono.slice(-9)]);
  const estado = Date.parse(tarea.caduca) <= ahora ? 'caducada' : atendido || pausa ? 'omitida' : 'enviando';
  const tomada = await dbGet('UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ? AND value = ? RETURNING key',
    [JSON.stringify({...tarea,estado}), CLAVE_RECUPERACION, fila.value]);
  if (!tomada || estado !== 'enviando') return;
  // Si el proceso cae durante el envío, no repetir una entrega de resultado incierto.
  try {
    await enviar(tarea.telefono,tarea.texto,{origen:'sistema',idioma:'ca'});
    await dbRun('UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
      [JSON.stringify({...tarea,estado:'enviada',enviada_en:new Date(ahora).toISOString()}),CLAVE_RECUPERACION]);
  } catch (e) {
    await dbRun('UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
      [JSON.stringify({...tarea,estado:'revisar_envio'}),CLAVE_RECUPERACION]);
    throw e;
  }
}
