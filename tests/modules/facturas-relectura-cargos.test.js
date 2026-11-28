import test from 'node:test';
import assert from 'node:assert/strict';
import {releerLineasFactura,guardarLineas} from '../../facturas.js';
const cargos=[{descripcion:'S.L.',importe:3.90,porcentaje_iva:21}];
test('relectura con cargos manuales se detiene antes de Drive, OCR y borrar productos',async()=>{
 for(const valor of [cargos,JSON.stringify(cargos)]){
  const factura={id:213,drive_url:'https://drive.google.com/file/d/123456789012345678901234567890/view',base_imponible:546.61,cargos_base:valor};
  const antes=structuredClone(factura);let accesos=0,escrituras=0;
  await assert.rejects(releerLineasFactura({factura,getToken:async()=>{accesos++;},dbRun:async()=>{escrituras++;}}),e=>e.codigo==='CARGOS_BASE_REVISION_MANUAL');
  assert.equal(accesos,0);assert.equal(escrituras,0);assert.deepEqual(factura,antes);
 }
});
test('guardar OCR que reintroduce S.L. no duplica ni elimina el cargo confirmado',async()=>{
 const datos={tipo:'factura',base_imponible:546.61,cargos_base:cargos,lineas:[{descripcion:'Productos',cantidad:1,importe:542.71},{descripcion:'S.L.',cantidad:1,importe:3.90}]};
 const antes=structuredClone(datos);let escrituras=0;
 await assert.rejects(guardarLineas(async()=>{escrituras++;},213,datos,'2026-11-16'),e=>e.codigo==='CARGOS_BASE_REVISION_MANUAL');
 assert.equal(escrituras,0);assert.deepEqual(datos,antes);
});
test('lectura normal sin cargos conserva funcionamiento y cálculo',async()=>{
 for(const valor of [undefined,null,[], '[]']){
  const writes=[];await guardarLineas(async(sql,p)=>writes.push({sql,p}),1,{tipo:'factura',base_imponible:10,cargos_base:valor,lineas:[{descripcion:'Producto',cantidad:1,precio_unitario:10,importe:10}]},'2026-11-16');
  assert.equal(writes.length,2);assert.deepEqual(writes[1].p.slice(0,3),[false,'ok',null]);
 }
});
function escenario(cambio,falloInsert=false){
 let f={id:213,tipo:'factura',drive_url:'https://drive.google.com/file/d/123456789012345678901234567890/view',base_imponible:10,cargos_base:[],lineas_estado:'ok'};
 let ls=[{id:1,importe:10,descripcion:'Original'}],writes=0;
 const deps={factura:{...f},getToken:async()=>'',dbGet:async()=>structuredClone(f),dbAll:async()=>structuredClone(ls),descargar:async()=>({buffer:Buffer.from('x'),mimeType:'image/jpeg'}),leer:async()=>{cambio?.(f,ls);return {lineas:[{descripcion:'Releído',cantidad:1,precio_unitario:10,importe:10}]};},transaccion:async fn=>{
  const antes=structuredClone([f,ls]);
  try{return await fn({get:async()=>structuredClone(f),all:async()=>structuredClone(ls),run:async(sql,p)=>{
   writes++;if(sql.startsWith('DELETE'))ls=[];
   if(sql.startsWith('INSERT')){if(falloInsert)throw new Error('fallo escritura');ls.push({descripcion:p[2]});}
   if(sql.startsWith('UPDATE facturas SET lineas_iva'))f.lineas_estado=p[1];
  }});}catch(e){[f,ls]=antes;throw e;}
 }};
 return {deps,estado:()=>({f,ls,writes})};
}
test('cargo añadido durante OCR aborta antes DELETE y preserva revisión manual',async()=>{
 const e=escenario(f=>{f.cargos_base=cargos;f.lineas_estado='ok';});
 await assert.rejects(releerLineasFactura(e.deps),x=>x.codigo==='RELECTURA_MODIFICADA');
 assert.equal(e.estado().writes,0);assert.deepEqual(e.estado().f.cargos_base,cargos);assert.equal(e.estado().f.lineas_estado,'ok');assert.equal(e.estado().ls[0].descripcion,'Original');
});
test('producto editado durante OCR también invalida la propuesta',async()=>{
 const e=escenario((_f,ls)=>{ls[0].descripcion='Corregido por contabilidad';});
 await assert.rejects(releerLineasFactura(e.deps),x=>x.codigo==='RELECTURA_MODIFICADA');
 assert.equal(e.estado().writes,0);assert.equal(e.estado().ls[0].descripcion,'Corregido por contabilidad');
});
test('sin cambios la sustitución es transaccional; fallo INSERT conserva detalle anterior',async()=>{
 const ok=escenario();await releerLineasFactura(ok.deps);assert.equal(ok.estado().ls[0].descripcion,'Releído');
 const error=escenario(null,true);await assert.rejects(releerLineasFactura(error.deps),/fallo escritura/);assert.equal(error.estado().ls[0].descripcion,'Original');assert.equal(error.estado().f.lineas_estado,'ok');
});
