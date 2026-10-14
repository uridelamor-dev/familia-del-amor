import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mesesVencidos,mensajeCompras,mensajeVentas,mensajesCompras,mensajesVentas,crearMensuales} from '../../src/modules/informes/mensuales.js';
test('ventas vencen el 1 y compras el 10 a las 9 de Madrid, sin adelantar octubre',()=>{
 assert.deepEqual(mesesVencidos(new Date('2026-10-31T10:00Z'),1),[]);
 assert.deepEqual(mesesVencidos(new Date('2026-11-01T07:59Z'),1),[]);
 assert.deepEqual(mesesVencidos(new Date('2026-11-01T08:00Z'),1),['2026-10']);
 assert.deepEqual(mesesVencidos(new Date('2026-11-01T08:00Z'),10),[]);
 assert.deepEqual(mesesVencidos(new Date('2026-11-10T08:00Z'),10),['2026-10']);
 assert.deepEqual(mesesVencidos(new Date('2027-01-01T08:00Z'),1),['2026-10','2026-11','2026-12']);
});
test('compras muestra IVA, gastos comunes y posibles duplicados sin ocultarlos',()=>{
 const text=mensajeCompras('2026-10',{rows:[{local:'Empresa · Prueba',documentos:2,total:121,base:100,iva:21}],excluidos:1,incompletos:1});
 assert.match(text,/121,00 €/);assert.match(text,/Empresa · Prueba/);assert.match(text,/1 posibles duplicados/);assert.match(text,/resumen provisional/);
});
test('ventas agrupa Blanes sin presentar un TPV ausente como cero y calcula media ponderada',()=>{
 const text=mensajeVentas('2026-10',[{local:'La Tapeta - Blanes',disponible:true,ventas:200,tickets:10},{local:'Cooperativa - Blanes',disponible:false},{local:'Girona',disponible:true,ventas:100,tickets:5}]);
 assert.match(text,/Subtotal disponible: 300,00 €/);assert.match(text,/Ticket medio: 20,00 €/);assert.match(text,/La Tapeta - Blanes: Datos incompletos/);assert.match(text,/Sin datos confirmados de: Cooperativa/);
});
function harness(){
 const state=new Map(),sent=[];let connected=false,fail=false;
 const query=async(sql,args=[])=>{
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes('pg_advisory_unlock'))return {rows:[]};
  if(sql.startsWith('SELECT value'))return {rows:state.has(args[0])?[{value:state.get(args[0])}]:[]};
  if(sql.startsWith('INSERT')){state.set(args[0],args[1]);return {rows:[]};}throw Error(sql);
 };
 const opts={pool:{connect:async()=>({query,release(){}})},enabled:true,conectado:()=>connected,now:()=>new Date('2026-11-12T10:00Z'),compras:async()=>({rows:[]}),ventas:async()=>[],enviar:async(n,m)=>{sent.push([n,m]);if(fail)throw Error('fallo');}};
 return {state,sent,opts,connect:()=>connected=true,fail:()=>fail=true};
}
test('recupera fuera del día previsto, persiste y no repite al reiniciar',async()=>{
 const h=harness();await crearMensuales(h.opts).tick();assert.equal(h.sent.length,0);
 h.connect();await crearMensuales(h.opts).tick();await crearMensuales(h.opts).tick();await crearMensuales(h.opts).tick();
 assert.equal(h.sent.length,2);assert.ok(h.sent.every(([tel])=>tel==='622149946'));
});
test('si envío es incierto no reenvía y sigue con el otro informe',async()=>{
 const h=harness();h.connect();h.fail();await crearMensuales(h.opts).tick();await crearMensuales(h.opts).tick();await crearMensuales(h.opts).tick();
 assert.equal(h.sent.length,2);assert.equal(JSON.parse(h.state.get('informe_ventas_2026-10_v1')).estado,'incierta');
});

test('general y cada local con comparaciones, sin comparar un grupo parcial',()=>{
 const row={local:'Lloret',disponible:true,ventas:45000,tickets:2250};
 const msgs=mensajesVentas('2026-10',{actual:[row],anterior:[{...row,ventas:42000}],anual:[{...row,ventas:40000}]});
 assert.equal(msgs.length,2);assert.match(msgs[1],/7,1 %/);assert.match(msgs[1],/12,5 %/);
 const parcial=mensajesVentas('2026-10',{actual:[row],anterior:[{...row,disponible:false}],anual:[]});
 assert.match(parcial[0],/septiembre de 2026: No disponible/);
 const compras=mensajesCompras('2026-10',{rows:[{local:'Lloret',documentos:1,total:121,base:100,iva:21},{local:'Empresa · SL',documentos:1,total:50,base:50,iva:0}]});
 assert.equal(compras.length,2);assert.match(compras[0],/Empresa · SL/);assert.doesNotMatch(compras[1],/171,00/);
});
test('cola de varios mensajes reanuda desde el siguiente sin regenerar ni repetir',async()=>{
 const h=harness();h.connect();h.opts.ventas=async()=>[{local:'Lloret',disponible:true,ventas:100,tickets:5}];
 await crearMensuales(h.opts).tick();
 h.opts.ventas=async()=>{throw Error('no regenerar');};
 await crearMensuales(h.opts).tick();
 assert.equal(h.sent.length,2);assert.match(h.sent[1][1],/VENTAS · LLORET/);
 assert.equal(JSON.parse(h.state.get('informe_ventas_2026-10_v1')).estado,'enviada');
});
