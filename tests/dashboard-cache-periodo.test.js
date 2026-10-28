import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crearCachePeriodo} from '../src/modules/dashboard/cache-periodo.js';
test('devuelve guardado, renueva en segundo plano y comparte peticiones',async()=>{
 let reloj=0,n=0,liberar;const leer=crearCachePeriodo({ahora:()=>reloj,fresco:10,maxEdad:100});
 const primero=await leer('A',async()=>({total:++n}));assert.equal(primero.total,1);
 reloj=20;
 const cargar=()=>new Promise(r=>{liberar=()=>r({total:++n});});
 const anterior=await leer('A',cargar);assert.equal(anterior.total,1);assert.equal(anterior.lectura.actualizando,true);
 const espera=leer('A',()=>{throw Error('duplicado');},{esperar:true});liberar();
 assert.equal((await espera).total,2);assert.equal(n,2);
 primero.total=999;assert.equal((await leer('A',cargar)).total,2);
});
test('no mezcla ambitos y no oculta un fallo tras caducar',async()=>{
 let reloj=0;const leer=crearCachePeriodo({ahora:()=>reloj,fresco:1,maxEdad:2});
 await leer('A',async()=>({total:12}));assert.equal((await leer('B',async()=>({total:34}))).total,34);
 reloj=3;await assert.rejects(leer('A',async()=>{throw Error('offline');}),/offline/);
 assert.equal((await leer('A',async()=>({total:56}))).total,56);
});
