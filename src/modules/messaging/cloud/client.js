import { CloudError } from './protocol.js';

export function createClient(cfg, fetcher = fetch) {
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetcher(`https://graph.facebook.com/${cfg.version}/${path}`, {
        ...options, headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', ...options.headers },
        signal: AbortSignal.timeout(20000), redirect: 'error',
      });
    } catch { throw new CloudError('No se pudo confirmar la respuesta de Meta. No reenvíes hasta comprobar el estado.', 502, 'uncertain'); }
    let data; try { data = await response.json(); } catch { throw new CloudError('Respuesta de Meta no reconocida.', 502, 'uncertain'); }
    if (!response.ok || data.error) throw new CloudError(`Meta rechazó la operación${data.error?.code ? ` (${Number(data.error.code)})` : ''}.`, 502, 'meta_rejected');
    return data;
  }
  return {
    async send(to, message, reference) {
      const result = await request(`${cfg.phoneId}/messages`, { method: 'POST', body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message,
        biz_opaque_callback_data: reference,
      }) });
      if (!result.messages?.[0]?.id) throw new CloudError('Meta no devolvió el identificador del envío.', 502, 'uncertain');
      return result.messages[0].id;
    },
    async templates() {
      const result = await request(`${cfg.wabaId}/message_templates?fields=name,language,status,components&limit=100`);
      return result.data || [];
    },
    async identity() { return request(`${cfg.phoneId}?fields=display_phone_number,verified_name`); },
    async media(id) {
      if (!/^\d+$/.test(id)) throw new CloudError('Adjunto inválido.');
      const info = await request(id);
      const url = new URL(info.url);
      if (url.protocol !== 'https:' || !(url.hostname.endsWith('.facebook.com') || url.hostname.endsWith('.fbcdn.net') || url.hostname === 'lookaside.fbsbx.com')) throw new CloudError('Origen del adjunto no permitido.', 502);
      const response = await fetcher(url, { headers: { Authorization: `Bearer ${cfg.token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok || Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new CloudError('No se puede descargar el adjunto (máximo 20 MB).', 502);
      const chunks = []; let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > 20 * 1024 * 1024) { throw new CloudError('Adjunto demasiado grande.', 413); }
        chunks.push(chunk);
      }
      return { buffer: Buffer.concat(chunks), mime: info.mime_type || 'application/octet-stream' };
    },
  };
}
