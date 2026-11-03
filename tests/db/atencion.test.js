import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {ATENCION_SCHEMA,crearAtencion,pausaBloqueante,nivelAviso} from '../../src/modules/messaging/atencion.js';
import {VINCULOS_SCHEMA} from '../../src/modules/messaging/contacto-conversacion.js';
import {BANDEJA_SCHEMA} from '../../src/modules/messaging/bandeja-historial.js';
test('consulta automática no bloquea, persona y toma manual sí',()=>{
 assert.equal(pausaBloqueante({estado_ia:'pausada',pausado_por:'sara',pausa_motivo:'consulta'}),false);
 for(const ficha of [{pausado_por:'Laura',pausa_motivo:'consulta'},{pausado_por:'sara',pausa_motivo:'pidio_persona'},{}])assert.equal(pausaBloqueante({estado_ia:'pausada',...ficha}),true);
 assert.equal(pausaBloqueante(null),false);
});
test('avisos: horario Madrid, escalado, no duplicados ni resueltas',()=>{
 const ahora=new Date('2026-10-20T12:00:00Z');
 for(const [mins,n] of [[0,1],[31,1],[61,1]])assert.equal(nivelAviso({estado:'pendiente',motivo:'consulta',abierta_en:new Date(+ahora-mins*60000),aviso_nivel:0},ahora),n);
 assert.equal(nivelAviso({abierta_en:ahora,estado:'resuelta'},ahora),0);
 assert.equal(nivelAviso({abierta_en:ahora},new Date('2026-10-20T22:00:00Z')),0);
 assert.equal(nivelAviso({abierta_en:ahora,aviso_nivel:3},ahora),0);
});
test('SQL real: tareas, toma, cierre, nuevo mensaje y recuperación idempotente',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 await db.raw(BANDEJA_SCHEMA);await db.raw(ATENCION_SCHEMA);
 await db.raw('CREATE TABLE whatsapp_messages(id SERIAL PRIMARY KEY,jid TEXT,telefono TEXT,mensaje TEXT,respuesta TEXT,tipo TEXT,creado_en TEXT,adjuntos JSONB,historico INTEGER DEFAULT 0)');
 await db.raw('CREATE TABLE wa_clientes(jid TEXT PRIMARY KEY,estado_ia TEXT,pausa_motivo TEXT,nombre TEXT,telefono TEXT,pausado_por TEXT)');
 await db.raw('CREATE TABLE leads(id SERIAL PRIMARY KEY,nombre TEXT,apellidos TEXT,telefono TEXT)');await db.raw(VINCULOS_SCHEMA);
 const jid='34600000000@s.whatsapp.net',lid='123456789@lid',send=[],rec=[];
 await db.raw('INSERT INTO wa_bandeja_chats(jid,telefono_jid,tiene_chat) VALUES($1,$2,true)',[lid,jid]);
 const svc=crearAtencion({pool:{query:db.raw},listo:()=>true,enviar:async(...x)=>send.push(x),recuperar:async(m,claim)=>{if(await claim())rec.push(m);}});
 await svc.abrir(lid,'consulta','Menú de grupo');
 assert.equal((await db.raw('SELECT * FROM wa_atencion')).rows.length,1);
 assert.equal((await db.raw('SELECT jid FROM wa_atencion')).rows[0].jid,jid);
 await svc.control(jid,'tomar','Laura');
 await db.raw('UPDATE wa_atencion SET aviso_nivel=2 WHERE jid=$1',[jid]);
 await svc.entrada(lid,'Para 20 personas',new Date(Date.now()+100));
 assert.equal((await db.raw('SELECT estado FROM wa_atencion')).rows[0].estado,'en_curso');
 const conservada=(await db.raw('SELECT resumen,aviso_nivel FROM wa_atencion')).rows[0];
 assert.equal(conservada.resumen,'Menú de grupo');assert.equal(conservada.aviso_nivel,2);
 assert.equal(await svc.acuse(lid),false);
 await svc.control(lid,'resolver','Laura');
 await svc.abrir(lid,'sin_respuesta','Antiguo',new Date('2026-01-01'));
 assert.equal((await db.raw('SELECT estado FROM wa_atencion')).rows[0].estado,'resuelta');
 await db.raw("UPDATE wa_atencion SET aviso_en=now(),acuse_en=now(),aviso_error=true WHERE jid=$1",[jid]);
 await svc.abrir(jid,'consulta','Nuevo presupuesto',new Date(Date.now()+1000));
 const reabierta=(await db.raw('SELECT * FROM wa_atencion WHERE jid=$1',[jid])).rows[0];
 assert.equal(reabierta.aviso_nivel,0);assert.equal(reabierta.aviso_en,null);assert.equal(reabierta.acuse_en,null);assert.equal(reabierta.aviso_error,false);assert.equal(reabierta.responsable,'marketing');
 await svc.control(jid,'resolver','Laura');
 const item={msg:{key:{id:'live1'}}};assert.equal((await svc.iniciar(lid,[item])).length,1);assert.equal((await svc.iniciar(jid,[item])).length,0);
 const otro='34600000001@s.whatsapp.net';
 await db.raw("INSERT INTO wa_bandeja_mensajes(jid,mensaje_id,enviado,texto,fecha) VALUES($1,'m1',false,'Reservar para mañana',now()-interval '10 minutes')",[otro]);
 await svc.tick();assert.equal(rec.length,1);await svc.tick();assert.equal(rec.length,1);
 assert.equal((await db.raw('SELECT * FROM wa_atencion WHERE jid=$1',[otro])).rows.length,0,'un mensaje recibido no crea una tarea humana por sí solo');
 const despedida='34600000003@s.whatsapp.net';
 await db.raw("INSERT INTO wa_bandeja_mensajes(jid,mensaje_id,enviado,texto,fecha) VALUES($1,'fin',false,'Muchas gracias!',now()-interval '10 minutes')",[despedida]);
 await svc.tick();assert.equal((await db.raw('SELECT * FROM wa_atencion WHERE jid=$1',[despedida])).rows.length,0);
 assert.equal(rec.length,1,'no recupera despedidas como solicitudes');
 const tercero='34600000002@s.whatsapp.net';
 await db.raw("INSERT INTO wa_bandeja_mensajes(jid,mensaje_id,enviado,texto,fecha) VALUES($1,'m2',false,'Reservar para mañana',now()-interval '10 minutes')",[tercero]);
 await svc.iniciar(tercero,[{msg:{key:{id:'m2'}}}]);await svc.tick();assert.equal(rec.length,1,'procesada antes de un corte no debe repetir acciones');

 // Recorrido completo con envío simulado: Laura, recordatorio, Dirección y cierre.
 const reloj=new Date('2026-10-20T13:00:00Z'),avisos=[];
 const notificador=crearAtencion({pool:{query:db.raw},listo:()=>true,enviar:async(...a)=>avisos.push(a),ahora:()=>reloj});
 await db.raw("UPDATE wa_atencion SET estado='resuelta'");
 await db.raw("INSERT INTO wa_atencion(jid,motivo,resumen,abierta_en) VALUES('34600000009@s.whatsapp.net','consulta','Aprobar presupuesto para grupo',$1)",[new Date(+reloj-180*60000)]);
 await notificador.tick();assert.equal(avisos.length,1);assert.equal(avisos[0][0],'34633018834');assert.match(avisos[0][1],/Aprobar presupuesto para grupo/);
 await notificador.tick();assert.equal(avisos.length,1,'no repite aviso');
 await db.raw("UPDATE wa_atencion SET aviso_en=$1 WHERE jid='34600000009@s.whatsapp.net'",[new Date(+reloj-31*60000)]);
 await notificador.tick();assert.equal(avisos.length,2);assert.equal(avisos[1][0],'34633018834');
 await db.raw("UPDATE wa_atencion SET aviso_en=$1 WHERE jid='34600000009@s.whatsapp.net'",[new Date(+reloj-61*60000)]);
 await notificador.tick();assert.equal(avisos.length,3);assert.equal(avisos[2][0],'34622149946');
 await notificador.control('34600000009@s.whatsapp.net','resolver','Laura');
 await notificador.tick();assert.equal(avisos.length,3,'cerrar detiene avisos');
 }finally{await db.fin();}
});
