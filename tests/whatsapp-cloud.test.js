import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { config, validSignature, equalSecret, events, windowOpen, validateOutgoing, nextStatus, phone } from '../src/modules/messaging/cloud/protocol.js';
import { createClient } from '../src/modules/messaging/cloud/client.js';
const cfg={phoneId:'10',wabaId:'20',recipients:new Set(['34600000001'])};
const incoming = {object:'whatsapp_business_account',entry:[{id:'20',changes:[{field:'messages',value:{metadata:{phone_number_id:'10'},contacts:[{wa_id:'34600000001',profile:{name:'Prueba'}}],messages:[{id:'wamid.1',from:'34600000001',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Hola'}}]}}]}]};

test('firma: verifica los bytes exactos y rechaza firma ausente o cuerpo alterado',()=>{
 const raw=Buffer.from('{"entry":[]}'),secret='prueba-no-real';
 const sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(validSignature(raw,sig,secret),true);
 assert.equal(validSignature(Buffer.from('{"entry":[1]}'),sig,secret),false);
 assert.equal(validSignature(raw,undefined,secret),false);
 assert.equal(validSignature(raw,sig,''),false);
 assert.equal(equalSecret('', ''),false);
});
test('el piloto no puede activar producción ni quedar listo sin configuración',()=>{
 assert.equal(config({}).ready,false);
 assert.throws(()=>config({WA_CLOUD_MODE:'production'}));
 assert.throws(()=>config({WA_CLOUD_API_VERSION:'../../foo'}));
 assert.equal(phone('+34 600 000 001'),'34600000001');
 assert.throws(()=>phone('600000001@s.whatsapp.net'));
});
test('solo acepta mensajes del número, cuenta y destinatarios de prueba autorizados',()=>{
 assert.equal(events(incoming,cfg).length,1);
 assert.equal(events(incoming,{...cfg,wabaId:'21'}).length,0);
 assert.equal(events(incoming,{...cfg,phoneId:'11'}).length,0);
 assert.equal(events(incoming,{...cfg,recipients:new Set()}).length,0);
});
test('24 horas desde el cliente: ni fecha futura ni un formulario permiten texto libre',()=>{
 const now=Date.now();assert.equal(windowOpen(new Date(now-86399999),now),true);
 assert.equal(windowOpen(new Date(now-86400000),now),false);
 assert.equal(windowOpen(null,now),false);assert.equal(windowOpen(new Date(now+1),now),false);
 assert.throws(()=>validateOutgoing({type:'text',text:'Hola'},{last_inbound_at:null},[],now),/24 horas/);
});
test('plantillas: aprobación, idioma y parámetros exactos, sin botones implícitos',()=>{
 const t={name:'prueba',language:'es',status:'APPROVED',components:[{type:'BODY',text:'Hola {{1}}'}]};
 assert.throws(()=>validateOutgoing({type:'template',name:'prueba',language:'ca',parameters:['Ana']},{},[t]));
 assert.throws(()=>validateOutgoing({type:'template',name:'prueba',language:'es',parameters:[]},{},[t]));
 assert.equal(validateOutgoing({type:'template',name:'prueba',language:'es',parameters:['Ana']},{},[t]).template.components[0].parameters[0].text,'Ana');
 assert.throws(()=>validateOutgoing({type:'template',name:'prueba',language:'es',parameters:['Ana']},{},[{...t,components:[...t.components,{type:'BUTTONS'}]}]));
});
test('un estado retrasado nunca rebaja una entrega o lectura',()=>{
 assert.equal(nextStatus('read','sent'),'read');assert.equal(nextStatus('delivered','failed'),'delivered');
 assert.equal(nextStatus('uncertain','delivered'),'delivered');
});
test('un corte de red se marca incierto y no se reintenta automáticamente',async()=>{
 let calls=0;const client=createClient({version:'v99.0',token:'secret',phoneId:'10'},async()=>{calls++;throw new Error('network token=secret');});
 await assert.rejects(client.send('34600000001',{type:'text',text:{body:'Hola'}},'id'),e=>e.code==='uncertain' && !e.message.includes('secret'));
 assert.equal(calls,1);
});
