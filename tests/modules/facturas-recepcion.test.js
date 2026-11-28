import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listarPaginas,canalFactura} from '../../src/modules/facturas/recepcion.js';
test('recorre páginas de Google aunque la primera ya estuviera procesada',async()=>{
 const llamadas=[];
 const filas=await listarPaginas('https://example.invalid/files?pageSize=100','ficticio','files',async url=>{
  llamadas.push(url);return {ok:true,json:async()=>new URL(url).searchParams.get('pageToken')==='siguiente'?{files:[{id:'nuevo'}]}:{files:[{id:'viejo'}],nextPageToken:'siguiente'}};
 });
 assert.deepEqual(filas.map(f=>f.id),['viejo','nuevo']);assert.equal(llamadas.length,2);
});
test('una página fallida no parece una lista completa',async()=>{
 await assert.rejects(listarPaginas('https://example.invalid','x','messages',async()=>({ok:false,status:503,json:async()=>({error:{}})})),/503/);
});
test('conserva la procedencia al asignar facturas pendientes',()=>{
 assert.equal(canalFactura('manual'),'Manual');assert.equal(canalFactura('email'),'Email');assert.equal(canalFactura('Drive'),'Drive');assert.equal(canalFactura('WhatsApp'),'WhatsApp');
});

test('diagnóstico seguro distingue fallos permanentes sin exponer el error original', async () => {
 const {diagnosticarRecepcion} = await import('../../src/modules/facturas/error-recepcion.js');
 const incompatible = diagnosticarRecepcion(new Error('unsupported image format SECRETO'));
 assert.equal(incompatible.permanente,true);
 assert.equal(incompatible.codigo,'archivo_incompatible');
 assert.doesNotMatch(JSON.stringify(incompatible),/SECRETO/);
 for(const [status,codigo] of [[401,'acceso_servicio'],[403,'acceso_servicio'],[429,'limite_servicio']]) {
  assert.equal(diagnosticarRecepcion({status,message:'SECRETO'}).codigo,codigo);
 }
 assert.equal(diagnosticarRecepcion(new Error('fetch failed')).codigo,'conexion');
 assert.equal(diagnosticarRecepcion(new Error('SECRETO')).codigo,'sin_clasificar');
});

test('nombre uniforme antes y después de leer, sin inventar datos ni cambiar formato',async()=>{
 const {nombreRecepcion}=await import('../../src/modules/facturas/recepcion.js');
 const f={id:19,local:'Girona',mime:'image/png',nombre:'imagen_ABC.jpg'};
 const pendiente=nombreRecepcion(f);
 assert.equal(pendiente,'Sin fecha · Documento · Proveedor sin identificar · Sin número · Girona · ID-Recepción-19.png');
 const leido=nombreRecepcion({...f,resultado:{datos:{fecha:'2026-11-04',tipo:'albaran',proveedor:'Mera',numero_factura:'A/123'}}});
 assert.equal(leido,'2026-11-04 · Albarán · Mera · A-123 · Girona · ID-Recepción-19.png');
 assert.notEqual(nombreRecepcion({...f,id:20}),pendiente);
});

test('revisión sin explicación conserva autor y antes/después',async()=>{
 const {crearRecepcion}=await import('../../src/modules/facturas/recepcion.js');
 const antes={proveedor:'Delsa',nif_proveedor:'X2667376C',tipo:'factura',fecha:'2026-11-04',numero_factura:'1',base_imponible:100,porcentaje_iva:21,cuota_iva:21,total:121};
 const f={id:19,hash:'hash',estado:'revision',original:Buffer.from('original'),resultado:{datos:antes},local:'Girona',mime:'application/pdf'};
 let guardado;
 const cola=crearRecepcion({db:{get:async()=>f,run:async(sql,args)=>{guardado=JSON.parse(args[0]);return {id:19};}},lock:async(_k,fn)=>fn(),procesar:async()=>{}});
 await cola.aprobar(19,{...antes,proveedor:'Mera'},{autor:'Contabilidad',confirmado:true,aceptarAvisos:true});
 assert.equal(guardado.aprobacion.antes.proveedor,'Delsa');assert.equal(guardado.aprobacion.despues.proveedor,'Mera');assert.equal(guardado.aprobacion.autor,'Contabilidad');assert.match(guardado.aprobacion.motivo,/Corrección/);
});

