import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema, disponible, motivoSalto} from '../helpers/pgtmp.js';
import {RECEPCION_SCHEMA,crearRecepcion} from '../../src/modules/facturas/recepcion.js';
const archivo={buffer:Buffer.from('factura ficticia'),mimeType:'application/pdf',filename:'prueba.pdf',canal:'Email',local:'La Tapeta - Girona'};
async function preparar(t,fn) {
  if(!await disponible()){t.skip(motivoSalto());return;}
  const db=await conEsquema();
  try {await db.raw(RECEPCION_SCHEMA);await fn(db);}finally{await db.fin();}
}
const cola=(db,procesar)=>crearRecepcion({db,procesar,lock:async(_h,fn)=>fn()});
test('original y origen sobreviven a fallo de Google y un nuevo trabajador los recupera',async t=>preparar(t,async db=>{
 const a=cola(db,async()=>{throw new Error('Google caído');});
 await assert.rejects(a.recibir(archivo), e=>e.recibido===true);
 let f=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(f.estado,'pendiente');assert.deepEqual(f.original,archivo.buffer);assert.equal(f.canal,'Email');
 assert.equal(f.intentos,1);assert.ok(new Date(f.proximo)>new Date());
 await db.run('UPDATE facturas_recepciones SET proximo=NOW()');
 let n=0;
 const b=cola(db,async o=>{n++;assert.equal(o.local,archivo.local);assert.equal(o.canal,'Email');assert.deepEqual(o.buffer,archivo.buffer);return {datos:{total:42},driveUrl:'https://example.invalid/factura'};});
 await b.reintentar();
 f=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(f.estado,'registrado');assert.equal(f.original,null);assert.equal(f.resultado.datos.total,42);
 await b.recibir(archivo);assert.equal(n,1);assert.equal((await db.all('SELECT id FROM facturas_recepciones')).length,1);
}));
test('tras cinco errores conserva el original para revisión y no reintenta sin límite',async t=>preparar(t,async db=>{
 let n=0; const a=cola(db,async()=>{n++;throw new Error('no legible');});
 await assert.rejects(a.recibir(archivo));
 for(let i=1;i<5;i++){await db.run('UPDATE facturas_recepciones SET proximo=NOW()');await a.reintentar();}
 const f=await db.get('SELECT * FROM facturas_recepciones');assert.equal(f.estado,'error');assert.equal(f.intentos,5);assert.deepEqual(f.original,archivo.buffer);
 await a.reintentar();assert.equal(n,5);
}));
test('recupera lectura interrumpida y cierra duplicado sin registrar de nuevo',async t=>preparar(t,async db=>{
 const a=cola(db,async()=>{const e=new Error('ya existe');e.isDuplicate=true;throw e;});
 await assert.rejects(a.recibir(archivo),e=>e.isDuplicate);
 assert.equal((await db.get('SELECT estado FROM facturas_recepciones')).estado,'duplicado');
 await db.run("UPDATE facturas_recepciones SET estado='leyendo',original=?,proximo=NOW()",[archivo.buffer]);
 let n=0;const b=cola(db,async()=>{n++;return {pendiente:true,datos:{}};});
 await b.reintentar();assert.equal(n,1);assert.equal((await db.get('SELECT estado FROM facturas_recepciones')).estado,'registrado');
}));
test('si falla la persistencia no comienza la lectura externa',async()=>{
 let leido=false;const a=cola({run:async()=>{throw new Error('base caída');}},async()=>{leido=true;});
 await assert.rejects(a.recibir(archivo),/base caída/);assert.equal(leido,false);
});
test('A01 reimportación con lector ocupado conserva original y la recupera el trabajador',async t=>preparar(t,async db=>{
 let ocupado=false,existe=true,n=0;
 const r=crearRecepcion({db,existeDestino:async()=>existe,procesar:async()=>({n:++n}),lock:async(_hash,fn)=>{
  if(ocupado)throw Object.assign(new Error('ocupado'),{recibido:true});return fn();
 }});
 await r.recibir(archivo);existe=false;ocupado=true;
 await assert.rejects(r.recibir(archivo),e=>e.recibido===true);
 assert.deepEqual((await db.get('SELECT original FROM facturas_recepciones')).original,archivo.buffer);
 ocupado=false;await r.reintentar();
 const f=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(n,2);assert.equal(f.estado,'registrado');assert.equal(f.original,null);
}));
test('decorativos verificados antiguos salen de la cola conservando el original sin llamar a IA',async t=>preparar(t,async db=>{
 const {ADJUNTOS_DECORATIVOS_VERIFICADOS} = await import('../../src/modules/facturas/adjuntos-verificados.js');
 let llamadas=0;const a=cola(db,async()=>{llamadas++;throw new Error('fallo');});
 await assert.rejects(a.recibir(archivo));
 await db.run("UPDATE facturas_recepciones SET hash=?,estado='error',intentos=5",[[...ADJUNTOS_DECORATIVOS_VERIFICADOS][0]]);
 await a.reintentar();await a.reintentar();
 const f=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(f.estado,'descartado');assert.equal(f.resultado.descartado,true);
 assert.deepEqual(f.original,archivo.buffer);assert.equal(llamadas,1);
}));
test('decorativo reconocido por lectura conserva original y no se vuelve a procesar',async t=>preparar(t,async db=>{
 let llamadas=0;const a=cola(db,async()=>{llamadas++;return {descartado:true,motivo:'Adjunto corporativo sin información de compra'};});
 await a.recibir(archivo);
 const f=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(f.estado,'descartado');assert.deepEqual(f.original,archivo.buffer);
 await a.ejecutar(f.id);assert.equal(llamadas,1);
}));
test('recupera solo el lote afectado, de dos en dos y una sola vez, sin aprobar errores reales',async t=>preparar(t,async db=>{
 const {crearRecuperacionValidacion}=await import('../../src/modules/facturas/recuperar-validacion.js');
 const {RevisionDocumento}=await import('../../src/modules/facturas/validacion-lectura.js');
 const datos={tipo:'factura',proveedor:'Proveedor',nif_proveedor:'ESB60599461',total:121};
 const anterior={datos,avisos:[{campo:'nif_proveedor',texto:'Prefijo'}],contraste:{version:2,primera:datos,segunda:datos}};
 for(const id of [3042,2982,2964,2941,3147])await db.run(`INSERT INTO facturas_recepciones(id,clave,hash,canal,nombre,mime,original,estado,resultado) VALUES (?,?,?,'Email','original.pdf','application/pdf',?,'revision',?::jsonb)`,[id,String(id),String(id),archivo.buffer,JSON.stringify(id===2941?{...anterior,aprobacion:{autor:'humano'}}:anterior)]);
 const recuperar=crearRecuperacionValidacion({db,lock:async(_h,fn)=>fn()});
 assert.equal(await recuperar(),2);
 assert.equal((await db.all("SELECT id FROM facturas_recepciones WHERE estado='pendiente'")).length,2);
 assert.equal(await recuperar(),1);assert.equal(await recuperar(),0);
 assert.equal((await db.get('SELECT estado FROM facturas_recepciones WHERE id=3147')).estado,'revision');
 assert.equal((await db.get('SELECT estado FROM facturas_recepciones WHERE id=2941')).estado,'revision');
 let llamadas=0;
 const q=cola(db,async()=>{llamadas++;throw new RevisionDocumento(datos,[{campo:'total',texto:'Descuadre real'}]);});
 await assert.rejects(q.ejecutar(3042),e=>e.recibido);
 const f=await db.get('SELECT * FROM facturas_recepciones WHERE id=3042');
 assert.equal(f.estado,'revision');assert.deepEqual(f.original,archivo.buffer);
 assert.deepEqual(f.resultado.revalidacion.anterior,anterior);
 assert.equal(f.resultado.avisos[0].campo,'total');
 const reinicio=crearRecuperacionValidacion({db,lock:async(_h,fn)=>fn()});
 assert.equal(await reinicio(),0);assert.equal(llamadas,1);
}));
test('nueva mejora reevalúa una sola vez casos del lote que seguían pendientes con versión 4',async t=>preparar(t,async db=>{
 const {crearRecuperacionValidacion,VERSION_RECUPERACION,VERSION_MEJORA_LECTURA}=await import('../../src/modules/facturas/recuperar-validacion.js');
 const resultado={datos:{total:137.23},contraste:{version:4},revalidacion:{version:VERSION_RECUPERACION},avisos:[{campo:'total',texto:'Línea total factura'}]};
 await db.run(`INSERT INTO facturas_recepciones(id,clave,hash,canal,nombre,mime,original,estado,resultado)VALUES(977,'977','977','Email','f.pdf','application/pdf',?,'revision',?::jsonb)`,[archivo.buffer,JSON.stringify(resultado)]);
 const recuperar=crearRecuperacionValidacion({db,lock:async(_h,fn)=>fn()});assert.equal(await recuperar(),1);
 let f=await db.get('SELECT * FROM facturas_recepciones WHERE id=977');assert.equal(f.resultado.revalidacion.version,VERSION_MEJORA_LECTURA);assert.deepEqual(f.resultado.revalidacion.anterior,resultado);
 await db.run("UPDATE facturas_recepciones SET estado='revision' WHERE id=977");assert.equal(await crearRecuperacionValidacion({db,lock:async(_h,fn)=>fn()})(),0);
}));

