// Sólo el título principal copiado literalmente: nunca palabras en referencias o conceptos.
const normal = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
export const esDocumentoPrevioFactura = d => ['factura proforma','proforma','presupuesto'].includes(normal(d?.titulo_documento));
export function avisosTipoDocumento(d = {}) {
 const titulo=normal(d.titulo_documento);
 // 'otro' también entra en totales actuales: no basta con reclasificar documentos previos a la factura.
 if(esDocumentoPrevioFactura(d))
  return [{campo:'tipo',texto:'El original es una proforma o presupuesto, no una factura definitiva. Se conserva para revisión sin registrar automáticamente sus importes; comprueba si existe la factura correspondiente.'}];
 const esperados = titulo==='factura' ? ['factura']
  : titulo==='factura simplificada' ? ['factura','ticket']
  : titulo==='albaran' ? ['albaran'] : null;
 if(esperados && !esperados.includes(d.tipo)) return [{campo:'tipo',texto:`El título del original es «${d.titulo_documento}», pero el tipo leído no coincide. Comprueba el título principal; un campo de referencia «Albarán» dentro de una factura no cambia su tipo.`}];
 // No escoger entre dos títulos, ni convertir rectificativas o abonos por intuición.
 if(/^(?:factura\s*[/;|]\s*albaran|albaran\s*[/;|]\s*factura)$/.test(titulo))
  return [{campo:'tipo',texto:'La cabecera contiene títulos de factura y albarán. Confirma si son documentos distintos o un título combinado antes de clasificarlo.'}];
 return [];
}
