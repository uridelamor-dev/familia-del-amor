// Un aviso por grupo y día de recuperación, incluso tras reiniciar el servidor.
// Reservar antes del envío evita duplicados cuando la respuesta de WhatsApp es incierta.
export function crearAvisoRecuperacionFacturas({ dbGet, enviar, ahora = () => new Date(), log = console.warn }) {
  return async function avisar(groupJid) {
    try {
      const dia = ahora().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
      const reservado = await dbGet(
        "INSERT INTO contents (key,value,updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING RETURNING key",
        ['wa_facturas_recuperadas:' + groupJid + ':' + dia, 'reservado']
      );
      if (!reservado) return;
      await enviar(groupJid, '📥 Estamos recuperando y digitalizando los documentos enviados mientras estábamos desconectados. Ya hemos empezado a recibirlos; no hace falta volver a enviarlos. Podéis consultar el progreso en Compras → Documentos recibidos.');
    } catch { log('[Facturas] No se pudo confirmar el aviso de recuperación; no se repite para evitar duplicados.'); }
  };
}
