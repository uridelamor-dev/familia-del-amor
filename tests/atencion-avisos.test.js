import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avisoAtencion,contactoAtendible} from '../src/modules/messaging/atencion.js';
const ahora=new Date('2026-10-20T13:00:00Z');
const tarea=(n,extra={})=>({jid:`3460000000${n}@s.whatsapp.net`,nombre:'Cliente '+n,fecha_cliente:'2026-10-20T12:00:00Z',ultimo_texto:'Quiero reservar para cuatro personas',motivo:'sin_respuesta',...extra});
test('aviso limpio: nombres, fechas, contexto y separación sin acusar al equipo',()=>{
 const texto=avisoAtencion([tarea(1),tarea(2,{nombre:'Carla',fecha_cliente:'2026-10-17T07:00:00Z',ultimo_texto:'Al final tendremos que anular'})],1,ahora);
 assert.match(texto,/Últimas 24 horas/);assert.match(texto,/Conversaciones anteriores/);
 assert.match(texto,/Carla/);assert.match(texto,/17 oct/);assert.match(texto,/Al final tendremos que anular/);
 assert.match(texto,/Comprobar si ya se atendió/);assert.doesNotMatch(texto,/Responsable:|Sin respuesta registrada/);
});
test('lista acotada, texto sin formato inyectado y sin teléfonos ficticios',()=>{
 const tareas=Array.from({length:8},(_,n)=>tarea(n,{ultimo_texto:'*urgente*\n'+ 'a'.repeat(600)}));
 const texto=avisoAtencion([...tareas,tarea(9,{jid:'0@s.whatsapp.net'})],2,ahora);
 assert.match(texto,/8 conversaciones/);assert.match(texto,/Y 5 más/);assert.equal((texto.match(/Último mensaje:/g)||[]).length,3);
 assert.ok(texto.length<1500);assert.doesNotMatch(texto,/\+0|\*urgente\*/);
 assert.equal(contactoAtendible('0@s.whatsapp.net'),false);assert.equal(avisoAtencion([{jid:'0@s.whatsapp.net'}],1),'');
 const lid=avisoAtencion([tarea(1,{jid:'123456789012345@lid',nombre:'Contacto de WhatsApp'})],1,ahora);
 assert.doesNotMatch(lid,/123456789012345/);
});
