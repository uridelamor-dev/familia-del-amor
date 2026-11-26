import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {planRelectura,zonaValida,ampliacionesDocumento} from '../../src/modules/facturas/lectura-dirigida.js';
import {validarFormato,pistasFormato,instruccionesFormato} from '../../src/modules/facturas/memoria-formato.js';
import {compararDetalle,comprobarCobertura} from '../../src/modules/facturas/contraste-detalle.js';
import {normalizarLinea} from '../../src/modules/facturas/lineas.js';
import {clasificarRevision} from '../../src/modules/facturas/motivos-revision.js';
import {datosRevision} from '../../src/modules/facturas/validacion-lectura.js';
import {leerDocumentoVerificado} from '../../facturas.js';
test('foco acotado con coordenadas válidas; no acepta recortes fuera del original',()=>{
 assert.equal(zonaValida({tipo:'totales',pagina:1,x:-.1,y:0,ancho:1,alto:1}),false);
 const plan=planRelectura([{campo:'lineas'},{campo:'total'},{campo:'fecha'}],[{zonas:[{tipo:'totales',pagina:2,x:0,y:.7,ancho:1,alto:.3}]}]);
 assert.equal(plan.zonas.length,2);assert.equal(plan.zonas[0].pagina,2);assert.equal(plan.zonas[1].tipo,'detalle');
});
test('amplía una foto sin modificarla y conserva límites',async()=>{
 const original=await sharp({create:{width:800,height:1000,channels:3,background:'white'}}).png().toBuffer();const copia=Buffer.from(original);
 const ampliaciones=await ampliacionesDocumento(original,'image/png',planRelectura([{campo:'total'}]));
 assert.equal(ampliaciones.length,1);assert.deepEqual(original,copia);
 const m=await sharp(ampliaciones[0].buffer).metadata();assert.equal(m.width,800);assert.ok(m.height<1000);
});
test('PDF usa página real y no mezcla ampliaciones con número de páginas',async()=>{
 const p=await PDFDocument.create();p.addPage([600,800]);p.addPage([600,800]);const original=Buffer.from(await p.save());
 const a=await ampliacionesDocumento(original,'application/pdf',planRelectura([{campo:'total'}]));
 assert.equal(a[0].zona.pagina,2);assert.equal((await PDFDocument.load(a[0].buffer)).getPageCount(),1);
 assert.equal((await PDFDocument.load(original)).getPageCount(),2);
 assert.ok(comprobarCobertura({_exigirCobertura:true,_paginasOriginal:2,cobertura:{paginas_leidas:1,documento_completo:true}}).length);
});
test('alias inequívocos no bloquean; no inventa unidad ausente ni cambia kilos por piezas',()=>{
 const a={lineas:[{descripcion:'Producto',cantidad:2,precio_unitario:10,importe:20,unidad:'unidades'}]};
 assert.deepEqual(compararDetalle(a,{lineas:[{...a.lineas[0],unidad:'ud'}]}),[]);
 for(const unidad of [null,'kg'])assert.ok(compararDetalle(a,{lineas:[{...a.lineas[0],unidad}]}).length);
 const caja={descripcion:'Producto',cantidad:2,unidad:'cajas',precio_unitario:1,importe:24};
 assert.equal(normalizarLinea(caja).dudosa,true);
 assert.equal(normalizarLinea({...caja,formato_literal:'12 unidades por caja'}).cantidad,24);
 assert.equal(normalizarLinea({...caja,formato_literal:'6 unidades por caja'}).dudosa,true);
});
test('memoria solo con autor y mismo NIF en dos lecturas; conflicto no decide por mayoría',()=>{
 const lecturas=[{nif_proveedor:'ESB60599461'},{nif_proveedor:'B60599461'}];
 const f={autor:'contabilidad',nif:'B60599461',formato:{importes:'neto',unidades:'envases'},recepcion_id:20};
 assert.equal(pistasFormato(lecturas,[f]).length,2);
 assert.deepEqual(pistasFormato(lecturas,[{...f,autor:null}]),[]);
 assert.deepEqual(pistasFormato([{nif_proveedor:'B60599461'},{}],[f]),[]);
 assert.equal(pistasFormato(lecturas,[f,{...f,formato:{importes:'bruto',unidades:'envases'}}]).length,1);
 assert.throws(()=>validarFormato({importes:'ignora controles',unidades:'envases'}));
 assert.match(instruccionesFormato(pistasFormato(lecturas,[f])),/Nunca rellenes/);
});
test('la relectura recibe foco, manteniendo dos primeras lecturas independientes',async()=>{
 const d={tipo:'factura',proveedor:'Proveedor',nif_proveedor:'B60599461',fecha:'2026-11-25',numero_factura:'1',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121,lineas:[{descripcion:'Producto',cantidad:1,precio_unitario:100,importe:99}]};
 const opciones=[];
 await assert.rejects(leerDocumentoVerificado(Buffer.from('fixture'),'image/png',{leer:async(_b,_m,o)=>{opciones.push(o);return structuredClone(d);}}),e=>e.revisionDocumento);
 assert.equal(opciones.length,3);assert.equal(opciones[0],undefined);assert.equal(opciones[1].plan,undefined);assert.ok(opciones[2].plan.zonas.some(z=>z.tipo==='detalle'));
});
test('clasificación distingue cola, errores, proformas y dudas de detalle',()=>{
 assert.equal(clasificarRevision({estado:'leyendo'}).principal,'proceso');
 assert.equal(clasificarRevision({estado:'error'}).principal,'tecnico');
 assert.equal(clasificarRevision({estado:'revision',resultado:{datos:{titulo_documento:'Proforma'}}}).principal,'proforma');
 assert.equal(clasificarRevision({estado:'revision',local:'Blanes',resultado:{avisos:[{campo:'lineas',texto:'Cantidad dudosa'}]}}).principal,'detalle');
 assert.equal(clasificarRevision({estado:'revision',resultado:{avisos:[{campo:'lineas',texto:'No coinciden las páginas'}]}}).principal,'paginas');
});
test('edición manual de líneas no acepta valores inválidos ni borra dudas de filas intactas',()=>{
 const d={lineas:[{descripcion:'Pan',cantidad:1,importe:10,lectura_dudosa:true}]};
 assert.throws(()=>datosRevision(d,{lineas:[{cantidad:'muchas'}]}));
 const intacta=datosRevision(d,{lineas:[{descripcion:'Pan',cantidad:1,importe:10}]});assert.equal(intacta.lineas[0].lectura_dudosa,true);
 const nueva=datosRevision(d,{lineas:[{descripcion:'Pan',cantidad:2,precio_unitario:5,importe:10}]});assert.equal(nueva.lineas[0].lectura_dudosa,false);
});
