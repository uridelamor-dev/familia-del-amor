// Sólo el título principal copiado literalmente: nunca palabras en referencias o conceptos.
const normal = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
export const esDocumentoPrevioFactura = d => ['factura proforma','proforma','presupuesto'].includes(normal(d?.titulo_documento));
export const tituloFacturaCombinado = valor => {
 const titulo = normal(valor);
 return /\bfactura\b/.test(titulo) && /\balbaran\b/.test(titulo)
  && !/\b(?:proforma|presupuesto)\b/.test(titulo);
};
export function avisosTipoDocumento(d = {}) {
 const titulo=normal(d.titulo_documento);
 // 'otro' también entra en totales actuales: no basta con reclasificar documentos previos a la factura.
 if(esDocumentoPrevioFactura(d))
  return [{campo:'tipo',texto:'El original es una proforma o presupuesto, no una factura definitiva. Se conserva para revisión sin registrar automáticamente sus importes; comprueba si existe la factura correspondiente.'}];
 if(tituloFacturaCombinado(titulo))
  return [{campo:'tipo',codigo:'titulo_combinado',texto:'El título combina albarán y factura. Se registrará como factura tras comprobar el original y aceptar la excepción.'}];
 const esperados = titulo==='factura' ? ['factura']
  : titulo==='factura simplificada' ? ['factura','ticket']
  : titulo==='albaran' ? ['albaran'] : null;
 if(esperados && !esperados.includes(d.tipo)) return [{campo:'tipo',texto:`El título del original es «${d.titulo_documento}», pero el tipo leído no coincide. Comprueba el título principal; un campo de referencia «Albarán» dentro de una factura no cambia su tipo.`}];
 return [];
}
