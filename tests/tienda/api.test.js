import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {once} from 'node:events';
import {rutasTienda} from '../../src/modules/tienda/rutas.js';import {estadoDemo} from '../../src/modules/tienda/preparar.js';
test('API: permisos, edición persistente, simulación, exportaciones y cierre público',async()=>{
 let state=estadoDemo();const store={read:async()=>structuredClone(state),mutate:async fn=>{const copy=structuredClone(state),r=await fn(copy);state=copy;return r;}};
 const app=express();app.use('/api/tienda',rutasTienda({store,root:process.cwd(),demo:true,auth:(req,res,next)=>{if(req.headers.authorization!=='Bearer demo-test')return res.sendStatus(401);req.user={id:1,rol:'direccion'};next();}}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api/tienda`;
 const req=(path,body,auth=false)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer demo-test'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{assert.equal((await req('/admin/state')).status,401);let r=await req('/admin/catalog/p09',{priceCents:499,format:{es:'Formato editado',ca:'Format editat'}},true);assert.equal(r.status,200);const pub=await(await req('/catalog')).json();const p=pub.catalog.find(p=>p.id==='p09');assert.equal(p.priceCents,499);assert.equal(p.format.ca,'Format editat');assert.equal(p.costCents,undefined);
 const b={key:crypto.randomUUID(),lineas:[{id:'p09',unidades:1},{id:'box-kraft',unidades:1}],lotes:2,deliveryId:'recogida-demo',contact:{name:'Prueba API',email:'test@example.invalid'},accepted:true,lang:'ca'};const a=await(await req('/orders',b)).json();assert.equal(a.demo,true);const again=await(await req('/orders',b)).json();assert.equal(a.id,again.id);assert.equal(state.orders.length,1);assert.equal(state.outbox[0].status,'simulado');assert.equal(a.price.marginCheck,undefined);
 r=await req('/admin/export/orders',undefined,true);assert.equal(r.status,200);assert.equal(Buffer.from(await r.arrayBuffer()).readUInt32LE(),0x04034b50);
 r=await req(`/admin/orders/${a.id}/pdf`,undefined,true);assert.equal(r.status,200);assert.ok(Buffer.from(await r.arrayBuffer()).toString().startsWith('%PDF'));
 await req('/admin/config',{publicActive:false},true);assert.equal((await req('/catalog')).status,409);assert.equal((await req('/admin/state',undefined,true)).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
