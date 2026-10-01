import test from 'node:test';
import assert from 'node:assert/strict';
import {destinatariosCorreo,validarSeleccionCorreo,prepararCorreoResend,confirmarCorreoResend,clienteResend} from '../src/modules/campaigns/email-envios.js';

const verificar=async()=>({dominio_verificado:true,remitente:'Familia <familiadelamor@familiadelamor.org>'});
const job={id:'test-job',asunto:'Hola',mensaje:'Gracias <amigos>',destinatarios:[{correo:'a@example.com'},{correo:'b@example.com'}]};
const permitidos=async()=>new Set(job.destinatarios.map(c=>c.correo));
test('excluye bajas compartidas, falta de consentimiento, email inválido y duplicados',()=>{
 const c=(correo,extra={})=>({correo,opt_in_email:1,...extra});
 const selected=[c('A@example.com'),c('a@example.com'),c('b@example.com',{opt_in_email:0}),c('bad'),c('c@example.com',{telefono:'600000001'}),c('d@example.com')];
 const all=[...selected,c('otro@example.com',{telefono:'+34600000001',baja:1}),c('d@example.com',{baja:1})];
 const r=destinatariosCorreo(selected,all);
 assert.deepEqual(r.data,[{correo:'a@example.com',nombre:''}]);
 assert.deepEqual(r.resumen,{seleccionados:6,baja:2,sin_permiso:1,sin_email:1,duplicados:1});
});
test('selección individual y filtros de la lista son explícitos; no acepta direcciones arbitrarias',()=>{
 assert.deepEqual(validarSeleccionCorreo({tipo:'cliente',telefono:'+34 600 000 000'}),{tipo:'cliente',telefono:'600000000'});
 assert.deepEqual(validarSeleccionCorreo({tipo:'clientes',filtros:{cerca_de:'Tordera',radio_km:'10',edad_min:'25'}}).filtros,{cerca_de:'Tordera',radio_km:'10',edad_min:'25'});
 for(const s of [{},{tipo:'cliente'},{tipo:'clientes',filtros:{correo:'x@y.com'}},{tipo:'clientes',filtros:{q:{}}}]) assert.throws(()=>validarSeleccionCorreo(s));
});
test('preparar respeta bajas de Resend, crea segmento aislado y nunca envía',async()=>{
 const calls=[], updates=[];
 await prepararCorreoResend(job,{verificar,permitidos,guardar:async c=>updates.push(c),api:async(path,method,body)=>{
   calls.push({path,method,body});
   if(path==='/segments')return {id:'segment-1'};
   if(path==='/contacts/a%40example.com')return {unsubscribed:false};
   if(path==='/contacts/b%40example.com')return {unsubscribed:true};
   if(path==='/broadcasts')return {id:'broadcast-1'};
   return {id:'a'};
 }});
 assert.equal(calls.some(c=>c.path.endsWith('/send')),false);
 assert.equal(calls.some(c=>c.path==='/contacts'&&c.method==='POST'),false);
 assert.equal(calls.filter(c=>c.path.includes('/segments/')).length,1);
 const payload=calls.find(c=>c.path==='/broadcasts').body;
 assert.equal(payload.segment_id,'segment-1');assert.deepEqual(payload.reply_to,['marketing@la-tapeta.com']);
 assert.ok(payload.html.includes('{{{RESEND_UNSUBSCRIBE_URL}}}'));assert.ok(!payload.send);
 assert.deepEqual(updates.at(-1),{broadcast_id:'broadcast-1',destinatarios:[job.destinatarios[0]],excluidos:1,estado:'preparado'});
});
test('un contacto nuevo se comprueba tras crearlo y nunca se fuerza resuscripción',async()=>{
 let found=false;const calls=[];
 await prepararCorreoResend({...job,destinatarios:[job.destinatarios[0]]},{verificar,permitidos,guardar:async()=>{},api:async(path,method,body)=>{
   calls.push({path,method,body});
   if(path==='/segments')return {id:'s'};
   if(path==='/contacts/a%40example.com')return found?{unsubscribed:false}:null;
   if(path==='/contacts'){found=true;assert.deepEqual(body,{email:'a@example.com'});return {id:'c'};}
   return {id:'b'};
 }});
 assert.equal(calls.filter(c=>c.path==='/contacts/a%40example.com').length,2);
});
test('se aborta antes de enviar si cambia el consentimiento o no es borrador',async()=>{
 const j={...job,estado:'enviando',broadcast_id:'b'};let sends=0;
 const api=async(path)=>{if(path.endsWith('/send'))sends++;return {status:'sent'};};
 await assert.rejects(confirmarCorreoResend(j,{verificar,permitidos:async()=>new Set(),api}),/permisos/);
 await assert.rejects(confirmarCorreoResend(j,{verificar,permitidos,api}),/borrador/);
 assert.equal(sends,0);
});
test('solo la confirmación envía, sin reintentar una respuesta incierta',async()=>{
 const j={...job,estado:'enviando',broadcast_id:'b'};let sends=0;
 const api=async(path)=>{if(path.endsWith('/send')){sends++;throw Error('timeout');}return {status:'draft'};};
 await assert.rejects(confirmarCorreoResend(j,{verificar,permitidos,api}),/timeout/);
 assert.equal(sends,1);
 await assert.rejects(confirmarCorreoResend({...j,estado:'preparado'},{verificar,permitidos,api}),/no está preparado/);
 assert.equal(sends,1);
});
test('fallo de proveedor no filtra respuesta sensible ni reintenta',async()=>{
 let calls=0;const api=clienteResend({env:{RESEND_API_KEY:'secreto'},pausa:async()=>{},fetcher:async()=>{calls++;return {ok:false,status:429,json:async()=>({key:'secreto'})};}});
 await assert.rejects(api('/segments','POST',{}),e=>e.message.includes('429')&&!e.message.includes('secreto'));
 assert.equal(calls,1);
});
