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
test('solo descarta despedidas inequívocas, nunca confirmaciones o peticiones',async()=>{
 const {cierreCortesia}=await import('../src/modules/messaging/atencion.js');
 for(const m of ['Gracias!','Moltes gràcies 😊','Thank you','Hasta luego'])assert.equal(cierreCortesia(m),true);
 for(const m of ['Ok','Sí','Perfecto','Gracias, quiero cancelar','Gracias ¿a qué hora?','Gracias 2 personas',''])assert.equal(cierreCortesia(m),false,m);
});
test('Dirección recibe solo después de Laura y su recordatorio; en curso tiene más plazo',async()=>{
 const {nivelAviso}=await import('../src/modules/messaging/atencion.js');
 const hace=m=>new Date(+ahora-m*60000).toISOString();
 const t={abierta_en:hace(180),estado:'pendiente'};
 assert.equal(nivelAviso({...t,aviso_nivel:0},ahora),1);
 assert.equal(nivelAviso({...t,aviso_nivel:1,aviso_en:hace(31)},ahora),2);
 assert.equal(nivelAviso({...t,aviso_nivel:2,aviso_en:hace(20)},ahora),0);
 assert.equal(nivelAviso({...t,aviso_nivel:2,aviso_en:hace(61)},ahora),3);
 assert.equal(nivelAviso({...t,estado:'en_curso',actualizada_en:hace(30),aviso_nivel:2,aviso_en:hace(61)},ahora),0);
 assert.equal(nivelAviso({...t,abierta_en:hace(300),estado:'en_curso',actualizada_en:hace(241),aviso_nivel:2,aviso_en:hace(61)},ahora),3);
});
test('el aviso explica el bloqueo conservado aunque el cliente diga gracias',()=>{
 const texto=avisoAtencion([tarea(1,{motivo:'consulta',resumen:'Quiere cambiar el día del descuento; falta autorizar la excepción.',ultimo_texto:'Gracias'})],1,ahora);
 assert.match(texto,/Motivo de revisión: Quiere cambiar/);
 assert.match(texto,/Qué falta: Resolver la duda/);
 assert.match(texto,/Último mensaje: «Gracias»/);
});
