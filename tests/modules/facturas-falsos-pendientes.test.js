import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normNif,nifValido} from '../../src/modules/facturas/emisor.js';
import {nifComprobable} from '../../src/modules/facturas/contraste-dirigido.js';
import {contraHistorial} from '../../src/modules/facturas/coherencia.js';
import {normalizarLinea} from '../../src/modules/facturas/lineas.js';
import {esAdjuntoDecorativo} from '../../src/modules/facturas/clasificacion.js';
import {leerDocumentoVerificado} from '../../facturas.js';
const linea={descripcion:'LOTE',cantidad:10,precio_unitario:21.2,importe:207.76,descuento_pct:2,importe_neto:null};
const base={tipo:'factura',proveedor:'Proveedor',nif_proveedor:'B60599461',fecha:'2026-11-25',fecha_texto:'25/11/2026',numero_factura:'1',base_imponible:207.76,cuota_iva:43.63,porcentaje_iva:21,total:251.39,lineas:[linea]};
test('ES y NIF nacional identifican la misma entidad sin admitir controles incorrectos',()=>{
 assert.equal(normNif('ES B60599461'),'B60599461');
 assert.equal(nifValido('ESB60599461'),true);
 assert.equal(nifComprobable('ESB60599461'),true);
 assert.equal(nifComprobable('ESB60599462'),false);
 assert.equal(normNif('FRB60599461'),'FRB60599461');
 assert.deepEqual(contraHistorial({nif_proveedor:'ESB60599461'},{nifsConfirmados:['B60599461']}),[]);
 assert.ok(contraHistorial({nif_proveedor:'ESB12345674'},{nifsConfirmados:['B60599461']}).length);
});
test('importe ya neto no recibe un segundo descuento; conserva tarifa y neto',()=>{
 const l=normalizarLinea(linea);
 assert.equal(l.importe,207.76);assert.equal(l.importe_bruto,212);assert.equal(l.dudosa,false);
 assert.equal(normalizarLinea({...linea,importe:200}).dudosa,true);
 const explicito=normalizarLinea({...linea,importe:212,importe_neto:207.76});
 assert.deepEqual(l,explicito);
 assert.equal(normalizarLinea({...linea,importe:212}).importe,207.76);
 assert.equal(normalizarLinea({...linea,importe:207.76,importe_neto:200}).dudosa,true);
});
test('documento corroborado con ES y descuento neto pasa automáticamente; errores reales siguen bloqueados',async()=>{
 let veces=0;
 const r=await leerDocumentoVerificado(Buffer.from('fixture'),'application/pdf',{leer:async()=>({...structuredClone(base),nif_proveedor:veces++?'ESB60599461':'B60599461'})});
 assert.equal(veces,2);assert.equal(r._contraste.estado,'lectura_validada');
 for(const cambio of [{cuota_iva:50},{nif_proveedor:'ESB60599462'},{titulo_documento:'PROFORMA',tipo:'otro'},{lineas:[{...linea,importe:200}]}]) {
  await assert.rejects(leerDocumentoVerificado(Buffer.from('fixture'),'application/pdf',{leer:async()=>structuredClone({...base,...cambio})}),e=>e.revisionDocumento===true);
 }
});
test('logo con tipo vacío sale de revisión; documento incompleto nunca se descarta',async()=>{
 const logo={es_documento_compra:false,confianza_clasificacion:'alta',clase_adjunto:'imagen_corporativa',tipo:null,lineas:[],calidad_imagen:'legible'};
 assert.equal(esAdjuntoDecorativo(logo),true);
 for(const cambio of [{fecha:'2026-11-25'},{titulo_documento:'Factura'},{total:0},{tipo:'factura'},{calidad_imagen:'recortada'},{_lecturaIncompleta:true},{campos_dudosos:['total']}])assert.equal(esAdjuntoDecorativo({...logo,...cambio}),false);
 let veces=0;const r=await leerDocumentoVerificado(Buffer.from('fixture'),'image/png',{leer:async()=>(veces++,structuredClone(logo))});
 assert.equal(veces,1);assert.equal(esAdjuntoDecorativo(r),true);
});
test('dos representaciones del mismo descuento se corroboran sin ocultar cambios de precio o cantidad',async()=>{
 const otra={...base,lineas:[{...linea,importe:212,importe_neto:207.76}]};let n=0;
 const r=await leerDocumentoVerificado(Buffer.from('fixture'),'application/pdf',{leer:async()=>structuredClone(n++?otra:base)});
 assert.equal(n,2);assert.equal(r._contraste.estado,'lectura_validada');
 const {compararDetalle}=await import('../../src/modules/facturas/contraste-detalle.js');
 assert.ok(compararDetalle(base,{...otra,lineas:[{...otra.lineas[0],cantidad:20,precio_unitario:10.6}]}).length);
});
test('recuperación no se activa sin lectura, con aprobación humana o tras un intento',async()=>{
 const {motivosRecuperacion}=await import('../../src/modules/facturas/recuperar-validacion.js');
 for(const r of [null,{}, {datos:{nif_proveedor:'ESB60599461'},aprobacion:{autor:'humano'}},{datos:{nif_proveedor:'ESB60599461'},revalidacion:{version:'anterior'}},{datos:{nif_proveedor:'ESB60599461'},contraste:{version:4}}])assert.deepEqual(motivosRecuperacion(r),[]);
});
