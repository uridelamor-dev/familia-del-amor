import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entradaDiferidaVigente, indicarEscribiendo } from '../src/modules/messaging/entrada-diferida.js';
const ahora = Date.parse('2026-10-11T12:00:00Z');
const msg = {key: {id:'m1',remoteJid:'34600000000@s.whatsapp.net',fromMe:false},messageTimestamp:ahora/1000-3600};
test('recupera mensajes de desconexión recientes, no historiales antiguos, grupos ni salientes',()=>{
 assert.equal(entradaDiferidaVigente(msg,ahora),true);
 for(const cambio of [{messageTimestamp:0},{messageTimestamp:ahora/1000-73*3600},{messageTimestamp:ahora/1000+120},{key:{...msg.key,fromMe:true}},{key:{...msg.key,remoteJid:'1@g.us'}},{key:{...msg.key,id:null}}])assert.equal(entradaDiferidaVigente({...msg,...cambio},ahora),false);
 assert.equal(entradaDiferidaVigente({...msg,key:{...msg.key,remoteJid:'123@lid'}},ahora),true);
});
test('presencia fallida o bloqueada no impide continuar con la respuesta',async()=>{
 await indicarEscribiendo({sendPresenceUpdate:async()=>{throw Error('sin conexión');}},'cliente',5);
 await indicarEscribiendo({sendPresenceUpdate:()=>new Promise(()=>{})},'cliente',5);
});

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { identidadConversacion } from '../src/modules/messaging/contexto.js';
test('la recuperación consulta respuestas previas usando el teléfono resuelto y propaga fallos de BD',async()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 let callback, encontrado=null;
 const env={setEntradaDiferidaPermitida:fn=>callback=fn,identidadConversacion,dbGet:async(sql,args)=>{
 assert.match(sql,/tipo = 'saliente'/);assert.match(sql,/sin respuesta registrada/);
 assert.ok(args.includes('34600000000'));return encontrado;
 }};
 vm.runInNewContext(server.slice(server.indexOf('  setEntradaDiferidaPermitida(async'),server.indexOf('  setOnMessage(async')),env);
 assert.equal(await callback(msg,'34600000000'),true);
 encontrado={id:12}; assert.equal(await callback(msg,'34600000000'),false);
 env.dbGet=async()=>{throw Error('BD caída');};await assert.rejects(callback(msg,'34600000000'),/BD caída/);
});

test('manejador real: append llega al procesamiento, se deduplica y no reabre conversaciones contestadas',async()=>{
 const wa=readFileSync(new URL('../whatsapp.js',import.meta.url),'utf8');let handler;const recibidos=[],vistos=new Set();let permitir=true;
 const env={console,Date,entradaDiferidaVigente,mensajeNormalizado:x=>x,
 sock:{ev:{on:(_evento,fn)=>handler=fn}},entradaDiferidaPermitida:async()=>permitir,
 resolverTelefono:async()=> '34600000000',entradaNueva:key=>{if(vistos.has(key.id))return false;vistos.add(key.id);return true;},
 leerCitado:()=>null,esMensajeInterno:async()=>false,onContactoLead:null,
 procesarConDebounce:(_jid,item)=>recibidos.push(item),onGroupAttachment:null};
 const start=wa.indexOf('  sock.ev.on("messages.upsert"');const end=wa.indexOf('\nfunction formatPhone',start);
 vm.runInNewContext(wa.slice(start,end).replace(/\n}\s*$/,''),env);
 const entrada={...msg,messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'Bona tarda, teniu taula?'}};
 await handler({messages:[entrada],type:'append'});assert.equal(recibidos.length,1);
 await handler({messages:[entrada],type:'notify'});assert.equal(recibidos.length,1);
 permitir=false;await handler({messages:[{...entrada,key:{...entrada.key,id:'m2'}}],type:'append'});assert.equal(recibidos.length,1);
 await handler({messages:[{...entrada,key:{...entrada.key,id:'m3'},messageTimestamp:1}],type:'append'});assert.equal(recibidos.length,1);
});