test('formato confirmado y falso aviso persisten; rechaza aprendizaje con dudas y falsos avisos corregidos',async t=>preparar(t,async db=>{
 const datos={tipo:'factura',proveedor:'Proveedor prueba',nif_proveedor:'B60599461',fecha:'2026-11-25',numero_factura:'A1',base_imponible:100,cuota_iva:21,total:121};
 await db.run(`INSERT INTO facturas_recepciones(clave,hash,canal,local,nombre,mime,original,estado,resultado) VALUES('memoria','memoria','Email','Blanes','f.pdf','application/pdf',?,'revision',?::jsonb)`,[archivo.buffer,JSON.stringify({datos})]);
 const f=await db.get('SELECT id FROM facturas_recepciones');let avisos=[];
 const r=crearRecepcion({db,lock:async(_h,fn)=>fn(),antesProcesar:async()=>{assert.fail('Una recepción confirmada no vuelve a la detección de páginas');},procesar:async o=>{assert.equal(o.datosAprobados.numero_factura,datos.numero_factura);return {datos};},validarRevision:async()=>avisos});
 const opts={autor:'contabilidad',confirmado:true,formato:{importes:'neto',unidades:'envases'},falsoAviso:true};
 await assert.rejects(r.aprobar(f.id,{total:122},opts),/falso aviso/);
 avisos=[{campo:'lineas',texto:'Cantidad dudosa'}];
 await assert.rejects(r.aprobar(f.id,{}, {...opts,aceptarAvisos:true}),/Resuelve todos/);
 assert.equal((await db.get('SELECT estado FROM facturas_recepciones')).estado,'revision');
 avisos=[];await r.aprobar(f.id,{},opts);await r.reintentar();
 const guardado=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(guardado.estado,'registrado');assert.equal(guardado.resultado.revisionPrevia.aprobacion.formato.importes,'neto');
 assert.equal(guardado.resultado.revisionPrevia.aprobacion.autor,'contabilidad');assert.equal(guardado.resultado.revisionPrevia.aprobacion.falsoAviso,true);
}));

