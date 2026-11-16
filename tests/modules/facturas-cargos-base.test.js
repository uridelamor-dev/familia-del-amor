import test from 'node:test';
import assert from 'node:assert/strict';
import {validarCargosBase,sumaCargosBase} from '../../src/modules/facturas/cargos-base.js';
import {validarSuma} from '../../src/modules/facturas/lineas.js';
import {huellaAuditoria} from '../../src/modules/facturas/auditoria-completa.js';
const cargo={descripcion:'S.L.',importe:3.9,porcentaje_iva:21};
test('DDI 213 y 426: cargo ya incluido en base cuadra sin aumentar total ni productos',()=>{
 for(const [productos,base] of [[542.71,546.61],[209.28,213.18]]){
  const lineas=[{importe:productos,dudosa:false}];
  const doc={cargos_base:[cargo]};const v=validarSuma(lineas,base,'factura',doc);
  assert.equal(v.diferencia,0);assert.equal(v.cuadra,true);assert.deepEqual(lineas,[{importe:productos,dudosa:false}]);
 }
});
test('cargo neto con IVA explícito se añade bruto solo cuando líneas incluyen IVA',()=>{
 assert.equal(sumaCargosBase([cargo],true),4.72);
 const v=validarSuma([{importe:121}],103.9,'factura',{cuota_iva:21.82,lineas_iva_incluido:true,cargos_base:[cargo]});
 assert.equal(v.diferencia,0);assert.equal(v.suma,125.72);
 assert.equal(sumaCargosBase([{...cargo,importe:-3.9}],true),-4.72);
 assert.equal(sumaCargosBase([{...cargo,importe:-.25,porcentaje_iva:10}],true),-.28);
});
test('validación exige IVA explícito y no acepta valores vacíos/coerciones; admite retirada',()=>{
 for(const c of [{...cargo,importe:true},{...cargo,importe:''},{...cargo,importe:3.999},{...cargo,porcentaje_iva:null},{...cargo,porcentaje_iva:''},{...cargo,porcentaje_iva:101},{...cargo,descripcion:''}])assert.throws(()=>validarCargosBase([c]));
 assert.deepEqual(validarCargosBase([]),[]);
 assert.deepEqual(validarCargosBase([{descripcion:' S.L. ',importe:'3,90',porcentaje_iva:'21'}]),[cargo]);
});
test('huella preserva documentos legacy y caduca al modificar cargos',()=>{
 const f={id:1,total:125.72};
 assert.equal(huellaAuditoria(f,[]),huellaAuditoria({...f,cargos_base:[]},[]));
 assert.notEqual(huellaAuditoria(f,[]),huellaAuditoria({...f,cargos_base:[cargo]},[]));
 assert.equal(huellaAuditoria({...f,cargos_base:[cargo]},[]),huellaAuditoria({...f,cargos_base:JSON.stringify([cargo])},[]));
});
