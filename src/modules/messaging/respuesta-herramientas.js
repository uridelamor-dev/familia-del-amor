/** Solo el turno final llega al cliente; los preámbulos quedan en el contexto interno. */
export async function respuestaTrasHerramientas({ mensajes, crear, ejecutar, idioma = 'es', maxRondas = 5 }) {
  let documentoIntentado = false;
  for (let i = 0; i < maxRondas; i++) {
    const respuesta = await crear(mensajes);
    const bloques = respuesta.content || [];
    const acciones = bloques.filter(b => b.type === 'tool_use');
    if (respuesta.stop_reason === 'end_turn' && !acciones.length) {
      const texto = bloques.filter(b => b.type === 'text').map(b => b.text.trim()).filter(Boolean).join('\n\n');
      // No entregar un «te envío la carta» sin ejecutar el envío. Una ronda más
      // permite seleccionar el ID del catálogo; nunca inventamos ni reenviamos aquí.
      if (texto && !documentoIntentado && prometeDocumento(texto)) {
        mensajes.push({ role: 'assistant', content: bloques });
        mensajes.push({ role: 'user', content: '[CONTROL INTERNO: No se ha enviado ningún documento en este turno. Si el cliente pide la carta y hay un documento adecuado, ejecuta enviar_documento con su ID del catálogo antes de responder. Si falta el local, pregúntalo; si no hay documento, indícalo. No prometas ni afirmes un envío que no has realizado.]' });
        continue;
      }
      if (texto) return texto;
      break;
    }
    // No ejecutar acciones ni enviar promesas desde una respuesta truncada.
    if (respuesta.stop_reason !== 'tool_use' || !acciones.length) break;
    mensajes.push({ role: 'assistant', content: bloques });
    const resultados = [];
    for (const accion of acciones) {
      if (accion.name === 'enviar_documento') documentoIntentado = true;
      const resultado = await ejecutar(accion);
      resultados.push({ type: 'tool_result', tool_use_id: accion.id, ...resultado });
    }
    mensajes.push({ role: 'user', content: resultados });
  }
  // Alguna acción puede haber ocurrido: no afirmar éxito ni sugerir repetirla.
  return idioma === 'ca'
    ? 'Em sap greu, no he pogut confirmar el resultat de la teva petició. Cal comprovar-lo abans de tornar-ho a intentar.'
    : idioma === 'en'
      ? 'Sorry, I could not confirm the outcome of your request. It needs to be checked before trying again.'
      : 'Lo siento, no he podido confirmar el resultado de tu petición. Hay que comprobarlo antes de volver a intentarlo.';
}

function prometeDocumento(texto) {
  const t = texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return /\b(carta|menu|documento?|pdf)\b/.test(t) && /(?:te (?:la |lo |las |los )?(?:envio|mando|paso|adjunto)|te he (?:enviado|mandado|pasado|adjuntado)|(?:t['’]|te l['’])envio|t['’]he enviat|(?:i(?:'ll| will| have| am)? |i['’]m )(?:send|sending|sent|attach)|aqui (?:tienes|tens))/.test(t);
}
