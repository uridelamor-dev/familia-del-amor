import { test } from 'node:test';
import assert from 'node:assert/strict';
import { respuestaTrasHerramientas } from '../src/modules/messaging/respuesta-herramientas.js';
const texto = text => ({ type: 'text', text });
const accion = (id = 'doc') => ({ type: 'tool_use', id, name: 'enviar_documento', input: { documento_id: 7 } });
const final = text => ({ stop_reason: 'end_turn', content: [texto(text)] });
const previo = (id = 'doc') => ({ stop_reason: 'tool_use', content: [texto("Perfecte! Te l'envio ara mateix."), accion(id)] });

for (const is_error of [false, true]) {
  test(`descarta la promesa previa cuando el documento falla (is_error=${is_error})`, async () => {
    const mensajes = [{ role: 'user', content: 'Sí, passa-me-la' }];
    let llamadas = 0;
    const salida = await respuestaTrasHerramientas({ mensajes, idioma: 'ca',
      crear: async contexto => {
        if (llamadas++ === 0) return previo();
        assert.equal(contexto.at(-1).content[0].content, 'Documento no disponible');
        assert.equal(contexto.at(-1).content[0].tool_use_id, 'doc');
        assert.equal(contexto.at(-1).content[0].is_error, is_error);
        return final('Em sap greu, no tinc aquesta carta disponible.');
      },
      ejecutar: async () => ({ content: 'Documento no disponible', is_error })
    });
    assert.equal(salida, 'Em sap greu, no tinc aquesta carta disponible.');
    assert.equal(mensajes[1].content[0].text, "Perfecte! Te l'envio ara mateix.");
  });
}
test('confirma una entrega después del envío, sin duplicar los preámbulos', async () => {
  let enviada = false, llamadas = 0;
  const salida = await respuestaTrasHerramientas({ mensajes: [],
    crear: async () => llamadas++ === 0 ? previo() : (assert.ok(enviada), final('Ja tens la carta.')),
    ejecutar: async () => { enviada = true; return { content: 'Documento enviado', is_error: false }; }
  });
  assert.equal(salida, 'Ja tens la carta.');
});
test('varias rondas y herramientas conservan todos sus resultados internos', async () => {
  let ronda = 0;
  const ejecutadas = [], mensajes = [];
  const salida = await respuestaTrasHerramientas({ mensajes,
    crear: async () => ++ronda < 3 ? { stop_reason: 'tool_use', content: [texto('Hecho'), accion(`${ronda}a`), accion(`${ronda}b`)] } : final('Una acción completada y otra pendiente.'),
    ejecutar: async a => { ejecutadas.push(a.id); return { content: a.id, is_error: false }; }
  });
  assert.deepEqual(ejecutadas, ['1a', '1b', '2a', '2b']);
  assert.equal(mensajes.length, 4);
  assert.equal(salida, 'Una acción completada y otra pendiente.');
});
for (const idioma of ['ca', 'es', 'en']) {
  test(`sin respuesta final no afirma éxito (${idioma})`, async () => {
    for (const respuesta of [final(''), { stop_reason: 'max_tokens', content: [texto('¡Listo!'), accion()] }, previo()]) {
      let ejecuciones = 0;
      const salida = await respuestaTrasHerramientas({ mensajes: [], idioma, maxRondas: 2,
        crear: async () => respuesta,
        ejecutar: async () => { ejecuciones++; return { content: 'Hecho', is_error: false }; }
      });
      assert.match(salida, /no he pogut confirmar|no he podido confirmar|could not confirm/);
      assert.doesNotMatch(salida, /Listo|Perfecte|Hecho/);
      assert.equal(ejecuciones, respuesta.stop_reason === 'tool_use' ? 2 : 0);
    }
  });
}
test('no oculta una excepción ni devuelve una promesa anterior como respuesta', async () => {
  await assert.rejects(respuestaTrasHerramientas({ mensajes: [], crear: async () => previo(),
    ejecutar: async () => { throw new Error('Conexión interrumpida'); }
  }), /Conexión interrumpida/);
});
