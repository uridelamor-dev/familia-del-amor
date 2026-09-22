import { createHmac, timingSafeEqual } from 'node:crypto';

export class CloudError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message); this.status = status; this.code = code;
  }
}
export function phone(value) {
  const n = String(value || '').replace(/[ +().-]/g, '').replace(/^00/, '');
  if (!/^[1-9]\d{7,14}$/.test(n)) throw new CloudError('Escribe el teléfono con prefijo internacional.');
  return n;
}
export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function validSignature(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || !secret || !/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false;
  return equalSecret(signature, 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
}
export function config(env = process.env) {
  const mode = env.WA_CLOUD_MODE || 'off';
  // Esta primera entrega solo habilita un piloto. No permite convertir accidentalmente el número real.
  if (!['off', 'pilot'].includes(mode)) throw new CloudError('Modo Cloud no habilitado para producción.', 503);
  const required = ['WA_CLOUD_PHONE_NUMBER_ID', 'WA_CLOUD_WABA_ID', 'WA_CLOUD_ACCESS_TOKEN',
    'WA_CLOUD_APP_SECRET', 'WA_CLOUD_VERIFY_TOKEN', 'WA_CLOUD_API_VERSION', 'WA_CLOUD_TEST_RECIPIENTS'];
  const missing = required.filter(k => !env[k]);
  const recipients = new Set(String(env.WA_CLOUD_TEST_RECIPIENTS || '').split(',').filter(Boolean).map(v => phone(v.trim())));
  if (env.WA_CLOUD_API_VERSION && !/^v\d+\.0$/.test(env.WA_CLOUD_API_VERSION)) throw new CloudError('Versión de Meta inválida.', 503);
  for (const key of ['WA_CLOUD_PHONE_NUMBER_ID', 'WA_CLOUD_WABA_ID']) {
    if (env[key] && !/^\d+$/.test(env[key])) throw new CloudError('Identificador de Meta inválido.', 503);
  }
  return { mode, ready: mode === 'pilot' && !missing.length, missing, recipients,
    phoneId: env.WA_CLOUD_PHONE_NUMBER_ID, wabaId: env.WA_CLOUD_WABA_ID,
    token: env.WA_CLOUD_ACCESS_TOKEN, secret: env.WA_CLOUD_APP_SECRET,
    verifyToken: env.WA_CLOUD_VERIFY_TOKEN, version: env.WA_CLOUD_API_VERSION };
}
export function windowOpen(lastInbound, now = Date.now()) {
  const t = new Date(lastInbound).getTime();
  return Number.isFinite(t) && t <= now && now - t < 86400000;
}
export function validateOutgoing(body, conversation, templates, now = Date.now()) {
  if (body.type === 'text') {
    if (!windowOpen(conversation.last_inbound_at, now)) throw new CloudError('Han pasado 24 horas. Usa una plantilla aprobada.', 409, 'window_closed');
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4096) throw new CloudError('El mensaje debe tener entre 1 y 4096 caracteres.');
    return { type: 'text', text: { body: body.text.trim() } };
  }
  if (body.type === 'template') {
    const found = templates.find(t => t.name === body.name && t.language === body.language && t.status === 'APPROVED');
    if (!found) throw new CloudError('La plantilla no está aprobada en ese idioma.');
    // El piloto soporta plantillas simples de texto, sin botones, cabeceras ni variables implícitas.
    const components = found.components || [];
    if (components.some(c => !['BODY', 'FOOTER'].includes(c.type))) throw new CloudError('Esta plantilla necesita componentes no habilitados en el piloto.');
    const text = components.find(c => c.type === 'BODY')?.text || '';
    const slots = [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])))].sort((a,b) => a-b);
    if (/\{\{[^\d]/.test(text) || slots.some((n,i) => n !== i+1)) throw new CloudError('Formato de variables no admitido.');
    const params = body.parameters || [];
    if (!Array.isArray(params) || params.length !== slots.length || params.some(p => typeof p !== 'string' || !p.trim() || p.length > 500)) throw new CloudError('Completa las variables de la plantilla.');
    return { type: 'template', template: { name: found.name, language: { code: found.language },
      ...(params.length ? { components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }] } : {}) } };
  }
  throw new CloudError('Tipo de mensaje no admitido.');
}
export function events(payload, cfg) {
  if (payload?.object !== 'whatsapp_business_account') return [];
  const out = [];
  for (const entry of payload.entry || []) {
    if (String(entry.id) !== cfg.wabaId) continue;
    for (const change of entry.changes || []) {
      const v = change.value;
      if (change.field !== 'messages' || String(v?.metadata?.phone_number_id) !== cfg.phoneId) continue;
      for (const m of v.messages || []) {
        let from; try { from = phone(m.from); } catch { continue; }
        if (!m.id || !/^\d+$/.test(String(m.timestamp)) || !cfg.recipients.has(from)) continue;
        const at = new Date(Number(m.timestamp) * 1000);
        if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 60000) continue;
        const media = ['image','audio','video','document','sticker'].includes(m.type) ? m[m.type] : null;
        const text = m.text?.body || media?.caption || m.button?.text || m.interactive?.button_reply?.title
          || m.interactive?.list_reply?.title || (m.type === 'location' ? [m.location?.name, m.location?.address].filter(Boolean).join(' · ') : '') || `[${m.type || 'Mensaje no compatible'}]`;
        out.push({ kind: 'message', id: String(m.id), phone: from, type: m.type || 'unknown', text,
          at: at.toISOString(), name: v.contacts?.find(c => c.wa_id === from)?.profile?.name || '',
          mediaId: media?.id || null, mime: media?.mime_type || null,
          filename: media?.filename || null, replyTo: m.context?.id || null });
      }
      for (const s of v.statuses || []) {
        if (!s.id || !['sent','delivered','read','failed'].includes(s.status)) continue;
        out.push({ kind: 'status', id: String(s.id), status: s.status,
          error: s.errors?.[0]?.code ? String(s.errors[0].code) : null,
          phone: s.recipient_id || null, reference: s.biz_opaque_callback_data || null });
      }
    }
  }
  return out;
}
export function nextStatus(current, next) {
  const rank = { preparing: 0, sending: 1, uncertain: 1, accepted: 2, failed: 2.5, sent: 3, delivered: 4, read: 5 };
  return (rank[next] ?? -1) > (rank[current] ?? -1) ? next : current;
}
