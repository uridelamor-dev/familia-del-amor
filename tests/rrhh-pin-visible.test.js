import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {kidDe} from '../src/modules/seguridad/clave-datos.js';
import {guardarPinVisible,leerPinVisible} from '../src/modules/rrhh/pin-visible.js';
const clave=randomBytes(32),llavero={actual:{clave,kid:kidDe(clave)}};
test('PIN cifrado visible únicamente para Dirección y RRHH',()=>{
 const valor=guardarPinVisible('4917',llavero);assert.ok(valor.startsWith('enc:v2:'));assert.notEqual(valor,'4917');
 for(const rol of ['direccion','rrhh'])assert.equal(leerPinVisible(valor,llavero,rol),'4917');
 for(const rol of ['trabajador','encargado','marketing',undefined])assert.equal(leerPinVisible(valor,llavero,rol),null);
});
test('PIN antiguo, claro o sin clave nunca se muestra ni se guarda en claro',()=>{
 assert.equal(guardarPinVisible('4917',{actual:null}),null);
 for(const valor of [null,'4917','$2b$hash'])assert.equal(leerPinVisible(valor,llavero,'direccion'),null);
 assert.equal(leerPinVisible(guardarPinVisible('4917',llavero),{actual:null},'direccion'),null);
});
