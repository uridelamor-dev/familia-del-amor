import test from 'node:test';
import assert from 'node:assert/strict';
import {inicial} from '../../src/modules/tienda/catalogo.js';
import {catalogoCerezo,aplicarCerezo2026} from '../../src/modules/tienda/cerezo-2026.js';
import {calcular} from '../../src/modules/tienda/calculo.js';
import {catalogoPublico} from '../../src/modules/tienda/servicio.js';
test('27 referencias trazables, con coste negociado y margen de mercancía mínimo del 30%',()=>{
 const ps=catalogoCerezo();assert.equal(ps.length,27);assert.equal(new Set(ps.map(p=>p.id)).size,27);
 assert.equal(ps[0].suggestedRetailCents,2783);assert.equal(ps.at(-1).suggestedRetailCents,42048);
 for(const p of ps){assert.ok(p.costCents*100<=p.priceCents*70,p.id);assert.ok(p.sourcePage);assert.ok(p.images[0].url);assert.equal(p.packagingIncluded,true);}
});
test('migración una sola vez: conserva pedidos, productos, ediciones posteriores y lotes personalizados',()=>{
 const s=inicial();s.orders=[{id:'real',snapshot:{totalCents:12345}}];s.bundles.push({id:'personal',visible:true});const orders=structuredClone(s.orders),products=structuredClone(s.catalog);
 assert.equal(aplicarCerezo2026(s),true);assert.deepEqual(s.orders,orders);assert.deepEqual(s.catalog.slice(0,65),products);assert.equal(s.bundles.find(b=>b.id==='personal').visible,true);assert.equal(s.bundles.find(b=>b.id==='detallet').visible,false);assert.equal(s.config.discounts.enabled,false);
 s.catalog.find(p=>p.bundleOnly).priceCents=9999;const current=structuredClone(s);assert.equal(aplicarCerezo2026(s),false);assert.deepEqual(s,current);
});
test('lote completo sin caja adicional, impuestos mixtos pendientes y sin descuentos por volumen',()=>{
 const s=inicial();aplicarCerezo2026(s);for(const p of s.catalog.filter(p=>p.bundleOnly)){
 const r=calcular(s.catalog,{lineas:[{id:p.id,unidades:1}],lotes:1000},s.config.discounts);assert.equal(r.discountBps,0);assert.equal(r.baseCents,p.priceCents*1000);if(p.taxBps===null)assert.equal(r.taxCents,null);
 }
 assert.throws(()=>calcular(s.catalog,{lineas:[{id:'p09',unidades:1}],lotes:1}),/embalaje/);
});
test('catálogo público sin costes ni referencia interna del proveedor',()=>{
 const s=inicial();aplicarCerezo2026(s);for(const p of catalogoPublico(s)){assert.equal('costCents'in p,false);assert.equal('costEstimated'in p,false);assert.equal('sourcePage'in p,false);}
});

test('publicación oculta procedencia y resuelve la selección del cliente sin cambiar IDs internos',async()=>{
 const {datosPublicos,pedidoInterno}=await import('../../src/modules/tienda/publicacion.js');
 const s=inicial();aplicarCerezo2026(s);
 const exposed=datosPublicos({catalog:catalogoPublico(s),bundles:s.bundles});
 assert.doesNotMatch(JSON.stringify(exposed),/cerezo|supplierReference|sourceCatalog|sourceUrl/i);
 const p=exposed.catalog.find(p=>p.id==='lot-nadal-16');assert.ok(p);
 assert.equal(pedidoInterno(s,{lineas:[{id:p.id,unidades:2}]}).lineas[0].id,'cerezo-2026-16');
});
test('ampliación conserva cambios previos y añade ambas espatllas',()=>{
 const s=inicial();aplicarCerezo2026(s);s.config.cerezoRevision=1;
 s.catalog=s.catalog.filter(p=>!['cerezo-2026-16','cerezo-2026-17'].includes(p.id));
 s.bundles=s.bundles.filter(p=>!['cerezo-2026-16','cerezo-2026-17'].includes(p.id));
 s.config.discounts.enabled=true;const backups=s.config.catalogBackups.length;
 aplicarCerezo2026(s);assert.equal(s.config.discounts.enabled,true);assert.equal(s.config.catalogBackups.length,backups);
 assert.ok(s.catalog.find(p=>p.id==='cerezo-2026-17'));assert.ok(s.catalog.find(p=>p.id==='cerezo-2026-16'));
});

 test('descuento de proveedor del 8% actualiza las 27 referencias existentes sin descontar dos veces ni alterar ventas',async()=>{
 const {seleccionCerezo}=await import('../../src/modules/tienda/cerezo-2026.js');
 const s=inicial();aplicarCerezo2026(s);s.config.cerezoRevision=3;
 for(const r of seleccionCerezo){
  const p=s.catalog.find(p=>p.id===`cerezo-2026-${r.reference}`);
  p.costCents=r.catalogCostCents;
  assert.equal(r.costCents,Math.round(r.catalogCostCents*9200/10000));
  assert.equal(r.supplierDiscountBps,800);
 }
 s.catalog.find(p=>p.bundleOnly).priceCents=12345;
 s.orders=[{id:'historico',costCents:3090}];
 const prices=s.catalog.filter(p=>!p.bundleOnly).map(p=>p.priceCents),orders=structuredClone(s.orders),discounts=structuredClone(s.config.discounts);
 assert.equal(aplicarCerezo2026(s),true);
 for(const r of seleccionCerezo)assert.equal(s.catalog.find(p=>p.id===`cerezo-2026-${r.reference}`).costCents,r.costCents);
 assert.deepEqual(s.catalog.filter(p=>!p.bundleOnly).map(p=>p.priceCents),prices);
 for(const p of s.catalog.filter(p=>p.bundleOnly)){assert.equal(p.priceCents,Math.ceil(p.costCents*100/70));assert.equal(p.suggestedRetailCents,p.priceCents+Math.round(p.priceCents*(p.taxBps??2100)/10000));}assert.deepEqual(s.orders,orders);assert.deepEqual(s.config.discounts,discounts);
 const after=structuredClone(s);assert.equal(aplicarCerezo2026(s),false);assert.deepEqual(s,after);
 });

 test('ampliar desde revisión 6 conserva precios editados y añade los dos lotes sin duplicarlos',()=>{
 const s=inicial();aplicarCerezo2026(s);s.config.cerezoRevision=6;
 const ids=['cerezo-2026-100','cerezo-2026-103'];
 s.catalog=s.catalog.filter(p=>!ids.includes(p.id));s.bundles=s.bundles.filter(p=>!ids.includes(p.id));
 const original=s.catalog.find(p=>p.bundleOnly);original.priceCents=12345;
 assert.equal(aplicarCerezo2026(s),true);assert.equal(original.priceCents,12345);
 for(const id of ids){assert.equal(s.catalog.filter(p=>p.id===id).length,1);assert.equal(s.bundles.filter(p=>p.id===id).length,1);}
 assert.equal(s.catalog.find(p=>p.id===ids[0]).suggestedRetailCents,6346);
 assert.equal(s.catalog.find(p=>p.id===ids[1]).suggestedRetailCents,4915);
 assert.equal(aplicarCerezo2026(s),false);
 });
