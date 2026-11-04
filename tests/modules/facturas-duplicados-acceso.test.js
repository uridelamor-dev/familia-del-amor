import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolverDuplicado} from '../../src/modules/facturas/duplicados-decision.js';
function base(original){
 const f={id:2,dup_de:1,dup_estado:'duda',local:'Girona'};
 const writes=[];
 const q=async(sql,args)=>{
  if(sql.startsWith('SELECT id,dup_de'))return {rows:[f]};
  if(sql.startsWith('SELECT *'))return {rows:original?[f,original]:[f]};
  writes.push({sql,args});return {rows:[]};
 };
 return {q,writes};
}
test('permite resolver en un segundo local autorizado',async()=>{
 const {q,writes}=base({id:1,local:'Girona'});
 await resolverDuplicado(q,{id:2,accion:'distinta',autor:'Contabilidad',puedeAcceder:f=>f.local==='Girona'});
 assert.ok(writes.some(x=>x.sql.startsWith('UPDATE')));
});
test('si existe la anterior pero no está autorizada no permite decidir a ciegas',async()=>{
 const {q,writes}=base({id:1,local:'Otro'});
 await assert.rejects(resolverDuplicado(q,{id:2,accion:'distinta',autor:'Contabilidad',puedeAcceder:f=>f.local==='Girona'}),/No tienes acceso a la factura anterior/);
 assert.equal(writes.length,0);
});
test('se puede conservar una factura sin original, sin afirmar que hay dos',async()=>{
 const {q}=base(null);
 const r=await resolverDuplicado(q,{id:2,accion:'conservar_unica',autor:'Contabilidad'});
 assert.match(r.mensaje,/sin factura anterior/);
});
test('conservar única se rechaza si la anterior sí existe',async()=>{
 const {q,writes}=base({id:1,local:'Girona'});
 await assert.rejects(resolverDuplicado(q,{id:2,accion:'conservar_unica',autor:'Contabilidad'}),/anterior existe/);
 assert.equal(writes.length,0);
});
