import { consultarDominioResend, htmlCorreo } from './email.js';

export const ENVIOS_SCHEMA = `CREATE TABLE IF NOT EXISTS correo_envios (
 id UUID PRIMARY KEY, autor INTEGER NOT NULL, asunto TEXT NOT NULL, mensaje TEXT NOT NULL,
 seleccion JSONB NOT NULL, destinatarios JSONB NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente',
 procesados INTEGER NOT NULL DEFAULT 0, excluidos INTEGER NOT NULL DEFAULT 0,
 segment_id TEXT, broadcast_id TEXT, error TEXT,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(), actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
const email = c => String(c.correo || '').trim().toLowerCase();
const tel = c => String(c.telefono || '').replace(/\D/g,'').slice(-9);
export function destinatariosCorreo(seleccionados, todos = seleccionados) {
 const bajasEmail = new Set(todos.filter(c=>Number(c.baja)===1).map(email).filter(Boolean));
 const bajasTel = new Set(todos.filter(c=>Number(c.baja)===1).map(tel).filter(Boolean));
 const vistos = new Set(), data = [];
 const resumen = {seleccionados:seleccionados.length, baja:0, sin_permiso:0, sin_email:0, duplicados:0};
 for (const c of seleccionados) {
   const correo = email(c);
   if (Number(c.baja)===1 || bajasEmail.has(correo) || (tel(c) && bajasTel.has(tel(c)))) {resumen.baja++;continue;}
   if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(correo)) {resumen.sin_email++;continue;}
   if (Number(c.opt_in_email)!==1) {resumen.sin_permiso++;continue;}
   if (vistos.has(correo)) {resumen.duplicados++;continue;}
   vistos.add(correo); data.push({correo,nombre:String(c.nombre||'')});
 }
 return {data,resumen};
}
export function validarSeleccionCorreo(s) {
 if (!s || !['cliente','clientes','canjes'].includes(s.tipo)) throw Error('Selecciona los destinatarios');
 if (s.tipo==='cliente') {
   const telefono=String(s.telefono||'').replace(/\D/g,'').slice(-9);
   if (!/^\d{9}$/.test(telefono)) throw Error('Cliente no válido');
   return {tipo:s.tipo,telefono};
 }
 const keys=s.tipo==='canjes' ? ['fecha','local','promocion'] : ['poblacion','cerca_de','radio_km','q','local','cumple_mes','con_email','con_telefono','edad_min','edad_max','reservo_from','reservo_to','cumple_en_dias','estado_comunicaciones','excluir_baja'];
 const filtros={};
 if (s.filtros && (typeof s.filtros!=='object' || Array.isArray(s.filtros))) throw Error('Filtros no válidos');
 for (const [k,v] of Object.entries(s.filtros||{})) {
   if (!keys.includes(k) || !['string','number','boolean'].includes(typeof v) || String(v).length>200) throw Error('Filtro no válido: '+k);
   filtros[k]=v;
 }
 return {tipo:s.tipo,filtros};
}

// No automatic retries for mutations: an uncertain send must be reconciled, never duplicated.
export function clienteResend({env=process.env,fetcher=fetch,pausa=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
 return async (path,method='GET',body,allow404=false) => {
   await pausa(600);
   const r=await fetcher('https://api.resend.com'+path,{method,headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
     ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
   if (allow404 && r.status===404) return null;
   if (!r.ok) throw Error(`Resend no ha aceptado la operación (${r.status}). Revisa los límites del plan o la configuración en Resend.`);
   return r.json();
 };
}

// Preparation uploads only the selected, consented addresses, in a fresh isolated segment.
// It NEVER sends. A separate authenticated confirmation is required once ready.
export async function prepararCorreoResend(job,{api=clienteResend(),guardar,permitidos,verificar=consultarDominioResend}={}) {
 const config=await verificar();
 if (!config.dominio_verificado) throw Error('El dominio no está verificado');
 const allowed=await permitidos();
 const candidates=job.destinatarios.filter(c=>allowed.has(c.correo));
 if (!candidates.length) throw Error('No quedan destinatarios autorizados');
 const segment=await api('/segments','POST',{name:'Panel '+job.id});
 if (!segment.id) throw Error('No se pudo preparar la lista');
 await guardar({segment_id:segment.id});
 const finales=[];
 let procesados=0;
 for (const c of candidates) {
   const path='/contacts/'+encodeURIComponent(c.correo);
   let contact=await api(path,'GET',undefined,true);
   if (!contact) {
     // Omit unsubscribed: never overwrite a pre-existing opt-out in a create race.
     await api('/contacts','POST',{email:c.correo});
     contact=await api(path);
   }
   if (contact?.unsubscribed===false) {
     await api(path+'/segments/'+encodeURIComponent(segment.id),'POST');
     finales.push(c);
   }
   await guardar({procesados:++procesados});
 }
 if (!finales.length) throw Error('Todos los destinatarios están dados de baja en Resend');
 const broadcast=await api('/broadcasts','POST',{segment_id:segment.id,name:'Panel '+job.id,
   from:config.remitente,reply_to:['marketing@la-tapeta.com'],subject:job.asunto,html:htmlCorreo(job.mensaje)});
 if (!broadcast.id) throw Error('Resend no confirmó el borrador');
 await guardar({broadcast_id:broadcast.id,destinatarios:finales,excluidos:job.destinatarios.length-finales.length,estado:'preparado'});
}

export async function confirmarCorreoResend(job,{api=clienteResend(),permitidos,verificar=consultarDominioResend}={}) {
 if (job.estado!=='enviando' || !job.broadcast_id) throw Error('El correo no está preparado');
 const config=await verificar();
 if (!config.dominio_verificado) throw Error('El dominio no está verificado');
 const allowed=await permitidos();
 if (!job.destinatarios.length || job.destinatarios.some(c=>!allowed.has(c.correo))) throw Error('Han cambiado los permisos de los destinatarios. Prepara de nuevo el correo antes de enviarlo.');
 const b=await api('/broadcasts/'+encodeURIComponent(job.broadcast_id));
 if (b.status!=='draft') throw Error('Este correo ya no es un borrador en Resend. Revisa su estado antes de repetirlo.');
 const result=await api('/broadcasts/'+encodeURIComponent(job.broadcast_id)+'/send','POST',{});
 if (!result.id) throw Error('No se ha recibido confirmación del envío. Revisa Resend antes de repetirlo.');
 return result;
}
