import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { conEsquema, disponible, motivoSalto } from '../helpers/pgtmp.js';
import { RECEPCION_SCHEMA, crearRecepcion } from '../../src/modules/facturas/recepcion.js';
import { datosRevision } from '../../src/modules/facturas/validacion-lectura.js';

const source=readFileSync(new URL('../../server.js',import.meta.url),'utf8');

test('P0: borrador, descarte y enlace de duplicado preservan originales e importes en PostgreSQL',async t=>{
 if(!await disponible())return t.skip(motivoSalto());
 const db=await conEsquema();
 try{
  await db.raw(RECEPCION_SCHEMA);
  await db.raw('CREATE TABLE facturas (id bigint PRIMARY KEY,local text,total numeric)');
  await db.run('INSERT INTO facturas VALUES (42,?,53.18),(43,?,42.00)',['Lloret','Girona']);
  const foto=Buffer.from('original de prueba');
  const datos={tipo:'albaran',proveedor:'Bon Pa',nif_proveedor:'B63190037',fecha:'2026-11-27',
   numero_factura:'2020019549',base_imponible:77.70,porcentaje_iva:4,cuota_iva:3.11,total:80.81};
  for(const id of [3364,1698,2319,2644])await db.run(
   "INSERT INTO facturas_recepciones(id,clave,hash,local,canal,nombre,mime,original,estado,resultado) VALUES (?, ?, ?, 'Lloret','WhatsApp','original.jpg','image/jpeg',?,'revision',?::jsonb)",
   [id,'clave-'+id,'hash-'+id,foto,JSON.stringify({datos})]);

  const routes=new Map();
  const script=source.slice(source.indexOf('function localRevisionRecepcion('),
   source.indexOf('app.post("/api/facturas/recepciones/:id/espera"'));
  vm.runInNewContext(script,{app:{post:(path,_auth,handler)=>routes.set(path.split('/').at(-1),handler)},
   requireAuth:()=>null,localesAccesibles:()=>['Lloret','Girona'],dbGet:db.get,dbRun:db.run,datosRevision,puedeAccederLocal:(_req,local)=>local==='Lloret'});
  const post=async (path,id,body)=>{
   const res={code:200,status(n){this.code=n;return this;},json(payload){this.payload=payload;}};
   await routes.get(path)({params:{id},body,user:{id:'contabilidad'}},res,e=>{throw e;});
   return res.code;
  };
  const fila=id=>db.get('SELECT * FROM facturas_recepciones WHERE id=?',[id]);
  assert.equal(await post('borrador',3364,{datos:{numero_factura:'2026019549'}}),200);
  const borrador=await fila(3364);
  assert.equal(borrador.estado,'revision');
  assert.equal(borrador.resultado.borrador.datos.numero_factura,'2026019549');
  assert.equal(borrador.resultado.datos.numero_factura,'2020019549');

  const cola=crearRecepcion({db,lock:async()=>assert.fail('El lector está ocupado'),procesar:async()=>{}});
  const cambios={numero_factura:'2026019549'};
  const opciones={autor:'contabilidad',confirmado:true,aceptarAvisos:true};
  await cola.aprobar(3364,cambios,opciones);
  await cola.aprobar(3364,cambios,opciones);
  assert.equal((await fila(3364)).estado,'pendiente');

  assert.equal(await post('resolver',1698,{accion:'no_contable',motivo:' '}),400);
  assert.equal(await post('resolver',1698,{accion:'no_contable',motivo:'Icono de firma'}),200);
  assert.equal(await post('resolver',2319,{accion:'duplicado',motivo:'Original cotejado',facturaId:43}),404);
  assert.equal((await fila(2319)).estado,'revision');
  assert.equal(await post('resolver',2319,{accion:'duplicado',motivo:'Original cotejado',facturaId:42}),200);
  assert.equal(await post('resolver',2644,{accion:'informativo',motivo:'Devolución sin cargo',facturaId:42}),200);
  for(const [id,estado,accion,compraId] of [
   [1698,'descartado','no_contable',null],[2319,'duplicado','duplicado','42'],[2644,'descartado','informativo','42']
  ]){
   const actual=await fila(id);
   assert.equal(actual.estado,estado);
   assert.equal(actual.resultado.resolucion.accion,accion);
   assert.equal(compraId===null?actual.resultado.resolucion.compraId:String(actual.resultado.resolucion.compraId),compraId);
   assert.deepEqual(actual.original,foto);
   assert.equal(actual.resultado.resolucion.autor,'contabilidad');
  }
  assert.equal(Number((await db.get('SELECT SUM(total) AS total FROM facturas')).total),95.18);
  assert.equal(await post('borrador',2319,{datos:cambios}),409);
 }finally{await db.fin();}
});

test('réplica de #2521 y #3234: corregir el receptor conserva la defensa sobre el emisor',async t=>{
 if(!await disponible())return t.skip(motivoSalto());
 const {comprobarRevisionHumana}=await import('../../facturas.js');
 const db=await conEsquema();
 try{
  await db.raw(RECEPCION_SCHEMA);
  const proveedor='MRM 2, S.A.';
  const datos={titulo_documento:'ALBARÁN / FACTURA',tipo:'factura',proveedor,
   nif_proveedor:'A80280845',nif_receptor:'A80280845',fecha:'2026-11-25',numero_factura:'MRM-2',
   base_imponible:100,porcentaje_iva:21,cuota_iva:21,total:121};
  const original=Buffer.from('original simulado');
  for(const id of [2521,3234])await db.run(
   `INSERT INTO facturas_recepciones(id,clave,hash,local,canal,nombre,mime,original,estado,resultado)
    VALUES (?, ?, ?, 'Blanes','Email','original.pdf','application/pdf',?,'revision',?::jsonb)`,
   [id,'c'+id,'h'+id,original,JSON.stringify({datos})]);
  const dbAll=async sql=>sql.includes('facturas_locales')
    ? [{empresa:'Família de l’Amor',cif:'B70799135'}]
    : [{proveedor,nif:'A80280845'}];
  const cola=crearRecepcion({db,lock:async()=>assert.fail('Lector ocupado'),procesar:async()=>{},
   validarRevision:d=>comprobarRevisionHumana(d,{dbAll})});
  const opts={confirmado:true,aceptarAvisos:true,autor:'prueba'};
  await assert.rejects(cola.aprobar(2521,{},opts),/mismo NIF/);
  await assert.rejects(cola.aprobar(2521,{nif_proveedor:'B70799135',nif_receptor:'B70799135'},opts),/emisor/i);
  await assert.rejects(cola.aprobar(2521,{proveedor:'Nombre inventado',nif_receptor:'B70799135'},opts),/contradice la memoria/);
  for(const id of [2521,3234]){
   await cola.aprobar(id,{nif_receptor:'B-70799135'},opts);
   const f=await db.get('SELECT * FROM facturas_recepciones WHERE id=?',[id]);
   assert.equal(f.estado,'pendiente');
   assert.equal(f.resultado.datos.nif_proveedor,'A80280845');
   assert.equal(f.resultado.datos.nif_receptor,'B70799135');
   assert.equal(f.resultado.datos.tipo,'factura');
   assert.deepEqual(f.original,original);
  }
 }finally{await db.fin();}
});
