import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recuperarRespuestaAutorizada} from '../src/modules/messaging/recuperacion-autorizada.js';
function entorno({atendido=false,pausa=false,fallo=false,caduca='2026-10-16T00:00:00Z'}={}){
 let value=JSON.stringify({estado:'pendiente',telefono:'34600000000',texto:'Per a quin local?',desde:'2026-10-10T14:05:00Z',caduca});const envios=[];
 return {envios,estado:()=>JSON.parse(value).estado,args:{ahora:Date.parse('2026-10-11T00:00:00Z'),listo:()=>true,
 dbGet:async(sql,args)=>{if(sql.startsWith('SELECT value'))return{value};if(sql.startsWith('SELECT id'))return atendido?{id:1}:null;if(sql.startsWith('SELECT jid'))return pausa?{jid:'test'}:null;if(sql.startsWith('UPDATE')){if(value!==args[2])return null;value=args[0];return{key:'ok'};}throw Error(sql);},
 dbRun:async(_sql,args)=>{value=args[0];},enviar:async()=>{envios.push('enviado');if(fallo)throw Error('resultado incierto');}}};
}
test('el encargo se envía una sola vez, incluso con dos workers y otro reinicio',async()=>{const e=entorno();await Promise.all([recuperarRespuestaAutorizada(e.args),recuperarRespuestaAutorizada(e.args)]);await recuperarRespuestaAutorizada(e.args);assert.equal(e.envios.length,1);assert.equal(e.estado(),'enviada');});
for(const caso of [{atendido:true},{pausa:true},{caduca:'2026-10-10T00:00:00Z'}])test('omite respuestas atendidas, pausadas o caducadas '+JSON.stringify(caso),async()=>{const e=entorno(caso);await recuperarRespuestaAutorizada(e.args);assert.equal(e.envios.length,0);assert.notEqual(e.estado(),'pendiente');});
test('un resultado de envío incierto exige revisión, nunca reenvío automático',async()=>{const e=entorno({fallo:true});await assert.rejects(recuperarRespuestaAutorizada(e.args));await recuperarRespuestaAutorizada(e.args);assert.equal(e.envios.length,1);assert.equal(e.estado(),'revisar_envio');});
