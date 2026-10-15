import {randomUUID,createHash} from 'node:crypto';
import {disponible,valorar,audit} from './servicio.js';
const clean=(v,n=160)=>typeof v==='string'?v.trim().slice(0,n):'';
export const CONSENTIMIENTO_LOTES='Quiero recibir por WhatsApp las propuestas de lotes de próximas campañas de Família del Amor.';
export function telefonoSolicitud(value){
 let t=clean(value,40).replace(/[\s().-]/g,'');
 if(/^\d{9}$/.test(t))t='34'+t;
 t=t.replace(/^00/,'').replace(/^\+/,'');
 if(!/^[1-9]\d{7,14}$/.test(t))throw new Error('Indica un teléfono válido, con prefijo si no es de España');
 return t;
}
export function prepararSolicitud(s,b){
 disponible(s);
 if(!/^[a-zA-Z0-9-]{16,100}$/.test(b.key||''))throw new Error('Solicitud no válida');
 const keyHash=createHash('sha256').update(b.key).digest('hex');
 const old=s.quotes.find(d=>d.keyHash===keyHash);if(old)return {doc:old,replayed:true};
 const name=clean(b.contact?.name),phone=telefonoSolicitud(b.contact?.phone);
 if(!name||b.accepted!==true)throw new Error('Indica tu nombre y revisa la información de privacidad');
 if(!['es','ca'].includes(b.lang))throw new Error('Idioma no válido');
 if(!Array.isArray(b.lineas)||b.lineas.length>60||b.lotes>10000)throw new Error('Revisa las cantidades');
 const snapshot=valorar(s,b),id=randomUUID(),now=new Date().toISOString();
 const campaign='Navidad '+new Intl.DateTimeFormat('es',{timeZone:'Europe/Madrid',year:'numeric'}).format(new Date());
 const doc={id,keyHash,reference:`SOL-${now.slice(0,4)}-${id.slice(0,8).toUpperCase()}`,createdAt:now,lang:b.lang,campaign,
 contact:{name,phone,company:clean(b.contact?.company),email:'',taxId:'',address:''},request:{lineas:b.lineas,lotes:b.lotes,deliveryId:b.deliveryId},snapshot,
 deliveryName:s.config.delivery.find(d=>d.id===b.deliveryId)?.name?.es||'Por concretar',notes:clean(b.notes,2000),dedication:'',
 marketingConsent:b.marketingConsent===true,consentText:b.marketingConsent===true?(b.lang==='ca'?'Vull rebre per WhatsApp les propostes de lots de pròximes campanyes de Família del Amor (opcional).':CONSENTIMIENTO_LOTES.replace(/\.$/,' (opcional).')):null,termsVersion:'solicitudes-lotes-v1',
 payment:'sin_pago',logistics:'sin_preparar',status:'solicitado',commercialStatus:'Nueva',versions:[],demo:false,source:'tienda_lotes'};
 s.quotes.push(doc);s.outbox.push({id:randomUUID(),record:id,kind:'solicitud_lotes',status:'pendiente',createdAt:now});audit(s,null,'solicitud_lotes',id);
 return {doc,replayed:false};
}
export async function registrarLead(c,d){
 if(!c)throw new Error('Registro de solicitudes no disponible');
 // Bloqueo por teléfono: dos solicitudes concurrentes no crean dos fichas.
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['tienda-lead:'+d.contact.phone]);
 const match=await c.query("SELECT id FROM leads WHERE regexp_replace(telefono,'[^0-9]','','g')=ANY($1::text[]) ORDER BY id LIMIT 1",[[d.contact.phone,'+'+d.contact.phone,...(d.contact.phone.startsWith('34')&&d.contact.phone.length===11?[d.contact.phone.slice(2)]:[])]]);
 let leadId=match.rows[0]?.id;
 if(!leadId){const r=await c.query("INSERT INTO leads(nombre,telefono,fuente,creado_en,actualizado_en) VALUES($1,$2,'tienda_lotes',$3,$3) RETURNING id",[d.contact.name,d.contact.phone,d.createdAt]);leadId=r.rows[0].id;}
 d.leadId=leadId;
 await c.query(`INSERT INTO cliente_hechos(telefono,etiqueta,valor,texto_original,fuente,estado,creado_en,creado_por,confirmado_por,confirmado_en) VALUES($1,'interes_lotes',$2,$3,'tienda','confirmado',$4,'cliente','cliente',$4)`,[d.contact.phone,`${d.campaign} · ${d.reference}`,mensajeSolicitud(d),d.createdAt]);
 // Consentimiento limitado a lotes, conservado junto a la solicitud. No amplía preferencias generales ni revoca bajas.
}
export function mensajeSolicitud(d){
 const euro=n=>(n/100).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
 const s=d.snapshot;
 return `🛍️ *NUEVA SOLICITUD · LOTES*\n${d.reference}\n\n${d.contact.name}${d.contact.company?' · '+d.contact.company:''}\nTeléfono: +${d.contact.phone}\n\n${s.lineas.map(l=>`• ${l.cantidad} × ${l.name.es}`).join('\n')}\n\n*Importe orientativo: ${s.totalCents==null?'por confirmar':euro(s.totalCents)}*${s.totalCents==null?`\nProductos: ${euro(s.baseCents)} sin IVA · impuestos y/o transporte por concretar`:''}\nEntrega: ${d.deliveryName}\n${d.notes?'\nComentarios: '+d.notes+'\n':''}\nContactar: https://wa.me/${d.contact.phone}\n\nGuardada en Tienda / Lotes → Presupuestos y en CRM. Sin pago ni reserva de stock.`;
}
export function crearAvisosSolicitudes({pool,store,conectado,enviar,enabled=false}){
 let busy=false;
 return async function tick(){
 if(!enabled||busy||!conectado())return;busy=true;let c,locked=false;
 try{
 if(!(await store.read()).outbox.some(j=>j.kind==='solicitud_lotes'&&['pendiente','enviando'].includes(j.status)))return;
 c=await pool.connect();locked=(await c.query('SELECT pg_try_advisory_lock(812764104) AS ok')).rows[0].ok;if(!locked)return;
 const job=await store.mutate(s=>{
 // Un envío interrumpido puede haber llegado. Se conserva para revisión, nunca se repite a ciegas.
 for(const j of s.outbox)if(j.kind==='solicitud_lotes'&&j.status==='enviando')j.status='revisar';
 const j=s.outbox.filter(j=>j.kind==='solicitud_lotes'&&j.status==='pendiente').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];if(!j)return null;
 const d=s.quotes.find(d=>d.id===j.record);if(!d){j.status='revisar';return null;}j.status='enviando';return {id:j.id,doc:d};
 });
 if(!job)return;
 let status='enviado';
 try{if(!conectado())status='pendiente';else await enviar('622149946',mensajeSolicitud(job.doc),{origen:'sistema',tipoMensaje:'solicitud_lotes'});}catch(e){status=/WhatsApp no conectado/.test(e.message)?'pendiente':'revisar';}
 await store.mutate(s=>{const j=s.outbox.find(j=>j.id===job.id);j.status=status;j.updatedAt=new Date().toISOString();});
 }finally{try{if(locked)await c.query('SELECT pg_advisory_unlock(812764104)');}finally{c?.release();busy=false;}}
 };
}
