import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {RECEPCION_SCHEMA,crearRecepcion} from '../../src/modules/facturas/recepcion.js';
import {PAGINAS_SCHEMA,crearPaginas} from '../../src/modules/facturas/paginas.js';
const prueba={relacion:'misma',contenido_complementario:true,documentos:[1,2].map(pagina=>({tipo:'factura',nif:'B12345678',numero:'F-123',fecha:'2026-10-28',pagina,paginas:2}))};
async function preparar(t,fn){
 if(!await disponible()){t.skip(motivoSalto());return;}
 const db=await conEsquema();
 try{
  await db.raw(RECEPCION_SCHEMA);
  for(const sql of PAGINAS_SCHEMA.split(';').filter(s=>s.trim()))await db.raw(sql);
  await db.raw('CREATE TABLE facturas_avisos_grupo (id BIGSERIAL PRIMARY KEY,recepcion_id BIGINT,mensaje TEXT)');
  const transaccion=async fn=>{await db.raw('BEGIN');try{const r=await fn(db);await db.raw('COMMIT');return r;}catch(e){await db.raw('ROLLBACK');throw e;}};
  await fn(db,transaccion);
 }finally{await db.fin();}
}
test('SQL de recepción agrupa atómicamente dos fotos y permite deshacer sin perder originales',async t=>preparar(t,async(db,transaccion)=>{
 const paginas=crearPaginas({db,transaccion,comparar:async()=>prueba,combinar:async()=>Buffer.from('pdf combinado')});
 let altas=0;
 const cola=crearRecepcion({db,lock:async(_,fn)=>fn(),antesProcesar:paginas.antes,procesar:async()=>{altas++;return {datos:{total:121}};}});
 for(let i=1;i<=2;i++)await assert.rejects(cola.recibir({buffer:Buffer.from('foto '+i),mimeType:'image/jpeg',filename:'foto.jpg',local:'Blanes',canal:'WhatsApp',contexto:{grupo:'g',remitente:'r',mensaje:'m'+i}}),e=>e.recibido);
 assert.equal(altas,0);
 await db.run('UPDATE facturas_recepciones SET proximo=NOW()');
 await cola.reintentar();
 const propuesta=await db.get('SELECT * FROM facturas_paginas');
 assert.equal(propuesta.estado,'revision');
 assert.deepEqual((await db.all('SELECT estado FROM facturas_recepciones ORDER BY id')).map(f=>f.estado),['paginas','paginas']);
 await assert.rejects(paginas.unir(propuesta),/confirmación explícita/);
 await paginas.unir(propuesta,'prueba');
 const filas=await db.all('SELECT * FROM facturas_recepciones ORDER BY id');
 assert.deepEqual(filas.map(f=>f.estado),['sustituido','sustituido','pendiente']);
 assert.ok(filas.every(f=>f.original));
 const p=await db.get('SELECT * FROM facturas_paginas');
 await paginas.deshacer(p,'prueba');
 assert.deepEqual((await db.all('SELECT estado FROM facturas_recepciones ORDER BY id')).map(f=>f.estado),['pendiente','pendiente','sustituido']);
 await cola.reintentar();assert.equal(altas,2); // No vuelve a unir la pareja descartada.
}));
test('la revisión por duda sobrevive al reinicio y separar desbloquea la recepción',async t=>preparar(t,async(db,transaccion)=>{
 const paginas=crearPaginas({db,transaccion,comparar:async()=>({relacion:'duda'}),combinar:async()=>{throw Error('No debe unir');}});
 const cola=crearRecepcion({db,lock:async(_,fn)=>fn(),antesProcesar:paginas.antes,procesar:async()=>({datos:{}})});
 for(let i=1;i<=2;i++)await assert.rejects(cola.recibir({buffer:Buffer.from('foto '+i),mimeType:'image/jpeg',local:'Blanes',contexto:{grupo:'g',remitente:'r'}}));
 await db.run('UPDATE facturas_recepciones SET proximo=NOW()');await cola.reintentar();
 assert.deepEqual((await db.all('SELECT estado FROM facturas_recepciones ORDER BY id')).map(f=>f.estado),['paginas','paginas']);
 await paginas.separar(await db.get('SELECT * FROM facturas_paginas'),'prueba');
 await cola.reintentar();
 assert.deepEqual((await db.all('SELECT estado FROM facturas_recepciones ORDER BY id')).map(f=>f.estado),['registrado','registrado']);
}));

