// Qué se le dice a una persona cuando la IA falla. PURO.
//
// EL PROBLEMA: hoy cualquier fallo sale como «No se pudo preparar la propuesta». Con eso, quien
// está delante no puede hacer NADA: no sabe si tiene que esperar un minuto, avisar a quien lleva
// las claves, o si es que lo ha pedido mal. Y como el detalle solo va al registro del servidor,
// hay que abrir Replit para enterarse de que la clave había caducado.
//
// No es cosmética: la diferencia entre «espera un minuto» y «la clave no vale» es la diferencia
// entre reintentar y perder la tarde.

/** Mensaje para la persona, a partir del error del SDK (que trae `status` HTTP). */
export function mensajeDeErrorIA(e, queIba = "la propuesta") {
  const status = Number(e && (e.status ?? e.statusCode)) || 0;
  if (status === 401 || status === 403) return "La clave de la IA no vale o ha caducado. Hay que revisarla en la configuración del servidor.";
  if (status === 429) return "Ahora mismo hay demasiadas peticiones a la IA. Espera un minuto y vuelve a darle.";
  if (status === 400) return `La IA ha rechazado la petición. Prueba a escribirlo más corto o de otra manera.`;
  if (status === 402) return "La cuenta de la IA se ha quedado sin saldo.";
  // 404 en esta API casi siempre es «ese modelo no existe o no está disponible para esta
  // cuenta». Sin decirlo, cambiar de modelo se manifiesta como un «no se pudo» genérico y
  // hay que ir al registro del servidor para enterarse.
  if (status === 404) return "El modelo de IA configurado no está disponible para esta cuenta. Hay que revisarlo en el servidor.";
  if (status >= 500) return "La IA no responde ahora mismo. Suele ser cosa de un momento: vuelve a intentarlo.";
  return `No se pudo preparar ${queIba}.`;
}

/**
 * ¿La respuesta se quedó a medias por el tope de tokens?
 *
 * IMPORTA MUCHO más de lo que parece. Cuando se corta a mitad, la herramienta llega con el
 * texto truncado —un mensaje de WhatsApp cortado por la mitad, o un «hecho» de un cliente que
 * es media frase— y todo lo demás sigue funcionando como si nada. Es el peor tipo de fallo:
 * silencioso y con la apariencia de un resultado bueno. Mejor no dar nada que dar la mitad.
 */
export function seCorto(resp) {
  return !!resp && resp.stop_reason === "max_tokens";
}
