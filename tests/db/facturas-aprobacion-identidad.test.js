import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {crearRecepcion,RECEPCION_SCHEMA} from '../../src/modules/facturas/recepcion.js';
import {RevisionDocumento} from '../../src/modules/facturas/validacion-lectura.js';
import {comprobarRevisionHumana} from '../../facturas.js';
test('recepción conserva original y conflicto tras aprobación explícita; no hay aprendizaje limpio',async t=>{
 if(!await disponible())return t.skip(motivoSalto());
 const db=await conEsquema();try{
 await db.raw(RECEPCION_SCHEMA);
 const datos={tipo:'factura',proveedor:'Proveedor',nif_proveedor:'B12345674',nif_receptor:'B12345674',fecha:'2026-11-13',numero_factura:'1',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121};
 const validarRevision=d=>comprobarRevisionHumana(d,{dbAll:async()=>[]});
 const cola=crearRecepcion({db,lock:async(_h,fn)=>fn(),validarRevision,procesar:async()=>{throw new RevisionDocumento(datos,await validarRevision(datos));}});
 await assert.rejects(cola.recibir({buffer:Buffer.from('original'),mimeType:'image/jpeg',canal:'Email'}),e=>e.recibido);
 const f=await db.get('SELECT * FROM facturas_recepciones');
 await assert.rejects(cola.aprobar(f.id,{}, {autor:'Contabilidad',confirmado:true}),/Quedan avisos/);
 assert.equal((await db.get('SELECT * FROM facturas_recepciones')).estado,'revision');
 await cola.aprobar(f.id,{}, {autor:'Contabilidad',confirmado:true,aceptarAvisos:true});
 const guardada=await db.get('SELECT * FROM facturas_recepciones');
 assert.equal(guardada.estado,'pendiente');assert.deepEqual(guardada.original,Buffer.from('original'));
 assert.ok(guardada.resultado.avisosTrasRevision.some(a=>a.campo==='nif_proveedor'));
 }finally{await db.fin();}
});
