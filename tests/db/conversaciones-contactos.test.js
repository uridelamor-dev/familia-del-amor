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
 for(const sql of ["CREATE TABLE leads(id SERIAL PRIMARY KEY,nombre TEXT,apellidos TEXT,telefono TEXT)","CREATE TABLE whatsapp_messages(id SERIAL PRIMARY KEY,jid TEXT,telefono TEXT,mensaje TEXT,respuesta TEXT,tipo TEXT,origen TEXT,creado_en TEXT,adjuntos JSONB)","CREATE TABLE wa_clientes(jid TEXT PRIMARY KEY,nombre TEXT,telefono TEXT,estado_ia TEXT,pausado_por TEXT,pausa_motivo TEXT)",VINCULOS_SCHEMA])await db.raw(sql);
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
