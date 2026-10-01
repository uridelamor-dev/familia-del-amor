// Preparación de campañas. Guardar un borrador nunca envía ni exporta contactos.
export const EMAIL_SCHEMA = `CREATE TABLE IF NOT EXISTS campanas_email (
 id SERIAL PRIMARY KEY, autor INTEGER NOT NULL, asunto TEXT NOT NULL,
 mensaje TEXT NOT NULL, filtros_json TEXT NOT NULL, destinatarios INTEGER NOT NULL,
 estado TEXT NOT NULL DEFAULT 'borrador', creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

const escape = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validarCorreo(body = {}) {
 const asunto = String(body.asunto || '').trim();
 const mensaje = String(body.mensaje || '').trim();
 if (!asunto || asunto.length > 200 || /[\r\n]/.test(asunto)) throw new Error('Indica un asunto de hasta 200 caracteres, en una sola línea');
 if (!mensaje || mensaje.length > 20000) throw new Error('Indica un mensaje de hasta 20.000 caracteres');
 // No se permite inyectar variables de Resend desde contenido libre.
 if (/\{\{\{/.test(mensaje)) throw new Error('El mensaje contiene una etiqueta no permitida');
 const filtros = {};
 for (const key of ['fecha','local','promocion']) {
   const value = body.filtros?.[key];
   if (value !== undefined && (typeof value !== 'string' || value.length > 200)) throw new Error('Filtro no válido');
   if (value) filtros[key] = value;
 }
 return {asunto, mensaje, filtros};
}

export function htmlCorreo(mensaje, {prueba=false}={}) {
 return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#203e35;line-height:1.6"><h2>Familia del Amor</h2>${mensaje.split(/\n\s*\n/).map(p=>`<p>${escape(p).replace(/\n/g,'<br>')}</p>`).join('')}<hr><p style="font-size:12px">${prueba ? 'Vista de prueba interna · no se ha enviado a clientes' : '<a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Dejar de recibir estas comunicaciones</a>'}</p></div>`;
}

export function configuracionCorreo(env = process.env) {
 const from = String(env.RESEND_FROM || '').trim();
 const address = from.match(/<([^<>]+)>$/)?.[1] || from;
 const valida = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) && !/[\r\n]/.test(from);
 return {proveedor:'Resend', remitente:valida ? from : null,
   credencial_configurada:!!env.RESEND_API_KEY, remitente_configurado:valida,
   dominio_id_configurado:!!env.RESEND_DOMAIN_ID,
   envio_habilitado:false, prueba_habilitada:env.RESEND_TEST_ENABLED==='true' && !!env.RESEND_API_KEY && valida,
   destinatario_prueba:'marketing@la-tapeta.com'};
}

export async function consultarDominioResend({env=process.env, fetcher=fetch}={}) {
 const config = configuracionCorreo(env);
 if (!config.credencial_configurada || !config.remitente_configurado || !config.dominio_id_configurado) return {...config, dominio_verificado:false};
 if (!/^[a-zA-Z0-9-]+$/.test(env.RESEND_DOMAIN_ID)) throw new Error('Identificador de dominio no válido');
 const r = await fetcher(`https://api.resend.com/domains/${env.RESEND_DOMAIN_ID}`, {
   headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`}, signal:AbortSignal.timeout(10000)
 });
 if (!r.ok) throw new Error('No se pudo comprobar el dominio en Resend');
 const d = await r.json();
 const domain = (config.remitente.match(/<([^<>]+)>$/)?.[1] || config.remitente).split('@')[1].toLowerCase();
 return {...config,dominio_verificado:d.status==='verified' && String(d.name).toLowerCase()===domain};
}

// El destino de prueba es fijo: ningún dato de clientes se transmite a Resend.
export async function enviarPruebaCorreo(body, {env=process.env,fetcher=fetch,idempotencyKey}={}) {
 const contenido=validarCorreo(body);
 if (!configuracionCorreo(env).prueba_habilitada) throw new Error('Las pruebas de correo todavía no están configuradas');
 if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey||'')) throw new Error('Identificador de prueba no válido');
 const estado=await consultarDominioResend({env,fetcher});
 if (!estado.dominio_verificado) throw new Error('El dominio todavía no está verificado en Resend');
 const response=await fetcher('https://api.resend.com/emails', {
   method:'POST', headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
   signal:AbortSignal.timeout(15000),
   body:JSON.stringify({from:estado.remitente,to:['marketing@la-tapeta.com'],reply_to:'marketing@la-tapeta.com',
     subject:'[PRUEBA] '+contenido.asunto,html:htmlCorreo(contenido.mensaje,{prueba:true}),text:contenido.mensaje+'\n\nPrueba interna. No se ha enviado a clientes.'})
 });
 if (!response.ok) throw new Error('Resend no ha confirmado el envío. Reintenta la misma prueba para evitar duplicados');
 const result=await response.json();
 if (!result.id) throw new Error('Resend no ha confirmado el envío');
 return {id:result.id,destinatario:'marketing@la-tapeta.com',estado:'aceptado'};
}
