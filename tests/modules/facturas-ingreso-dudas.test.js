import {test} from 'node:test';
import assert from 'node:assert/strict';
import {controlesLectura} from '../../src/modules/facturas/validacion-lectura.js';
import {revisarFacturas} from '../../src/modules/facturas/calidad.js';
const doc={tipo:'factura',proveedor:'Ejemplo',nif_proveedor:'B12345674',fecha:'2026-11-13',numero_factura:'A1',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:121};
const avisos=d=>controlesLectura(d).filter(a=>a.campo==='lineas');
test('detalle explícitamente dudoso bloquea aunque cuadre cabecera',()=>{
 assert.equal(avisos({...doc,lineas:[{descripcion:'Servicio',importe:100,lectura_dudosa:true}]}).length,1);
});
test('IVA confundido con cantidad no obtiene validación verde',()=>{
 assert.ok(avisos({...doc,lineas:[{descripcion:'Artículo',cantidad:21,precio_unitario:100,importe:100}]}).length);
});
test('detalle incompleto que no suma avisa sin alterar importes',()=>{
 const d={...doc,lineas:[{descripcion:'Servicio',importe:80}]};const antes=structuredClone(d);
 assert.ok(avisos(d).length);assert.deepEqual(d,antes);
});
test('servicios sin cantidad ni precio y segunda lectura sin líneas no inventan errores',()=>{
 for(const d of [doc,{...doc,lineas:[]},{...doc,lineas:[{descripcion:'Servicio',importe:100}]}])assert.deepEqual(avisos(d),[]);
});
test('albarán sin precio válido y precio con IVA explícito conservan modalidad',()=>{
 assert.deepEqual(avisos({...doc,tipo:'albaran',base_imponible:null,cuota_iva:null,total:null,lineas:[{descripcion:'Pan',cantidad:2}]}),[]);
 assert.deepEqual(avisos({...doc,lineas_iva_incluido:true,lineas:[{descripcion:'Servicio',importe:121}]}),[]);
});
test('calidad conserva avisos de detalle y fiscal aunque resumen cuadre',()=>{
 const f={...doc,local:'Girona'};
 for(const cambio of [{lineas_estado:'dudas'},{lineas_estado:'error'},{iva_estado:'revisar'},{iva_estado:'error'}])assert.ok(revisarFacturas([{...f,...cambio}],'2026-11-17')[0].calidad.length);
 assert.deepEqual(revisarFacturas([{...f,lineas_estado:'ok',iva_estado:'manual',revisar:'[]'}],'2026-11-17')[0].calidad,[]);
});
test('un uno por ciento de tolerancia no oculta 50 euros de detalle faltante',()=>{
 assert.ok(avisos({...doc,base_imponible:10000,cuota_iva:2100,total:12100,lineas:[{descripcion:'Servicio',importe:9950}]}).length);
});
test('una línea sin importe en factura no desaparece del control por no tener cantidad',()=>{
 assert.ok(avisos({...doc,lineas:[{descripcion:'Servicio',importe:100},{descripcion:'Otro servicio'}]}).length);
});
