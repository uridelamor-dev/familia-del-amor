import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {BANDEJA_SCHEMA,crearArchivoBandeja,mensajeBandeja} from '../../src/modules/messaging/bandeja-historial.js';
import {VINCULOS_SCHEMA} from '../../src/modules/messaging/contacto-conversacion.js';
import {registrarConversaciones} from '../../src/modules/messaging/conversaciones.js';
const msg=(jid,id,ts,texto,fromMe=false)=>({key:{remoteJid:jid,id,fromMe},messageTimestamp:ts,message:{conversation:texto}});
test('historial: conserva audio y fecha original, ignora protocolo y estados',()=>{
 const audio={...msg('123@lid','a',1600000000,''),message:{audioMessage:{}}};
 assert.equal(mensajeBandeja(audio).texto.trim(),'[Audio]');assert.equal(mensajeBandeja(audio).fecha,'2020-09-13T12:26:40.000Z');
 assert.equal(mensajeBandeja(msg('status@broadcast','x',1600000000,'hola')),null);
 assert.equal(mensajeBandeja({...audio,message:{protocolMessage:{}}}),null);
});
test('historial completo: orden real, idempotencia, alias, agenda, grupos, permisos y paginación',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 for(const sql of ["CREATE TABLE leads(id SERIAL PRIMARY KEY,nombre TEXT,apellidos TEXT,telefono TEXT)","CREATE TABLE whatsapp_messages(id SERIAL PRIMARY KEY,jid TEXT,telefono TEXT,mensaje TEXT,respuesta TEXT,tipo TEXT,historico INTEGER DEFAULT 0,creado_en TEXT,adjuntos JSONB)","CREATE TABLE wa_clientes(jid TEXT PRIMARY KEY,nombre TEXT,telefono TEXT,estado_ia TEXT,pausado_por TEXT,pausado_en TEXT,pausa_motivo TEXT)",VINCULOS_SCHEMA,BANDEJA_SCHEMA])await db.raw(sql);
 const guardar=crearArchivoBandeja({query:db.raw}),pn='34622149946@s.whatsapp.net',lid='123456789012345@lid',interno='34633111222@s.whatsapp.net',grupo='123456789-1@g.us';
 const lote={historico:true,chats:[{id:lid,pnJid:pn,name:'Cliente'},{id:grupo,name:'Equipo Blanes'},{id:interno,name:'Personal'},{id:'34677111222@s.whatsapp.net',name:'Sin mensajes',conversationTimestamp:1700000050}],internos:{[interno]:true},contacts:[{id:'34666111222@s.whatsapp.net',name:'Solo agenda'}],messages:[msg(lid,'a',1600000000,'Antiguo'),msg(pn,'b',1700000000,'Reciente'),msg(grupo,'g',1700000100,'Grupo'),msg(interno,'i',1700000200,'Privado')]};
 await guardar(lote);await guardar(lote);assert.equal((await db.raw('SELECT count(*)::int AS n FROM wa_bandeja_mensajes')).rows[0].n,4);
 const rutas={};registrarConversaciones({get:(p,a,h)=>rutas['GET '+p]=h,post:(p,a,h)=>rutas['POST '+p]=h},{auth:()=>()=>{},pool:{query:db.raw},listo:()=>false});
 const call=async(path='',query={},rol='direccion')=>{let body,code=200;await rutas['GET /api/conversaciones'+path]({query,user:{rol}},{status(n){code=n;return this},json(v){body=v}});return {body,code};};
 let r=await call();assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.total,4);assert.deepEqual(r.body.data.map(x=>x.jid),[interno,grupo,'34677111222@s.whatsapp.net',pn]);
 assert.equal(r.body.data.find(x=>x.jid===grupo).solo_lectura,true);
 r=await call('','', 'marketing');assert.equal(r.body.total,2);assert.ok(!r.body.data.some(x=>x.interno||x.jid===grupo));
 assert.equal((await call('/detalle',{jid:grupo},'marketing')).code,404);
 r=await call('/detalle',{jid:pn});assert.equal(r.body.data.length,2);assert.deepEqual(r.body.data.map(x=>x.mensaje),['Antiguo','Reciente']);
 // Importación repetida no empuja conversaciones viejas al primer puesto.
 await guardar({messages:[msg(pn,'viejo',1500000000,'Más antiguo')]});assert.equal((await call()).body.data.at(-1).jid,pn);
 // La respuesta de Sara del registro anterior se conserva aunque se recupere la entrada.
 await db.raw("INSERT INTO whatsapp_messages(jid,telefono,mensaje,respuesta,tipo,creado_en) VALUES($1,'34622149946','Reciente','Respuesta preservada','intercambio','2023-11-14T22:13:20Z')",[pn]);
 r=await call('/detalle',{jid:pn});assert.equal(r.body.data.filter(x=>x.mensaje==='Reciente').length,1);assert.ok(r.body.data.some(x=>x.respuesta==='Respuesta preservada'));
 // El mismo ID recibido como PN y LID solo aparece una vez.
 await guardar({messages:[msg(pn,'a',1600000000,'Antiguo')]});
 assert.equal((await call('/detalle',{jid:pn})).body.data.filter(x=>x.mensaje==='Antiguo').length,1);
 await guardar({chats:[{id:lid,pinned:1700010000,archived:true}]});
 assert.equal((await call()).body.data[0].jid,pn);
 await guardar({chats:[{id:pn,pinned:0,archived:false}]});
 assert.equal((await call()).body.data.find(x=>x.jid===pn).archivado,false);
 // Un alias sin conversación no crea una fila ficticia.
 await guardar({lidPnMappings:[{lid:'777777777777@lid',pn:'34600123456@s.whatsapp.net'}]});
 assert.equal((await call()).body.total,4);
 // Más de 50 chats y más de 100 mensajes, sin perder límites de página.
 await guardar({chats:Array.from({length:60},(_,i)=>({id:'3461000'+String(i).padStart(4,'0')+'@s.whatsapp.net',conversationTimestamp:1700010000+i})),messages:Array.from({length:105},(_,i)=>msg(pn,'hist'+i,1700020000+i,'Mensaje '+i))});
 r=await call();assert.equal(r.body.data.length,50);assert.equal(r.body.total,64);assert.equal((await call('',{offset:50})).body.data.length,14);
 const primera=(await call('/detalle',{jid:pn})).body;const segunda=(await call('/detalle',{jid:pn,cursor:JSON.stringify(primera.cursor)})).body;assert.equal(primera.data.length,100);assert.equal(segunda.data.length,9);assert.ok(!primera.data.some(a=>segunda.data.some(b=>a.id===b.id)));
 }finally{await db.fin();}
});
