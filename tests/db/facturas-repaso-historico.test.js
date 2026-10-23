import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {REPASO_HISTORICO_SCHEMA,crearRepasoHistorico} from '../../src/modules/facturas/repaso-historico.js';
import {RevisionDocumento} from '../../src/modules/facturas/validacion-lectura.js';
const doc={tipo:'factura',proveedor:'Prueba',nif_proveedor:'B12345678',fecha:'2026-09-10',numero_factura:'123',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121};
async function preparar(t,fn){
 if(!await disponible()){t.skip(motivoSalto());return;}
 const db=await conEsquema();try{
 await db.raw(`CREATE TABLE facturas(id BIGSERIAL PRIMARY KEY,proveedor TEXT,nif TEXT,tipo TEXT,fecha TEXT,numero_factura TEXT,base_imponible NUMERIC,cuota_iva NUMERIC,porcentaje_iva NUMERIC,total NUMERIC,file_hash TEXT,sheet_synced INTEGER,iva_estado TEXT,iva_aviso TEXT);
 CREATE TABLE facturas_pendientes(LIKE facturas INCLUDING ALL,descartado_en TEXT);
 CREATE TABLE facturas_recepciones(id BIGSERIAL PRIMARY KEY,local TEXT,nombre TEXT,hash TEXT,estado TEXT,resultado JSONB);
 `);
 await db.raw(REPASO_HISTORICO_SCHEMA);
 await db.run('INSERT INTO facturas(proveedor,nif,tipo,fecha,numero_factura,base_imponible,cuota_iva,porcentaje_iva,total,file_hash) VALUES (?,?,?,?,?,?,?,?,?,?)',[doc.proveedor,doc.nif_proveedor,doc.tipo,doc.fecha,doc.numero_factura,100,21,21,121,'uno']);
 await fn(db);
 }finally{await db.fin();}
}
const crear=(db,extra={})=>crearRepasoHistorico({db,lock:fn=>fn(),original:async()=>({buffer:Buffer.from('ficticio'),mimeType:'image/jpeg'}),leer:async()=>({...doc}),...extra});
test('modal se reclama una vez; inicio idempotente, instantánea fija y progreso tras reinicio',async t=>preparar(t,async db=>{
 const q=crear(db);assert.equal(await q.visto(),true);assert.equal(await q.visto(),false);
 await q.iniciar('Uriel');assert.equal((await q.estado()).total,1);
 await db.run("INSERT INTO facturas(proveedor,total) VALUES ('posterior',42)");
 await q.iniciar('Otro');assert.equal((await q.estado()).total,1);
 await q.paso();assert.equal((await q.estado()).contadores.sin_discrepancias,1);
 let leidos=0;const reinicio=crear(db,{leer:async()=>{leidos++;return doc;}});await reinicio.paso();assert.equal(leidos,0);assert.equal((await q.estado()).estado,'muestra_lista');await q.controlar('ampliar','Uriel');await q.paso();assert.equal((await q.estado()).estado,'completado');
 await reinicio.iniciar('Otra publicación');assert.equal((await q.estado()).total,1);assert.equal((await q.estado()).autor,'Uriel');
 assert.equal(Number((await db.get('SELECT total FROM facturas WHERE id=1')).total),121);
}));
test('incluye pendientes y recepción sin duplicar archivos ya guardados; originales ausentes visibles',async t=>preparar(t,async db=>{
 await db.run("INSERT INTO facturas_pendientes(proveedor,file_hash) VALUES ('Pendiente','dos')");
 await db.run("INSERT INTO facturas_recepciones(hash,estado) VALUES ('uno','revision'),('dos','error'),('tres','pendiente'),('decorativo','descartado')");
 const q=crear(db,{original:async()=>null});await q.iniciar('Uriel');assert.equal((await q.estado()).total,3);
 for(let i=0;i<4;i++)await q.paso();const e=await q.estado();assert.equal(e.contadores.sin_original,3);assert.equal(e.estado,'muestra_lista');
}));
test('discrepancias y errores técnicos no modifican los datos ni parecen documentos correctos',async t=>preparar(t,async db=>{
 const q=crear(db,{leer:async()=>{throw new RevisionDocumento({...doc,total:112},[{texto:'Total dudoso'}]);}});
 await q.iniciar('Uriel');await q.paso();let f=await db.get('SELECT * FROM facturas_repaso_documentos');assert.equal(f.estado,'revisar');assert.equal(f.resultado.datos.total,112);
 assert.equal(Number((await db.get('SELECT total FROM facturas WHERE id=1')).total),121);
 await db.run("UPDATE facturas_repaso_documentos SET estado='leyendo'");
 await crear(db,{leer:async()=>{throw new Error('token privado NO MOSTRAR');}}).paso();f=await db.get('SELECT * FROM facturas_repaso_documentos');assert.equal(f.estado,'error');assert.doesNotMatch(JSON.stringify(f.resultado),/privado/);
}));

