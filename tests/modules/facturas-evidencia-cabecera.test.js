import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {avisosEvidenciaCabecera} from '../../src/modules/facturas/evidencia-cabecera.js';
import {controlesLectura} from '../../src/modules/facturas/validacion-lectura.js';
import {leerDocumentoVerificado,comprobarRevisionHumana,promptExtraccion} from '../../facturas.js';
const doc={tipo:'albaran',titulo_documento:'Albarán',proveedor:'COMERC DE PEIX ROS S.L.U.',nif_proveedor:'B12345674',fecha:'2026-11-16',fecha_texto:'16-11-2026',numero_factura:'26CPRAVE-093958',base_imponible:81,porcentaje_iva:10,cuota_iva:8.10,total:89.10,lineas:[{descripcion:'Pescado',cantidad:3,precio_unitario:27,importe:81}],_exigirEvidenciaCabecera:true,evidencia_fecha:{etiqueta:'Fecha albarán',texto:'16-11-2026',ubicacion:'Cabecera junto al número de albarán'},evidencia_total:{etiqueta:'Total',importe_texto:'89,10',ubicacion:'Cuadro Totales al pie'}};
test('Peix Ros: cabecera y cuadro fiscal correctos se validan sin cambiar datos',()=>{
 const antes=structuredClone(doc);assert.deepEqual(controlesLectura(doc),[]);assert.deepEqual(doc,antes);
});
test('congelación, caducidad y fechas auxiliares no sustituyen emisión aunque coincidan entre lecturas',async()=>{
 for(const etiqueta of ['Fecha congelación','Caducidad','Fecha lote','Fecha fabricación','Consumo preferente','Fecha pedido','Vencimiento']) {
  const mal={...doc,fecha:'2026-07-09',fecha_texto:'09-07-2026',evidencia_fecha:{etiqueta,texto:'09-07-2026',ubicacion:'Detalle del producto'}};
  assert.ok(controlesLectura(mal).some(a=>a.campo==='fecha'),etiqueta);
 }
 let n=0;const mal={...doc,fecha:'2026-07-09',fecha_texto:'09-07-2026',evidencia_fecha:{etiqueta:'Congelación',texto:'09-07-2026',ubicacion:'Producto'}};
 await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'),'image/jpeg',{leer:async()=>{n++;return structuredClone(mal);}}),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.campo==='fecha'));
 assert.equal(n,3);
});
test('no acepta 81 de neto como total aunque base 81 + IVA cero cuadre',async()=>{
 const mal={...doc,porcentaje_iva:0,cuota_iva:0,total:81,evidencia_total:{etiqueta:'Neto',importe_texto:'81,00',ubicacion:'Columna importe del producto'}};
 assert.ok(controlesLectura(mal).some(a=>a.campo==='total'));
 await assert.rejects(leerDocumentoVerificado(Buffer.from('prueba'),'image/jpeg',{leer:async()=>structuredClone(mal)}),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.campo==='total'));
 assert.ok(controlesLectura({...mal,evidencia_total:doc.evidencia_total}).some(a=>a.campo==='total'));
});
test('exige evidencia nueva, distingue importe literal y conserva totales cero explícitos',()=>{
 assert.ok(avisosEvidenciaCabecera({...doc,evidencia_fecha:null}).some(a=>a.campo==='fecha'));
 assert.ok(avisosEvidenciaCabecera({...doc,evidencia_total:null}).some(a=>a.campo==='total'));
 assert.ok(avisosEvidenciaCabecera({...doc,evidencia_fecha:{...doc.evidencia_fecha,texto:'15-11-2026'}}).some(a=>a.campo==='fecha'));
 for(const [total,importe_texto] of [[1234.56,'1.234,56 €'],[1234.56,'1,234.56 EUR'],[1000,'1.000'],[0,'0,00'],[-89.1,'(89,10)']])assert.deepEqual(avisosEvidenciaCabecera({...doc,total,evidencia_total:{...doc.evidencia_total,importe_texto}}),[]);
 assert.ok(avisosEvidenciaCabecera({...doc,evidencia_total:{...doc.evidencia_total,importe_texto:'81 + 8,10'}}).length);
});
test('albarán sin valorar, legado y corrección humana no quedan bloqueados por evidencia OCR antigua',async()=>{
 assert.deepEqual(avisosEvidenciaCabecera({...doc,total:null,evidencia_total:null}),[]);
 assert.deepEqual(avisosEvidenciaCabecera({...doc,_exigirEvidenciaCabecera:undefined,evidencia_fecha:null,evidencia_total:null}),[]);
 const corregida={...doc,evidencia_fecha:{etiqueta:'Congelación',texto:'09-07-2026',ubicacion:'Producto'},evidencia_total:{etiqueta:'Neto',importe_texto:'81,00',ubicacion:'Producto'}};
 assert.deepEqual(await comprobarRevisionHumana(corregida),[]);
 assert.ok(avisosEvidenciaCabecera(corregida).length); // No se borra la evidencia para otras lecturas.
});
test('abono explícito puede imprimir magnitud positiva; no se infiere signo desde una mención',()=>{
 const abono={...doc,total:-89.1,titulo_documento:'Abono'};
 assert.deepEqual(avisosEvidenciaCabecera(abono),[]);
 assert.ok(avisosEvidenciaCabecera({...abono,titulo_documento:'Factura',concepto:'Abono anterior'}).some(a=>a.campo==='total'));
});
test('el extractor exige origen de fecha y total también para la segunda lectura',()=>{
 const source=readFileSync(new URL('../../facturas.js',import.meta.url),'utf8');
 assert.match(source,/r\.valor\._exigirEvidenciaCabecera = true/);
 const prompt=promptExtraccion('2026-11-17');
 assert.match(prompt,/Congelación 09-07-2026 y Caducidad 09-07-2028/);
 assert.match(prompt,/Total 89,10/);assert.match(prompt,/evidencia_total/);assert.match(prompt,/evidencia_fecha/);
});
