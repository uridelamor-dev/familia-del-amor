import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepararFirmantes,huellaPdf} from '../../src/modules/rrhh/firmas/borradores.js';
const w={id:1,nombre:'Persona prueba',email:'persona@example.invalid'},d={id:2,nombre:'Dirección prueba',email:'empresa@example.invalid',rol:'direccion'};
test('prepara trabajador y empresa sin aceptar roles ajenos ni firmante repetido',()=>{
 assert.deepEqual(prepararFirmantes(w,d).firmantes.map(f=>f.papel),['trabajador','empresa']);
 assert.equal(prepararFirmantes(w,{...d,rol:'encargado'}).ok,false);
 assert.equal(prepararFirmantes(w,{...d,id:1}).ok,false);
 assert.equal(prepararFirmantes({...w,email:''},d).ok,false);
 assert.equal(prepararFirmantes(w).firmantes.length,1);
});
test('la huella cambia al cambiar el original y no admite otro tipo de archivo',()=>{
 const a=Buffer.from('%PDF-1.7 original'),b=Buffer.from('%PDF-1.7 cambiado');
 assert.equal(huellaPdf(a).length,64);assert.notEqual(huellaPdf(a),huellaPdf(b));
 assert.throws(()=>huellaPdf(Buffer.from('<html>no pdf</html>')));
});
