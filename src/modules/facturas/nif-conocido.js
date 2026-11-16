import {nifsConfirmados} from './identidad-confirmada.js';
export function nifConocido(datos, alias = [], historial = []) {
  // Nunca tapar un dato leído, aunque parezca incorrecto. Repetir OCR no lo confirma.
  if (String(datos?.nif_proveedor || '').trim()) return null;
  const confirmados=nifsConfirmados(datos?.proveedor,alias);
  return confirmados.length===1 ? confirmados[0] : null;
}
export async function completarNifConocido(datos, dbAll) {
  if (datos?._contraste || datos?._revisionHumana) return; // No deshacer la identidad ya contrastada con el historial OCR.
  if (!datos?.proveedor || String(datos.nif_proveedor || '').trim() || !dbAll) return;
  try {
    const alias = await dbAll('SELECT clave,nif,proveedor,autor FROM facturas_proveedor_alias');
    const nif = nifConocido(datos, alias);
    if (nif) { datos.nif_proveedor = nif; datos._origenNif = "Identidad confirmada manualmente del proveedor"; }
  } catch { /* Si no se puede contrastar la ficha, conservar el campo vacío. */ }
}