test('completar una factura mantiene su ID y pagos, conserva los originales y restaura el detalle al deshacer',async t=>preparar(t,async(db,transaccion)=>{
 const {crearCompletarPaginas}=await import('../../src/modules/facturas/paginas-completar.js');
 await db.raw(`CREATE TABLE facturas(id BIGSERIAL PRIMARY KEY,file_hash TEXT,local TEXT,tipo TEXT,numero_factura TEXT,nif TEXT,fecha TEXT,
 drive_url TEXT,drive_thumb TEXT,base_imponible NUMERIC,porcentaje_iva NUMERIC,cuota_iva NUMERIC,total NUMERIC,
 recargo_equivalencia NUMERIC,retencion NUMERIC,otros_cargos NUMERIC,iva_desglose TEXT,iva_estado TEXT,iva_aviso TEXT,lineas_estado TEXT,lineas_aviso TEXT,lineas_leidas_en TEXT,lineas_version INTEGER,sheet_synced INTEGER)`);
 await db.raw('CREATE TABLE factura_lineas(id BIGSERIAL PRIMARY KEY,factura_id BIGINT REFERENCES facturas(id),descripcion TEXT,importe NUMERIC)');
 await db.raw('CREATE TABLE pagos(id BIGSERIAL PRIMARY KEY,factura_id BIGINT REFERENCES facturas(id),importe NUMERIC)');
 await db.run("INSERT INTO facturas(file_hash,local,tipo,numero_factura,nif,fecha,drive_url,base_imponible,porcentaje_iva,cuota_iva,total,iva_estado) VALUES ('h1','Blanes','factura','F-123','B12345678','2026-10-28','original',100,21,21,121,'manual')");
 await db.run("INSERT INTO factura_lineas(factura_id,descripcion,importe) VALUES (1,'Primera página',50)");
 await db.run('INSERT INTO pagos(factura_id,importe) VALUES (1,121)');
 for(const i of [1,2])await db.run('INSERT INTO facturas_recepciones(clave,hash,local,canal,nombre,mime,original,estado,contexto) VALUES (?,?,?,?,?,?,?,?,?::jsonb)', ['c'+i,'h'+i,'Blanes','WhatsApp','foto.jpg','image/jpeg',Buffer.from('original '+i),i===1?'registrado':'paginas',JSON.stringify({grupo:'g',remitente:'r'})]);
 const p=await db.run("INSERT INTO facturas_paginas(primera,segunda,estado,pruebas) VALUES (1,2,'revision',?::jsonb) RETURNING *",[JSON.stringify(prueba)]);
 const completar=crearCompletarPaginas({db,transaccion,leer:async()=>({tipo:'factura',numero_factura:'F-123',nif_proveedor:'B12345678',fecha:'2026-10-28',base_imponible:100,cuota_iva:21,total:121}),archivar:async()=>'copia-completa',guardarLineas:async run=>{await run("INSERT INTO factura_lineas(factura_id,descripcion,importe) VALUES (1,'Ambas páginas',100)");}});
 const paginas=crearPaginas({db,transaccion,completar,combinar:async()=>Buffer.from('combinado')});
 const r=await paginas.unir(p,'Silvia');assert.equal(Number(r.facturaId),1);
 assert.equal((await db.all('SELECT * FROM facturas')).length,1);assert.equal(Number((await db.get('SELECT factura_id FROM pagos')).factura_id),1);
 assert.equal((await db.get('SELECT drive_url FROM facturas')).drive_url,'copia-completa');
 assert.deepEqual((await db.all('SELECT estado FROM facturas_recepciones ORDER BY id')).map(f=>f.estado),['sustituido','sustituido','registrado']);
 assert.ok((await db.all('SELECT original FROM facturas_recepciones')).every(f=>f.original));
 const unida=await db.get('SELECT * FROM facturas_paginas');
 await db.run("UPDATE factura_lineas SET descripcion='Corregido después'");
 await assert.rejects(paginas.deshacer(unida,'Silvia'),/editado después/);
 await db.run("UPDATE factura_lineas SET descripcion='Ambas páginas'");
 await paginas.deshacer(unida,'Silvia');
 assert.equal((await db.get('SELECT drive_url FROM facturas')).drive_url,'original');
 assert.equal((await db.get('SELECT descripcion FROM factura_lineas')).descripcion,'Primera página');
 assert.deepEqual((await db.all('SELECT estado FROM facturas_recepciones ORDER BY id')).map(f=>f.estado),['registrado','pendiente','sustituido']);
}));

