import {test} from 'node:test';
import assert from 'node:assert/strict';
import {huellaAuditoria,validarConfirmacion,COMPROBACIONES,cargarDistintivos,registrarAuditoriaCompleta} from '../src/modules/facturas/auditoria-completa.js';

const f={id:18,proveedor:'Proveedor',nif:'B123',fecha:'2026-09-30',total:'110.00',base_imponible:'100.00',cuota_iva:'10.00',vencimiento:'2026-11-15',drive_url:'https://drive.google.com/file/d/ejemplo',iva_desglose:'[{"base":100,"tipo":10,"cuota":10}]'};
const lineas=[{id:1,cantidad:'2',precio_unitario:'50.00',importe:'100.00',descripcion:'Producto',unidad:'kg'}];
const huella=huellaAuditoria(f,lineas);
const body={huella,comprobaciones:Object.fromEntries(COMPROBACIONES.map(k=>[k,true])),archivo_nombre:'Factura.pdf',archivo_ruta:'Contabilidad / Empresa / 2026 / Septiembre / Local'};
test('el distintivo cambia por cabecera, vencimiento, original y líneas, no por pago o miniatura',()=>{
 for(const k of ['proveedor','nif','fecha','vencimiento','drive_url','empresa','local','numero_factura'])assert.notEqual(huellaAuditoria({...f,[k]:'cambio'},lineas),huella,k);
 for(const k of ['cantidad','precio_unitario','importe','descripcion','unidad'])assert.notEqual(huellaAuditoria(f,[{...lineas[0],[k]:k==='descripcion'||k==='unidad'?'cambio':7}]),huella,k);
 assert.notEqual(huellaAuditoria(f,[]),huella);
 assert.equal(huellaAuditoria({...f,pagado:1,drive_thumb:'otra',estado_pago:'pagada'},lineas),huella);
});
test('lectura pg numérica y JSON producen la misma huella',()=>{
 assert.equal(huellaAuditoria({...f,total:110,base_imponible:100,cuota_iva:10,iva_desglose:[{cuota:10,tipo:10,base:100}]},[{...lineas[0],cantidad:2,precio_unitario:50,importe:100}]),huella);
});
test('confirmar exige todos los puntos, evidencia de Drive y versión vigente',()=>{
 assert.doesNotThrow(()=>validarConfirmacion(body,huella));
 for(const k of COMPROBACIONES)assert.throws(()=>validarConfirmacion({...body,comprobaciones:{...body.comprobaciones,[k]:false}},huella),e=>e.status===400);
 assert.throws(()=>validarConfirmacion({...body,archivo_ruta:' '},huella),e=>e.status===400);
 assert.throws(()=>validarConfirmacion(body,'cambiada'),e=>e.status===409);
});
test('lectura automática no concede distintivo y una auditoría modificada queda desactualizada',async()=>{
 const rows=[{id:18},{id:19},{id:20,revision_humana:{autor:'Alguien'}}];let consultas=0;
 await cargarDistintivos(rows,async()=>{consultas++;return [{factura_id:18,huella,factura:f,lineas,autor:'Revisor',fecha:'2026-11-06'},{factura_id:19,huella,factura:{...f,total:120},lineas,autor:'Revisor',fecha:'2026-11-06'}];});
 assert.equal(consultas,1);assert.equal(rows[0].auditoria_completa.vigente,true);assert.equal(rows[1].auditoria_completa.vigente,false);assert.equal(rows[2].auditoria_completa,undefined);
});
test('no se registra una auditoría fuera del ámbito autorizado',async()=>{
 let post,insertado=false,liberado=false;
 const client={query:async sql=>{if(sql.startsWith('INSERT'))insertado=true;return {rows:sql.startsWith('SELECT * FROM facturas WHERE')?[f]:[]};},release:()=>{liberado=true;}};
 registrarAuditoriaCompleta({get(){},post(path,auth,handler){post=handler;}},{auth(){},pool:{connect:async()=>client},puedeAccederLocal:()=>false});
 let status;const res={status(n){status=n;return this;},json(){}};
 await post({params:{id:18},body,user:{username:'Revisor'}},res);
 assert.equal(status,403);assert.equal(insertado,false);assert.equal(liberado,true);
});
