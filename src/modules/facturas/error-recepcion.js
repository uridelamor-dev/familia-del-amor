// Mensajes cerrados: nunca exponer respuestas crudas del proveedor ni datos del documento.
export function diagnosticarRecepcion(error) {
  const mensaje = String(error?.message || '');
  const status = Number(error?.status || error?.response?.status);
  if (/unsupported|media.?type|image format|invalid.*image|no es un pdf|corrupt|encrypted|password/i.test(mensaje))
    return { codigo: 'archivo_incompatible', permanente: true, texto: 'El archivo no se puede leer en su formato actual. Revisa el original y aporta una copia PDF, JPG o PNG legible.' };
  if (status === 401 || status === 403 || /invalid_grant|unauthorized|api.?key|authentication/i.test(mensaje))
    return { codigo: 'acceso_servicio', texto: 'La lectura está bloqueada por el acceso a un servicio. Hay que revisar la conexión; repetir el envío no lo corrige.' };
  if (status === 429 || /rate.?limit|too many requests|\b429\b/i.test(mensaje))
    return { codigo: 'limite_servicio', texto: 'El servicio ha limitado temporalmente las peticiones. Se volverá a intentar.' };
  if (/timeout|timed out|plazo|fetch failed|econnreset|enotfound|aborted/i.test(mensaje))
    return { codigo: 'conexion', texto: 'La conexión o la lectura no terminó a tiempo. Se volverá a intentar.' };
  if (/JSON válido|más líneas|lectura se ha cortado/i.test(mensaje))
    return { codigo: 'lectura_incompleta', texto: 'La lectura no ha devuelto datos completos. Si persiste, habrá que revisar el documento.' };
  if (/Drive|Google|carpeta/i.test(mensaje))
    return { codigo: 'archivo_drive', texto: 'No se ha podido completar el archivo en Drive. Hay que revisar la conexión y la carpeta de destino.' };
  return { codigo: 'sin_clasificar', texto: 'No se pudo completar el procesamiento. Requiere diagnóstico técnico si el error persiste.' };
}
