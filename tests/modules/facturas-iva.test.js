import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarIva,guardarIvaLeido,repasarIva} from '../../src/modules/facturas/iva.js';
const f={id:1,base_imponible:300,cuota_iva:35,total:335,iva_estado:'pendiente',iva_desglose:null,drive_url:'pdf',iva_intentos:0};
const partes=[{base:100,tipo:4,cuota:4},{base:100,tipo:10,cuota:10},{base:100,tipo:21,cuota:21}];
test('tres tipos, ceros y abonos sin inventar valores',()=>{
 assert.equal(validarIva(partes,f).ok,true);
 assert.equal(validarIva([{base:100,tipo:0,cuota:0}],{base_imponible:100,cuota_iva:0,total:100}).ok,true);
 assert.equal(validarIva([{base:-100,tipo:21,cuota:-21}],{base_imponible:-100,cuota_iva:-21,total:-121}).ok,true);
 assert.equal(validarIva([{base:100,tipo:null,cuota:0}],{base_imponible:100,cuota_iva:0,total:100}).ok,false);
});
test('no acepta repartos incompletos, importes incompatibles ni retenciones escondidas',()=>{
 assert.equal(validarIva([],f).ok,false);
 assert.equal(validarIva(partes.slice(1),f).ok,false);
 assert.equal(validarIva([...partes.slice(0,2),{base:100,tipo:21,cuota:35}],f).ok,false);
 assert.equal(validarIva(partes,{...f,total:320}).ok,false);
 assert.equal(validarIva(partes,{...f,base_imponible:null}).ok,false);
});
test('reagrupa tipos iguales sin perder centimos',()=>{
 const v=validarIva([{base:40,tipo:10,cuota:4},{base:60,tipo:10,cuota:6}],{base_imponible:100,cuota_iva:10,total:110});
 assert.deepEqual(v.partes,[{base:100,tipo:10,cuota:10}]);
});
test('histórico solo escribe el desglose y protege ediciones concurrentes',async()=>{
 let sql,params;
 await guardarIvaLeido({dbRun:async(s,p)=>{sql=s;params=p;}},f,partes);
 assert.match(sql,/iva_estado <> 'manual'/);assert.match(sql,/IS NOT DISTINCT FROM/);
 assert.doesNotMatch(sql.split('WHERE')[0],/SET base_imponible|total =|proveedor =/);
 assert.equal(params[1],'ok');assert.equal(params[3],1);
 await guardarIvaLeido({dbRun:async(s,p)=>{params=p;}},f,[]);assert.equal(params[1],'revisar');
});
test('cola lee una vez tras reclamar y deja error visible si falla',async()=>{
 const calls=[];let read=0;
 const deps={dbAll:async()=>[f],dbRun:async(s,p)=>{calls.push([s,p]);return s.includes('RETURNING id')?{id:1}:undefined;}};
 await repasarIva(deps,async()=>{read++;return partes;});assert.equal(read,1);
 assert.ok(calls.some(([s,p])=>s.includes('iva_desglose =')&&p[1]==='ok'));
 await repasarIva(deps,async()=>{throw new Error('Sin acceso');});assert.ok(calls.some(([s])=>s.includes("iva_estado='error'")));
 await repasarIva({...deps,dbRun:async()=>null},async()=>assert.fail('Reclamada por otro proceso'));
});

test('un céntimo discrepante no llega a un libro cuyos totales deben ser exactos',()=>{
 assert.equal(validarIva(partes,{...f,base_imponible:300.01,total:335.01}).ok,false);
 assert.equal(validarIva([{base:' ',tipo:0,cuota:0}],{base_imponible:0,cuota_iva:0,total:0}).ok,false);
});
