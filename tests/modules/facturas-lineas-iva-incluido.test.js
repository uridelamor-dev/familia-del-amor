import test from 'node:test';
import assert from 'node:assert/strict';
import {validarSuma,mensajeValidacion,grupoDeSQL} from '../../src/modules/facturas/lineas.js';
import {huellaAuditoria} from '../../src/modules/facturas/auditoria-completa.js';
const ls=(...importes)=>importes.map(importe=>({importe,dudosa:false}));
test('coincidir con el total no activa IVA incluido automáticamente',()=>{
 assert.equal(validarSuma(ls(1.1,3.5),3.802,'ticket',{cuota_iva:.798,total:4.60}).cuadra,false);
 assert.equal(validarSuma(ls(1.1,3.5),3.802,'ticket',{cuota_iva:.798,lineas_iva_incluido:'true'}).cuadra,false);
});
test('confirmación explícita admite Botiga y Castellmenatge sin cambiar líneas',()=>{
 const datos=ls(16.98,18.98,9.98,22.98),antes=JSON.stringify(datos);
 const v=validarSuma(datos,56.96,'factura',{cuota_iva:11.96,lineas_iva_incluido:true});
 assert.equal(v.cuadra,true);assert.equal(v.base,68.92);assert.equal(v.referencia,'base más IVA');assert.equal(JSON.stringify(datos),antes);
 assert.equal(validarSuma(ls(1.1,3.5),3.802,'ticket',{cuota_iva:.798,lineas_iva_incluido:true}).cuadra,true);
});
test('no confunde recargos, retenciones ni otros cargos con los precios con IVA',()=>{
 const f={cuota_iva:10,total:115,recargo_equivalencia:5,lineas_iva_incluido:true};
 assert.equal(validarSuma(ls(110),100,'factura',f).cuadra,true);
 const v=validarSuma(ls(115),100,'factura',f);assert.equal(v.cuadra,false);assert.match(mensajeValidacion(v),/base más IVA/);
});
test('sin cuota o sin base no se confirma el cuadre ni siquiera en albaranes',()=>{
 for(const tipo of ['factura','albaran'])assert.equal(validarSuma(ls(110),100,tipo,{lineas_iva_incluido:true}).cuadra,false);
 assert.equal(validarSuma(ls(110),null,'factura',{cuota_iva:10,lineas_iva_incluido:true}).cuadra,false);
});
test('devoluciones y tipos mixtos se contrastan con la cuota explícita, sin tipo medio',()=>{
 assert.equal(validarSuma(ls(-11),-10,'factura',{cuota_iva:-1,lineas_iva_incluido:true}).cuadra,true);
 assert.equal(validarSuma(ls(104,110,121),300,'factura',{cuota_iva:35,lineas_iva_incluido:true}).cuadra,true);
});
test('el cambio de criterio invalida el distintivo conservando las huellas anteriores en modo neto',()=>{
 const f={id:1,total:4.6};assert.equal(huellaAuditoria(f,[]),huellaAuditoria({...f,lineas_iva_incluido:false},[]));
 assert.notEqual(huellaAuditoria(f,[]),huellaAuditoria({...f,lineas_iva_incluido:true},[]));
});
test('no mezcla precios con IVA con comparativas o sumas netas de productos',()=>{
 const g=grupoDeSQL({iva_incluido:true,unidades:['ud'],precios:[10],precios_fechas:['2026-11-01'],conimporte:1,importe:10,preciomin:10,preciomax:10});
 assert.equal(g.importe,null);assert.equal(g.precioMin,null);assert.equal(g.ultimoPrecio,null);assert.equal(g.ivaIncluido,true);
});
