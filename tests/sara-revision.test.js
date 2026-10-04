import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { revisarRespuesta, textoSeguro, pideExcepcionPromocion } from '../src/modules/messaging/sara-revision.js';
import { condicionesPromociones, ADJUNTOS_SCHEMA } from '../src/modules/messaging/sara-promociones.js';
import { respuestaTrasHerramientas } from '../src/modules/messaging/respuesta-herramientas.js';
import { estaPausada, idiomaSugerido, lineaIdioma, pistaIdioma, respuestaCortesia } from '../src/modules/messaging/sara.js';
import { anteponerCitado } from '../src/modules/messaging/contexto.js';

const valido = { decision: 'enviar', idioma: 'ca', respuesta: 'La promoció és el dia 1.', motivo: '', evidencias: ['Promoción: día 1'] };
const bloque = input => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'revisar_respuesta', input }] });
test('la revisión usa solo una herramienta sin acciones y exige evidencia literal', async () => {
  const r = await revisarRespuesta({ fuentes: 'Promoción: día 1', mensaje: 'Quin dia?', borrador: 'El dia 1', crear: async args => {
    assert.equal(args.tools.length, 1); assert.equal(args.tool_choice.name, 'revisar_respuesta');
    assert.equal(JSON.parse(args.messages[0].content).fuentesOficiales, 'Promoción: día 1');
    return bloque(valido);
  } });
  assert.equal(r.idioma, 'ca');
  await assert.rejects(revisarRespuesta({ fuentes: 'Promoción: día 1', crear: async () => bloque({ ...valido, evidencias: ['Vale cualquier día'] }) }), /revision_no_valida/);
});
test('revisión truncada, vacía o mal formada no se envía', async () => {
  for (const r of [{ ...bloque(valido), stop_reason: 'max_tokens' }, bloque({}), bloque({ ...valido, respuesta: '', evidencias: [] })]) {
    await assert.rejects(revisarRespuesta({ fuentes: '', crear: async () => r }));
  }
});
test('excepciones se detectan en tres idiomas, sin confundir una reserva corriente', () => {
  for (const m of ['¿Puedo usarlo otro día?', 'Puc venir un altre dia?', 'Can I use it another day?', 'Podem fer una excepció?']) {
    assert.equal(pideExcepcionPromocion(m, 'Invitación a desayuno gratuito'), true, m);
  }
  assert.equal(pideExcepcionPromocion('Quiero cambiar la fecha de mi reserva'), false);
  assert.equal(pideExcepcionPromocion('Quina és l’adreça?', 'Promoció esmorzar'), false);
});
test('condiciones no mezclan cupón con oferta de caja ni revelan secretos', () => {
  const r = JSON.parse(condicionesPromociones([{ id: 1, nombre: 'Cupón', token: 'SECRETO', hasta: null }], [{ id: 2, nombre: 'Desayuno', estado: 'publicada', texto_camarero: 'INTERNO' }]));
  assert.match(r.cupones[0].hasta, /No consta/); assert.equal(r.promociones_en_caja[0].referencia, 'caja:2');
  assert.doesNotMatch(JSON.stringify(r), /SECRETO|INTERNO/);
});

