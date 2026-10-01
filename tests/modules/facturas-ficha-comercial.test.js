import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarFichaComercial} from '../../src/modules/facturas/ficha-comercial.js';
test('contactos y condiciones independientes por local sin campos arbitrarios',()=>{
 const d=validarFichaComercial({contacto_comercial:' Ana ',admin:true,condiciones:[{local:'Blanes',hora_limite:'12:00'},{local:'Girona',hora_limite:'10:00'}]});
 assert.equal(d.contacto_comercial,'Ana');assert.equal(d.admin,undefined);assert.equal(d.condiciones.length,2);
});
test('rechaza duplicados, horas y correos inválidos',()=>{
 for(const b of [{condiciones:[{local:'A'},{local:'A'}]},{condiciones:[{local:'A',hora_limite:'29:80'}]},{email_comercial:'no-es-correo',condiciones:[]}])assert.throws(()=>validarFichaComercial(b));
});
