import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const s=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const code=s.slice(s.indexOf('function facNifProveedorElegido('),s.indexOf('function facSelectorProveedor('));
const resolve=vm.runInNewContext(code+';facNifProveedorElegido');
test('el NIF confirmado en memoria prevalece sobre lecturas históricas distintas',()=>{
 assert.equal(resolve({alias:{nif:'B12345678'},nifs:[{nif:'ERRONEO'}]}),'B12345678');
});
test('sin memoria solo se usa un NIF histórico inequívoco',()=>{
 assert.equal(resolve({nifs:[{nif:'B12345678'}]}),'B12345678');
 assert.equal(resolve({nifs:[{nif:'A'},{nif:'B'}]}),'');
 assert.equal(resolve({}), '');
});
