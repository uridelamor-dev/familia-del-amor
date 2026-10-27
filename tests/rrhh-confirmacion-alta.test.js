import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrarConfirmaciones,hashToken,resumenConfirmacion} from '../src/modules/rrhh/confirmacion-alta.js';
function sistema(){
 const rutas=new Map(),sql=[];let altas=0,envios=0;
 const fila={id:1,datos:{nombre:'Ejemplo',fecha_alta:'2026-12-01'},estado:'pendiente',vence_en:'2099-01-01',autor_id:3};
 const c={query:async(q,args)=>{sql.push(q);if(q.includes('FOR UPDATE'))return {rows:[fila]};if(q.startsWith('UPDATE rrhh_confirmaciones SET estado='))fila.estado=args[0];return {rows:[]};},release(){}};
 registrarConfirmaciones({post:(p,...f)=>rutas.set(p,f.at(-1)),get:(p,...f)=>rutas.set(p,f.at(-1))},{auth(){},pool:{connect:async()=>c},crear:async(_c,r)=>{altas++;assert.equal(r.datos.fecha_alta,'2026-12-01');return{id:8};},invalidar(){},procesarAccesos:async()=>{assert.equal(sql.at(-1),"COMMIT");envios++;}});
 return {fila,sql,get envios(){return envios;},get altas(){return altas;},async responder(body,token='a'.repeat(64)){let status=200,result;const res={set(){},status(s){status=s;return this;},json(j){result=j;}};await rutas.get('/api/alta-personal/responder')({headers:{authorization:'Bearer '+token},body},res);return{status,result};}};
}
test('confirmar crea una sola cuenta y conserva incorporación; repetir no duplica',async()=>{const s=sistema();assert.equal((await s.responder({accion:'confirmar'})).status,200);assert.equal(s.altas,1);assert.equal(s.fila.estado,'confirmada');assert.equal((await s.responder({accion:'confirmar'})).status,400);assert.equal(s.altas,1);assert.ok(s.sql.includes('COMMIT'));assert.equal(s.envios,1);assert.ok(s.sql.some(q=>q.includes("acceso_envio='pendiente'")));});
test('solicitar corrección nunca activa al trabajador',async()=>{const s=sistema();assert.equal((await s.responder({accion:'corregir',nota:'Mi nombre necesita corrección'})).status,200);assert.equal(s.altas,0);assert.equal(s.fila.estado,'corregir');assert.equal(s.envios,0);});
test('caducidad y token inválido impiden la activación',async()=>{const s=sistema();s.fila.vence_en='2020-01-01';assert.equal((await s.responder({accion:'confirmar'})).status,400);assert.equal((await s.responder({accion:'confirmar'},'incorrecto')).status,400);assert.equal(s.altas,0);});
test('resumen no revela PIN, contraseña, DNI ni IBAN completos',()=>{const d={dni:'12345678Z',iban:'ES9121000418450200051332',pin:'4917',password:'secreto'};const texto=JSON.stringify(resumenConfirmacion(d));for(const v of Object.values(d))assert.ok(!texto.includes(v));assert.equal(hashToken('token').length,64);});

test('recuperar confirmación conserva los adjuntos para el responsable que la retoma',async()=>{
 let handler;const queries=[];const ids=['11111111-1111-4111-8111-111111111111'];
 const client={release(){},query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.includes('RETURNING datos,autor_id')?[{datos:{documentos_identidad:ids},autor_id:3}]:[]};}};
 registrarConfirmaciones({post:(p,...h)=>{if(p.endsWith('/recuperar'))handler=h.at(-1);},get(){}},{auth(){},pool:{connect:async()=>client}});
 let result;await handler({params:{id:1},user:{id:4}},{set(){},json(x){result=x;},status(){return this;}});
 assert.deepEqual(result.datos.documentos_identidad,ids);assert.ok(queries.some(q=>q.sql.startsWith('UPDATE rrhh_identidad_adjuntos')&&q.args[0]===4&&q.args[2]===3));assert.equal(queries.at(-1).sql,'COMMIT');
});
