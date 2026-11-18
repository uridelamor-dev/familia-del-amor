import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {RECEPCION_SCHEMA} from '../../src/modules/facturas/recepcion.js';
import {criterioFechaCompras,listadoFacturasSQL,RECEPCION_SQL,DIA_RECEPCION_SQL,RECEPCION_REAL_SQL} from '../../src/modules/facturas/fecha-listado.js';
import {AUDITORIA_COMPLETA_SCHEMA,cargarDistintivos,huellaAuditoria,COMPROBACIONES} from '../../src/modules/facturas/auditoria-completa.js';
async function preparar(t,fn){
 if(!await disponible()){t.skip(motivoSalto());return;}
 const db=await conEsquema();
 try{
 await db.raw(`CREATE TABLE facturas(id SERIAL PRIMARY KEY,tipo text,proveedor text,nif text,concepto text,fecha text,numero_factura text,local text,empresa text,
 base_imponible numeric,porcentaje_iva numeric,cuota_iva numeric,total numeric,iva_desglose jsonb,vencimiento text,periodo_facturado text,drive_url text,file_hash text,conciliado_con integer,reparto text,
 cargos_base jsonb,lineas_iva_incluido boolean,recargo_equivalencia numeric,retencion numeric,otros_cargos numeric,creado_en text,drive_thumb text,ocr_texto text);
 CREATE TABLE factura_lineas(id SERIAL PRIMARY KEY,factura_id integer,orden integer,descripcion text,cantidad numeric,unidad text,precio_unitario numeric,importe numeric,precio_bruto numeric,importe_bruto numeric,descuento_pct numeric,factor_unidad numeric,ocr_texto text);
 CREATE INDEX idx_test_lineas ON factura_lineas(factura_id);`);
 await db.raw(RECEPCION_SCHEMA);await db.raw(RECEPCION_SCHEMA);await db.raw(AUDITORIA_COMPLETA_SCHEMA);
 await db.raw(`INSERT INTO facturas(tipo,proveedor,fecha,numero_factura,local,empresa,base_imponible,cuota_iva,total,creado_en,file_hash,drive_thumb,ocr_texto)
 SELECT CASE WHEN n%3=0 THEN 'albaran' ELSE 'factura' END,'Proveedor '||n%7,'2026-10-'||lpad((n%28+1)::text,2,'0'),'N-'||n,CASE WHEN n%2=0 THEN 'Blanes' ELSE 'Girona' END,'Empresa',100,21,121,CASE WHEN n=20 THEN '' ELSE '2026-11-01T12:00:00+01:00' END,CASE WHEN n=20 THEN NULL ELSE 'h'||n END,repeat('X',8000),repeat('OCR',500)
 FROM generate_series(1,530) n;
 INSERT INTO facturas_recepciones(clave,hash,canal,nombre,mime,creado,resultado)
 SELECT 'r'||n,'h'||(n%530+1),'WhatsApp','documento.pdf','application/pdf', '2026-11-02T23:30:00Z'::timestamptz+n*interval '1 minute',jsonb_build_object('facturaId',(n%530+1)::text)
 FROM generate_series(1,3000) n WHERE n%530+1<>20;
 INSERT INTO facturas_recepciones(clave,hash,canal,nombre,mime,creado,resultado) VALUES
 ('id-only','different','Email','a.pdf','application/pdf','2026-10-31T23:30:00Z','{"facturaId":1}'),
 ('hash-only','h2','Email','b.pdf','application/pdf','2026-10-31T23:15:00Z','{}');`);
 await fn(db);
 }finally{await db.fin();}
}
const anterior=(where,orden)=>`SELECT *, ${RECEPCION_SQL} AS recibido_en, ${DIA_RECEPCION_SQL} AS fecha_recepcion, (${RECEPCION_REAL_SQL} IS NOT NULL) AS recepcion_confirmada FROM facturas ${where} ORDER BY ${orden} LIMIT 500`;
test('SQL real: lista optimizada idéntica con fechas, ámbitos, búsqueda, paginación y recepciones por ID/hash',async t=>preparar(t,async db=>{
 for(const q of [{},{fecha_tipo:'recepcion'}]){
 const c=criterioFechaCompras(q);
 for(const [where,params] of [['',[]],[`WHERE local=? AND tipo=?`,['Blanes','albaran']],[`WHERE ${c.campo} >= ? AND ${c.campo} <= ?`,['2026-11-01','2026-11-03']],[`WHERE id=?`,[20]],[`WHERE numero_factura LIKE ?`,['N-5%']]]){
 const viejo=await db.all(anterior(where,c.orden),params);
 const nuevo=await db.all(listadoFacturasSQL({where,orden:c.orden}),params);
 assert.deepEqual(nuevo,viejo);
 }
 }
 const f=await db.all(listadoFacturasSQL({where:'WHERE id IN (1,2,20)',orden:'id ASC'}));
 assert.equal(f[0].fecha_recepcion,'2026-11-01');assert.equal(f[1].fecha_recepcion,'2026-11-01');
 assert.equal(f[2].recibido_en,null);assert.equal(f[2].recepcion_confirmada,false);
 const plan=(await db.all('EXPLAIN (ANALYZE, FORMAT JSON) '+listadoFacturasSQL({orden:'fecha DESC'})))[0]['QUERY PLAN'][0];
 await db.raw('DROP INDEX idx_recepcion_factura_fecha; DROP INDEX idx_recepcion_hash_fecha;');
 const antes=(await db.all('EXPLAIN (ANALYZE, FORMAT JSON) '+anterior('','fecha DESC')))[0]['QUERY PLAN'][0];
 t.diagnostic('530 facturas / 3000 recepciones: antes '+antes['Execution Time']+' ms; después '+plan['Execution Time']+' ms (PostgreSQL embebido, datos sintéticos, no producción)');
}));
test('SQL real: última auditoría, misma huella, invalidación por cambios y proyección sin OCR/miniaturas',async t=>preparar(t,async db=>{
 await db.raw(`INSERT INTO factura_lineas(factura_id,orden,descripcion,cantidad,unidad,precio_unitario,importe,ocr_texto) VALUES (1,1,'Producto',2,'kg',50,100,repeat('OCR',2000));`);
 const f=await db.get('SELECT * FROM facturas WHERE id=1'),ls=await db.all('SELECT * FROM factura_lineas WHERE factura_id=1');
 const h=huellaAuditoria(f,ls),checks=JSON.stringify(Object.fromEntries(COMPROBACIONES.map(k=>[k,true])));
 await db.run("INSERT INTO facturas_auditoria_completa(factura_id,huella,autor,comprobaciones,archivo_nombre,archivo_ruta) VALUES(1,?,'antiguo',?,'a','b'),(1,?,'actual',?,'a','b')",['obsoleta',checks,h,checks]);
 let transfer;
 const read=async(sql,params)=>{transfer=await db.all(sql,params);return transfer;};
 let rows=[{id:1},{id:2}];await cargarDistintivos(rows,read);
 assert.equal(transfer.length,1);assert.equal(rows[0].auditoria_completa.autor,'actual');assert.equal(rows[0].auditoria_completa.vigente,true);assert.equal(rows[1].auditoria_completa,undefined);
 assert.equal(transfer[0].factura.drive_thumb,undefined);assert.equal(transfer[0].factura.ocr_texto,undefined);assert.equal(transfer[0].lineas[0].ocr_texto,undefined);
 assert.equal(huellaAuditoria(transfer[0].factura,transfer[0].lineas),h);
 for(const sql of ["UPDATE factura_lineas SET cantidad=3 WHERE factura_id=1","UPDATE facturas SET vencimiento='2026-12-15' WHERE id=1"]){
 await db.run(sql);rows=[{id:1}];await cargarDistintivos(rows,read);assert.equal(rows[0].auditoria_completa.vigente,false);
 }
 // Una confirmación más reciente inválida nunca recupera el distintivo de otra anterior.
 await db.run("INSERT INTO facturas_auditoria_completa(factura_id,huella,autor,comprobaciones,archivo_nombre,archivo_ruta) VALUES(1,'otra','último',?,'a','b')",[checks]);
 rows=[{id:1}];await cargarDistintivos(rows,read);assert.equal(rows[0].auditoria_completa.autor,'último');assert.equal(rows[0].auditoria_completa.vigente,false);
}));
