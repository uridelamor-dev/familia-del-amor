import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mesesVencidos,mensajeCompras,mensajeVentas,mensajesCompras,mensajesVentas,crearMensuales,desplazarMes} from '../../src/modules/informes/mensuales.js';
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
 const opts={pool:{connect:async()=>({query,release(){}})},enabled:true,conectado:()=>connected,now:()=>new Date('2026-11-12T10:00Z'),compras:async()=>({rows:[]}),ventas:async()=>({actual:[{local:'Lloret',disponible:true,ventas:0,tickets:0}]}),enviar:async(n,m)=>{sent.push([n,m]);if(fail)throw Error('fallo');}};
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
 assert.equal(msgs.length,1);assert.match(msgs[0],/7,1 %/);assert.match(msgs[0],/12,5 %/);assert.match(msgs[0],/Lloret/);
 const parcial=mensajesVentas('2026-10',{actual:[row],anterior:[{...row,disponible:false}],anual:[]});
 assert.match(parcial[0],/septiembre de 2026: No disponible/);
 const compras=mensajesCompras('2026-10',{rows:[{local:'Lloret',documentos:1,total:121,base:100,iva:21},{local:'Empresa · SL',documentos:1,total:50,base:50,iva:0}]});
 assert.equal(compras.length,2);assert.match(compras[0],/Empresa · SL/);assert.doesNotMatch(compras[1],/171,00/);
});
test('cola de varios mensajes reanuda desde el siguiente sin regenerar ni repetir',async()=>{
 const h=harness();h.connect();h.state.set('informe_ventas_2026-10_v1',JSON.stringify({estado:'preparada',mensajes:['resumen anterior','VENTAS · LLORET'],enviados:0}));
 await crearMensuales(h.opts).tick();
 h.opts.ventas=async()=>{throw Error('no regenerar');};
 await crearMensuales(h.opts).tick();
 assert.equal(h.sent.length,2);assert.match(h.sent[1][1],/VENTAS · LLORET/);
 assert.equal(JSON.parse(h.state.get('informe_ventas_2026-10_v1')).estado,'enviada');
});

test('el informe consulta las mismas fuentes de Blanes que el panel, sin duplicar Cooperativa',async()=>{
 const {readFileSync}=await import('node:fs');
 const {runInNewContext}=await import('node:vm');
 const {fuentesVentas}=await import('../../src/modules/locales/centros.js');
 const {leerMesVentas}=await import('../../src/modules/informes/ventas-mensuales.js');
 const src=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 const bloque=src.slice(src.indexOf('  const mensuales = crearMensuales({'),src.indexOf('  const tickMensuales='));
 let opts;const calls=[];
 runInNewContext(bloque,{crearMensuales:o=>opts=o,pool:{},PROD:false,isReady:()=>false,sendMensajeLibre:()=>{throw Error('No enviar');},INV_LOCALES:['La Tapeta - Blanes','Cooperativa - Blanes','La Tapeta - Girona',"Botiga d'en Mateu - Tordera",'Oficina'],LOCALES_SIN_PUBLICO:new Set(['Oficina']),fuentesVentas,desplazarMes,leerMesVentas,loadAgoraConfigsActive:async()=>['La Tapeta - Blanes','La Tapeta - Girona'].map(local=>({local,usuario:'test',password:'test'})),ventasRangoLive:async(l,from)=>{calls.push([l,from]);return [{dia:from,ventas:100,tickets:10}];}});
 const r=await opts.ventas('2026-10');
 assert.equal(calls.length,6);
 assert.ok(calls.every(([l])=>l!=='Cooperativa - Blanes'&&l!=='Oficina'));
 assert.equal(r.actual.length,2);
 assert.ok(r.actual.every(x=>x.disponible));
 assert.doesNotMatch(mensajesVentas('2026-10',r)[0],/Datos incompletos|Sin datos confirmados/);
});

test('facturación espera a las 11 de Madrid, también en horario de verano',async()=>{
 assert.deepEqual(mesesVencidos(new Date('2026-11-01T09:59:59Z'),1,11),[]);
 assert.deepEqual(mesesVencidos(new Date('2026-11-01T10:00:00Z'),1,11),['2026-10']);
 assert.deepEqual(mesesVencidos(new Date('2027-06-01T08:59:59Z'),1,11),[]);
 assert.ok(mesesVencidos(new Date('2027-06-01T09:00:00Z'),1,11).includes('2027-05'));
 const h=harness();h.connect();
 h.opts.now=()=>new Date('2026-11-01T09:59:59Z');
 await crearMensuales(h.opts).tick();assert.equal(h.sent.length,0);
 h.opts.now=()=>new Date('2026-11-01T10:00:00Z');
 await crearMensuales(h.opts).tick();assert.equal(h.sent.length,1);
 assert.match(h.sent[0][1],/FACTURACIÓN/);
});

