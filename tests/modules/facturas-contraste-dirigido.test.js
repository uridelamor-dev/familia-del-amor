import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararContraste,nifComprobable,elegirLecturaContrastada} from '../../src/modules/facturas/contraste-dirigido.js';
import {leerDocumentoVerificado} from '../../facturas.js';
const buena={tipo:'factura',proveedor:'ASIA HIPER STORE',nif_proveedor:'B12345674',fecha:'2026-09-10',numero_factura:'123',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121,lineas:[{descripcion:'Producto',importe:100}]};
const dbAll=async()=>[];
function lector(valores){let n=0;return async()=>{const v=valores[n++];if(v instanceof Error)throw v;assert.ok(v,'No debe pedir más lecturas');return structuredClone(v);};}
test('comprueba el control del CIF antes de relajar una variante de nombre',()=>{
 assert.equal(nifComprobable('B12345674'),true);assert.equal(nifComprobable('B12345678'),false);
 const r=prepararContraste([buena,{...buena,proveedor:'ASIA HYPER STORE'}]);
 assert.equal(r.lecturas[1].proveedor,buena.proveedor);assert.equal(r.cambios.length,1);
 assert.equal(prepararContraste([buena,{...buena,nif_proveedor:'B87654321',proveedor:'ASIA HYPER STORE'}]).cambios.length,0);
});
test('el nombre solo y dos lecturas sin NIF no autorizan completar identidad',()=>{
 const ficha={proveedor:buena.proveedor,nif:buena.nif_proveedor,autor:'Silvia'};
 const vacia={...buena,nif_proveedor:null};
 assert.equal(prepararContraste([vacia,vacia],[ficha]).lecturas[0].nif_proveedor,null);
 assert.equal(prepararContraste([vacia,buena],[ficha]).lecturas[0].nif_proveedor,buena.nif_proveedor);
 assert.equal(prepararContraste([vacia,buena],[{...ficha,autor:null}]).lecturas[0].nif_proveedor,null);
 assert.equal(prepararContraste([vacia,buena],[ficha],[{cif:buena.nif_proveedor}]).lecturas[0].nif_proveedor,null);
});
test('una relectura resuelve un porcentaje ausente conservando productos y evidencia original',async()=>{
 const primera={...buena,porcentaje_iva:null};
 const r=await leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{dbAll,leer:lector([primera,buena,buena])});
 assert.equal(r.porcentaje_iva,21);assert.deepEqual(r.lineas,buena.lineas);
 assert.equal(r._contraste.primera.porcentaje_iva,null);assert.equal(r._contraste.resueltoPorRelectura,true);
});
test('no calcula el IVA correcto si las lecturas originales dicen 21 y el original exige 4',async()=>{
 const mal={...buena,base_imponible:37.50,cuota_iva:1.5,total:39};
 await assert.rejects(leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{dbAll,leer:lector([mal,mal,{...mal,porcentaje_iva:4}])}),e=>e.revisionDocumento && e.resultado.contraste.tercera.porcentaje_iva===4);
});
test('un NIF nuestro como proveedor nunca se autoacepta aunque tres lecturas coincidan',async()=>{
 await assert.rejects(leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{dbAll:async sql=>sql.includes('facturas_locales')?[{cif:buena.nif_proveedor,empresa:'Nuestra SL'}]:[],leer:lector([buena,buena,buena])}),e=>e.revisionDocumento);
});
test('un fallo de relectura conserva la revisión y no pide otra foto',async()=>{
 await assert.rejects(leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{dbAll,leer:lector([buena,{...buena,total:122},Error('timeout')])}),e=>e.revisionDocumento && e.resultado.contraste.errorRelectura && !e.resultado.solicitarFoto);
});
test('una cabecera correcta no rescata productos truncados ni fotos recortadas',()=>{
 for(const cambio of [{_lecturaIncompleta:true},{calidad_imagen:'recortada'},{campos_dudosos:['lineas']}]) assert.equal(elegirLecturaContrastada({...buena,...cambio},buena,buena),null);
});
test('un resumen fiscal mixto no se mezcla con otro desglose',()=>{
 const mixta={...buena,porcentaje_iva:null,cuota_iva:15.5,total:115.5,iva_desglose:[{base:50,tipo:10,cuota:5},{base:50,tipo:21,cuota:10.5}]};
 assert.ok(elegirLecturaContrastada(mixta,mixta,mixta));
 assert.equal(elegirLecturaContrastada(mixta,mixta,{...mixta,iva_desglose:[]}),null);
});
test('documentos correctos solo necesitan dos lecturas',async()=>{
 const r=await leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{dbAll,leer:lector([buena,buena])});
 assert.equal(r.total,121);assert.equal(r._contraste.tercera,undefined);
});
test('un CIF con forma correcta pero control erróneo se retiene aunque coincida',async()=>{
 const mal={...buena,nif_proveedor:'B12345678'};
 await assert.rejects(leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{dbAll,leer:lector([mal,mal,mal])}),e=>e.revisionDocumento);
});
test('no acepta un tipo cero con cuota positiva ni desgloses distintos',async()=>{
 const {controlesLectura,compararLecturas}=await import('../../src/modules/facturas/validacion-lectura.js');
 assert.ok(controlesLectura({...buena,porcentaje_iva:0}).some(a=>a.campo==='porcentaje_iva'));
 assert.ok(compararLecturas(buena,{...buena,iva_desglose:[{base:100,tipo:21,cuota:21}]}).some(a=>a.campo==='iva_desglose'));
});
test('una corrección humana previa permite completar solo el NIF corroborado',async()=>{
 const ficha={proveedor:buena.proveedor,nif:buena.nif_proveedor,autor:'Silvia'};
 const r=await leerDocumentoVerificado(Buffer.from('x'),'image/jpeg',{
   dbAll:async sql=>sql.includes('revisionPrevia')?[ficha]:[],leer:lector([{...buena,nif_proveedor:null},buena])});
 assert.equal(r.nif_proveedor,buena.nif_proveedor);
 assert.equal(r._contraste.primera.nif_proveedor,null);
 assert.equal(r._contraste.ajustes[0].campo,'nif_proveedor');
});
