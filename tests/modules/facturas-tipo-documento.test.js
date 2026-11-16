import test from 'node:test';
import assert from 'node:assert/strict';
import {avisosTipoDocumento} from '../../src/modules/facturas/tipo-documento.js';
import {controlesLectura} from '../../src/modules/facturas/validacion-lectura.js';
import {leerDocumentoVerificado,promptExtraccion} from '../../facturas.js';
const f={tipo:'factura',titulo_documento:'Factura',proveedor:'DDI PROVEA SL',nif_proveedor:'B67210948',fecha:'2026-10-08',fecha_texto:'08.10.2026',numero_factura:'7822113451',base_imponible:41.67,cuota_iva:8.75,porcentaje_iva:21,total:50.42,lineas:[]};
const leer=async respuestas=>{let i=0;return leerDocumentoVerificado(Buffer.from('fixture'),'image/jpeg',{leer:async()=>structuredClone(respuestas[Math.min(i++,respuestas.length-1)])});};
test('DDI: título Factura contradice albarán sin modificar tipo ni importes',()=>{
 const d={...f,tipo:'albaran'},antes=structuredClone(d);
 assert.equal(avisosTipoDocumento(d)[0].campo,'tipo');assert.deepEqual(d,antes);
 assert.ok(controlesLectura(d).some(a=>a.campo==='tipo'));
});
test('DDI correcto mantiene número de factura, aunque concepto cite albarán',async()=>{
 const d=await leer([{...f,concepto:'Albarán829464418'}]);assert.equal(d.tipo,'factura');assert.equal(d.numero_factura,'7822113451');
 const prompt=promptExtraccion('2026-11-16');assert.match(prompt,/829464418 es sólo la entrega referenciada/);
});
test('albarán real que menciona factura mensual no se convierte por palabras del concepto',async()=>{
 const d=await leer([{...f,tipo:'albaran',titulo_documento:'Albarán',concepto:'Se incluirá en factura mensual'}]);assert.equal(d.tipo,'albaran');
});
test('proforma y presupuesto quedan en revisión incluso clasificados como otro',async()=>{
 for(const titulo of ['Factura proforma','Proforma','Presupuesto']){
  assert.equal(avisosTipoDocumento({...f,titulo_documento:titulo})[0].campo,'tipo');
  assert.equal(avisosTipoDocumento({...f,tipo:'otro',titulo_documento:titulo})[0].campo,'tipo');
  await assert.rejects(leer([{...f,tipo:'otro',titulo_documento:titulo}]),e=>e.revisionDocumento && e.resultado.datos.tipo==='otro' && e.resultado.datos.total===50.42 && e.resultado.avisos.some(a=>a.campo==='tipo'));
 }
 for(const tipo of ['ticket','factura'])assert.deepEqual(avisosTipoDocumento({...f,tipo,titulo_documento:'Factura simplificada'}),[]);
});
test('dos lecturas coincidentes pero contradictorias no se registran por mayoría',async()=>{
 let llamadas=0;
 await assert.rejects(leerDocumentoVerificado(Buffer.from('fixture'),'image/jpeg',{leer:async()=>{llamadas++;return {...f,tipo:'albaran'};}}),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.campo==='tipo'));
 assert.equal(llamadas,3);
});
test('tercera lectura coherente corroborada puede resolver, sin alterar números',async()=>{
 const d=await leer([{...f,tipo:'albaran'},f,f]);assert.equal(d.tipo,'factura');assert.equal(d.total,50.42);assert.equal(d._contraste.resueltoPorRelectura,true);
});
test('títulos combinados o lectura explícitamente incierta quedan para revisión',async()=>{
 for(const d of [{...f,titulo_documento:'Factura / Albarán'},{...f,titulo_documento:null,campos_dudosos:['tipo']}])
  await assert.rejects(leer([d]),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.campo==='tipo'));
 assert.deepEqual(avisosTipoDocumento({...f,titulo_documento:null}),[]); // Ausencia no inventa evidencia ni transforma históricos.
});
test('abonos y rectificativas conservan sus controles de signo independientes',async()=>{
 await assert.rejects(leer([{...f,titulo_documento:'Abono'}]),e=>e.revisionDocumento&&e.resultado.avisos.some(a=>a.campo==='total'));
 await assert.rejects(leer([{...f,titulo_documento:'Factura rectificativa'}]),e=>e.revisionDocumento);
 const d=await leer([{...f,titulo_documento:'Abono',base_imponible:-41.67,cuota_iva:-8.75,total:-50.42}]);assert.equal(d.total,-50.42);
});

test('relectura no oculta evidencia previa de proforma quitando su título',async()=>{
 await assert.rejects(leer([{...f,tipo:'otro',titulo_documento:'Presupuesto'},{...f,tipo:'otro',titulo_documento:null},{...f,tipo:'otro',titulo_documento:null}]),e=>e.revisionDocumento && e.resultado.avisos.some(a=>a.texto.includes('presupuesto')));
});
