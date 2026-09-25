/** Solo el turno final llega al cliente; los preámbulos quedan en el contexto interno. */
export async function respuestaTrasHerramientas({ mensajes, crear, ejecutar, idioma = 'es', maxRondas = 5 }) {
  for (let i = 0; i < maxRondas; i++) {
    const respuesta = await crear(mensajes);
    const bloques = respuesta.content || [];
    const acciones = bloques.filter(b => b.type === 'tool_use');
    if (respuesta.stop_reason === 'end_turn' && !acciones.length) {
      const texto = bloques.filter(b => b.type === 'text').map(b => b.text.trim()).filter(Boolean).join('\n\n');
      if (texto) return texto;
      break;
    }
    // No ejecutar acciones ni enviar promesas desde una respuesta truncada.
    if (respuesta.stop_reason !== 'tool_use' || !acciones.length) break;
    mensajes.push({ role: 'assistant', content: bloques });
    const resultados = [];
    for (const accion of acciones) {
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
