import {ADJUNTOS_SCHEMA} from '../../src/modules/messaging/sara-promociones.js';
import {ATENCION_SCHEMA} from '../../src/modules/messaging/atencion.js';
import {BANDEJA_SCHEMA} from '../../src/modules/messaging/bandeja-historial.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {VINCULOS_SCHEMA,telefonoContacto} from '../../src/modules/messaging/contacto-conversacion.js';
import {registrarConversaciones} from '../../src/modules/messaging/conversaciones.js';
test('normalizar teléfonos sin confundir prefijos extranjeros ni LID',()=>{
 assert.equal(telefonoContacto('+34 622 149 946'),'34622149946');assert.equal(telefonoContacto('622149946'),'34622149946');assert.equal(telefonoContacto('0034622149946'),'34622149946');assert.equal(telefonoContacto('447622149946'),'447622149946');assert.equal(telefonoContacto('12345678901@lid'),null);
});
test('identidad automática única, manual reversible y búsqueda por nombre',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 for(const sql of ["CREATE TABLE leads(id SERIAL PRIMARY KEY,nombre TEXT,apellidos TEXT,telefono TEXT)","CREATE TABLE whatsapp_messages(id SERIAL PRIMARY KEY,jid TEXT,telefono TEXT,mensaje TEXT,respuesta TEXT,tipo TEXT,origen TEXT,creado_en TEXT,adjuntos JSONB,historico INTEGER DEFAULT 0)","CREATE TABLE wa_clientes(jid TEXT PRIMARY KEY,nombre TEXT,telefono TEXT,estado_ia TEXT,pausado_por TEXT,pausa_motivo TEXT)",VINCULOS_SCHEMA,BANDEJA_SCHEMA,ATENCION_SCHEMA,ADJUNTOS_SCHEMA])await db.raw(sql);
 await db.raw("INSERT INTO leads(nombre,apellidos,telefono) VALUES ('Maria','Garcia','622149946'),('Otra','Persona','447622149946'),('Duplicado','Uno','633123123'),('Duplicado','Dos','34633123123')");
 await db.raw("INSERT INTO whatsapp_messages(jid,telefono,tipo) VALUES ('34622149946@s.whatsapp.net','34622149946','intercambio'),('123456789012345@lid','123456789012345','intercambio'),('34633123123@s.whatsapp.net','34633123123','intercambio')");
 const rutas={};registrarConversaciones({get:(p,a,h)=>rutas[p]=h,post:(p,a,h)=>rutas[p]=h},{auth:()=>()=>{},pool:{query:db.raw},listo:()=>false});
 async function call(path,query={},body={}){let out,code=200;await rutas['/api/conversaciones'+path]({query,body,user:{username:'test'}},{status(n){code=n;return this},json(v){out=v}});assert.equal(code,200,JSON.stringify(out));return out;}
 let list=await call('');assert.equal(list.data.find(x=>x.jid.startsWith('346221')).nombre,'Maria Garcia');assert.equal(list.data.find(x=>x.jid.endsWith('@lid')).telefono,null);assert.equal(list.data.find(x=>x.jid.startsWith('346331')).lead_id,null);
 assert.equal((await call('',{q:'Maria'})).data.length,1);
 await call('/vincular',{}, {jid:'123456789012345@lid',lead_id:1});let d=await call('/detalle',{jid:'123456789012345@lid'});assert.equal(d.cliente.nombre,'Maria Garcia');assert.equal(d.cliente.telefono,'34622149946');
 await db.raw("UPDATE leads SET nombre='María' WHERE id=1");assert.equal((await call('/detalle',{jid:'123456789012345@lid'})).cliente.nombre,'María Garcia');
 await call('/vincular',{}, {jid:'123456789012345@lid',lead_id:null});assert.equal((await call('/detalle',{jid:'123456789012345@lid'})).cliente.nombre,'Contacto de WhatsApp');
 }finally{await db.fin();}
});
test('no leídos por usuario, lectura acotada y adjuntos privados del chat',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 for(const sql of ["CREATE TABLE leads(id SERIAL PRIMARY KEY,nombre TEXT,apellidos TEXT,telefono TEXT)","CREATE TABLE whatsapp_messages(id SERIAL PRIMARY KEY,jid TEXT,telefono TEXT,mensaje TEXT,respuesta TEXT,tipo TEXT,creado_en TEXT,adjuntos JSONB,historico INTEGER DEFAULT 0)","CREATE TABLE wa_clientes(jid TEXT PRIMARY KEY,nombre TEXT,telefono TEXT,estado_ia TEXT,pausado_por TEXT,pausa_motivo TEXT)",VINCULOS_SCHEMA,BANDEJA_SCHEMA,ATENCION_SCHEMA,ADJUNTOS_SCHEMA])await db.raw(sql);
 const jid='34600000000@s.whatsapp.net',grupo='123-456@g.us',id='11111111-1111-4111-8111-111111111111';
 await db.raw("INSERT INTO wa_bandeja_mensajes(jid,mensaje_id,enviado,texto,fecha) VALUES($1,'a',false,'Foto', '2026-11-01T10:00Z'),($1,'b',false,'Hola','2026-11-01T11:00Z'),($1,'c',true,'Respuesta','2026-11-01T11:01Z'),($2,'d',false,'Grupo','2026-11-01T10:00Z')",[jid,grupo]);
 await db.raw("INSERT INTO wa_adjuntos(id,jid,mensaje_id,nombre,mime,datos) VALUES($1,$2,'a','foto.png','image/png',$3)",[id,jid,Buffer.from('fixture')]);
 const rutas={};registrarConversaciones({get:(p,a,h)=>rutas['GET '+p]=h,post:(p,a,h)=>rutas['POST '+p]=h},{auth:()=>()=>{},pool:{query:db.raw},listo:()=>true});
 async function call(method,path,{query={},body={},params={},username='ana',rol='marketing'}={}){const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;},set(v){this.headers=v;},send(v){this.bytes=v;}};await rutas[method+' /api/conversaciones'+path]({query,body,params,user:{username,rol}},res);return res;}
 let lista=await call('GET','');assert.equal(lista.code,200);assert.equal(lista.body.data.length,1);assert.equal(lista.body.data[0].no_leidos,2);
 const detalle=await call('GET','/detalle',{query:{jid}});assert.equal(detalle.code,200);assert.equal(detalle.body.data[0].adjuntos[0].nombre,'foto.png');
 const primero=detalle.body.data[0];assert.equal((await call('POST','/leer',{body:{jid,hasta:[primero.creado_en,primero.id]}})).code,200);
 assert.equal((await call('GET','')).body.data[0].no_leidos,1);
 assert.equal((await call('GET','',{username:'bea'})).body.data[0].no_leidos,2);
 const ultimo=detalle.body.data.at(-1);await call('POST','/leer',{body:{jid,hasta:[ultimo.creado_en,ultimo.id]}});
 assert.equal((await call('GET','',{query:{no_leidos:'1'}})).body.data.length,0);
 await call('POST','/leer',{body:{jid,hasta:[primero.creado_en,primero.id]}});
 assert.equal((await call('GET','')).body.data[0].no_leidos,0,'una petición atrasada no revierte el leído');
 assert.equal((await db.raw('SELECT count(*)::int n FROM wa_atencion')).rows[0].n,0,'leer no resuelve ni asigna atención');
 assert.equal((await call('POST','/leer',{body:{jid,hasta:['2099-01-01','inexistente']}})).code,404);
 await db.raw("INSERT INTO wa_bandeja_chats(jid,telefono_jid) VALUES('777777777@lid',$1)",[jid]);
 await db.raw("UPDATE wa_adjuntos SET jid='777777777@lid'");
 assert.equal((await call('GET','/detalle',{query:{jid}})).body.data[0].adjuntos[0].nombre,'foto.png','el archivo también se encuentra por el alias de WhatsApp');
 const archivo=await call('GET','/adjunto/:id',{query:{jid},params:{id}});assert.equal(archivo.bytes.toString(),'fixture');assert.equal(archivo.headers['Cache-Control'],'no-store');
 assert.equal((await call('GET','/adjunto/:id',{query:{jid:grupo},params:{id}})).code,404);
 await db.raw("UPDATE wa_adjuntos SET creado_en=now()-interval '31 days'");assert.equal((await call('GET','/adjunto/:id',{query:{jid},params:{id}})).code,404);
 assert.equal((await call('GET','/detalle',{query:{jid}})).body.data[0].adjuntos[0].disponible,false);
 }finally{await db.fin();}
});
