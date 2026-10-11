// Los eventos append también contienen mensajes recibidos estando desconectados.
// El historial masivo se sigue archivando sin generar respuestas automáticas.
export function entradaDiferidaVigente(msg, ahora = Date.now()) {
  const jid = msg?.key?.remoteJid || '';
  const fecha = Number(msg?.messageTimestamp) * 1000;
  return !!msg?.key?.id && !msg.key.fromMe && /@(s\.whatsapp\.net|lid)$/.test(jid)
    && Number.isFinite(fecha) && fecha <= ahora + 60000 && fecha >= ahora - 72 * 3600000;
}

export async function indicarEscribiendo(sock, jid, espera = 1500) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => sock.sendPresenceUpdate('composing', jid)),
      new Promise(resolve => { timer = setTimeout(resolve, espera); }),
    ]);
  } catch { /* La presencia es decorativa: nunca debe impedir responder. */ }
  finally { clearTimeout(timer); }
}
