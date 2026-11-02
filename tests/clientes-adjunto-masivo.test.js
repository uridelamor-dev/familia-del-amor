import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const start = source.indexOf('app.post("/api/contactos/mensaje-masivo"');
const route = source.slice(start, source.indexOf('// ── CAMPAÑAS WHATSAPP', start));
async function run(body, attachment = { buffer: Buffer.from('fixture'), filename: 'factura.pdf', mimetype: 'application/pdf' }) {
  let handler, saved, sent;
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  vm.runInNewContext(route, {
    app: { post: (_path, _auth, fn) => { handler = fn; } }, requireAuth: () => {},
    isReady: () => true, cargarAdjunto: () => attachment,
    segmentoDelBody: () => ({ segmento: {} }), contactosGeograficos: async () => [{ telefono: 'fixture' }],
    filtrarEnviablesWA: contacts => ({ aptos: contacts, omitidos: {} }),
    dbRun: async (sql, args) => { saved = { sql, args }; return { id: 12 }; },
    hoyISO: () => '2026-11-02', enviarLoteWA: options => { sent = options; },
  });
  await handler({ body: { mensaje: 'Prueba', ...body } }, res);
  return { res, saved, sent };
}

test('el adjunto se guarda y se entrega al envío junto al texto', async () => {
  const { res, saved, sent } = await run({ adjunto_url: '/uploads/123-factura.pdf' });
  assert.equal(res.code, 200);
  assert.equal(saved.args[3], '/uploads/123-factura.pdf');
  assert.match(saved.sql, /'enviando'/);
  assert.equal(sent.adjunto.buffer.toString(), 'fixture');
  assert.equal(sent.mensaje, 'Prueba');
});
test('sin adjunto sigue funcionando el mensaje de texto', async () => {
  const { res, saved, sent } = await run({});
  assert.equal(res.code, 200);
  assert.equal(saved.args[3], null);
  assert.equal(sent.adjunto, null);
});
test('no se inicia el envío con rutas ajenas o archivos incompatibles', async () => {
  for (const adjunto_url of ['https://example.com/a.pdf', '/uploads/../a.pdf', '/uploads/script.js', 123]) {
    const { res, saved, sent } = await run({ adjunto_url });
    assert.equal(res.code, 400);
    assert.equal(saved, undefined);
    assert.equal(sent, undefined);
  }
});
test('un adjunto perdido, vacío o demasiado grande no se envía como texto solo', async () => {
  for (const attachment of [null, { buffer: Buffer.alloc(0) }, { buffer: { length: 15 * 1024 * 1024 + 1 } }]) {
    const { res, saved, sent } = await run({ adjunto_url: '/uploads/a.jpg' }, attachment);
    assert.equal(res.code, 400);
    assert.equal(saved, undefined);
    assert.equal(sent, undefined);
  }
});
