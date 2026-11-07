import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {redondearImporte} from '../src/modules/facturas/redondeo.js';
import {claveProducto} from '../src/modules/facturas/lineas.js';

const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const inicio=source.indexOf('app.patch("/api/facturas/lineas/:id"');
const ruta=source.slice(inicio,source.indexOf('\n});',inicio)+4);
async function corregir(body,linea={},acceso=true){
 let handler;const writes=[];let resultado,status=200;
 const original={id:7,factura_id:1,descripcion:'PLATANOS',clave:'platanos',cantidad:1.5,precio_unitario:1.65,importe:2.48,unidad:'kg',factor_unidad:6,local:'Girona',base_imponible:2.48,...linea};
 vm.runInNewContext(ruta,{app:{patch:(_p,_a,h)=>{handler=h;}},requireAuth:()=>()=>{},
  dbGet:async()=>original,dbRun:async(s,p)=>{writes.push([s,p]);},dbAll:async()=>[],
  puedeAccederLocal:()=>acceso,redondearImporte,claveProducto,
  recalcularCuadre:async()=>({suma:2.48,base:2.48,diferencia:0,cuadra:true}),console});
 const res={status(n){status=n;return this;},json(v){resultado=v;return this;}};
 await handler({params:{id:'7'},body},res);return {status,resultado,writes};
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
