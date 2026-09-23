import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarRitmo,enHorario,intervaloMs,RITMO_INICIAL} from '../../src/modules/captacion/ritmo.js';
test('cola: valida horario y reparto sin ráfagas',()=>{
 assert.deepEqual(validarRitmo(RITMO_INICIAL), RITMO_INICIAL);
 assert.equal(intervaloMs(RITMO_INICIAL),300000);
 assert.equal(intervaloMs({...RITMO_INICIAL,cantidad:2}),150000);
 for(const patch of [{desde:'21:00'},{hasta:'08:00'},{desde:'29:00'},{minutos:0},{minutos:4},{minutos:121},{cantidad:3},{cantidad:0}]) assert.throws(()=>validarRitmo({...RITMO_INICIAL,...patch}));
});
test('cola: respeta noche, límite exacto y cambio de hora de Madrid',()=>{
 for(const [fecha,permitido] of [['2026-09-24T06:59:59Z',false],['2026-09-24T07:00:00Z',true],['2026-09-24T19:00:00Z',false],['2026-09-24T22:00:00Z',false],['2026-12-24T07:59:00Z',false],['2026-12-24T08:00:00Z',true]]) assert.equal(enHorario(RITMO_INICIAL,Date.parse(fecha)),permitido,fecha);
});
