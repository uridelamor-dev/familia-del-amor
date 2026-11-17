import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizarLinea} from '../../src/modules/facturas/lineas.js';
import {calcularVencimiento} from '../../src/modules/facturas/vencimiento.js';
import {planPagoEmpresa} from '../../src/modules/facturas/pago-empresa.js';
import {compararLecturas,controlesLectura,datosRevision} from '../../src/modules/facturas/validacion-lectura.js';

const casos=[{cantidad:7.580,precio_unitario:57.90,importe:438.88,logistica:1},
 {cantidad:70.930,precio_unitario:28.40,importe:2014.41,logistica:10}];
test('Cerezo: peso facturado conserva precio impreso y redondeo de importe',()=>{
 for(const c of casos){
  const l=normalizarLinea({...c,descripcion:'Jamón',unidad:'kg'});
  assert.equal(l.precio_unitario,c.precio_unitario);assert.equal(l.cantidad,c.cantidad);
  assert.equal(l.importe,c.importe);assert.equal(l.dudosa,false);
 }
});
test('Cerezo: cantidad logística con precio por kg no inventa coste por caja',()=>{
 for(const c of casos){
  const l=normalizarLinea({...c,cantidad:c.logistica,descripcion:'Jamón',unidad:'CJ'});
  assert.equal(l.precio_unitario,null);assert.equal(l.dudosa,true);
  assert.equal(l.cantidad,c.logistica);assert.equal(l.importe,c.importe);
 }
});
test('con descuentos conserva el precio efectivo y no el de tarifa',()=>{
 for(const descuento of [{descuento_pct:10,importe_neto:90},{importe_neto:90}]){
  const l=normalizarLinea({descripcion:'Producto',cantidad:2,precio_unitario:50,importe:100,...descuento});
  assert.equal(l.precio_unitario,45);assert.equal(l.precio_bruto,50);
 }
});
test('vencimiento diciembre prevalece sobre condiciones de contado y regla de empresa',()=>{
 for(const [fecha,vto] of [['2026-10-07','2026-12-06'],['2026-10-09','2026-12-08']]){
  const v=calcularVencimiento({fecha,vencimientoLeido:vto,condiciones:{dias:0}});
  assert.equal(v.vencimiento,vto);assert.equal(v.origen,'factura');
  const p=planPagoEmpresa({fecha,tipo:'factura',empresa:'Pilar Ayllón Torres',proveedor:'Cerezo',vencimiento:vto,vencimiento_origen:'factura'},[],'2026-11-17');
  assert.equal(p.vencimiento,vto);assert.equal(p.pagado,0);
 }
});
test('segunda lectura detecta vencimiento distinto o fecha omitida sin adivinarla',()=>{
 for(const b of [{vencimiento:'2026-10-07'},{}])assert.ok(compararLecturas({vencimiento:'2026-12-06'},b).some(a=>a.campo==='vencimiento'));
 assert.deepEqual(compararLecturas({vencimiento:'2026-12-06'},{vencimiento:'2026-12-06'}),[]);
 assert.deepEqual(compararLecturas({vencimiento:null},{}),[]);
});
test('vencimiento inválido requiere revisión, ausente no inventa fecha',()=>{
 for(const vencimiento of ['2026-02-30','06/12/2026',123])assert.ok(controlesLectura({vencimiento}).some(a=>a.campo==='vencimiento'));
 for(const vencimiento of [null,undefined,'2026-12-06'])assert.equal(controlesLectura({vencimiento}).some(a=>a.campo==='vencimiento'),false);
 assert.equal(datosRevision({vencimiento:'2026-10-07'},{vencimiento:'2026-12-06'}).vencimiento,'2026-12-06');
});
