// Comparte el trabajo en curso entre el temporizador, el botón y la conexión OAuth.
export function compartirSincronizacion(ejecutar) {
  let pendiente = null;
  return function sincronizar() {
    if (!pendiente) pendiente = Promise.resolve().then(ejecutar).finally(() => { pendiente = null; });
    return pendiente;
  };
}
