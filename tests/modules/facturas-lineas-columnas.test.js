import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizarLineas, normalizarLinea, validarSuma} from '../../src/modules/facturas/lineas.js';

test('Gran Reino: cantidades y precios leídos de sus columnas, con IVA incluido explícito', () => {
 const filas = [{descripcion:'BOTE',cantidad:1,precio_unitario:2.90,importe:2.90},
  {descripcion:'MOLDE',cantidad:2,precio_unitario:5.95,importe:11.90}];
 const lineas = normalizarLineas(filas);
 assert.deepEqual(lineas.map(l=>[l.cantidad,l.precio_unitario,l.importe,l.dudosa]),[[1,2.9,2.9,false],[2,5.95,11.9,false]]);
 assert.equal(validarSuma(lineas,12.231,'factura',{cuota_iva:2.569,lineas_iva_incluido:true}).cuadra,true);
});

test('IVA copiado como cantidad no se repara adivinando: se bloquea el precio incoherente', () => {
 for (const fila of [{descripcion:'BOTE',cantidad:21,precio_unitario:2.90,importe:2.90},
  {descripcion:'MOLDE',cantidad:21,precio_unitario:5.95,importe:11.90}]) {
  const l=normalizarLinea(fila);
  assert.equal(l.cantidad,21);assert.equal(l.importe,fila.importe);
  assert.equal(l.dudosa,true);assert.equal(l.precio_unitario,null);
 }
});

test('incertidumbre explícita de columnas no se oculta calculando un precio derivado', () => {
 const l=normalizarLinea({descripcion:'BOTE',cantidad:21,importe:2,lectura_dudosa:true});
 assert.equal(l.cantidad,21);assert.equal(l.importe,2);
 assert.equal(l.dudosa,true);assert.equal(l.precio_unitario,null);
});

test('21 unidades reales son válidas y no se confunden con un porcentaje fiscal', () => {
 const l=normalizarLinea({descripcion:'BOTE',cantidad:21,precio_unitario:2.9,importe:60.9,lectura_dudosa:false});
 assert.equal(l.cantidad,21);assert.equal(l.dudosa,false);assert.equal(l.precio_unitario,2.9);
});
