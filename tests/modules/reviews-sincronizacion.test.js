import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compartirSincronizacion } from '../../src/modules/reviews/sincronizacion.js';
test('botón y actualización automática comparten una sola petición en curso', async () => {
  let calls = 0, finish;
  const sync = compartirSincronizacion(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const a = sync(), b = sync();
  assert.equal(a, b); await Promise.resolve(); assert.equal(calls, 1);
  finish({ updated: 10 }); assert.deepEqual(await a, { updated: 10 });
  const c = sync(); await Promise.resolve(); assert.equal(calls, 2); finish({ updated: 12 }); await c;
});
test('tras un fallo se libera el bloqueo y se permite volver a sincronizar', async () => {
  let calls = 0;
  const sync = compartirSincronizacion(() => { if (++calls === 1) throw Error('red'); return 'ok'; });
  await assert.rejects(sync(), /red/); assert.equal(await sync(), 'ok');
});
