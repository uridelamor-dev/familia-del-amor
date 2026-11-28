import sharp from 'sharp';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {controlesLectura,compararLecturas,datosRevision} from '../../src/modules/facturas/validacion-lectura.js';
import {leerDocumentoVerificado, procesarFactura, procesarFacturaSinLocal} from '../../facturas.js';
const buena={tipo:'factura',proveedor:'Proveedor de prueba',nif_proveedor:'B12345674',fecha:'2026-09-10',fecha_texto:'10/09/2026',numero_factura:'123',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121,lineas:[]};
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
 await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'),'image/jpeg',{dbAll:async()=>[],leer:async(_b,_m,opts)=>{n++;if(n===2)assert.deepEqual(opts,{revision:true});return {...buena,total:n>=2?122:121};}}),e=>e.revisionDocumento && e.resultado.datos.total===121 && e.resultado.segunda.total===122);
 assert.equal(n,3);
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

test('Lindamer: tres lecturas iguales no validan día y mes invertidos',async()=>{
 const mal={...buena,proveedor:'Lindamer',fecha:'2026-03-11',fecha_texto:'03/11/2026'};
 await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'),'image/jpeg',{leer:async()=>structuredClone(mal)}),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.campo==='fecha'&&a.texto.includes('2026-11-03')));
});
test('la fecha literal correcta permite registrar aunque día y mes sean intercambiables',async()=>{
 const bien={...buena,fecha:'2026-11-03',fecha_texto:'03/11/2026'};
 const r=await leerDocumentoVerificado(Buffer.from('prueba'),'image/jpeg',{leer:async()=>structuredClone(bien)});
 assert.equal(r.fecha,'2026-11-03');
});
test('sin transcripción ni evidencia del original, una fecha ambigua queda en revisión',async()=>{
 const ambigua={...buena,fecha:'2026-03-11',fecha_texto:null};
 await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'),'image/jpeg',{leer:async()=>structuredClone(ambigua)}),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.campo==='fecha'));
});
test('la capa PDF descubre la inversión aunque la transcripción repita el error',async()=>{
 const mal={...buena,fecha:'2026-03-11',fecha_texto:'11/03/2026',_pistasFecha:{hayTexto:true,anios:[2026],fechas:['2026-11-03']}};
 await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'),'application/pdf',{leer:async()=>structuredClone(mal)}),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.campo==='fecha'));
});

test('P1 #2153: una página de totales numerada queda en revisión aunque los importes cuadren', async () => {
  const parcial = {...buena, proveedor:'Transgourmet', base_imponible:549.68, cuota_iva:56.19,
    porcentaje_iva:null, total:605.87, cobertura:{numeracion_impresa:{total:2, visibles:[2]}}};
  let lecturas = 0;
  await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'), 'image/jpeg', {
    leer: async () => ++lecturas === 2 ? {...parcial, cobertura:null} : parcial,
  }), e => e.revisionDocumento && e.resultado.avisos.some(a => a.codigo === 'paginas_ausentes'));
  assert.equal(lecturas, 2);
  assert.ok(!controlesLectura({...parcial, cobertura:{numeracion_impresa:{total:2, visibles:[1, 2]}}})
    .some(a => a.codigo === 'paginas_ausentes'));
});

test('una tercera lectura que ve páginas ausentes impide validar las dos primeras', async () => {
  const lecturas = [buena, {...buena, total:122},
    {...buena, cobertura:{numeracion_impresa:{total:3, visibles:[1, 3]}}}];
  await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'), 'image/jpeg', {
    leer: async () => lecturas.shift(),
  }), e => e.revisionDocumento && e.resultado.avisos.some(a => a.codigo === 'paginas_ausentes'));
});


test('P1 #2328 y #3360: una entrega en Blanes enviada desde Lloret queda en revisión', async () => {
 for (const numero_factura of ['502083', '300532']) {
  const datos = {...buena, tipo:'albaran', proveedor:'Maresme Tot Gel', numero_factura,
   direccion_entrega:'Carrer de la Muralla, 21 · Blanes'};
  await assert.rejects(procesarFactura({
   buffer:Buffer.from(numero_factura), mimeType:'image/jpeg', local:'Lloret', canal:'WhatsApp',
   leerDocumento:async () => datos,
  }), e => e.revisionDocumento && e.resultado.avisos.some(a =>
   a.campo === 'local' && a.texto.includes('Blanes') && a.texto.includes('Lloret')));
 }
});

test('el contraste distingue un domicilio fiscal de una dirección de entrega', () => {
 const entrega = {...buena, direccion_entrega:'Muralla, 21'};
 assert.ok(compararLecturas(entrega, {...buena, domicilio_fiscal:'Muralla, 21'})
  .some(a => a.campo === 'local'));
 assert.ok(!compararLecturas(entrega, {...buena, direccion_entrega:'Carrer de la Muralla, 28'})
  .some(a => a.campo === 'local'));
});


