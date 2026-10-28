import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fuentesDeUsuario,seleccionarAvisos} from '../../src/modules/avisos/bandeja.js';
const ahora=Date.parse('2026-10-28T12:00:00Z');
const aviso=(fuente,sev='info',dias=0,extra={})=>({id:fuente,fuente,sev,primera:new Date(ahora-dias*86400000).toISOString(),...extra});
test('Cada rol recibe sus responsabilidades, no todos los módulos que puede consultar',()=>{
 assert.deepEqual(fuentesDeUsuario({rol:'rrhh'}),['rrhh','candidaturas']);
 assert.deepEqual(fuentesDeUsuario({rol:'contabilidad'}),['facturas','pendientes']);
 assert.deepEqual(fuentesDeUsuario({rol:'marketing'}),['reviews']);
 assert.deepEqual(fuentesDeUsuario({rol:'encargado'}),['rrhh','mantenimiento','whatsapp']);
 assert.deepEqual(fuentesDeUsuario({rol:'trabajador'}),[]);
});
test('Quitar un módulo al usuario también retira sus notificaciones',()=>{
 assert.deepEqual(fuentesDeUsuario({rol:'rrhh',modulos:['horarios']}),[]);
 assert.deepEqual(fuentesDeUsuario({rol:'contabilidad',modulos:['reviews']}),[]);
});
test('Dirección: críticos inmediatos, importantes a los 3 días y ordinarios a los 14',()=>{
 const items=[aviso('whatsapp','crit'),aviso('facturas','imp',2),aviso('pendientes','imp',3),aviso('rrhh','info',13),aviso('reviews','info',14)];
 assert.deepEqual(seleccionarAvisos(items,{rol:'direccion'},ahora).map(a=>a.fuente),['whatsapp','pendientes','reviews']);
});
test('RRHH no recibe marketing ni contabilidad aunque sean críticos',()=>{
 const items=['rrhh','facturas','reviews','whatsapp'].map(f=>aviso(f,'crit'));
 assert.deepEqual(seleccionarAvisos(items,{rol:'rrhh'},ahora).map(a=>a.fuente),['rrhh']);
});
test('Solo Dirección agrupa campos de una misma persona; el contador coincide con la lista',()=>{
 const items=['telefono','dni','email'].map((campo,i)=>aviso('rrhh','info',14,{id:'rrhh:'+i,worker_id:1,nombre:'Persona',campo}));
 const dir=seleccionarAvisos(items,{rol:'direccion'},ahora);
 assert.equal(dir.length,1);assert.equal(dir[0].campos.length,3);assert.match(dir[0].titulo,/3 datos pendientes/);
 assert.equal(seleccionarAvisos(items,{rol:'rrhh'},ahora).length,3);
 assert.equal(seleccionarAvisos(items,{rol:'encargado'},ahora).length,2);
});
test('No inventa antigüedad cuando falta una fecha válida',()=>{
 assert.equal(seleccionarAvisos([aviso('facturas','info',0,{primera:'invalida'})],{rol:'direccion'},ahora).length,0);
});
