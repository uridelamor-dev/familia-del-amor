import {test} from 'node:test';
import assert from 'node:assert/strict';
import {numeroDocumentoAusente} from '../../src/modules/facturas/numero-documento.js';
import {controlesLectura,datosRevision} from '../../src/modules/facturas/validacion-lectura.js';
import {revisarFacturas} from '../../src/modules/facturas/calidad.js';
import {crearRecepcion} from '../../src/modules/facturas/recepcion.js';
import {leerDocumentoVerificado,promptExtraccion} from '../../facturas.js';

const albaran={tipo:'albaran',proveedor:'ELABORATS JOPRIMSA, S.L.',nif_proveedor:'B56652845',fecha:'2026-11-17',fecha_texto:'17/11/2026',numero_factura:'2026/47159',base_imponible:71.68,porcentaje_iva:10,cuota_iva:7.17,total:78.85,lineas:[{descripcion:'PATATA LIONESA POCHADA AGATA 2000 G/2UND',cantidad:4,unidad:'CA',precio_unitario:17.92,importe:71.68}]};
const avisoNumero=d=>controlesLectura(d).some(a=>a.campo==='numero_factura');
const calidad=d=>revisarFacturas([{...albaran,nif:albaran.nif_proveedor,local:'Blanes',...d}],'2026-11-17')[0].calidad;

test('ausencias y marcadores no cuentan como número en factura ni albarán',()=>{
 for(const numero_factura of [undefined,null,'','  ','—','s/n',' S / N ','sin número','Sin numerar','No leído','N/A','null']) {
  assert.equal(numeroDocumentoAusente(numero_factura),true);
  for(const tipo of ['factura','albaran'])assert.equal(avisoNumero({...albaran,tipo,numero_factura}),true);
 }
});
test('conserva referencias reales y no exige número a tickets u otros documentos',()=>{
 for(const numero_factura of ['2026/47159','  001-234/A  ','SN-123','0000',0])assert.equal(avisoNumero({...albaran,numero_factura}),false);
 for(const tipo of ['ticket','otro'])assert.equal(avisoNumero({...albaran,tipo,numero_factura:null}),false);
 assert.deepEqual(controlesLectura({...albaran,total:null,base_imponible:null,cuota_iva:null,lineas:[]}),[]);
});
test('tres lecturas omitiendo número no permiten registrar automáticamente el albarán',async()=>{
 let llamadas=0;
 await assert.rejects(leerDocumentoVerificado(Buffer.from('original de prueba'),'image/jpeg',{leer:async()=>{llamadas++;return {...structuredClone(albaran),numero_factura:null};}}),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.campo==='numero_factura'));
 assert.equal(llamadas,3);
 const bien=await leerDocumentoVerificado(Buffer.from('original de prueba'),'image/jpeg',{leer:async()=>structuredClone(albaran)});
 assert.equal(bien.numero_factura,'2026/47159');
});
test('histórico avisa salvo revisión completa vigente y marcadores no generan duplicados',()=>{
 const aviso='Número de documento pendiente de comprobar';
 assert.ok(calidad({numero_factura:null}).includes(aviso));
 assert.ok(calidad({numero_factura:'s/n',auditoria_completa:{vigente:false}}).includes(aviso));
 assert.ok(!calidad({numero_factura:null,auditoria_completa:{vigente:true}}).includes(aviso));
 assert.ok(calidad({numero_factura:null,auditoria_completa:{vigente:'true'}}).includes(aviso));
 const rows=revisarFacturas([1,2].map(id=>({...albaran,id,local:'Blanes',numero_factura:'s/n'})),'2026-11-17');
 assert.ok(rows.every(f=>!f.calidad.includes('Mismo proveedor y número en esta lista')));
});
test('ausencia legítima permite excepción humana explícita y conserva su evidencia',async()=>{
 const datos={...albaran,numero_factura:null};
 const f={id:1,hash:'hash',estado:'revision',original:Buffer.from('original'),resultado:{datos},local:'Blanes',mime:'image/jpeg'};
 let guardado;
 const cola=crearRecepcion({db:{get:async()=>f,run:async(_sql,args)=>{guardado=JSON.parse(args[0]);return {id:f.id};}},lock:async(_k,fn)=>fn(),procesar:async()=>{}});
 await assert.rejects(cola.aprobar(1,{}, {autor:'Contabilidad',confirmado:true}),/confirma expresamente la excepción/);
 assert.equal(guardado,undefined);
 await cola.aprobar(1,{}, {autor:'Contabilidad',confirmado:true,aceptarAvisos:true,motivo:'Original completo comprobado: no lleva número.'});
 assert.equal(guardado.datos.numero_factura,null);
 assert.ok(guardado.avisosTrasRevision.some(a=>a.campo==='numero_factura'));
 assert.match(guardado.aprobacion.motivo,/no lleva número/);
 assert.equal(avisoNumero(datosRevision(datos,{numero_factura:'2026/47159'})),false);
});
test('instrucciones distinguen número de albarán y formato de envase',()=>{
 const prompt=promptExtraccion('2026-11-17');
 assert.match(prompt,/Nº albarán 2026\/47159/);
 assert.match(prompt,/G\/2UND/);
 assert.match(prompt,/Ese 2 describe el envase, no sustituye la cantidad facturada/);
});
