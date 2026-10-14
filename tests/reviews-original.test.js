import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { reviewTextParts, mapManageRow, draftRequest } from '../src/modules/reviews/reviews.service.js';

const raw = '(Translated by Google) Very good service!\n\n(Original) ¡Muy buen trato!';
test('separa traducción y original sin cambiar el registro guardado', () => {
  const row = { text: raw, rating: 5 };
  assert.deepEqual(reviewTextParts(raw), { original: '¡Muy buen trato!', translation: 'Very good service!' });
  assert.equal(mapManageRow(row).text, '¡Muy buen trato!');
  assert.equal(mapManageRow(row).translation, 'Very good service!');
  assert.equal(row.text, raw);
  assert.equal(reviewTextParts('(Traducido por Google) Bien (Original) Très bien').original, 'Très bien');
});
test('conserva textos sin formato inequívoco, vacíos y multilínea', () => {
  for (const value of ['', 'Hola\nMuy bien', 'Mi opinión (Original) buena', '(Translated by Google) Good', '(Translated by Google) Good (Original) ']) {
    assert.deepEqual(reviewTextParts(value), { original: value, translation: '' });
  }
  assert.equal(reviewTextParts('(Translated by Google) Good (Original) Hola\nAdiós').original, 'Hola\nAdiós');
});
test('el borrador recibe el original y la instrucción de responder en su idioma', () => {
  const request = draftRequest({ text: raw, rating: 5 });
  assert.ok(request.messages[0].content.includes('¡Muy buen trato!'));
  assert.ok(!request.messages[0].content.includes('Very good service!'));
  assert.ok(request.system.includes('idioma del texto original'));
});
test('traducción cerrada por defecto, escapada y disponible en ficha y editor', () => {
  const source = readFileSync(new URL('../public/panel/app.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function reviewTranslation(r)'), source.indexOf('function reviewCard(r)'));
  const context = vm.createContext({ esc: v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') });
  vm.runInContext(fn, context);
  const html = context.reviewTranslation({ translation: '<img onerror=alert(1)>' });
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes(' open'));
  assert.equal(context.reviewTranslation({}), '');
  assert.equal(source.split('${reviewTranslation(r)}').length - 1, 2);
});
