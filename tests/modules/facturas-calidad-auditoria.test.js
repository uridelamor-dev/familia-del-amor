import {test} from 'node:test';
import assert from 'node:assert/strict';
import {revisarFacturas} from '../../src/modules/facturas/calidad.js';
import {cargarDistintivos,huellaAuditoria} from '../../src/modules/facturas/auditoria-completa.js';

const factura={id:534,tipo:'factura',fecha:'2026-11-13',numero_factura:'022026-10/2606074',proveedor:'JORIC',nif:'B55291504',local:'Can Mateu',base_imponible:150.70,cuota_iva:15.07,recargo_equivalencia:2.11,total:167.88};
const calidad=cambio=>revisarFacturas([{...factura,...cambio}],'2026-11-17')[0].calidad;
const vigente={auditoria_completa:{vigente:true}};
const lectura='Lectura pendiente de revisión';

test('la revisión completa vigente resuelve dudas OCR sin borrar las señales originales',()=>{
 for(const cambio of [{lineas_estado:'dudas'},{revisar:['Unidad no impresa']},{revisar:'["Unidad no impresa"]'}]) {
  const f={...factura,...vigente,...cambio};const antes=structuredClone(f);
  assert.deepEqual(revisarFacturas([f],'2026-11-17')[0].calidad,[]);
  assert.deepEqual(f,antes);
 }
});
test('sin auditoría vigente las dudas siguen pendientes, incluso con una revisión humana anterior',()=>{
 for(const auditoria_completa of [undefined,{vigente:false},{vigente:'true'}]) {
  assert.ok(calidad({auditoria_completa,revision_humana:{autor:'Revisor'},lineas_estado:'dudas'}).includes(lectura));
  assert.ok(calidad({auditoria_completa,revisar:'["Unidad no impresa"]'}).includes(lectura));
 }
});
test('revisar admite listas JSON o arrays y no confunde listas vacías con avisos',()=>{
 for(const revisar of [undefined,null,'','  ','[]',' [ ] ',[], 'null'])assert.deepEqual(calidad({revisar}),[]);
 for(const revisar of [['Aviso'],'["Aviso"]','Aviso antiguo','[malformado'])assert.ok(calidad({revisar}).includes(lectura));
});
test('la revisión vigente no oculta errores técnicos ni estados de recálculo de líneas e IVA',()=>{
 for(const lineas_estado of ['descuadre','error'])assert.ok(calidad({...vigente,lineas_estado}).includes(lectura));
 for(const iva_estado of ['revisar','error'])assert.ok(calidad({...vigente,iva_estado}).includes('Desglose de IVA pendiente de revisión'));
});
test('la revisión vigente conserva problemas objetivos y posibles duplicados',()=>{
 for(const cambio of [{fecha:null},{fecha:'2027-01-01'},{local:''},{total:null},{total:0},{base_imponible:null},{total:180},{recargo_equivalencia:'incorrecto'}])assert.ok(calidad({...vigente,...cambio}).length,JSON.stringify(cambio));
 const rows=revisarFacturas([{...factura,...vigente},{...factura,...vigente,id:535}],'2026-11-17');
 assert.ok(rows.every(f=>f.calidad.includes('Mismo proveedor y número en esta lista')));
});
test('el listado recupera las dudas cuando una edición invalida la huella auditada',async()=>{
 const lineas=[{id:1,descripcion:'Producto',cantidad:1,importe:150.70}];
 const huella=huellaAuditoria(factura,lineas);
 for(const editada of [false,true]) {
  const actual={...factura,lineas_estado:'dudas',concepto:editada?'Datos cambiados':undefined};
  const rows=[actual];
  await cargarDistintivos(rows,async()=>[{factura_id:534,huella,factura:actual,lineas,autor:'Revisor',fecha:'2026-11-17'}]);
  assert.equal(rows[0].auditoria_completa.vigente,!editada);
  assert.equal(revisarFacturas(rows,'2026-11-17')[0].calidad.includes(lectura),editada);
 }
});