test('email sin local: la entrega en Blanes resuelve un NIF compartido', async () => {
 const fin = new Error('Entrada al registro con local');
 let consultasHash = 0;
 await assert.rejects(procesarFacturaSinLocal({
  buffer:Buffer.from('email con entrega'), mimeType:'application/pdf', origen:'email',
  leerDocumento:async () => ({...buena, nif_receptor:'B70799135', direccion_entrega:'Muralla, 21'}),
  dbAll:async sql => sql.includes('REPLACE(REPLACE(UPPER(cif)')
   ? [{local:'La Tapeta - Blanes', empresa:'Del Amor Uriel'}, {local:'La Tapeta - Lloret', empresa:'Del Amor Uriel'}]
   : [],
  dbGet:async sql => {
   if (sql.includes('FROM facturas WHERE file_hash') && ++consultasHash === 2) throw fin;
   return null;
  },
 }), error => error === fin);
});

test('email sin local: una dirección incompatible con el NIF receptor requiere revisión', async () => {
 await assert.rejects(procesarFacturaSinLocal({
  buffer:Buffer.from('email con entrega contradictoria'), mimeType:'application/pdf', origen:'email',
  leerDocumento:async () => ({...buena, nif_receptor:'B70799135', direccion_entrega:'Muralla, 21'}),
  dbAll:async sql => sql.includes('REPLACE(REPLACE(UPPER(cif)')
   ? [{local:'La Tapeta - Lloret', empresa:'Del Amor Uriel'}]
   : [],
  dbGet:async () => null,
 }), error => error.revisionDocumento && error.resultado.avisos.some(a =>
  a.campo === 'local' && a.texto.includes('NIF receptor')));
});


test('P1 #2899: una foto sin EXIF girada se contrasta dos veces tras orientar la copia', async () => {
 const foto = await sharp({create:{width:80,height:120,channels:3,background:'white'}}).png().toBuffer();
 const lecturaCorregida = [];
 const salida = await leerDocumentoVerificado(foto,'image/png',{
  leer:async imagen => {
   if (imagen === foto) return {...buena,orientacion_texto:{giro_horario:90,confianza:'alta'}};
   const {width,height} = await sharp(imagen).metadata();
   lecturaCorregida.push([width,height]);
   return {...buena};
  },
 });
 assert.deepEqual(lecturaCorregida,[[120,80],[120,80]]);
 assert.equal(salida._contraste.estado,'lectura_validada');
});

test('P1: un extracto, certificado o voucher corroborado conserva el original en revisión', async () => {
 for (const clase_adjunto of ['voucher_datafono','certificado_seguro','extracto_cuenta']) {
  const informativo={tipo:'otro',clase_adjunto,es_documento_compra:false,
   confianza_clasificacion:'alta',calidad_imagen:'legible',lineas:[]};
  await assert.rejects(leerDocumentoVerificado(Buffer.from(clase_adjunto),'application/pdf',{
   leer:async () => ({...informativo}),
  }), error => error.revisionDocumento && error.resultado.avisos.some(a => a.codigo === 'informativo'));
 }
});

test('P2: el desglose aprobado suma base, IVA y recargo y conserva los tipos mixtos', async () => {
 const {validarIva} = await import('../../src/modules/facturas/iva.js');
 const iva_desglose = [
  {tipo:4,base:50,cuota:2,recargo:0.25},
  {tipo:21,base:100,cuota:21,recargo:5.2},
 ];
 const d = datosRevision(buena,{iva_desglose,total:178.45,lineas_iva_incluido:true});
 assert.deepEqual([d.base_imponible,d.cuota_iva,d.recargo_equivalencia,d.porcentaje_iva],[150,23,5.45,null]);
 assert.equal(d.lineas_iva_incluido,true);
 assert.deepEqual(validarIva(d.iva_desglose,d).partes,iva_desglose);
 assert.throws(() => datosRevision(buena,{iva_desglose:[{tipo:4,base:null,cuota:2}]}));
});

test('P2: bultos y descuento en euros se guardan separados de la cantidad y del IVA', async () => {
 const {normalizarLinea} = await import('../../src/modules/facturas/lineas.js');
 const d = datosRevision(buena,{lineas:[{descripcion:'Producto',cantidad:10,bultos:2,
  precio_unitario:4,importe:40,importe_neto:36,descuento_euros:4}]});
 const l = normalizarLinea(d.lineas[0]);
 assert.deepEqual([l.cantidad,l.bultos,l.descuento_euros,l.importe,l.dudosa],[10,2,4,36,false]);
 assert.equal(normalizarLinea({...d.lineas[0],importe_neto:34}).dudosa,true);
});

test('P3: la pauta de DDI requiere un NIF coincidente y la de Cerezo conserva el IVA ausente', async () => {
 const {instruccionesPlantillaProveedor} = await import('../../src/modules/facturas/memoria-formato.js');
 const ddi = {...buena,nif_proveedor:'B67210948'};
 assert.match(instruccionesPlantillaProveedor([ddi,{...ddi,nif_proveedor:'ES-B67210948'}]),/Dto en euros/);
 assert.equal(instruccionesPlantillaProveedor([ddi,buena]),'');
 const cerezo = {...buena,nif_proveedor:'B60599461'};
 assert.match(instruccionesPlantillaProveedor([cerezo,cerezo]),/Si el IVA no está impreso/);
});
