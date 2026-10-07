import {test} from 'node:test';
import assert from 'node:assert/strict';
import {idiomaSugerido,pistaIdioma} from '../src/modules/messaging/sara.js';
test('Los datos de reserva en catalán mantienen también los avisos automáticos en catalán',()=>{
 assert.equal(pistaIdioma('Al final serem 5'),'ca');
 assert.equal(pistaIdioma('Serem 5'),'ca');
 assert.equal(idiomaSugerido({mensajesCliente:['La tapeta girona','Al final serem 5']}).idioma,'ca');
 assert.equal(idiomaSugerido({mensajesCliente:['Al final serem 5','La tapeta girona']}).idioma,'ca');
 assert.equal(idiomaSugerido({mensajesCliente:['Serem 5','Quiero cambiar la hora']}).idioma,'es');
});
