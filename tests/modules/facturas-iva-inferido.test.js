import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completarIva} from '../../src/modules/facturas/iva-inferido.js';
import {datosRevision} from '../../src/modules/facturas/validacion-lectura.js';
const factura=(extra={})=>({base_imponible:100,cuota_iva:21,total:121,porcentaje_iva:null,...extra});
test('completa 4, 10 y 21 y conserva otras dudas',()=>{
 for(const tipo of [4,10,21]) {
  const d=factura({cuota_iva:tipo,total:100+tipo,campos_dudosos:['fecha','porcentaje_iva']});
  assert.equal(completarIva(d).valor,tipo); assert.deepEqual(d.campos_dudosos,['fecha']);
 }
});
test('acepta redondeo de céntimos, abonos y ajustes explícitos',()=>{
 for(const extra of [{base_imponible:33.33,cuota_iva:7,total:40.33},{base_imponible:-100,cuota_iva:-21,total:-121},{retencion:15,total:106}]) assert.equal(completarIva(factura(extra)).valor,21);
});
test('no inventa datos, no sobrescribe tipos ni decide casos ambiguos',()=>{
 for(const extra of [{porcentaje_iva:0},{porcentaje_iva:10},{total:null},{base_imponible:null},{cuota_iva:null},{total:130},{base_imponible:.1,cuota_iva:.01,total:.11},{cuota_iva:0,total:100},{cuota_iva:-21,total:79},{otros_cargos:'incorrecto'}]) {
  const d=factura(extra), antes=structuredClone(d);assert.equal(completarIva(d),null);assert.deepEqual(d,antes);
 }
});
test('desgloses mixtos o contradictorios conservan revisión',()=>{
 for(const iva_desglose of [[{base:50,tipo:10,cuota:5},{base:50,tipo:21,cuota:10.5}],[{base:100,tipo:10,cuota:21}],[{tipo:21}]]) assert.equal(completarIva(factura({iva_desglose})),null);
 assert.equal(completarIva(factura({iva_desglose:[{base:100,tipo:21,cuota:21}]})).valor,21);
});
test('al confirmar una revisión recalcula el tipo ausente con los importes corregidos',()=>{
 const original=factura();const d=datosRevision(original,{cuota_iva:10,total:110});
 assert.equal(d.porcentaje_iva,10);assert.equal(original.porcentaje_iva,null);
});
