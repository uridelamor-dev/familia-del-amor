import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarReceta,calcularReceta} from '../../src/modules/escandallos/coste.js';
import {moduloDeRuta} from '../../src/modules/usuarios/permisos.js';
const ingrediente={clave:'aceite',proveedor:'Proveedor prueba',unidad_compra:'caja',unidad_uso:'ml',factor:6000,cantidad:60,merma:0,nombre:'Aceite'};
const receta={nombre:'Plato prueba',raciones:2,pvp:11,iva:10,ingredientes:[ingrediente]};
const fuente={...ingrediente,precio:60,fecha:'2026-09-22',factura_id:2};
test('el coste usa la conversión de caja a ml y separa IVA del PVP',()=>{
 const r=calcularReceta(receta,[fuente]);assert.equal(r.coste_lote,.6);assert.equal(r.coste_racion,.3);assert.equal(r.venta_neta,10);assert.equal(r.margen,9.7);assert.equal(r.margen_pct,97);
});
test('la merma aumenta compra necesaria sin quitar raciones',()=>{
 const r=calcularReceta({...receta,ingredientes:[{...ingrediente,merma:20}]},[fuente]);assert.ok(Math.abs(r.coste_lote-.75)<1e-10);assert.ok(Math.abs(r.coste_racion-.375)<1e-10);
});
test('no mezcla proveedores ni formatos ni da coste cero cuando faltan precios',()=>{
 for(const f of [{...fuente,proveedor:'Otro'},{...fuente,unidad_compra:'kg'}, {...fuente,precio:null}]){
 const r=calcularReceta(receta,[f]);assert.equal(r.faltan,1);assert.equal(r.coste_lote,null);assert.equal(r.margen,null);}
});
test('PVP cero no produce margen ficticio',()=>assert.equal(calcularReceta({...receta,pvp:0},[fuente]).margen,null));
test('los formatos inválidos y números vacíos no pasan por cero',()=>{
 assert.equal(validarReceta(receta).ok,true);
 for(const d of [null,{...receta,ingredientes:[null]},{...receta,ingredientes:[]},{...receta,raciones:0},{...receta,iva:''},{...receta,pvp:true}, ...['factor','cantidad','merma'].map(k=>({...receta,ingredientes:[{...ingrediente,[k]:''}]})),{...receta,ingredientes:[{...ingrediente,merma:100}]}]) assert.equal(validarReceta(d).ok,false);
});
test('los escandallos heredan la restricción del módulo Productos',()=>assert.equal(moduloDeRuta('/api/escandallos/12/versiones'),'productos'));