test('un TPV sin confirmar retrasa el envío y se vuelve a consultar al reintentar',async()=>{
 const h=harness();h.connect();let lecturas=0;
 h.opts.now=()=>new Date('2026-11-01T10:00Z');
 h.opts.ventas=async()=>{lecturas++;return {actual:[{local:'Girona',disponible:false,motivo:'lectura_pendiente'}]};};
 await crearMensuales(h.opts).tick();assert.equal(h.sent.length,0);
 await crearMensuales(h.opts).tick();assert.equal(lecturas,1);
 h.opts.now=()=>new Date('2026-11-01T10:30Z');
 h.opts.ventas=async()=>{lecturas++;return {actual:[{local:'Girona',disponible:true,ventas:32888,tickets:3085}]};};
 await crearMensuales(h.opts).tick();assert.equal(lecturas,2);assert.equal(h.sent.length,1);
 assert.match(h.sent[0][1],/32.888,00/);assert.doesNotMatch(h.sent[0][1],/incompletos/);
});


test('padre recibe solo ventas desde diciembre, con mismo contenido y progreso independiente',async()=>{
 const h=harness();h.connect();
 // Octubre ya se envió antes del alta: no se reenvía a ninguno.
 for(const tipo of ['ventas','compras'])h.state.set(`informe_${tipo}_2026-10_v1`,JSON.stringify({estado:'enviada'}));
 h.opts.now=()=>new Date('2026-12-01T10:00Z');
 for(let i=0;i<8;i++)await crearMensuales(h.opts).tick();
 const uriel=h.sent.filter(([t])=>t==='622149946').map(([,m])=>m);
 const padre=h.sent.filter(([t])=>t==='34633492120').map(([,m])=>m);
 assert.equal(uriel.length,1);assert.deepEqual(padre,uriel);
 assert.equal([...h.state.keys()].some(k=>k.includes('2026-10_v1_')),false);
 h.opts.now=()=>new Date('2026-12-10T10:00Z');
 for(let i=0;i<4;i++)await crearMensuales(h.opts).tick();
 assert.equal(h.sent.filter(([t])=>t==='34633492120').length,1);
 assert.match(h.sent.at(-1)[1],/COMPRAS/);assert.equal(h.sent.at(-1)[0],'622149946');
});
test('envío incierto al padre no repite la entrega ni modifica el ciclo de Uriel',async()=>{
 const h=harness();h.connect();h.opts.now=()=>new Date('2026-12-01T10:00Z');
 const k='informe_ventas_2026-11_v1';
 h.state.set('informe_ventas_2026-10_v1',JSON.stringify({estado:'enviada'}));
 h.state.set('informe_compras_2026-10_v1',JSON.stringify({estado:'enviada'}));
 const original=JSON.stringify({estado:'enviada',mensajes:['resumen','local'],enviados:2});h.state.set(k,original);
 h.fail();await crearMensuales(h.opts).tick();await crearMensuales(h.opts).tick();
 assert.equal(h.sent.length,1);assert.equal(h.sent[0][0],'34633492120');
 assert.equal(h.state.get(k),original);
 assert.equal(JSON.parse(h.state.get(k+'_34633492120')).estado,'incierta');
});


test('resumen único conserva importes, variaciones y actividad por local sin duplicar bloques',()=>{
 const a={local:'Lloret',disponible:true,ventas:1200,tickets:60};
 const b={local:'Girona',disponible:true,ventas:800,tickets:20};
 const [m]=mensajesVentas('2026-11',{actual:[a,b],anterior:[{...a,ventas:1000},{...b,ventas:1000}],anual:[{...a,ventas:600},{...b,ventas:0}]});
 assert.match(m,/TOTAL: 2000,00/);assert.match(m,/80 tickets · Media: 25,00/);
 assert.match(m,/Lloret · 1200,00/);assert.match(m,/Girona · 800,00/);
 assert.match(m,/60 tickets · Media: 20,00/);assert.match(m,/20 tickets · Media: 40,00/);
 assert.match(m,/octubre de 2026: \+200,00 € · \+20 %/);
 assert.match(m,/octubre de 2026: −200,00 € · -20 %/);
 assert.match(m,/noviembre de 2025: \+800,00 € \(periodo anterior: 0 €\)/);
 assert.doesNotMatch(m,/Infinity|NaN/);assert.equal(m.match(/https:\/\//g).length,1);
 assert.equal(m.match(/📍/g).length,2);assert.match(m,/Importes con IVA/);
});
test('no compara total con un ámbito diferente aunque los datos estén disponibles',()=>{
 const a={local:'Lloret',disponible:true,ventas:1200,tickets:60};
 const b={local:'Girona',disponible:true,ventas:800,tickets:20};
 const [m]=mensajesVentas('2026-11',{actual:[a,b],anterior:[a],anual:[]});
 assert.match(m.split('📍')[0],/octubre de 2026: No disponible/);
 assert.match(m.split('📍')[1],/octubre de 2026: \+0,00 € · \+0 %/);
});
