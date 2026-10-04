import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { describirAdjunto, mensajeNormalizado, leerLimitado, prepararAdjunto, interpretarAdjunto, convertirAudio, validarContenido, MAX_ADJUNTO } from '../src/modules/messaging/sara-adjuntos.js';

const pdf = Buffer.from('%PDF-1.7\nDocumento de prueba');
const msg = { key: { remoteJid: 'cliente@s.whatsapp.net', id: 'a1' }, message: { documentMessage: { mimetype: 'application/pdf', fileName: 'ejemplo.pdf', fileLength: pdf.length } } };
const options = { msg, descargar: async () => Readable.from([pdf]) };

test('adjunto privado: archiva original, lee contenido y conserva identificador', async () => {
  const orden = [];
  const a = await prepararAdjunto({ ...options, guardar: async x => { orden.push('guardar'); assert.deepEqual(x.buffer, pdf); return 'id-archivo'; },
    interpretar: async () => { orden.push('leer'); return { etiqueta: 'Lectura del archivo', texto: 'Dinar per a quatre persones.' }; } });
  assert.deepEqual(orden, ['guardar', 'leer']); assert.equal(a.id, 'id-archivo'); assert.match(a.texto, /Dinar per a quatre/);
});
test('con atención humana guarda el adjunto sin llamar al proveedor', async () => {
  const a = await prepararAdjunto({ ...options, analizar: false, guardar: async () => 'id', interpretar: async () => { throw new Error('No debe llamarse'); } });
  assert.equal(a.error, undefined); assert.match(a.texto, /Pendiente/);
});
test('fallo de lectura conserva original sin inventar contenido', async () => {
  const a = await prepararAdjunto({ ...options, guardar: async () => 'id', interpretar: async () => { throw new Error('lectura_sin_configurar'); } });
  assert.equal(a.id, 'id'); assert.equal(a.error, true); assert.match(a.texto, /No se ha podido interpretar/);
});
test('formato y tamaño declarados se comprueban antes de descargar', async () => {
  for (const m of [{ videoMessage: { mimetype: 'video/mp4' } }, { documentMessage: { mimetype: 'application/pdf', fileLength: MAX_ADJUNTO + 1 } }, { audioMessage: { mimetype: 'audio/ogg', seconds: 301 } }]) {
    const a = await prepararAdjunto({ msg: { ...msg, message: m }, descargar: async () => { assert.fail('No descargar'); } });
    assert.equal(a.error, true);
  }
});
test('límite real del stream y firma del archivo, aunque el remitente mienta', async () => {
  await assert.rejects(leerLimitado(Readable.from([Buffer.alloc(20)]), 10), /demasiado_grande/);
  assert.throws(() => validarContenido(Buffer.from('<html>'), describirAdjunto(msg.message)), /formato_no_coincide/);
  const a = await prepararAdjunto({ ...options, descargar: async () => Readable.from([Buffer.from('<html>')]), guardar: async () => assert.fail('No guardar archivo falso') });
  assert.equal(a.error, true);
});
test('envoltorios compatibles y visualización única', () => {
  assert.deepEqual(mensajeNormalizado({ ephemeralMessage: { message: { documentWithCaptionMessage: { message: msg.message } } } }), msg.message);
  assert.equal(describirAdjunto({ viewOnceMessage: { message: msg.message } }), null);
  assert.equal(describirAdjunto({ imageMessage: { mimetype: 'image/jpeg', viewOnce: true } }), null);
  assert.equal(describirAdjunto({ documentMessage: { mimetype: 'audio/ogg; codecs=opus' } }).tipo, 'audio');
});
test('audio Ogg se convierte y transcribe conservando el idioma original', async () => {
  const meta = describirAdjunto({ audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 5 } });
  let conversion = 0;
  const a = await interpretarAdjunto(Buffer.from('OggSfixture'), meta, { apiKey: 'clave-ficticia', convertir: async () => { conversion++; return Buffer.from('wav'); }, fetcher: async (url, args) => {
    assert.match(url, /audio\/transcriptions$/); assert.equal(args.body.get('file').name, 'audio.wav');
    assert.match(args.body.get('prompt'), /idioma original/);
    return { ok: true, json: async () => ({ text: 'Vull reservar una taula per demà.' }) };
  } });
  assert.equal(conversion, 1); assert.equal(a.texto, 'Vull reservar una taula per demà.');
});
test('PDF usa lectura estructurada, sin almacenamiento del proveedor; ilegible no se acepta', async () => {
  for (const legible of [true, false]) {
    const promesa = interpretarAdjunto(pdf, describirAdjunto(msg.message), { apiKey: 'ficticia', fetcher: async (_url, args) => {
      const body = JSON.parse(args.body); assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
      assert.match(body.input[0].content[1].file_data, /^data:application\/pdf;base64,/);
      return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ legible, texto: 'Document del client' }) }] }] }) };
    } });
    if (legible) assert.equal((await promesa).texto, 'Document del client');
    else await assert.rejects(promesa, /archivo_ilegible/);
  }
});
test('sin credenciales no hay llamada y un fallo del proveedor no se interpreta como texto', async () => {
  await assert.rejects(interpretarAdjunto(pdf, describirAdjunto(msg.message), { apiKey: '', fetcher: () => assert.fail() }), /sin_configurar/);
  await assert.rejects(interpretarAdjunto(pdf, describirAdjunto(msg.message), { apiKey: 'x', fetcher: async () => ({ ok: false, status: 429 }) }), /proveedor_429/);
});
test('conversión sin shell, duración real acotada y limpieza de temporales', async () => {
  let dir;
  const b = await convertirAudio(Buffer.from('OggSfixture'), async (bin, args) => {
    if (bin.endsWith('ffprobe')) { dir = args.at(-1).replace('/audio.ogg', ''); return { stdout: '2.5' }; }
    assert.ok(args.includes('-nostdin')); assert.ok(args.includes('file,pipe'));
    await writeFile(args.at(-1), Buffer.from('RIFFfixture'));
    return {};
  });
  assert.equal(b.toString(), 'RIFFfixture'); assert.equal(existsSync(dir), false);
  await assert.rejects(convertirAudio(Buffer.from('OggSfixture'), async (_bin, args) => { dir = args.at(-1).replace('/audio.ogg', ''); return { stdout: '301' }; }), /audio_fuera_limites/);
  assert.equal(existsSync(dir), false);
});
