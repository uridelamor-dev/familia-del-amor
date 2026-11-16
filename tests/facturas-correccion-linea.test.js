import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {redondearImporte} from '../src/modules/facturas/redondeo.js';
import {claveProducto} from '../src/modules/facturas/lineas.js';

const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const inicio=source.indexOf('app.patch("/api/facturas/lineas/:id"');
const ruta=source.slice(inicio,source.indexOf('\n});',inicio)+4);
async function corregir(body,linea={},acceso=true,conflicto=false){
 let handler;const writes=[],events=[];let resultado,status=200;
 const original={id:7,factura_id:1,descripcion:'PLATANOS',clave:'platanos',cantidad:1.5,precio_unitario:1.65,importe:2.48,unidad:'kg',factor_unidad:6,local:'Girona',base_imponible:2.48,...linea};
 const tx={get:async(sql,p)=>{
  if(sql.includes('FOR UPDATE')){events.push('lock');return {id:1};}
  if(sql.startsWith('SELECT l.id'))return conflicto?null:original;
  if(sql.startsWith('UPDATE factura_lineas')){writes.push([sql,p]);return {id:7};}
  throw new Error('Consulta inesperada: '+sql);
 },run:async(s,p)=>{writes.push([s,p]);},all:async()=>[]};
 vm.runInNewContext(ruta,{app:{patch:(_p,_a,h)=>{handler=h;}},requireAuth:()=>()=>{},
  transaccionPaginas:async fn=>{events.push('BEGIN');try{const r=await fn(tx);events.push('COMMIT');return r;}catch(e){events.push('ROLLBACK');throw e;}},
  puedeAccederLocal:()=>acceso,redondearImporte,claveProducto,
  recalcularCuadre:async(_id,_base,deps)=>{assert.equal(deps.dbGet,tx.get);return {suma:2.48,base:2.48,diferencia:0,cuadra:true};},console:{error(){}}});
 const res={status(n){status=n;return this;},json(v){resultado=v;return this;}};
 await handler({params:{id:'7'},body},res);return {status,resultado,writes,events};
}
test('redondea la media centésima de factura y abono sin perder un céntimo',()=>{
 for(const [v,r] of [[1.5*1.65,2.48],[-1.5*1.65,-2.48],[1.005,1.01],[-1.005,-1.01],[6.2*2.85,17.67]])assert.equal(redondearImporte(v),r);
});
test('corregir el precio conserva el precio escrito y calcula 2,48',async()=>{
 const r=await corregir({precio_unitario:1.65},{importe:2.47});
 assert.equal(r.status,200);assert.equal(r.resultado.importe,2.48);assert.equal(r.resultado.precio_unitario,1.65);
});
test('confirmar el importe redondeado no inventa decimales en el precio',async()=>{
 const r=await corregir({importe:2.48});assert.equal(r.resultado.precio_unitario,1.65);
 const otro=await corregir({importe:3});assert.equal(otro.resultado.precio_unitario,2);
});
test('nombre y unidad se corrigen sin cambiar importes ni factor de envase',async()=>{
 const r=await corregir({descripcion:'PIMIENTO ROJO',unidad:'U'});
 assert.equal(r.resultado.descripcion,'PIMIENTO ROJO');assert.equal(r.resultado.unidad,'U');assert.equal(r.resultado.precio_unitario,1.65);
 assert.equal(r.writes.length,1);assert.match(r.writes[0][0],/descripcion = \?, clave = \?/);
 assert.deepEqual(Array.from(r.writes[0][1]),[1.5,1.65,2.48,'U','PIMIENTO ROJO','pimiento rojo',6,false,7]);
});
test('una devolución admite cantidad negativa y conserva el importe abonado',async()=>{
 const r=await corregir({cantidad:-16},{cantidad:1,precio_unitario:2.78,importe:-44.48});
 assert.equal(r.status,200);assert.equal(r.resultado.cantidad,-16);assert.equal(r.resultado.precio_unitario,2.78);assert.equal(r.resultado.importe,-44.48);
});
test('no permite cantidades cero, nombres vacíos ni cambios fuera del local autorizado',async()=>{
 for(const body of [{cantidad:0},{descripcion:''},{descripcion:'x'.repeat(301)},{cantidad:'mal'},{descripcion:'Otro',aplicar_a_todas:true}]){
  const r=await corregir(body);assert.equal(r.status,400);assert.equal(r.writes.length,0);
 }
 const r=await corregir({importe:3},{},false);assert.equal(r.status,403);assert.equal(r.writes.length,0);
});

// Casos encontrados al cotejar los originales de Agrària y Kiku.
test('cotejo conserva precio e importe impresos independientes',async()=>{
 for (const [cantidad,precio,importe] of [[1,4.135,4.13],[4.11,7.95,32.68],[4.05,3.702,15.01]]) {
  const r=await corregir({precio_unitario:precio,conservar_original:true},{cantidad,importe});
  assert.equal(r.status,200);assert.equal(r.resultado.precio_unitario,precio);assert.equal(r.resultado.importe,importe);
  const total=await corregir({importe,conservar_original:true},{cantidad,precio_unitario:precio});
  assert.equal(total.resultado.precio_unitario,precio);assert.equal(total.resultado.importe,importe);
 }
});
test('cotejo de cantidad no sustituye precio ni importe y no propaga',async()=>{
 const r=await corregir({cantidad:4.05,conservar_original:true},{precio_unitario:3.702,importe:15.01});
 assert.equal(r.resultado.cantidad,4.05);assert.equal(r.resultado.precio_unitario,3.702);assert.equal(r.resultado.importe,15.01);
 const rechazado=await corregir({cantidad:4.05,conservar_original:true,aplicar_a_todas:true});
 assert.equal(rechazado.status,400);assert.equal(rechazado.writes.length,0);
});

test('detalle sustituido devuelve conflicto sin escritura y revierte la transacción',async()=>{
 const r=await corregir({cantidad:1.00001,conservar_original:true},{},true,true);
 assert.equal(r.status,409);assert.equal(r.writes.length,0);assert.deepEqual(r.events,['BEGIN','lock','ROLLBACK']);
});
test('cantidad con cinco decimales se guarda sin redondeo y sólo responde tras commit',async()=>{
 const r=await corregir({cantidad:'1,00001',conservar_original:true});
 assert.equal(r.status,200);assert.equal(r.resultado.cantidad,1.00001);assert.equal(r.writes[0][1][0],1.00001);
 assert.deepEqual(r.events,['BEGIN','lock','COMMIT']);
});
