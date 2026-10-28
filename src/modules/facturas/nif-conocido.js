import { nifValido } from './emisor.js';
import { claveProveedor } from './categorias.js';
const normalizar = x => String(x || '').replace(/[\s.\-/]/g, '').toUpperCase();
const nombre = x => String(x || '').trim().toLocaleLowerCase('es');
export function nifConocido(datos, alias = [], historial = []) {
  // Nunca tapar un dato leído, aunque parezca incorrecto.
  if (String(datos?.nif_proveedor || '').trim() || !nombre(datos?.proveedor)) return null;
  const aprendidos = alias.filter(a => nombre(a.proveedor) === nombre(datos.proveedor)
    || a.clave === claveProveedor(datos.proveedor)).map(a => normalizar(a.nif)).filter(Boolean);
  const confirmados=[...new Set(aprendidos)];
  if(confirmados.length===1&&nifValido(confirmados[0]))return confirmados[0];
  if(confirmados.length>1)return null;
  const previos = historial.map(f => normalizar(f.nif)).filter(Boolean);
  const todos = [...new Set([...aprendidos, ...previos])];
  if (todos.length !== 1 || !nifValido(todos[0])) return null;
  // Alias confirmado por una corrección manual, o al menos dos documentos distintos.
  const documentos = new Set(historial.filter(f => normalizar(f.nif) === todos[0])
    .map(f => f.numero_factura).filter(Boolean));
  if (!aprendidos.includes(todos[0]) && documentos.size < 2) return null;
  return todos[0];
}
export async function completarNifConocido(datos, dbAll) {
  if (datos?._contraste) return; // No deshacer la identidad ya contrastada con el historial OCR.
  if (!datos?.proveedor || String(datos.nif_proveedor || '').trim() || !dbAll) return;
  try {
    const alias = await dbAll('SELECT clave,nif,proveedor FROM facturas_proveedor_alias');
    const historial = await dbAll(`SELECT nif,numero_factura FROM facturas
      WHERE LOWER(TRIM(proveedor)) = LOWER(TRIM(?))
      AND COALESCE(dup_estado,'') <> 'duda'`, [datos.proveedor]);
    const nif = nifConocido(datos, alias, historial);
    if (nif) { datos.nif_proveedor = nif; datos._origenNif = "Ficha o historial inequívoco del proveedor"; }
  } catch { /* Si no se puede contrastar la ficha, conservar el campo vacío. */ }
}
