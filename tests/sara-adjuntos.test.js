import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { describirAdjunto, mensajeNormalizado, leerLimitado, prepararAdjunto, interpretarAdjunto, convertirAudio, validarContenido, MAX_ADJUNTO, duracionOggOpus } from '../src/modules/messaging/sara-adjuntos.js';


function oggPage(payload, sequence, granule, flags = 0) {
  const head = Buffer.alloc(28);
  head.write('OggS'); head[5] = flags; head.writeBigInt64LE(BigInt(granule), 6);
  head.writeUInt32LE(7, 14); head.writeUInt32LE(sequence, 18); head[26] = 1; head[27] = payload.length;
  return Buffer.concat([head, payload]);
}
function opusFixture(seconds = 14) {
  const head = Buffer.alloc(19); head.write('OpusHead'); head[8] = 1; head[9] = 1; head.writeUInt16LE(312, 10);
  return Buffer.concat([oggPage(head, 0, 0, 2), oggPage(Buffer.from('OpusTags'), 1, 0), oggPage(Buffer.from([0xf8, 0xff, 0xfe]), 2, seconds * 48000 + 312, 4)]);
}
const legacyOgg = oggPage(Buffer.from('vorbis'), 0, 0, 2);

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
test('audio Ogg no Opus se envía original y conserva el idioma', async () => {
  const meta = describirAdjunto({ audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 5 } });
  let conversion = 0;
  const a = await interpretarAdjunto(legacyOgg, meta, { apiKey: 'clave-ficticia', convertir: async () => { conversion++; return Buffer.from('wav'); }, fetcher: async (url, args) => {
    assert.match(url, /audio\/transcriptions$/); assert.equal(args.body.get('file').name, 'audio.ogg');
    assert.match(args.body.get('prompt'), /idioma original/);
    return { ok: true, json: async () => ({ text: 'Vull reservar una taula per demà.' }) };
  } });
  assert.equal(conversion, 0); assert.equal(a.texto, 'Vull reservar una taula per demà.');
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

test('fallo temporal de conexión se reintenta una vez sin duplicar archivo ni conversión', async () => {
  const meta = { audioMessage: { mimetype: 'audio/ogg', seconds: 14 } };
  let llamadas = 0, guardados = 0, conversiones = 0;
  const a = await prepararAdjunto({ msg: { ...msg, message: meta },
    descargar: async () => Readable.from([legacyOgg]),
    guardar: async () => { guardados++; return 'audio-id'; },
    interpretar: (b, m) => interpretarAdjunto(b, m, { apiKey: 'ficticia',
      convertir: async () => { conversiones++; return Buffer.from('wav'); },
      fetcher: async (_url, args) => {
        assert.equal(args.body.get('file').name, 'audio.ogg');
        if (++llamadas === 1) throw new TypeError('fetch failed', { cause: Object.assign(new Error('private details'), { code: 'UND_ERR_CONNECT_TIMEOUT' }) });
        return { ok: true, json: async () => ({ text: 'Bon dia, voldria reservar.' }) };
      },
    }),
  });
  assert.equal(a.error, undefined); assert.match(a.texto, /Bon dia/);
  assert.equal(llamadas, 2); assert.equal(guardados, 1); assert.equal(conversiones, 0);
});

test('reintentos acotados y sin repetir errores de credenciales o cuota', async () => {
  for (const [status, esperadas] of [[503, 2], [401, 1], [429, 1]]) {
    let llamadas = 0;
    await assert.rejects(interpretarAdjunto(pdf, describirAdjunto(msg.message), { apiKey: 'ficticia',
      fetcher: async () => { llamadas++; return { ok: false, status }; },
    }), new RegExp(`lectura_proveedor_${status}`));
    assert.equal(llamadas, esperadas);
  }
});

test('diagnóstico distingue conexión y conversión sin revelar contenido del error', async () => {
  const { diagnosticoAdjunto } = await import('../src/modules/messaging/sara-adjuntos.js');
  assert.equal(diagnosticoAdjunto(new TypeError('secret', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })), 'conexion_und_err_connect_timeout');
  assert.equal(diagnosticoAdjunto({ code: 'ENOENT', message: 'private path' }), 'herramienta_no_disponible');
  assert.equal(diagnosticoAdjunto({ killed: true, message: 'private command' }), 'conversion_tiempo_agotado');
  assert.equal(diagnosticoAdjunto(new Error('secret')), 'error_procesando');
  assert.equal(diagnosticoAdjunto(new Error('lectura_proveedor_401')), 'lectura_proveedor_401');
});


test('nota de voz Opus va directamente al proveedor incluso sin conversor instalado', async () => {
  const original = opusFixture();
  const meta = describirAdjunto({ audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 14 } });
  const result = await interpretarAdjunto(original, meta, { apiKey: 'ficticia',
    convertir: async () => assert.fail('No arrancar ffprobe ni ffmpeg'),
    fetcher: async (_url, args) => {
      const file = args.body.get('file');
      assert.equal(file.name, 'audio.ogg'); assert.equal(file.type, 'audio/ogg');
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), original);
      return { ok: true, json: async () => ({ text: 'Voldria reservar per demà.' }) };
    },
  });
  assert.match(result.texto, /Voldria/);
  assert.equal(duracionOggOpus(original), 14);
});

test('Opus mantiene el límite medible y envía variantes originales sin conversor', async () => {
  const meta = { tipo: 'audio', extension: 'ogg', mime: 'audio/ogg', compatible: true, segundos: 1 };
  assert.equal(duracionOggOpus(opusFixture(300)), 300);
  await assert.rejects(interpretarAdjunto(opusFixture(301), meta, {
    apiKey: 'ficticia', fetcher: () => assert.fail('No enviar'), convertir: () => assert.fail('No convertir fuera de límites'),
  }), /audio_fuera_limites/);
  const original = opusFixture();
  const missingEnd = Buffer.from(original); missingEnd[missingEnd.length - 31 + 5] = 0;
  let converted = 0;
  const result = await interpretarAdjunto(missingEnd, meta, {
    apiKey: 'ficticia', convertir: async b => { assert.deepEqual(b, missingEnd); converted++; return Buffer.from('WAV comprobado'); },
    fetcher: async (_url, args) => {
      assert.equal(args.body.get('file').name, 'audio.ogg');
      assert.deepEqual(Buffer.from(await args.body.get('file').arrayBuffer()), missingEnd);
      return {ok:true, json:async()=>({text:'Una taula per a dos.'})};
    },
  });
  assert.equal(converted, 0); assert.match(result.texto, /taula/);
  await assert.rejects(interpretarAdjunto(original.subarray(0, -1), meta, {
    apiKey:'ficticia', convertir:async()=>{throw new Error('audio_fuera_limites');},
    fetcher:async()=>({ok:false,status:400}),
  }), /lectura_proveedor_400/);
});
