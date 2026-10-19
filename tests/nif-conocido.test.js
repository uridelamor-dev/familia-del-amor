import test from 'node:test';
import assert from 'node:assert/strict';
import {nifConocido,completarNifConocido} from '../src/modules/facturas/nif-conocido.js';
const datos={proveedor:'Proveedor Uno SL',nif_proveedor:null};
const historial=[{nif:'B12345674',numero_factura:'1'},{nif:'B12345674',numero_factura:'2'}];
test('completa un CIF ausente con dos facturas distintas coherentes',()=>{
 assert.equal(nifConocido(datos,[],historial),'B12345674');
});
test('no sustituye el CIF leído ni elige entre CIF contradictorios',()=>{
 assert.equal(nifConocido({...datos,nif_proveedor:'ilegible'},[],historial),null);
 assert.equal(nifConocido(datos,[],[...historial,{nif:'B87654321',numero_factura:'3'}]),null);
});
test('una sola lectura repetida no prueba la identidad fiscal',()=>{
 assert.equal(nifConocido(datos,[],[historial[0],historial[0]]),null);
});
test('admite un alias confirmado pero no un proveedor parecido',()=>{
 assert.equal(nifConocido(datos,[{proveedor:'Proveedor Uno SL',nif:'B12345674'}]),'B12345674');
 assert.equal(nifConocido(datos,[{proveedor:'Proveedor Dos SL',nif:'B12345674'}]),null);
});
test('un fallo al consultar no inventa el dato ni bloquea la factura',async()=>{
 const d={...datos};
 await completarNifConocido(d,async()=>{throw Error('BD');});
 assert.equal(d.nif_proveedor,null);
});
