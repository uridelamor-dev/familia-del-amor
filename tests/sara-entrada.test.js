import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { prepararAdjunto } from '../src/modules/messaging/sara-adjuntos.js';
import { textoSeguro } from '../src/modules/messaging/sara-revision.js';
import { estaPausada, idiomaSugerido, pidePersona, MOTIVO_PAUSA } from '../src/modules/messaging/sara.js';
import { respuestaASeguimiento, CONTENTO, DESCONTENTO, DUDOSO } from '../src/modules/reservas/seguimiento.js';

const wa = readFileSync(new URL('../whatsapp.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
test('el mismo mensaje no se procesa dos veces y la cola mantiene el orden por cliente', async () => {
  const env = {};
  const a = wa.indexOf('const colasPorJid = new Map();'), b = wa.indexOf('const NEREA_JID', a);
  vm.runInNewContext(wa.slice(a, b), env);
  const key = { remoteJid: 'uno', id: 'mensaje1' };
  assert.equal(env.entradaNueva(key), true); assert.equal(env.entradaNueva(key), false);
  assert.equal(env.entradaNueva({ ...key, remoteJid: 'dos' }), true);
  const orden = []; let liberar;
  const espera = new Promise(resolve => { liberar = resolve; });
  const p1 = env.encolarPorJid('uno', async () => { orden.push('inicio'); await espera; orden.push('fin'); });
  const p2 = env.encolarPorJid('uno', async () => orden.push('segundo'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(orden, ['inicio']); liberar(); await Promise.all([p1, p2]);
  assert.deepEqual(orden, ['inicio', 'fin', 'segundo']);
});
function entrada({ estado = 'activa', fallaLectura = false, tomaManual = false } = {}) {
  const guardados = [], envios = [], llamadas = [];
  const perfil = { estado_ia: estado, idioma_ultimo: 'ca', pausado_por: estado === 'pausada' ? 'operador' : null };
  const env = { console, estaPausada, idiomaSugerido, pidePersona, MOTIVO_PAUSA, textoSeguro,
    perfilLoader: async () => perfil, logBaileys: () => ({}), guardarAdjunto: async () => 'adjunto-1',
    downloadMediaMessage: async () => Readable.from([Buffer.from('%PDF-1.7')]),
    prepararAdjunto: args => prepararAdjunto({ ...args, interpretar: async () => {
      llamadas.push('leer'); if (fallaLectura) throw new Error('archivo_ilegible');
      return { etiqueta: 'Lectura del archivo', texto: 'Vull reservar una taula per a quatre persones.' };
    } }),
    onMessage: async x => guardados.push(x), onPausarIA: null, followupAwaitingReply: new Map(), seguimientoResolver: null,
    sock: { updateMediaMessage() {}, sendPresenceUpdate: async () => {}, sendMessage: async (_jid, x) => envios.push(x.text) },
    responderConIA: async (_jid, texto) => {
      llamadas.push(texto);
      if (tomaManual) Object.assign(perfil, { estado_ia: 'pausada', pausado_por: 'operador' });
      return 'Per a quin dia?';
    },
  };
  const a = wa.indexOf('async function procesarBatch('), b = wa.indexOf('/**', a);
  vm.runInNewContext(wa.slice(a, b), env);
  return { run: () => env.procesarBatch('cliente', [{ textoFinal: '[Archivo adjunto sin texto]', tieneAdjunto: true,
    msg: { key: { id: 'm1', remoteJid: 'cliente' }, message: { documentMessage: { mimetype: 'application/pdf' } } } }]), envios, guardados, llamadas };
}
test('entrada real: lectura y adjunto quedan en historial, no se envía la etiqueta vacía al modelo', async () => {
  const e = entrada(); await e.run();
  assert.deepEqual(e.envios, ['Per a quin dia?']); assert.match(e.guardados[0].texto, /Vull reservar/);
  assert.deepEqual([...e.guardados[0].adjuntos], ['adjunto-1']); assert.doesNotMatch(e.llamadas[1], /Archivo adjunto sin texto/);
});
test('entrada real: estando pausada archiva y permanece en silencio', async () => {
  const e = entrada({ estado: 'pausada' }); await e.run();
  assert.equal(e.envios.length, 0); assert.equal(e.llamadas.length, 0); assert.equal(e.guardados[0].respuesta, null);
  assert.deepEqual([...e.guardados[0].adjuntos], ['adjunto-1']);
});
test('entrada real: lectura fallida no ejecuta acciones ni pierde el original', async () => {
  const e = entrada({ fallaLectura: true }); await e.run();
  assert.deepEqual(e.envios, [textoSeguro('adjunto', 'ca')]); assert.deepEqual(e.llamadas, ['leer']);
  assert.deepEqual([...e.guardados[0].adjuntos], ['adjunto-1']);
});
test('entrada real: toma manual durante la respuesta impide enviarla', async () => {
  const e = entrada({ tomaManual: true }); await e.run();
  assert.equal(e.envios.length, 0); assert.equal(e.guardados[0].respuesta, null);
});
test('saludos catalanes breves y seguimiento mantienen su idioma', () => {
  for (const m of ['Bon dia', 'Bona tarda!', 'Gràcies', 'D’acord']) assert.equal(idiomaSugerido({ mensajesCliente: [m] }).idioma, 'ca');
  for (const veredicto of [CONTENTO, DESCONTENTO, DUDOSO]) {
    const r = respuestaASeguimiento({ veredicto, idioma: 'ca', nombre: 'Marta', enlace: 'https://example.test' });
    assert.match(r.texto, /Gràcies/); assert.doesNotMatch(r.texto, /Gracias|contárnoslo|equipo/);
    assert.equal(r.pideResena, veredicto === CONTENTO);
  }
});
test('callback real: fallo al pausar se propaga y no permite afirmar que se ha derivado', async () => {
  let callback;
  const a = server.indexOf('  setOnPausarIA(async'), b = server.indexOf('  setOnGroupAttachment(', a);
  const env = { console, setOnPausarIA: fn => { callback = fn; }, saraMarcarPausa: () => ({}), isoConOffset: () => '',
    dbRun: async () => { throw new Error('base_no_disponible'); }, lineaErrorSql: () => 'error controlado' };
  vm.runInNewContext(server.slice(a, b), env);
  await assert.rejects(callback('cliente@s.whatsapp.net', {}), /base_no_disponible/);
});
test('callback real: una reserva solo informa éxito tras quedar guardada', async () => {
  for (const fallo of ['bloqueo', 'insert', 'despues', null]) {
    let callback;
    const a = server.indexOf('  setOnReserva(async'), b = server.indexOf('  // Grupos de WhatsApp por defecto', a);
    const env = { console, setOnReserva: fn => { callback = fn; }, estaBloqueado: async () => { if (fallo === 'bloqueo') throw new Error('fallo'); return null; },
      dbRun: async sql => { if (fallo === 'insert') throw new Error('fallo'); return { id: 1 }; },
      upsertLeadFromReserva: () => {}, dbGet: async () => { if (fallo === 'despues') throw new Error('fallo'); return null; }, programarSeguimiento: async () => {} };
    vm.runInNewContext(server.slice(a, b), env);
    const p = callback({ local: 'Local', personas: 2, dia: '2026-12-01', hora: '13:30', telefono: '600000001', nombre_reserva: 'Prueba' }, 'cliente');
    if (fallo === 'bloqueo' || fallo === 'insert') await assert.rejects(p, /fallo/);
    else assert.equal((await p).ok, true);
  }
});
test('endpoint de adjuntos exige autenticación de dirección y aplica caducidad', async () => {
  let handler; let protegida = false;
  const a = server.indexOf('app.get("/api/whatsapp/adjuntos/:id"'), b = server.indexOf('app.get("/api/whatsapp/mensajes"', a);
  const env = { app: { get: (_path, middleware, fn) => { assert.equal(middleware, 'autenticado'); handler = fn; } },
    requireAuth: roles => { assert.deepEqual([...roles], ['direccion']); protegida = true; return 'autenticado'; },
    dbGet: async sql => { assert.match(sql, /30 days/); return null; } };
  vm.runInNewContext(server.slice(a, b), env);
  let status;
  const res = { status: n => { status = n; return res; }, json: () => {}, sendStatus: n => { status = n; } };
  await handler({ params: { id: '00000000-0000-4000-8000-000000000001' } }, res);
  assert.equal(protegida, true); assert.equal(status, 404);
});
