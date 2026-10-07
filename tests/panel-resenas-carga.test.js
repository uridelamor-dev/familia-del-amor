import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/panel/app.js', import.meta.url), 'utf8');
const loader = source.slice(source.indexOf('let reviewsFilterRequest ='), source.indexOf('function loadMoreReviews'));
function setup(request) {
  const view = { innerHTML: '' };
  const context = vm.createContext({
    CURRENT: 'reviews', document: { getElementById: () => view },
    skeleton: () => 'loading', errorCard: text => 'error: ' + text,
    REV_PAGINA: 0, REV_TAM: 50, REVF: {}, REV_DATA: [], REV_SEL: new Set(),
    REV_CONT: {}, REV_HASMORE: false, REV_SIN_FICHA: false, REV_STATUS: null,
    URLSearchParams, token: () => 'test',
    fetch: async () => ({ ok: true, json: async () => ({ connected: false }) }),
    revPedir: request, renderReviews: () => 'reviews ready',
  });
  vm.runInContext(loader, context);
  return { context, view };
}
test('Reseñas termina de cargar aunque Google no esté conectado', async () => {
  const { context, view } = setup(async () => ({ data: [{ id: 1 }] }));
  await context.loadReviews();
  assert.equal(view.innerHTML, 'reviews ready');
  assert.equal(context.REV_DATA.length, 1);
});
test('Reseñas muestra los errores de carga en vez de quedarse esperando', async () => {
  const { context, view } = setup(async () => { throw new Error('Sin conexión'); });
  await context.loadReviews();
  assert.equal(view.innerHTML, 'error: Sin conexión');
});
test('Una respuesta tardía no sustituye otra pantalla', async () => {
  let resolve;
  const { context, view } = setup(() => new Promise(r => { resolve = r; }));
  const pending = context.loadReviews();
  context.CURRENT = 'clientes';
  view.innerHTML = 'clientes';
  resolve({ data: [] });
  await pending;
  assert.equal(view.innerHTML, 'clientes');
});