const wa = readFileSync(new URL('../whatsapp.js', import.meta.url), 'utf8');
function conversacion({ respuesta = 'Dime algo', revision = { ...valido, respuesta: 'Digues-me què necessites.', evidencias: [] }, falloDerivacion = false, falloRevision = false, accion = false } = {}) {
  let llamadas = 0, acciones = [];
  const env = { console, estaPausada, respuestaTrasHerramientas, revisarRespuesta, textoSeguro, pideExcepcionPromocion,
    perfilLoader: async () => null, resolverTelefono: async () => '34600111222', campanaLoader: async () => ({ texto: 'Promoción: día 1', idioma: 'ca' }), reservaLoader: null,
    conversaciones: new Map(), historialLoader: null, MAX_HISTORIAL: 10, SESION_TTL_SEG: 100,
    getContextoFechaHora: () => '2026-10-04', idiomaSugerido, lineaIdioma, pistaIdioma, respuestaCortesia,
    onActualizarPerfil: null, saraConfigLoader: async () => 'Promoción: día 1', SYSTEM_PROMPT: '## Nuestros locales Local A ## Carta, platos',
    buildPerfilContext: () => '', ctxAnteponerCitado: anteponerCitado, TOOLS: [], Anthropic: { RateLimitError: class extends Error {} },
    lineaError: () => 'Error controlado', redactar: () => ({}),
    ejecutarHerramienta: async b => { acciones.push(b.name); return { content: 'Acción registrada', is_error: falloDerivacion }; },
    getAnthropic: () => ({ messages: { create: async args => {
      if (args.tool_choice) { if (falloRevision) throw new Error('proveedor'); return bloque(revision); }
      llamadas++;
      if (accion && llamadas === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'registrar_reserva', id: 't1', input: {} }] };
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: respuesta }] };
    } } }),
  };
  const a = wa.indexOf('async function responderConIA('), b = wa.indexOf('// Ejecuta una herramienta', a);
  vm.runInNewContext(wa.slice(a, b), env);
  return { run: m => env.responderConIA('test', m, null, null), acciones, llamadas: () => llamadas };
}
test('turno real: excepción se deriva antes del modelo, confirma solo si se ha registrado', async () => {
  for (const falloDerivacion of [true, false]) {
    const c = conversacion({ falloDerivacion });
    const r = await c.run('Puc venir un altre dia?');
    assert.equal(c.llamadas(), 0); assert.deepEqual(c.acciones, ['pasar_a_persona']);
    assert.equal(r, textoSeguro(falloDerivacion ? 'error' : 'consulta', 'ca'));
  }
});
test('turno real: al cliente llega la revisión en catalán, no el borrador mezclado', async () => {
  const c = conversacion(); assert.equal(await c.run('Vull saber com funciona'), 'Digues-me què necessites.');
});
test('turno real: respuesta sin fundamento se sustituye por consulta registrada', async () => {
  const c = conversacion({ respuesta: 'Sí, vale el día 2', revision: { ...valido, decision: 'consultar', respuesta: '', motivo: 'Fecha sin confirmar', evidencias: [] } });
  assert.equal(await c.run('Puc venir dissabte?'), textoSeguro('consulta', 'ca'));
  assert.deepEqual(c.acciones, ['pasar_a_persona']);
});
test('fallar la revisión tras ejecutar una acción no invita a repetirla ni la duplica', async () => {
  const c = conversacion({ accion: true, falloRevision: true });
  assert.equal(await c.run('Vull reservar una taula'), textoSeguro('resultado', 'ca'));
  assert.deepEqual(c.acciones, ['registrar_reserva']);
});
test('migración SQL conserva originales privados, admite pausa y no duplica adjuntos', { skip: !process.env.TEST_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.TEST_PGLITE_MODULE); const db = new PGlite();
  try {
    await db.exec('CREATE TABLE whatsapp_messages(id SERIAL PRIMARY KEY, respuesta TEXT NOT NULL)');
    await db.exec(ADJUNTOS_SCHEMA); await db.exec(ADJUNTOS_SCHEMA);
    await db.query('INSERT INTO whatsapp_messages(respuesta,adjuntos) VALUES (NULL,$1)', [JSON.stringify(['00000000-0000-4000-8000-000000000001'])]);
    const datos = Buffer.from('%PDF-1.7');
    await db.query('INSERT INTO wa_adjuntos(id,jid,mensaje_id,nombre,mime,datos) VALUES ($1,$2,$3,$4,$5,$6)', ['00000000-0000-4000-8000-000000000001', 'test', 'a1', 'archivo.pdf', 'application/pdf', datos]);
    const { rows } = await db.query('SELECT datos FROM wa_adjuntos'); assert.deepEqual(Buffer.from(rows[0].datos), datos);
    await assert.rejects(db.query("INSERT INTO wa_adjuntos(id,jid,mensaje_id,nombre,mime,datos) SELECT '00000000-0000-4000-8000-000000000002',jid,mensaje_id,nombre,mime,datos FROM wa_adjuntos"));
  } finally { await db.close(); }
});
