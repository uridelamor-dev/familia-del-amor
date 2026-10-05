import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crearFetchFactura, conPlazoFactura} from '../../src/modules/facturas/red.js';

test('429 espera Retry-After y repite exactamente el cuerpo sin perder la respuesta', async t => {
 const llamadas=[], pausas=[];
 t.mock.method(globalThis,'fetch',async (url,opts)=>{
  llamadas.push({url,body:opts.body,method:opts.method});
  return llamadas.length===1 ? new Response('',{status:429,headers:{'Retry-After':'3'}}) : Response.json({id:'libro'});
 });
 const fetch=crearFetchFactura({esperar:async ms=>pausas.push(ms),azar:()=>0});
 assert.deepEqual(await (await fetch('https://sheets.googleapis.com/test',{method:'POST',body:'datos'})).json(),{id:'libro'});
 assert.deepEqual(pausas,[3000]); assert.deepEqual(llamadas[0],llamadas[1]);
});
test('429 sin cabecera espera una ventana de cuota, y aumenta la espera', async t=>{
 let n=0;const pausas=[];
 t.mock.method(globalThis,'fetch',async()=>++n<3?new Response('',{status:429}):Response.json({ok:true}));
 const fetch=crearFetchFactura({esperar:async ms=>pausas.push(ms),azar:()=>0});
 await conPlazoFactura(()=>fetch('https://sheets.googleapis.com/test'),300000);
 assert.deepEqual(pausas,[60000,120000]);
});
test('Retry-After admite fecha HTTP',async t=>{
 let n=0;const pausas=[];
 t.mock.method(globalThis,'fetch',async()=>++n===1?new Response('',{status:429,headers:{'Retry-After':'Mon, 05 Oct 2026 20:00:05 GMT'}}):Response.json({}));
 await crearFetchFactura({esperar:async ms=>pausas.push(ms),ahora:()=>Date.parse('2026-10-05T20:00:00Z'),azar:()=>0})('https://sheets.googleapis.com/test');
 assert.deepEqual(pausas,[5000]);
});
test('no repite errores ambiguos ni errores de permisos',async t=>{
 for(const status of [403,500,503]) {
  let n=0;t.mock.method(globalThis,'fetch',async()=>{n++;return new Response('',{status});});
  await assert.rejects(crearFetchFactura()('https://sheets.googleapis.com/test',{method:'POST'}),new RegExp(String(status)));
  assert.equal(n,1);t.mock.restoreAll();
 }
});
test('respeta plazo y no inicia una espera que no puede completar',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('',{status:429}));
 let esperas=0;
 await assert.rejects(conPlazoFactura(()=>crearFetchFactura({esperar:async()=>esperas++})('https://sheets.googleapis.com/test'),1000),/pendiente/);
 assert.equal(esperas,0);
});
test('cancelar durante la espera impide otro intento',async t=>{
 const controller=new AbortController();let n=0;
 t.mock.method(globalThis,'fetch',async()=>{n++;return new Response('',{status:429});});
 const fetch=crearFetchFactura({esperar:async()=>controller.abort(new Error('cancelado')),azar:()=>0});
 await assert.rejects(fetch('https://sheets.googleapis.com/test',{signal:controller.signal}),/cancelado/);
 assert.equal(n,1);
});
