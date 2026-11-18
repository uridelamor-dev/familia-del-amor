import {test} from 'node:test';
import assert from 'node:assert/strict';
import {actualizarAvisosTrasCorreccion as actualizar} from '../../src/modules/facturas/avisos-vigentes.js';
import {cuadraTotal,cuadraIva} from '../../src/modules/facturas/coherencia.js';
import {comoDocumento} from '../../src/modules/facturas/repaso.js';
const f={proveedor:'Consum',nif:'F46075986',base_imponible:100,cuota_iva:21,porcentaje_iva:21,total:150};
const conAvisos=(d,avisos)=>({...d,revisar:JSON.stringify(avisos)});
test('al corregir el total desaparece solo el descuadre demostrado, no las dudas OCR',()=>{
 const antes=conAvisos(f,[cuadraTotal(f).texto,'Fecha ambigua','Posible duplicado']);
 const actual={...antes,total:121};
 assert.deepEqual(JSON.parse(actualizar(antes,actual)),['Fecha ambigua','Posible duplicado']);
 assert.equal(antes.total,150);
});
test('un descuadre que persiste se actualiza en lugar de ocultarse',()=>{
 const antes=conAvisos(f,[cuadraTotal(f).texto]);
 const actual={...antes,total:130};
 assert.deepEqual(JSON.parse(actualizar(antes,actual)),[cuadraTotal(actual).texto]);
});
test('sin datos completos, o con aviso desconocido, no se declara resuelto',()=>{
 const antes=conAvisos(f,[cuadraTotal(f).texto]);
 for(const total of [null,'',undefined,'error'])assert.equal(actualizar(antes,{...antes,total}),antes.revisar);
 for(const revisar of ['texto antiguo','[malformado',JSON.stringify([{texto:'Duda'}])])assert.equal(actualizar({...antes,revisar},{...antes,total:121}),revisar);
});
test('los ajustes fiscales forman parte de la comprobación',()=>{
 const antes=conAvisos(f,[cuadraTotal(f).texto]);
 assert.equal(actualizar(antes,{...antes,otros_cargos:29}),null);
});
test('corregir un NIF resuelve exclusivamente la advertencia antigua correspondiente',()=>{
 const texto='Este proveedor siempre ha venido con el NIF F46078986 y esta vez pone F46075986. Un proveedor no cambia de NIF: lo que suele cambiar es la lectura.';
 const antes=conAvisos(f,[texto,'Comprobar receptor']);
 assert.deepEqual(JSON.parse(actualizar(antes,{...antes,nif:'F46078986'})),['Comprobar receptor']);
 for(const cambio of [{nif:'B12345678'},{nif:'F46078986',proveedor:'Otra entidad'}])assert.equal(actualizar(antes,{...antes,...cambio}),antes.revisar);
});
test('el IVA recalculado no se acepta por eliminar el porcentaje',()=>{
 const datos={...f,cuota_iva:10};const antes=conAvisos(datos,[cuadraIva(datos).texto]);
 assert.equal(actualizar(antes,{...antes,porcentaje_iva:10}),null);
 assert.equal(actualizar(antes,{...antes,porcentaje_iva:0}),antes.revisar);
});
test('el repaso conserva los tipos de IVA mixtos y evita compararlos con un único porcentaje',()=>{
 const partes=[{base:10,tipo:10,cuota:1},{base:10,tipo:21,cuota:2.1}];
 for(const iva_desglose of [partes,JSON.stringify(partes)]) {
  const doc=comoDocumento({...f,base_imponible:20,cuota_iva:3.1,iva_desglose});
  assert.deepEqual(doc.iva_desglose,partes);assert.equal(cuadraIva(doc),null);
 }
});

import {normalizarLinea} from '../../src/modules/facturas/lineas.js';
test('una línea explícitamente no servida con cantidad e importe cero no genera duda artificial',()=>{
 const l={descripcion:'Producto no servido',cantidad:0,precio_unitario:8,importe:0};
 assert.equal(normalizarLinea(l).dudosa,false);
 for(const cambio of [{descripcion:'Producto'},{importe:null},{importe:8},{cantidad:null},{lectura_dudosa:true}])assert.equal(normalizarLinea({...l,...cambio}).dudosa,true);
});
test('un ajuste no numérico no permite retirar avisos',()=>{
 const antes=conAvisos(f,[cuadraTotal(f).texto]);
 assert.equal(actualizar(antes,{...antes,total:121,otros_cargos:'ilegible'}),antes.revisar);
});
