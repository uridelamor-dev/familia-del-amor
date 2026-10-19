import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/panel/app.js', import.meta.url), 'utf8');
const poll = app.slice(app.indexOf('async function pollWa()'), app.indexOf('// ── Sara (IA)'));
function setup(api) {
  const box = { innerHTML: '' };
  const ctx = vm.createContext({
    CURRENT: 'whatsapp', WA_POLL: 1, WA_POLL_BUSY: false,
    apiRaw: api, document: { getElementById: () => box },
    waQRContent: q => q.qr || 'esperando',
    clearInterval() {}, loadWhatsApp: async () => { ctx.loaded = true; }
  });
  vm.runInContext(poll, ctx);
  return { ctx, box };
}
test('recupera un QR que llega tarde y lo renueva mientras sigue desconectado', async () => {
  let qr = null;
  const { ctx, box } = setup(async path => path.endsWith('/status') ? { connected: false } : { qr });
  await ctx.pollWa();
  assert.equal(box.innerHTML, 'esperando');
  qr = 'primer QR';
  await ctx.pollWa();
  assert.equal(box.innerHTML, qr);
  qr = 'QR renovado';
  await ctx.pollWa();
  assert.equal(box.innerHTML, qr);
});
test('al conectar carga la pantalla conectada sin solicitar otro QR', async () => {
  const calls = [];
  const { ctx } = setup(async path => { calls.push(path); return { connected: true }; });
  await ctx.pollWa();
  assert.deepEqual(calls, ['/api/whatsapp/status']);
  assert.equal(ctx.loaded, true);
});
test('un error se explica y permite recuperarse en la siguiente consulta', async () => {
  let fails = true;
  const { ctx, box } = setup(async () => { if (fails) throw Error('fallo'); return { qr: 'recuperado' }; });
  await ctx.pollWa();
  assert.match(box.innerHTML, /No se ha podido consultar/);
  assert.equal(ctx.WA_POLL_BUSY, false);
  fails = false;
  await ctx.pollWa();
  assert.equal(box.innerHTML, 'recuperado');
});
