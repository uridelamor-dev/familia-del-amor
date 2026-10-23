import {test} from 'node:test';
import assert from 'node:assert/strict';
import {controlesLectura,compararLecturas,datosRevision} from '../../src/modules/facturas/validacion-lectura.js';
import {leerDocumentoVerificado} from '../../facturas.js';
const buena={tipo:'factura',proveedor:'Proveedor de prueba',nif_proveedor:'B12345678',fecha:'2026-09-10',numero_factura:'123',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121,lineas:[]};
test('no confunde importes ausentes con cero ni unidad ausente con documento inválido',()=>{
 assert.deepEqual(controlesLectura({...buena,lineas:[{cantidad:2,precio_unitario:50,importe:100,unidad:null}]}),[]);
 assert.ok(controlesLectura({...buena,base_imponible:null}).some(a=>a.campo==='base_imponible'));
 assert.deepEqual(controlesLectura({...buena,base_imponible:0,cuota_iva:0,total:0}),[]);
});
test('albarán sin valorar sigue siendo válido',()=>assert.deepEqual(controlesLectura({...buena,tipo:'albaran',total:null,base_imponible:null,cuota_iva:null}),[]));
test('retención, múltiples tipos y resumen fiscal se comprueban',()=>{
 assert.deepEqual(controlesLectura({...buena,retencion:15,total:106}),[]);
 assert.deepEqual(controlesLectura({...buena,cuota_iva:15.5,total:115.5,porcentaje_iva:null,iva_desglose:[{base:50,tipo:10,cuota:5},{base:50,tipo:21,cuota:10.5}]}),[]);
 assert.ok(controlesLectura({...buena,iva_desglose:[{base:100,tipo:21,cuota:20}]}).length);
});
test('fechas imposibles, truncamiento y dudas no pasan',()=>{
 for(const cambio of [{fecha:'2026-02-30'},{fecha:null},{_lecturaIncompleta:true},{campos_dudosos:['total']},{calidad_imagen:'recortada'}]) assert.ok(controlesLectura({...buena,...cambio}).length);
});
test('desacuerdos en campos críticos retienen el documento, sin promediar',()=>{
 for(const cambio of [{total:122},{fecha:'2026-09-11'},{nif_proveedor:'B22222222'},{proveedor:'Otro'}]) assert.ok(compararLecturas(buena,{...buena,...cambio}).length);
 assert.equal(compararLecturas(buena,{...buena,proveedor:'PROVEEDOR DE PRUEBA'}).length,0);
});
test('la segunda lectura se realiza sin recibir la primera y bloquea antes del alta',async()=>{
 let n=0;
 await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'),'image/jpeg',{dbAll:async()=>[],leer:async(_b,_m,opts)=>{n++;if(n===2)assert.deepEqual(opts,{revision:true});return {...buena,total:n===2?122:121};}}),e=>e.revisionDocumento && e.resultado.datos.total===121 && e.resultado.segunda.total===122);
 assert.equal(n,2);
});
test('un fallo técnico de la segunda lectura no se convierte en foto borrosa',async()=>{
 let n=0;await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'),'image/jpeg',{leer:async()=>{if(++n===2)throw new Error('timeout');return {...buena};}}),e=>!e.revisionDocumento && e.message==='timeout');
});
test('corrección solo admite campos autorizados y elimina desglose obsoleto',()=>{
 const d=datosRevision({...buena,iva_desglose:[{base:100,tipo:21,cuota:21}]},{base_imponible:200,aprobacion:{falsa:true},__proto__:{}});
 assert.deepEqual(d.iva_desglose,[]);assert.equal(d.aprobacion,undefined);
 assert.throws(()=>datosRevision(buena,{total:'121abc'}));
});
test('solo pide otra foto automáticamente si ambas lecturas ven mala calidad y faltan datos',async()=>{
 const {RevisionDocumento}=await import('../../src/modules/facturas/validacion-lectura.js');
 assert.equal(new RevisionDocumento({...buena,total:null,calidad_imagen:'ilegible'},[],{...buena,total:null,calidad_imagen:'ilegible'}).resultado.solicitarFoto,true);
 assert.equal(new RevisionDocumento({...buena,total:null},[],{...buena,total:null}).resultado.solicitarFoto,false);
 assert.equal(new RevisionDocumento({...buena,total:null,calidad_imagen:'ilegible'},[],{...buena,calidad_imagen:'legible'}).resultado.solicitarFoto,false);
});
