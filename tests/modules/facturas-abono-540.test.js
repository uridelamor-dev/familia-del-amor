import test from 'node:test';
import assert from 'node:assert/strict';
import {avisosAbono,pistasAbono} from '../../src/modules/facturas/abonos.js';
import {leerDocumentoVerificado} from '../../facturas.js';
const f={tipo:'factura',titulo_documento:'Abono',proveedor:'DDI PROVEA SL',nif_proveedor:'B67210948',fecha:'2026-10-31',fecha_texto:'31.10.2026',numero_factura:'7922008767',base_imponible:186.21,cuota_iva:39.10,porcentaje_iva:21,total:225.31,iva_desglose:[{base:186.21,tipo:21,cuota:39.10}],lineas:[{descripcion:'Inedit',cantidad:2,precio_unitario:33.105,importe:66.21},{descripcion:'Carbonico vacio',cantidad:1,precio_unitario:100,importe:100},{descripcion:'Barril20L',cantidad:1,precio_unitario:20,importe:20}]};
const negativas=()=>({...f,base_imponible:-186.21,cuota_iva:-39.10,total:-225.31,iva_desglose:[{base:-186.21,tipo:21,cuota:-39.10}],lineas:f.lineas.map(l=>({...l,cantidad:-l.cantidad,importe:-l.importe}))});
const procesar=d=>leerDocumentoVerificado(Buffer.from('fixture'),'application/pdf',{leer:async()=>structuredClone(d)});
test('540: cabecera y tres productos positivos permanecen en revisión sin mutaciones',async()=>{
 const antes=structuredClone(f);await assert.rejects(procesar(f),e=>e.revisionDocumento);assert.deepEqual(f,antes);
});
test('540: total negativo no permite dejar detalle ni desglose positivos',async()=>{
 for(const d of [{...negativas(),lineas:f.lineas},{...negativas(),iva_desglose:f.iva_desglose},{...negativas(),base_imponible:f.base_imponible}])
  await assert.rejects(procesar(d),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>['lineas','iva_desglose','base_imponible'].includes(a.campo)));
});
test('540: abono íntegramente cotejado negativo puede registrarse sin cambiar precios positivos',async()=>{
 const d=await procesar(negativas());assert.equal(d.total,-225.31);assert.deepEqual(d.lineas.map(l=>l.importe),[-66.21,-100,-20]);assert.equal(d.lineas[0].precio_unitario,33.105);
});
test('evidencia PDF literal retiene positivo aunque OCR omita título; concepto aislado no activa guardia',()=>{
 assert.ok(avisosAbono({...f,titulo_documento:null,_evidenciaAbono:pistasAbono('Abono\nFactura rectificativa por diferencia periodo (10.2026)')}).length);
 assert.deepEqual(avisosAbono({...f,titulo_documento:'Factura',concepto:'Abono pendiente de recibir'}),[]);
});
