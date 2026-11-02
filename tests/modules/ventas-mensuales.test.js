import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumirMes,leerMesVentas,ventasPendientes} from '../../src/modules/informes/ventas-mensuales.js';
const mes='2026-10',fila={dia:'2026-10-01',ventas:10.1,tickets:2};
test('lectura vacía correcta equivale a cero; fallo, importes ausentes y días duplicados no',()=>{
 assert.deepEqual(resumirMes([],mes),{ventas:0,tickets:0});
 for(const rows of [null,[{...fila,ventas:null}],[{...fila,ventas:''}],[{...fila,tickets:null}],[{...fila,tickets:2.5}],[{...fila,dia:'2026-09-30'}],[{...fila,dia:'2026-10-32'}],[fila,fila]])assert.equal(resumirMes(rows,mes),null);
 assert.deepEqual(resumirMes([fila,{...fila,dia:'2026-10-31',ventas:0.2}],mes),{ventas:10.3,tickets:4});
});
test('respaldo completo sustituye, nunca suma y nunca rellena huecos inventando ceros',async()=>{
 const dias=Array.from({length:31},(_,i)=>({...fila,dia:`2026-10-${String(i+1).padStart(2,'0')}`}));
 const opts={mes,locales:['Girona'],configurados:new Set(['Girona']),leer:async()=>{throw Error('timeout');},respaldo:async()=>dias};
 let rows=await leerMesVentas(opts);assert.equal(rows[0].ventas,313.1);assert.equal(rows[0].fuente,'guardado');
 rows=await leerMesVentas({...opts,respaldo:async()=>dias.slice(1)});assert.equal(ventasPendientes(rows),true);
 rows=await leerMesVentas({...opts,leer:async()=>[fila]});assert.equal(rows[0].ventas,10.1);assert.equal(rows[0].fuente,'tpv');
});
test('un local sin configurar se diferencia de un fallo; nunca se confirma un grupo sin lecturas',async()=>{
 const rows=await leerMesVentas({mes,locales:['Girona','Otro'],configurados:new Set(['Girona']),leer:async()=>[],respaldo:async()=>[]});
 assert.equal(rows[1].motivo,'sin_configurar');assert.equal(ventasPendientes(rows),false);
 assert.equal(ventasPendientes([rows[1]]),true);
 assert.equal(ventasPendientes([]),true);
});
