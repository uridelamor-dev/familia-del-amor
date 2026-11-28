import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {crearRecepcion,RECEPCION_SCHEMA} from '../../src/modules/facturas/recepcion.js';
import {RevisionDocumento} from '../../src/modules/facturas/validacion-lectura.js';
import {comprobarRevisionHumana} from '../../facturas.js';
test('recepción conserva original y bloquea el NIF del destinatario incluso con excepción',async t=>{
 if(!await disponible())return t.skip(motivoSalto());
 const db=await conEsquema();try{
 await db.raw(RECEPCION_SCHEMA);
 const datos={tipo:'factura',proveedor:'Proveedor',nif_proveedor:'B12345674',nif_receptor:'B12345674',fecha:'2026-11-13',numero_factura:'1',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121};
 const validarRevision=d=>comprobarRevisionHumana(d,{dbAll:async()=>[]});
 const cola=crearRecepcion({db,lock:async(_h,fn)=>fn(),validarRevision,procesar:async()=>{throw new RevisionDocumento(datos,await validarRevision(datos));}});
 await assert.rejects(cola.recibir({buffer:Buffer.from('original'),mimeType:'image/jpeg',canal:'Email'}),e=>e.recibido);
 const f=await db.get('SELECT * FROM facturas_recepciones');
 await assert.rejects(cola.aprobar(f.id,{}, {autor:'Contabilidad',confirmado:true,aceptarAvisos:true}),/Emisor y destinatario tienen el mismo NIF/);
 const guardada=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(guardada.estado,'revision');
 assert.deepEqual(guardada.original,Buffer.from('original'));
 assert.equal(guardada.resultado.aprobacion,undefined);
 }finally{await db.fin();}
});

test('P0 #2521 simulado: el título combinado admite excepción y queda como factura',async t=>{
 if(!await disponible())return t.skip(motivoSalto());
 const db=await conEsquema();try{
  await db.raw(RECEPCION_SCHEMA);
  const datos={tipo:'albaran',titulo_documento:'ALBARÁN – FACTURA',campos_dudosos:['tipo'],
   proveedor:'Proveedor',nif_proveedor:'B12345674',fecha:'2026-11-13',numero_factura:'1',
   base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121};
  const validarRevision=d=>comprobarRevisionHumana(d,{dbAll:async()=>[]});
  const cola=crearRecepcion({db,lock:async()=>{throw Error('Hay otra lectura en curso');},validarRevision,procesar:async()=>{}});
  await db.run(`INSERT INTO facturas_recepciones (id,clave,hash,canal,nombre,mime,original,estado,resultado)
    VALUES(2521,'combinado','combinado','Email','original','image/jpeg',?,'revision',?::jsonb)`,
  [Buffer.from('fixture'),JSON.stringify({datos})]);
  const opciones={autor:'Contabilidad',confirmado:true,aceptarAvisos:true};
  await assert.rejects(cola.aprobar(2521,{}, {...opciones,aceptarAvisos:false}),/confirma expresamente la excepción/);
  await assert.rejects(cola.aprobar(2521,{titulo_documento:'Factura'}, opciones),/tipo leído no coincide/);
  await cola.aprobar(2521,{}, opciones);
  const fila=await db.get('SELECT estado,resultado FROM facturas_recepciones WHERE id=2521');
  assert.equal(fila.estado,'pendiente');
  assert.equal(fila.resultado.datos.tipo,'factura');
  assert.equal(fila.resultado.avisosTrasRevision[0].codigo,'titulo_combinado');
 }finally{await db.fin();}
});