test('muestra de 25 variada, pausa duradera y ampliación explícita sin repetir lecturas',async t=>preparar(t,async db=>{
 await db.run("INSERT INTO facturas(proveedor,tipo,total) SELECT 'Mayoría','factura',1 FROM generate_series(1,40)");
 await db.run("INSERT INTO facturas_pendientes(proveedor,tipo,total) VALUES ('Otro proveedor','albaran',2)");
 let llamadas=0;
 const q=crear(db,{leer:async()=>{llamadas++;return doc;}});await q.iniciar('Uriel');
 await q.controlar('pausar','Uriel');await crear(db).paso();assert.equal(llamadas,0);assert.equal((await q.estado()).estado,'pausado');
 await q.controlar('continuar','Uriel');for(let i=0;i<26;i++)await q.paso();
 assert.equal(llamadas,25);assert.equal((await q.estado()).estado,'muestra_lista');
 const pendiente=await db.get("SELECT estado FROM facturas_repaso_documentos WHERE origen='pendiente'");assert.notEqual(pendiente.estado,'pendiente');
 await q.controlar('continuar','Uriel');await q.paso();assert.equal(llamadas,25);
 await q.controlar('ampliar','Uriel');for(let i=0;i<20;i++)await q.paso();
 assert.equal(llamadas,42);assert.equal((await q.estado()).estado,'completado');
}));
test('pausar durante una lectura permite terminar solo esa y reanudar después',async t=>preparar(t,async db=>{
 await db.run("INSERT INTO facturas(proveedor,total) VALUES ('Segundo',22)");
 let q;let llamadas=0;q=crear(db,{leer:async()=>{llamadas++;await q.controlar('pausar','Uriel');return doc;}});
 await q.iniciar('Uriel');await q.paso();await q.paso();assert.equal(llamadas,1);assert.equal((await q.estado()).estado,'pausado');
 await q.controlar('continuar','Uriel');await q.paso();assert.equal(llamadas,2);
}));

