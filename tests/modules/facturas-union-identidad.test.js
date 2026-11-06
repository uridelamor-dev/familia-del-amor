import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarIdentidadUnion} from '../../src/modules/facturas/union-identidad.js';
test('no une GRAU con Transgourmet aunque se elija un CIF para conservar',()=>{
 assert.throws(()=>validarIdentidadUnion([{proveedor:'GRAU',nif:'A17127630'},{proveedor:'Transgourmet',nif:'ESA17371758'}]),/CIF diferentes/);
});
test('admite variantes de una misma identidad fiscal con prefijo ES',()=>{
 assert.doesNotThrow(()=>validarIdentidadUnion([{proveedor:'GRAU',nif:'ESA17127630'},{proveedor:'Vins i Licors Grau SA',nif:'A17127630'}]));
});
test('impide agrupar proveedores usando el CIF o nombre del destinatario',()=>{
 const empresas=[{empresa:'Del Amor Uriel SLU',cif:'B70799135'}];
 for(const d of [{proveedor:'GRAU',nif:'ESB70799135'},{proveedor:'Del Amor Uriel',nif:null}])
  assert.throws(()=>validarIdentidadUnion([d],empresas),/destinataria/);
});
