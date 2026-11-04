import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {getDashboard} from '../../src/modules/dashboard/dashboard.service.js';
test('el dashboard separa el histórico de los últimos 30 días por fecha de publicación',async()=>{
 let consulta;
 const d=await getDashboard({all:async()=>[],get:async(sql,params)=>{
  if(sql.includes('::int recientes')){consulta={sql,params};return {n:6700,recientes:12};}return null;
 }},{now:'2026-11-04T12:00:00Z'});
 assert.ok(consulta);assert.deepEqual(consulta.params,['2026-10-06','2026-11-04']);
 assert.ok(!consulta.sql.includes('creado_en'));assert.equal(d.resenas.sinResponder,6700);assert.equal(d.resenas.sinResponderRecientes,12);
});
test('el menú usa solo recientes y nunca recupera el contador histórico',()=>{
 const app=readFileSync(new URL('../../public/panel/app.js',import.meta.url),'utf8');
 const ctx=vm.createContext({PENDIENTES:{},PENDIENTES_TXT:{}});
 vm.runInContext(app.slice(app.indexOf('function fijarPendientes('),app.indexOf('let DASH_RANGE')),ctx);
 for(const recientes of [12,0,undefined]) {
  ctx.fijarPendientes({resenas:{sinResponder:6700,sinResponderRecientes:recientes}});
  assert.equal(ctx.PENDIENTES.reviews,recientes||0);assert.match(ctx.PENDIENTES_TXT.reviews,/30 días/);
 }
});
