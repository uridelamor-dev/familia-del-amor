import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararLineaManual,agregarLineaManual} from '../src/modules/facturas/alta-linea.js';

const body={descripcion:'Subcarpeta A4',cantidad:'14',unidad:'U',precio_unitario:'0,3719',importe:'5,21',lineas_actuales:[7]};
test('añadir detalle conserva el precio neto preciso y el importe del original',()=>{
 const l=prepararLineaManual(body);assert.equal(l.precio_unitario,.3719);assert.equal(l.importe,5.21);
 assert.equal(prepararLineaManual({...body,importe:''}).importe,5.21);
});
test('admite devoluciones y productos gratuitos sin convertir vacíos en cero',()=>{
 assert.equal(prepararLineaManual({...body,cantidad:-14,importe:-5.21}).importe,-5.21);
 assert.equal(prepararLineaManual({...body,precio_unitario:0,importe:0}).importe,0);
 for(const cambio of [{cantidad:0},{cantidad:''},{precio_unitario:''},{precio_unitario:true},{unidad:''},{descripcion:''},{importe:50},{lineas_actuales:null},{lineas_actuales:['7']}])assert.throws(()=>prepararLineaManual({...body,...cambio}),e=>e.status===400);
});
function entorno(acceso=true){
 let filas=[{id:7,orden:1,importe:3.93,dudosa:false}],auditoria=[],estado;
 const transaccion=async fn=>{
  const copia=structuredClone(filas),a=structuredClone(auditoria);
  try{return await fn({
   get:async(sql,p)=>{
    if(sql.startsWith('SELECT'))return{id:1,local:'Girona',tipo:'factura',base_imponible:9.14};
    const id=filas.length+7;filas.push({id,orden:p[1],importe:p[6],dudosa:false});return{id};
   },
   all:async()=>structuredClone(filas),
   run:async(sql,p)=>{if(sql.startsWith('UPDATE'))estado=p;else auditoria.push(p);}
  });}catch(e){filas=copia;auditoria=a;throw e;}
 };
 return {ejecutar:(datos=body)=>agregarLineaManual({id:1,body:datos,transaccion,puedeAcceder:()=>acceso,autor:'contable',ahora:'2026-11-07'}),leer:()=>({filas,auditoria,estado})};
}
test('añade sin reemplazar líneas existentes, cuadra y registra autor',async()=>{
 const db=entorno();const r=await db.ejecutar();assert.equal(r.cuadra,true);
 assert.equal(db.leer().filas.length,2);assert.equal(db.leer().filas[0].importe,3.93);
 assert.equal(db.leer().auditoria[0][4],'contable');assert.equal(db.leer().estado[0],'ok');
});
test('repetir una respuesta perdida no duplica; sí permite repetir un producto tras recargar',async()=>{
 const db=entorno();await db.ejecutar();await assert.rejects(db.ejecutar(),e=>e.status===409);
 assert.equal(db.leer().filas.length,2);
 await db.ejecutar({...body,lineas_actuales:[7,8]});assert.equal(db.leer().filas.length,3);
});
test('sin acceso no escribe líneas ni auditoría',async()=>{
 const db=entorno(false);await assert.rejects(db.ejecutar(),e=>e.status===403);
 assert.equal(db.leer().filas.length,1);assert.equal(db.leer().auditoria.length,0);
});
