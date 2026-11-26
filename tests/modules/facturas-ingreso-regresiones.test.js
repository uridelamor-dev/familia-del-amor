import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leerDocumentoVerificado,comprobarRevisionHumana,instruccionesRevision} from '../../facturas.js';
const base={tipo:'factura',proveedor:'Proveedor',nif_proveedor:'B12345674',fecha:'2026-11-13',fecha_texto:'13/11/2026',numero_factura:'1',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121,lineas:[{descripcion:'Servicio',cantidad:1,precio_unitario:100,importe:100}]};
test('cabecera corroborada no acepta las líneas de una primera lectura incompatible',async()=>{
 const otra={...base,base_imponible:200,cuota_iva:42,total:242,lineas:[]};let n=0;
 await assert.rejects(leerDocumentoVerificado(Buffer.from('fixture'),'image/jpeg',{leer:async()=>structuredClone([base,otra,otra][n++])}),e=>e.revisionDocumento);
 assert.equal(n,3);
});
test('detalle correcto no añade una tercera lectura y conserva céntimos del original',async()=>{
 const mitjans={...base,base_imponible:121.66,cuota_iva:12.17,porcentaje_iva:10,total:133.83,lineas:[{descripcion:'Pavo',cantidad:8.454,precio_unitario:14.39,importe:121.66}]};let n=0;
 const r=await leerDocumentoVerificado(Buffer.from('fixture'),'image/jpeg',{leer:async()=>(n++,structuredClone(mitjans))});
 assert.equal(n,2);assert.equal(r.lineas[0].importe,121.66);
});
test('la relectura de productos pide detalle; la comprobación normal también contrasta productos',()=>{
 assert.match(instruccionesRevision({revision:true}),/Relee también todas las líneas/);
 const t=instruccionesRevision({revision:true,camposRevision:['lineas','total']});
 assert.match(t,/Relee también todas las líneas/);assert.doesNotMatch(t,/No extraigas productos/);
});
test('aprobación no aprende identidad propia ni NIF del receptor como emisor',async()=>{
 const propios=await comprobarRevisionHumana(base,{dbAll:async sql=>sql.includes('facturas_locales')?[{cif:'B12345674',empresa:'Nuestra'}]:[]});
 assert.ok(propios.some(a=>a.campo==='nif_proveedor'));
 const mismo=await comprobarRevisionHumana({...base,nif_receptor:base.nif_proveedor},{dbAll:async()=>[]});
 assert.ok(mismo.some(a=>a.texto.includes('mismo NIF')));
});
test('corregir el emisor elimina evidencia OCR obsoleta sin ocultar conflictos fiscales',async()=>{
 const d={...base,_exigirEvidenciaEmisor:true,evidencia_emisor:{nombre_literal:'OCR incorrecto'}};
 assert.deepEqual(await comprobarRevisionHumana(d,{dbAll:async()=>[]}),[]);
 assert.ok((await comprobarRevisionHumana({...d,nif_proveedor:'B12345678'},{dbAll:async()=>[]})).length);
});
