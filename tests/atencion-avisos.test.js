import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avisoAtencion,contactoAtendible} from '../src/modules/messaging/atencion.js';
const ahora=new Date('2026-10-20T13:00:00Z');
const tarea=(n,extra={})=>({jid:`3460000000${n}@s.whatsapp.net`,nombre:'Cliente '+n,fecha_cliente:'2026-10-20T12:00:00Z',ultimo_texto:'Quiero reservar para cuatro personas',estado:'pendiente',motivo:'consulta',resumen:'Hace falta aprobar el presupuesto solicitado.',...extra});
test('el aviso pone primero el cliente y la acción y enlaza cada conversación',()=>{
 const texto=avisoAtencion([tarea(1,{motivo:'pidio_persona',nombre:'Marc'}),tarea(2,{nombre:'Carla',estado:'en_curso',responsable:'Laura'})],1);
 assert.match(texto,/Laura, atención al cliente/);
 assert.match(texto,/Marc.*Ha pedido hablar con una persona/);
 assert.match(texto,/Carla.*Revisa y responde/);
 assert.match(texto,/Lo está gestionando Laura/);
 assert.match(texto,/#conversaciones\/34600000001%40s.whatsapp.net/);
 assert.doesNotMatch(texto,/Últimas 24 horas|Último mensaje:|Motivo de revisión:|Responsable:/);
});
test('lista acotada, texto sin formato inyectado y sin teléfonos ficticios',()=>{
 const tareas=Array.from({length:8},(_,n)=>tarea(n,{resumen:'*urgente*\n'+ 'a'.repeat(600)}));
 const texto=avisoAtencion([...tareas,tarea(9,{jid:'0@s.whatsapp.net'})],2,ahora);
 assert.match(texto,/Hay 2 más/);assert.equal((texto.split('#conversaciones/').length-1),6);
 assert.ok(texto.length<2800);assert.doesNotMatch(texto,/\+0|\*urgente\*/);
 assert.equal(contactoAtendible('0@s.whatsapp.net'),false);assert.equal(avisoAtencion([{jid:'0@s.whatsapp.net'}],1),'');
 const lid=avisoAtencion([tarea(1,{jid:'123456789012345@lid',nombre:'Contacto de WhatsApp'})],1,ahora);
 assert.doesNotMatch(lid.replace(/https?:\/\/\S+/g,''),/123456789012345/);
 assert.match(lid,/#conversaciones\/123456789012345%40lid/);
});
test('solo descarta despedidas inequívocas, nunca confirmaciones o peticiones',async()=>{
 const {cierreCortesia}=await import('../src/modules/messaging/atencion.js');
 for(const m of ['Gracias!','Moltes gràcies 😊','Thank you','Hasta luego'])assert.equal(cierreCortesia(m),true);
 for(const m of ['Ok','Sí','Perfecto','Gracias, quiero cancelar','Gracias ¿a qué hora?','Gracias 2 personas',''])assert.equal(cierreCortesia(m),false,m);
});
test('Laura recibe el primer aviso incluso de noche y el siguiente día a las nueve de Madrid',async()=>{
 const {nivelAviso}=await import('../src/modules/messaging/atencion.js');
 // El sábado todavía es horario de verano, el domingo ya es hora de invierno.
 const t={abierta_en:'2026-10-24T20:20:00Z',estado:'pendiente'};
 assert.equal(nivelAviso(t,new Date('2026-10-24T20:20:00Z')),1);
 const avisada={...t,aviso_nivel:1,aviso_en:t.abierta_en};
 assert.equal(nivelAviso(avisada,new Date('2026-10-24T21:55:00Z')),0);
 assert.equal(nivelAviso(avisada,new Date('2026-10-25T07:59:59Z')),0);
 assert.equal(nivelAviso(avisada,new Date('2026-10-25T08:00:00Z')),2);
 assert.equal(nivelAviso(avisada,new Date('2026-10-26T00:00:00Z')),2);
});
test('Dirección solo recibe un aviso a las 72 horas si el caso sigue sin tomar',async()=>{
 const {nivelAviso}=await import('../src/modules/messaging/atencion.js');
 const t={abierta_en:'2026-10-24T20:20:00Z',estado:'pendiente',aviso_nivel:2};
 assert.equal(nivelAviso(t,new Date('2026-10-27T20:19:59Z')),0);
 assert.equal(nivelAviso(t,new Date('2026-10-27T20:20:00Z')),3);
 assert.equal(nivelAviso({...t,estado:'en_curso'},new Date('2026-10-27T20:20:00Z')),0);
 assert.equal(nivelAviso({...t,estado:'resuelta'},new Date('2026-10-27T20:20:00Z')),0);
 assert.equal(nivelAviso({...t,aviso_nivel:3},new Date('2026-10-27T20:20:00Z')),0);
});
test('el aviso explica el bloqueo conservado aunque el cliente diga gracias',()=>{
 const texto=avisoAtencion([tarea(1,{motivo:'consulta',resumen:'Quiere cambiar el día del descuento; falta autorizar la excepción.',ultimo_texto:'Gracias'})],1,ahora);
 assert.match(texto,/Quiere cambiar el día del descuento/);
 assert.match(texto,/Revisa y responde a esta consulta/);
 assert.doesNotMatch(texto,/Gracias/);
});

test('avisos y escalado descartan resueltas, grupos y pendientes automáticos',()=>{
 for(const extra of [{estado:'resuelta'},{motivo:'sin_respuesta'},{jid:'123@g.us'},{interno:true}])assert.equal(avisoAtencion([tarea(1,extra)],1,ahora),'');
});