test('una corrección cotejada retira la duda OCR del valor anterior y valida la fecha nueva', async () => {
 const {crearRecepcion}=await import('../../src/modules/facturas/recepcion.js');
 const datos={proveedor:'Mera',tipo:'albaran',fecha:'2026-11-04',numero_factura:'A/123',campos_dudosos:['fecha','numero_factura']};
 const fila={id:19,hash:'hash',estado:'revision',original:Buffer.from('original'),resultado:{datos}};
 let guardado;
 const cola=crearRecepcion({
  db:{get:async()=>fila,run:async(_sql,[resultado])=>{guardado=JSON.parse(resultado);return {id:19};}},
  lock:async(_hash,fn)=>fn(),
  procesar:async()=>{}
 });
 const opciones={autor:'Contabilidad',confirmado:true,aceptarAvisos:true};
 await assert.rejects(cola.aprobar(19,{fecha:'2026-11-04'},opciones),/lectura señala dudas/);
 await assert.rejects(cola.aprobar(19,{fecha:'2026-02-30'},opciones),/fecha de emisión válida/);
 await cola.aprobar(19,{fecha:'2026-11-03'},opciones);
 assert.deepEqual(guardado.datos.campos_dudosos,['numero_factura']);
 assert.deepEqual(guardado.aprobacion.antes.campos_dudosos,['fecha','numero_factura']);
 assert.equal(guardado.aprobacion.despues.fecha,'2026-11-03');
});

test('encola con el lector ocupado y reconoce un reintento sin escribir dos veces', async () => {
 const {crearRecepcion}=await import('../../src/modules/facturas/recepcion.js');
 const datos={proveedor:'Proveedor',nif_proveedor:'B12345674',tipo:'albaran',fecha:'2026-11-12',numero_factura:'A/1'};
 let fila={id:19,estado:'revision',version:'11',original:Buffer.from('original'),resultado:{datos}};
 let escrituras=0;
 const cola=crearRecepcion({
  db:{
   get:async()=>fila,
   run:async(sql,[resultado,,id,version])=>{
    assert.match(sql,/xmin::text=\?/);
    assert.equal(version,'11');
    escrituras++;
    fila={...fila,estado:'pendiente',resultado:JSON.parse(resultado)};
    return {id};
   }
  },
  lock:async()=>{throw new Error('Lector ocupado');},
  procesar:async()=>assert.fail('La confirmación debe quedar en cola')
 });
 const opciones={autor:'Contabilidad',confirmado:true,aceptarAvisos:true};
 await cola.aprobar(19,{numero_factura:'A/2'},opciones);
 await cola.aprobar(19,{numero_factura:'A/2'},opciones);
 await assert.rejects(cola.aprobar(19,{numero_factura:'A/3'},opciones),/ya no está pendiente/);
 assert.equal(escrituras,1);
 assert.equal(fila.resultado.datos.numero_factura,'A/2');
});

test('un duplicado resuelto manualmente conserva su original y no se reprocesa', async () => {
 const {crearRecepcion}=await import('../../src/modules/facturas/recepcion.js');
 const fila={id:19,hash:'hash',estado:'duplicado',original:Buffer.from('original'),
  resultado:{resolucion:{accion:'duplicado',compraId:42}}};
 const cola=crearRecepcion({
  db:{get:async()=>fila,run:async()=>assert.fail('El original debe conservarse')},
  lock:async(_hash,fn)=>fn(),
  existeDestino:async()=>assert.fail('No se busca por hash tras enlazar manualmente'),
  procesar:async()=>assert.fail('Un duplicado resuelto no se registra')
 });
 await assert.rejects(cola.ejecutar(19),error=>error.isDuplicate===true);
});