const {crearDecisionesHistorico,cabeceraHistorica}=await import('../../src/modules/facturas/repaso-decision.js');
const decisiones=db=>crearDecisionesHistorico({transaccion:async fn=>{await db.run('BEGIN');try{const r=await fn(db);await db.run('COMMIT');return r;}catch(e){await db.run('ROLLBACK');throw e;}}});
async function listoParaDecidir(db){
 const q=crear(db,{leer:async()=>({...doc,total:112})});await q.iniciar('Uriel');await q.paso();
 return cabeceraHistorica(await db.get('SELECT * FROM facturas WHERE id=1'));
}
test('corrección confirmada conserva antes/después y autor; doble envío no repite cambios',async t=>preparar(t,async db=>{
 const actual=await listoParaDecidir(db),decidir=decisiones(db);
 const body={esperado:actual,campos:{...actual,total:112},decision:'corregir',motivo:'Comprobado el total con el original',confirmado:true,excepcion:true};
 await decidir({origen:'factura',id:1,body,autor:'Uriel'});
 const f=await db.get('SELECT * FROM facturas WHERE id=1');assert.equal(Number(f.total),112);assert.equal(f.sheet_synced,0);assert.equal(f.iva_estado,'revisar');
 const h=await db.get('SELECT * FROM facturas_repaso_decisiones');assert.equal(h.autor,'Uriel');assert.equal(Number(h.antes.total),121);assert.equal(Number(h.despues.total),112);
 await assert.rejects(()=>decidir({origen:'factura',id:1,body,autor:'Uriel'}),/ya se revisó/);
 assert.equal((await db.all('SELECT * FROM facturas_repaso_decisiones')).length,1);
}));
test('conservar registra revisión sin aplicar propuestas y exige confirmación/motivo',async t=>preparar(t,async db=>{
 const actual=await listoParaDecidir(db),decidir=decisiones(db);
 const body={esperado:actual,campos:{...actual,total:112},decision:'conservar',motivo:'El original confirma los datos guardados',confirmado:true};
 await assert.rejects(()=>decidir({origen:'factura',id:1,body:{...body,confirmado:false},autor:'Uriel'}),/Confirma/);
 await assert.rejects(()=>decidir({origen:'factura',id:1,body:{...body,motivo:''},autor:'Uriel'}),/Explica/);
 await decidir({origen:'factura',id:1,body,autor:'Uriel'});
 assert.equal(Number((await db.get('SELECT total FROM facturas WHERE id=1')).total),121);
 assert.equal((await db.get('SELECT revision_humana FROM facturas_repaso_documentos')).revision_humana.decision,'conservar');
}));
test('cambio concurrente bloquea corrección; fallo de auditoría revierte la factura',async t=>preparar(t,async db=>{
 const actual=await listoParaDecidir(db),decidir=decisiones(db);
 const body={esperado:actual,campos:{...actual,total:112},decision:'corregir',motivo:'Verificado con el original',confirmado:true,excepcion:true};
 await db.run('UPDATE facturas SET total=200 WHERE id=1');
 await assert.rejects(()=>decidir({origen:'factura',id:1,body,autor:'Uriel'}),/cambió/);
 assert.equal(Number((await db.get('SELECT total FROM facturas WHERE id=1')).total),200);
 await db.run('UPDATE facturas SET total=121 WHERE id=1');
 await db.run("ALTER TABLE facturas_repaso_decisiones ADD CONSTRAINT simular_fallo CHECK (autor <> 'fallo')");
 await assert.rejects(()=>decidir({origen:'factura',id:1,body,autor:'fallo'}));
 assert.equal(Number((await db.get('SELECT total FROM facturas WHERE id=1')).total),121);
 assert.equal((await db.all('SELECT * FROM facturas_repaso_decisiones')).length,0);
 assert.equal((await db.get('SELECT revision_humana FROM facturas_repaso_documentos')).revision_humana,null);
}));
test('campos inválidos y avisos sin confirmar no se guardan',async t=>preparar(t,async db=>{
 const actual=await listoParaDecidir(db),decidir=decisiones(db);
 const body={esperado:actual,campos:{...actual,total:112},decision:'corregir',motivo:'Verificado con el original',confirmado:true};
 await assert.rejects(()=>decidir({origen:'factura',id:1,body,autor:'Uriel'}),/Persisten avisos/);
 await assert.rejects(()=>decidir({origen:'factura',id:1,body:{...body,excepcion:true,campos:{...actual,fecha:'2026-02-30'}},autor:'Uriel'}),/fecha/);
 await assert.rejects(()=>decidir({origen:'factura',id:1,body:{...body,excepcion:true,campos:{...actual,total:'112'}},autor:'Uriel'}),/Campo no válido/);
 assert.equal(Number((await db.get('SELECT total FROM facturas WHERE id=1')).total),121);
}));
test('corregir pendiente no lo registra como factura ni cambia su estado de asignación',async t=>preparar(t,async db=>{
 await db.run("INSERT INTO facturas_pendientes(proveedor,tipo,total) VALUES ('Pendiente','factura',111)");
 const q=crear(db);await q.iniciar('Uriel');await q.paso();await q.paso();
 const p=await db.get('SELECT * FROM facturas_pendientes');
 await decisiones(db)({origen:'pendiente',id:p.id,autor:'Uriel',body:{confirmado:true,decision:'corregir',motivo:'Cabecera contrastada con el original',esperado:cabeceraHistorica(p),campos:{...cabeceraHistorica(p),proveedor:doc.proveedor,tipo:doc.tipo,nif:doc.nif_proveedor,fecha:doc.fecha,numero_factura:doc.numero_factura,base_imponible:100,porcentaje_iva:21,cuota_iva:21,total:121},excepcion:true}});
 assert.equal(Number((await db.get('SELECT total FROM facturas_pendientes')).total),121);
 assert.equal((await db.all('SELECT id FROM facturas')).length,1);
}));
test('esquema aditivo conserva pausa, fase y decisiones después de publicar',async t=>preparar(t,async db=>{
 const q=crear(db);await q.iniciar('Uriel');await q.paso();await q.paso();await q.controlar('ampliar','Uriel');await q.controlar('pausar','Uriel');
 await db.raw(REPASO_HISTORICO_SCHEMA);
 const e=await crear(db).estado();assert.equal(e.estado,'pausado');assert.equal(e.fase,'completo');assert.equal(e.total,1);
}));
