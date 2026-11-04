import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/panel/app.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('function seleccionarTodosEstablecimientos()'), source.indexOf('function todosEstablecimientosSeleccionados()'));
function select(assigned, eligible) {
  const ctx = vm.createContext({ misLocales: () => assigned, localesElegibles: () => eligible, VARIOS: '*varios*', SELECCION: ['antiguo'], DASH_LOCAL: 'antiguo' });
  const applied = vm.runInContext(helper + '\nseleccionarTodosEstablecimientos()', ctx);
  return { applied, selected: ctx.SELECCION, local: ctx.DASH_LOCAL };
}
test('todos con alcance limitado envía locales explícitos, nunca ámbito global', () => {
  const r = select(['Blanes', 'Girona'], ['Blanes', 'Girona']);
  assert.equal(r.applied, true);
  assert.deepEqual(r.selected, ['Blanes', 'Girona']);
  assert.equal(r.local, '*varios*');
});
test('un local sigue limitado a ese local', () => {
  assert.equal(select(['Oficina'], ['Oficina']).local, 'Oficina');
});
test('sin locales elegibles no aplica un ámbito vacío global', () => {
  const r = select(['Oficina'], []);
  assert.equal(r.applied, false);
  assert.equal(r.local, 'antiguo');
});
test('dirección conserva selección global', () => {
  const r = select([], ['Blanes', 'Girona']);
  assert.equal(r.local, '');
  assert.equal(r.selected.length, 0);
});
