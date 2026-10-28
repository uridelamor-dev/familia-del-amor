import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {AVISOS_SCHEMA,sincronizarFuente,registrarBandeja} from '../../src/modules/avisos/bandeja.js';
import {cargarAvisosFuente} from '../../src/modules/avisos/fuentes.js';
const ahora=Date.parse('2026-10-28T12:00:00Z');
test('Antigüedad persistente, resolución automática, reapertura y aislamiento de ámbitos',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 await db.raw(AVISOS_SCHEMA);await db.raw(AVISOS_SCHEMA);
 const client={query:db.raw};
 const leer=(items,tiempo=ahora,ambito='[]')=>sincronizarFuente(client,{fuente:'rrhh',ambito,ahora:tiempo,cargar:async()=>items});
 const item={id:'rrhh:1:telefono'};
 let a=await leer([item]);assert.equal(+new Date(a[0].primera),ahora);
 a=await leer([item],ahora+86400000);assert.equal(+new Date(a[0].primera),ahora);
 await leer([],ahora+86400000,'["Otro local"]');
 assert.equal((await db.get("SELECT resuelta FROM panel_avisos_historial WHERE ambito='[]'")).resuelta,null);
 await leer([],ahora+2*86400000);
 assert.ok((await db.get("SELECT resuelta FROM panel_avisos_historial WHERE ambito='[]'")).resuelta);
 a=await leer([{...item,desde:'2000-01-01'}],ahora+3*86400000);
 assert.equal(+new Date(a[0].primera),ahora+3*86400000,'una recurrencia no hereda la edad del aviso resuelto');
 await assert.rejects(sincronizarFuente(client,{fuente:'rrhh',ambito:'[]',cargar:async()=>{throw Error('sin conexión');}}));
 assert.equal((await db.get("SELECT resuelta FROM panel_avisos_historial WHERE ambito='[]'")).resuelta,null,'un fallo de lectura no resuelve avisos');
 }finally{await db.fin();}
});
test('Fuentes SQL reales: locales, campos privados, IVA, duplicados y reseñas archivadas',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 await db.raw(`CREATE TABLE users(id INT,username TEXT,nombre TEXT,local TEXT,activo INT,fecha_alta TEXT,fecha_baja TEXT,telefono TEXT,puesto TEXT,fecha_nac TEXT,email TEXT,dni TEXT,rol TEXT);
 CREATE TABLE rrhh_datos_alta(worker_id INT,direccion TEXT,iban TEXT,tipo_jornada TEXT,tipo_contrato TEXT,talla_camiseta TEXT,talla_sudadera TEXT);
 CREATE TABLE hr_applications(id INT,nombre TEXT,creado_en TEXT,estado TEXT);
 CREATE TABLE facturas(id INT,proveedor TEXT,numero_factura TEXT,local TEXT,revisar TEXT,iva_estado TEXT,dup_estado TEXT);
 CREATE TABLE facturas_pendientes(id INT,proveedor TEXT,numero_factura TEXT,creado_en TEXT);
 CREATE TABLE maintenance_issues(id INT,local TEXT,titulo TEXT,creado_en TEXT,fecha_objetivo TEXT,estado TEXT);
 CREATE TABLE google_reviews(id TEXT,author TEXT,rating INT,location_name TEXT,fecha TEXT,creado_en TEXT,google_reply TEXT);
 CREATE TABLE reviews_repaso(cutoff TEXT);
 CREATE TABLE reviews_repaso_items(review_id TEXT,state TEXT);
 INSERT INTO users(id,nombre,local,activo,rol) VALUES(1,'Ana','Oficina',1,'trabajador'),(2,'Otra persona','Otro',1,'trabajador');
 INSERT INTO facturas VALUES(1,'P','F1','Oficina','[]','revisar',NULL),(2,'Q','F2','Otro','["Aviso"]',NULL,NULL),(3,'R','F3','Oficina','[]',NULL,'distinta');
 INSERT INTO google_reviews VALUES('1','Cliente',1,'La Tapeta Blanes','2026-10-27',NULL,NULL),('2','Otro',1,'La Tapeta Lloret','2026-10-27',NULL,NULL),('3','Antigua',1,'La Tapeta Blanes','2020-01-01',NULL,NULL),('4','Resuelta',1,'La Tapeta Blanes','2026-10-27',NULL,'Gracias');
 INSERT INTO reviews_repaso VALUES('2026-10-01');
 INSERT INTO reviews_repaso_items VALUES('2','omitir');`);
 const cargar=(f,locales=[])=>cargarAvisosFuente({query:db.raw},f,{locales,hoy:'2026-10-28',whatsappConnected:true});
 const rr=await cargar('rrhh',['Oficina']);assert.ok(rr.length);assert.ok(rr.every(a=>a.worker_id===1));
 assert.deepEqual((await cargar('facturas',['Oficina'])).map(a=>a.documento_id),[1]);
 assert.deepEqual((await cargar('reviews',['La Tapeta - Blanes'])).map(a=>a.documento_id),['1']);
 assert.equal((await cargar('reviews')).length,1);
 for(const f of ['candidaturas','pendientes','mantenimiento','whatsapp'])assert.deepEqual(await cargar(f),[]);
 }finally{await db.fin();}
});
test('La API de campana no consulta fuentes de otros departamentos',async()=>{
 let handler;const cargadas=[];
 registrarBandeja({get:(ruta,auth,h)=>handler=h},{auth:()=>{},pool:{connect:async()=>({query:async sql=>({rows:[]}),release(){}})},ambito:()=> '[]',cargar:async(c,r,f)=>{cargadas.push(f);return [];}});
 let respuesta;
 await handler({user:{rol:'contabilidad'}},{set(){},json:r=>respuesta=r,status(){return this;}});
 assert.deepEqual(cargadas,['facturas','pendientes']);assert.equal(respuesta.total,0);
});

test('Una fuente fallida no oculta los avisos de las demás',async()=>{
 let handler,respuesta;let liberadas=0;
 registrarBandeja({get:(ruta,auth,h)=>handler=h},{auth:()=>{},pool:{connect:async()=>({query:async()=>({rows:[]}),release(){liberadas++;}})},ambito:()=> '[]',cargar:async(c,r,f)=>{
  if(f==='facturas')throw Error('fallo temporal');
  return [{id:'pendiente:1',titulo:'Asignar documento',sev:'imp'}];
 }});
 await handler({user:{rol:'contabilidad'}},{set(){},json:r=>respuesta=r,status(){return this;}});
 assert.deepEqual(respuesta.fallidas,['facturas']);assert.equal(respuesta.total,1);
 assert.equal(respuesta.data[0].fuente,'pendientes');assert.equal(liberadas,2);
});
