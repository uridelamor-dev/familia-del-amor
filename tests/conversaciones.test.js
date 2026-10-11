import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrarConversaciones,jidValido} from '../src/modules/messaging/conversaciones.js';
import {conTurno} from '../src/modules/messaging/turno.js';
import {moduloDeRuta,modulosDeRol} from '../src/modules/usuarios/permisos.js';
function sistema({existe=true,conectado=true,falloPausa=false}={}){
 const rutas={},pasos=[];
 registrarConversaciones({get:(r,a,h)=>rutas['GET '+r]=h,post:(r,a,h)=>rutas['POST '+r]=h},{
 auth:roles=>{assert.deepEqual(roles,['direccion','marketing']);return()=>{};},
 pool:{query:async(sql,p)=>{pasos.push(sql.startsWith('INSERT')?'pausa':'consulta');if(sql.startsWith('INSERT')&&falloPausa)throw Error('DB');return {rows:existe?[{jid:'123@lid'}]:[]};}},
 enviar:async()=>pasos.push('envio'),listo:()=>conectado,bloquear:conTurno,olvidar:()=>pasos.push('olvidar')});
 return {pasos,async llamar(r,body){const res={status(n){this.codigo=n;return this;},json(v){this.body=v;}};await rutas[r]({body,query:{},user:{username:'Laura'}},res);return res;}};
}
test('conversaciones: permisos propios y destinos exactos, nunca grupos',()=>{
 assert.equal(moduloDeRuta('/api/conversaciones/enviar'),'conversaciones');
 assert.ok(modulosDeRol('marketing').includes('conversaciones'));assert.ok(!modulosDeRol('encargado').includes('conversaciones'));
 assert.ok(jidValido('123@lid'));assert.ok(!jidValido('123@g.us'));assert.ok(!jidValido('123@sXwhatsappXnet'));
});
test('el envío pausa y olvida la sesión antes de escribir, y no envía si falla la pausa',async()=>{
 const s=sistema();const r=await s.llamar('POST /api/conversaciones/enviar',{jid:'123@lid',mensaje:'Hola'});assert.equal(r.body.ok,true);assert.deepEqual(s.pasos,['consulta','pausa','olvidar','envio']);
 const f=sistema({falloPausa:true});assert.equal((await f.llamar('POST /api/conversaciones/enviar',{jid:'123@lid',mensaje:'Hola'})).codigo,500);assert.ok(!f.pasos.includes('envio'));
});
test('no envía a conversaciones no visibles, desconectado ni texto vacío',async()=>{
 for(const [op,body,code] of [[{existe:false},{jid:'123@lid',mensaje:'Hola'},404],[{conectado:false},{jid:'123@lid',mensaje:'Hola'},503],[{},{jid:'123@lid',mensaje:''},400],[{},{jid:'123@g.us',mensaje:'Hola'},400]]){
 const s=sistema(op);assert.equal((await s.llamar('POST /api/conversaciones/enviar',body)).codigo,code);assert.ok(!s.pasos.includes('envio'));
 }
});
test('control manual y envío automático se serializan y el candado se libera tras error',async()=>{
 let liberar,iniciar;const iniciado=new Promise(r=>iniciar=r);const pasos=[];const a=conTurno('uno',async()=>{pasos.push(1);iniciar();await new Promise(r=>liberar=r);pasos.push(2);});
 await iniciado;const b=conTurno('uno',async()=>pasos.push(3));liberar();await Promise.all([a,b]);assert.deepEqual(pasos,[1,2,3]);
 await assert.rejects(conTurno('uno',()=>{throw Error('fallo');}));assert.equal(await conTurno('uno',()=>4),4);
});
