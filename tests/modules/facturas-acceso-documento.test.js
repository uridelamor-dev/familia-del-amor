import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {puedeLocal} from '../../src/modules/usuarios/locales.js';
import {barras as barrasDelCentro,ambitoDeRuta} from '../../src/modules/locales/centros.js';
const s=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
const code=s.slice(s.indexOf('function puedeAccederLocal('),s.indexOf('// Auth endpoints',s.indexOf('function puedeAccederLocal(')));
const access=vm.runInNewContext(code+';puedeAccederLocal',{puedeLocal,barrasDelCentro,ambitoDeRuta});
test('documento de un segundo local autorizado es accesible sin seleccionar ese local',()=>{
 const req={user:{rol:'contabilidad',local:'Oficina',locales:['Oficina','La Tapeta - Girona']},path:'/api/facturas/documento/1'};
 assert.equal(access(req,'La Tapeta - Girona'),true);
 assert.equal(access(req,'La Tapeta - Lloret'),false);
});
test('consulta, guardado y líneas comprueban permisos y no el filtro del listado',()=>{
 for(const [route,check] of [['app.patch("/api/facturas/:id",','puedeAccederLocal(req,antes.local)'],['app.get("/api/facturas/documento/:id",','puedeAccederLocal(req,row.local)'],['app.get("/api/facturas/:id/lineas",','puedeAccederLocal(req, f.local)']]){
  const start=s.indexOf(route);assert.ok(start>=0);
  assert.ok(s.slice(start,start+3000).includes(check),route);
 }
});

test('una factura marcada «somos nosotros» se puede abrir para corregir desde su aviso',async()=>{
 const factura={id:42,local:'La Tapeta - Girona',proveedor:'Nuestra sociedad',revisar:JSON.stringify(['Somos nosotros, no un proveedor'])};
 const start=s.indexOf('app.get("/api/facturas/documento/:id",');
 const end=s.indexOf('\n});',start)+4;
 let handler;
 vm.runInNewContext(s.slice(start,end),{
  app:{get:(ruta,auth,fn)=>{handler=fn;}},requireAuth:()=>()=>{},
  dbGet:async()=>({...factura}),puedeAccederLocal:access,
  estadoPago:()=> 'pendiente',instanteMadrid:()=>({fecha:'2026-11-04'})
 });
 let status=200,body;
 await handler({params:{id:42},path:'/api/facturas/documento/42',user:{rol:'contabilidad',local:'Oficina',locales:['Oficina','La Tapeta - Girona']}},
  {status(n){status=n;return this;},json(j){body=j;}},e=>{throw e;});
 assert.equal(status,200);
 assert.equal(body.data.id,42);
 assert.equal(body.data.revisar,factura.revisar);
});
