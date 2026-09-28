import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendienteDeActivacion, vigente } from '../src/modules/fidelizacion/promos.js';
const p = {estado:'publicada', local:'Girona', desde:'2026-10-01', hasta:'2026-10-01', hora_desde:'00:00', hora_hasta:'14:00'};
test('programar antes de la fecha no permite un canje anticipado', () => {
 const ahora='2026-09-28T12:00:00Z';
 assert.equal(pendienteDeActivacion(p,ahora),true);
 assert.equal(vigente(p,{ahora,local:'Girona'}).motivo,'aun_no_empieza');
});
test('ventana exacta de Madrid y local siguen siendo obligatorios', () => {
 assert.equal(vigente(p,{ahora:'2026-10-01T11:59:00Z',local:'Girona'}).ok,true);
 assert.equal(vigente(p,{ahora:'2026-10-01T12:00:00Z',local:'Girona'}).ok,false);
 assert.equal(vigente(p,{ahora:'2026-10-01T10:00:00Z',local:'Lloret'}).ok,false);
 assert.equal(pendienteDeActivacion(p,'2026-10-01T22:00:00Z'),false);
});
test('no preparar borradores, pausadas, caducadas o fechas inválidas', () => {
 for (const patch of [{estado:'borrador'},{estado:'pausada'},{hasta:'2026-09-01'},{desde:'2026-02-30'},{hasta:'mal'},{desde:'2026-10-02'}]) {
  assert.equal(pendienteDeActivacion({...p,...patch},'2026-09-28T12:00:00Z'),false);
 }
 assert.equal(pendienteDeActivacion(p,'invalido'),false);
});
