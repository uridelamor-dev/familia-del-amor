// Solo excluimos material decorativo identificado con certeza y sin datos de compra.
export function esAdjuntoDecorativo(d = {}) {
  return d.es_documento_compra === false && d.confianza_clasificacion === 'alta'
    && ['logo','firma','imagen_corporativa'].includes(d.clase_adjunto)
    && d.tipo === 'otro'
    && [d.total,d.base_imponible,d.cuota_iva,d.numero_factura].every(v => v == null || v === '')
    && (d.iva_desglose == null || Array.isArray(d.iva_desglose) && d.iva_desglose.length === 0)
    && (d.lineas == null || (Array.isArray(d.lineas) && d.lineas.length === 0));
}