test('réplica del grupo 1326 y recepción 2971: separar sin OCR y conservar la decisión',async t=>preparar(t,async(db,transaccion)=>{
 const {rutasPaginas}=await import('../../src/modules/facturas/paginas-rutas.js');
 const original=Buffer.from('original de prueba');
 const datos={tipo:'factura',proveedor:'Proveedor de prueba',nif_proveedor:'A80280845',
  fecha:'2026-11-25',numero_factura:'F-2971',base_imponible:100,cuota_iva:21,total:121};
 for(const [id,estado,resultado] of [[2966,'paginas',null],[2971,'paginas',{datos}],[2969,'registrado',{facturaId:42}],
    [2972,'pendiente',{aprobacion:{autor:'prueba'}}]]) {
  await db.run(`INSERT INTO facturas_recepciones(id,clave,hash,local,canal,nombre,mime,original,estado,contexto,resultado)
    VALUES (?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb)`,
  [id,'c'+id,'h'+id,'Blanes','WhatsApp','original.jpg','image/jpeg',original,estado,
   JSON.stringify({grupo:'g',remitente:'r'}),resultado?JSON.stringify(resultado):null]);
 }
 await db.run("INSERT INTO facturas_paginas(id,primera,segunda,estado,pruebas) VALUES(1326,2966,2971,'revision','{}')");
 const paginas=crearPaginas({db,transaccion,comparar:async()=>assert.fail('No se debe volver a comparar ninguno de estos candidatos')});
 const rutas=new Map();
 rutasPaginas({get(){},post(ruta,_auth,fn){rutas.set(ruta,fn);}},{
  auth:null,db,transaccion,puedeAccederLocal:()=>true,paginas,
  conBloqueo:async()=>assert.fail('El lector ya está ocupado'),
 });
 const responder=async (ruta,params,body={})=>{
  const res={status(n){this.codigo=n;return this;},json(r){this.resultado=r;}};
  await rutas.get(ruta)({params,body,user:{id:'prueba'}},res);
  return res;
 };
 const fila=id=>db.get('SELECT * FROM facturas_recepciones WHERE id=?',[id]);
 const cola=crearRecepcion({db,lock:async()=>assert.fail('No se necesita al lector para aprobar'),procesar:async()=>{}});
 for(let intento=0;intento<2;intento++){
  const r=await responder('/api/facturas/paginas/:id/:accion',{id:'1326',accion:'separar'});
  assert.equal(r.resultado.ok,true);
 }
 const estado=await db.get('SELECT estado,autor FROM facturas_paginas WHERE id=1326');
 assert.deepEqual(estado,{estado:'separadas',autor:'prueba'});
 assert.equal((await fila(2966)).estado,'pendiente');
 assert.equal((await fila(2969)).estado,'registrado');
 assert.equal((await fila(2971)).estado,'revision');
 assert.equal(await paginas.antes(await fila(2966)),false);
 const recr=await responder('/api/facturas/paginas',{}, {ids:[2966,2971]});
 assert.equal(recr.codigo,400);
 assert.match(recr.resultado.error,/Ya se tomó una decisión/);
 // Reproduce además la recepción 2971 todavía en estado «paginas» al abrir su ficha.
 await db.run("UPDATE facturas_recepciones SET estado='paginas' WHERE id=2971");
 const revisar={confirmado:true,aceptarAvisos:true,autor:'prueba',local:'Girona'};
 await cola.aprobar(2971,{},revisar);
 assert.equal((await fila(2971)).local,'Girona');
 assert.equal((await fila(2971)).resultado.aprobacion.localAnterior,'Blanes');
 for(const id of [2966,2971,2969,2972])assert.deepEqual((await fila(id)).original,original);
}));