test('P2: la nota manuscrita queda como tarea después de registrar la compra', async t => preparar(t, async db => {
 const { RevisionDocumento } = await import('../../src/modules/facturas/validacion-lectura.js');
 const datos = {tipo:'factura', proveedor:'Proveedor prueba', nif_proveedor:'B12345674',
  fecha:'2026-11-25', numero_factura:'K1', base_imponible:100, cuota_iva:21, total:121};
 const r = crearRecepcion({
  db, lock:async(_hash,fn)=>fn(), validarRevision:async()=>[],
  procesar:async o => {
   if (!o.datosAprobados) throw new RevisionDocumento(datos,[],{...datos,nota_manuscrita:'Abonar 4'});
   return {facturaId:42,datos:o.datosAprobados};
  },
 });
 await assert.rejects(r.recibir(archivo), error => error.recibido);
 const antes = await db.get('SELECT id,seguimiento_nota FROM facturas_recepciones');
 assert.equal(antes.seguimiento_nota,'Abonar 4');
 await r.aprobar(antes.id,{}, {autor:'contabilidad',confirmado:true});
 await r.reintentar();
 const f = await db.get('SELECT estado,seguimiento_nota,seguimiento_cierre,resultado FROM facturas_recepciones');
 assert.equal(f.estado,'registrado');
 assert.equal(f.resultado.facturaId,42);
 assert.equal(f.seguimiento_nota,'Abonar 4');
 assert.equal(f.seguimiento_cierre,null);
}));
