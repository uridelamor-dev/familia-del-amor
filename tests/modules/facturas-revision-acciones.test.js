import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guardarDeshacerRevision,deshacerRevision} from '../../src/modules/facturas/deshacer-revision.js';
import {recordarProveedorRevision} from '../../src/modules/facturas/aprendizaje-revision.js';
function almacen(tipo='duplicado') {
 const antes={id:7,local:'Lloret',total:121,dup_estado:'pendiente',descartado_en:null,descartado_por:null};
 let fila={...antes,...(tipo==='duplicado'?{dup_estado:'distinta'}:{descartado_en:'2026-11-04',descartado_por:'Ana'})},registro;
 let updates=0;
 const q=async(sql,p)=>{
  if(sql.startsWith('SELECT *'))return {rows:fila?[fila]:[]};
  if(sql.startsWith('SELECT value'))return {rows:registro?[{value:registro}]:[]};
  if(sql.startsWith('INSERT INTO config(key,value) VALUES($1'))registro=p[1];
  if(sql.startsWith('UPDATE config'))registro=p[0];
  if(sql.startsWith('UPDATE facturas'))updates++;
  return {rows:[]};
 };
 return {q,antes,setFila:f=>fila=f,get fila(){return fila;},get updates(){return updates;}};
}
for(const tipo of ['duplicado','descarte'])test('deshacer '+tipo+' restaura una sola vez',async()=>{
 const a=almacen(tipo);const token=await guardarDeshacerRevision(a.q,{tipo,antes:[a.antes],autor:'Ana'});
 assert.equal((await deshacerRevision(a.q,{token,autor:'Ana',puedeAcceder:()=>true})).tipo,tipo);
 assert.equal(a.updates,1);
 await assert.rejects(deshacerRevision(a.q,{token,autor:'Ana',puedeAcceder:()=>true}),/Ya se ha deshecho/);
});
for(const caso of ['otro autor','sin acceso','modificado','eliminado'])test('deshacer bloquea '+caso,async()=>{
 const a=almacen();const token=await guardarDeshacerRevision(a.q,{tipo:'duplicado',antes:[a.antes],autor:'Ana'});
 if(caso==='modificado')a.setFila({...a.fila,total:500});
 if(caso==='eliminado')a.setFila(null);
 await assert.rejects(deshacerRevision(a.q,{token,autor:caso==='otro autor'?'Luis':'Ana',puedeAcceder:()=>caso!=='sin acceso'}));
 assert.equal(a.updates,0);
});
test('sincronización de Sheets no invalida deshacer',async()=>{
 const a=almacen();const token=await guardarDeshacerRevision(a.q,{tipo:'duplicado',antes:[a.antes],autor:'Ana'});
 a.setFila({...a.fila,sheet_synced:1,sheet_id:'hoja'});
 await deshacerRevision(a.q,{token,autor:'Ana',puedeAcceder:()=>true});assert.equal(a.updates,1);
});
test('aprendizaje requiere NIF válido y no reemplaza identidades en conflicto',async()=>{
 for(const [nif,existentes,esperado] of [['B12345678',[],false],['B12345674',[{proveedor:'Otro'}],false],['B12345674',[],true]]) {
  let escrituras=0;
  const q=async(sql)=>{if(sql.startsWith('INSERT'))escrituras++;return {rows:sql.startsWith('SELECT proveedor')?existentes:[]};};
  assert.equal(await recordarProveedorRevision(q,{proveedor:'Mera',nif,total:121,fecha:'2026-11-04'},'Ana'),esperado);
  assert.equal(escrituras,esperado?1:0);
 }
});
