import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/panel/app.js', import.meta.url), 'utf8');
const start = code.indexOf('function facPillVinculo(');
const end = code.indexOf('function facTablaHtml(', start);
const ctx = vm.createContext({});
vm.runInContext(code.slice(start, end), ctx);

test('el vínculo parcial no se presenta como conciliación completa', () => {
  const factura = { tipo: 'factura', total: 1815, conciliado_con: '[252]' };
  for (const compacto of [false, true]) {
    const html = ctx.facPillVinculo(factura, compacto);
    assert.match(html, /Con albaranes vinculados/);
    assert.match(html, /diferencia por comprobar/);
    assert.doesNotMatch(html, /pill ok|>conciliada</);
  }
});

test('el albarán indica el vínculo a factura y los documentos sin vínculo no muestran marca', () => {
  assert.match(ctx.facPillVinculo({ tipo: 'albaran', conciliado_con: '428' }), /Vinculado a factura/);
  assert.equal(ctx.facPillVinculo({ tipo: 'factura', conciliado_con: null }), '');
});
