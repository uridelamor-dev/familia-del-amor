import {normNif, nifValido, esNuestraPorNombre} from './emisor.js';

const fiscal = value => normNif(value).replace(/^ES(?=[A-Z0-9]{9}$)/, '');
// Elegir una ficha de destino no demuestra que dos empresas sean la misma.
export function validarIdentidadUnion(documentos, empresas = []) {
  const propios = new Set(empresas.map(e => fiscal(e.cif)).filter(Boolean));
  const nifs = new Set();
  for (const d of documentos) {
    const n = fiscal(d.nif);
    if (propios.has(n) || esNuestraPorNombre(d.proveedor, empresas))
      throw Error('Hay datos de una empresa destinataria entre los proveedores. Corrige primero el emisor en sus documentos.');
    if (n && nifValido(n)) nifs.add(n);
  }
  if (nifs.size > 1)
    throw Error('Estos documentos tienen CIF diferentes. Revisa y corrige el emisor en los originales antes de unir proveedores; elegir un CIF no debe sustituir a otra empresa.');
}
