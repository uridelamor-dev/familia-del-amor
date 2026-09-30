import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizarLinea} from '../../src/modules/facturas/lineas.js';
import {sugerirLocalPendiente,indexarHistorialProveedor} from '../../src/modules/facturas/asignacion.js';
import {construirRevision,lineasPropuestaPedido} from '../../src/modules/inventario/calculo.js';
import {clavePrecio,revisarPrecios} from '../../src/modules/facturas/precio-referencia.js';
test('un error de OCR no transforma kilos en paquetes aunque el cociente sea entero',()=>{
 const l=normalizarLinea({descripcion:'Tomate kg',cantidad:2,unidad:'kg',precio_unitario:3,importe:60});
 assert.equal(l.cantidad,2);assert.equal(l.unidad,'kg');assert.equal(l.factor_unidad,null);assert.equal(l.precio_unitario,null);assert.equal(l.dudosa,true);
});
test('el CIF compartido restringe las sugerencias al titular, y el desconocido requiere revisión',()=>{
 const locales=[{local:'Blanes',cif:'B70799135'},{local:'Girona',cif:'B70799135'},{local:'Can Mateu',cif:'OTRO'}];
 const historial=indexarHistorialProveedor([{proveedor:'Proveedor X',local:'Can Mateu'},{proveedor:'Proveedor X',local:'Can Mateu'}]);
 for(const nif_receptor of ['B70799135','DESCONOCIDO']) assert.equal(sugerirLocalPendiente({pendiente:{nif_receptor,proveedor:'Proveedor X'},locales,historial}).local,null);
});
test('sin contar no significa agotado; cero explícito sí permite reponer',()=>{
 const productos=[{id:1,nombre:'Leche',unidad:'l',stock_objetivo:20}];
 for(const v of [null,undefined,'','incorrecto',-1]) {
  const rev=construirRevision(productos,{1:v});assert.equal(rev[0].contado,null);assert.equal(rev[0].sugerido,null);assert.deepEqual(lineasPropuestaPedido(rev),[]);
 }
 assert.equal(construirRevision(productos,{1:0})[0].sugerido,20);
});
test('precio por kg no se compara con unidad, envase desconocido ni línea dudosa',()=>{
 const refs=new Map([[clavePrecio('tomate','kg'),{precio:1,compras:3}]]);
 for(const linea of [{unidad:'ud'},{unidad:'caja'},{unidad:'kg',dudosa:true}]) assert.equal(revisarPrecios([{clave:'tomate',precio_unitario:10,...linea}],refs).total,0);
 assert.equal(revisarPrecios([{clave:'tomate',unidad:'kg',precio_unitario:10}],refs).total,1);
});
