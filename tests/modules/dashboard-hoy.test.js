import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenHoy } from '../../src/modules/dashboard/hoy.js';
const hoy = '2026-09-23', anterior = '2026-09-16';
const fila = (dia, ventas, tickets) => ({ dia, ventas, tickets, comensales: 0 });
const vivo = { hoy, locales: [
  { local: 'A', dias: [fila(hoy, 100, 2), fila(anterior, 80, 2)] },
  { local: 'B', dias: [fila(hoy, 300, 3), fila(anterior, 120, 2)] },
  { local: 'Ajeno', dias: [fila(hoy, 9000, 1)] }
] };
test('suma únicamente el ámbito y recalcula el ticket ponderado y el día exacto anterior', () => {
  const r = resumenHoy(vivo, { hoy, locales: ['A','B','A'] });
  assert.equal(r.actual.ventas, 400); assert.equal(r.actual.ticketMedio, 80);
  assert.equal(r.variacion, 100); assert.equal(r.anterior, anterior);
  assert.equal(r.actual.comensales, null);
});
test('un local sin datos o fallido no presenta una cifra parcial como total', () => {
  assert.equal(resumenHoy(vivo, { hoy, locales: ['A','Desconocido'] }).actual, null);
  assert.equal(resumenHoy({hoy,locales:[{...vivo.locales[0],error:'offline'}]}, {hoy,locales:['A']}).actual,null);
});
test('cero comprobado se conserva, denominador cero y día sin datos no inventan porcentaje', () => {
  const r = resumenHoy({hoy,locales:[{local:'A',dias:[fila(hoy,0,0),fila(anterior,0,0)]}]},{hoy,locales:['A']});
  assert.equal(r.actual.ventas,0); assert.equal(r.actual.ticketMedio,null); assert.equal(r.variacion,null);
  assert.equal(resumenHoy(vivo,{hoy,locales:['Ajeno']}).variacion,null);
});
test('caché de ayer nunca se muestra como hoy y admite comparación negativa', () => {
  assert.equal(resumenHoy({...vivo,hoy:anterior},{hoy,locales:['A']}).actual,null);
  const r = resumenHoy({hoy,locales:[{local:'A',dias:[fila(hoy,50,1),fila(anterior,100,2)]}]},{hoy,locales:['A']});
  assert.equal(r.variacion,-50);
});
