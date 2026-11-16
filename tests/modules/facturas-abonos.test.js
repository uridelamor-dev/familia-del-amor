import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avisosAbono,pistasAbono} from '../../src/modules/facturas/abonos.js';
import {leerDocumentoVerificado} from '../../facturas.js';
const f={tipo:'factura',proveedor:'DDI PROVEA SL',nif_proveedor:'B67210948',fecha:'2026-11-11',fecha_texto:'11/11/2026',numero_factura:'7922008869',base_imponible:41.67,cuota_iva:8.75,porcentaje_iva:21,total:50.42,lineas:[]};
test('abono DDI positivo se retiene, sin cambiar importes',()=>{
 const d={...f,titulo_documento:'Abono'};assert.equal(avisosAbono(d)[0].campo,'total');assert.equal(d.total,50.42);
 assert.deepEqual(avisosAbono({...d,base_imponible:-41.67,cuota_iva:-8.75,total:-50.42}),[]);
});
test('menciones y referencias no identifican abono',()=>{
 assert.deepEqual(avisosAbono({...f,concepto:'Abono pendiente de recibir'}),[]);
 assert.equal(pistasAbono('Forma de pago: abono en cuenta\nFactura con abono anterior\nReferencia nota de crédito').abono,false);
 assert.equal(pistasAbono('ABONO\nNúmero\n7922008869').abono,true);
});
test('archivo mixto y rectificativa positiva exigen revisión',()=>{
 assert.equal(avisosAbono({...f,total:-50.42,_evidenciaAbono:pistasAbono('Factura\nAbono')})[0].campo,'numero_factura');
 assert.equal(avisosAbono({...f,titulo_documento:'Factura rectificativa'})[0].campo,'total');
});
test('relectura no borra título explícito detectado por primera lectura',async()=>{
 let n=0;await assert.rejects(leerDocumentoVerificado(Buffer.from('test'),'image/jpeg',{leer:async()=>({...f,titulo_documento:++n===1?'Abono':'Factura'})}),e=>e.revisionDocumento && e.resultado.avisos.some(a=>a.texto.includes('abono')));assert.equal(n,3);
});
test('tres lecturas de abono positivo no se registran como gasto',async()=>{
 await assert.rejects(leerDocumentoVerificado(Buffer.from('test'),'image/jpeg',{leer:async()=>({...f,titulo_documento:'Abono'})}),e=>e.revisionDocumento);
});
test('abono negativo coherente supera el flujo verificado',async()=>{
 const d=await leerDocumentoVerificado(Buffer.from('test'),'image/jpeg',{leer:async()=>({...f,titulo_documento:'Abono',base_imponible:-41.67,cuota_iva:-8.75,total:-50.42})});
 assert.equal(d.total,-50.42);assert.equal(d.base_imponible,-41.67);
});
