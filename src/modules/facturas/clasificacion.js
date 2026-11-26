// Solo excluimos material decorativo identificado con certeza y sin datos de compra.
export function esAdjuntoDecorativo(d = {}) {
  return d.es_documento_compra === false && d.confianza_clasificacion === 'alta'
    && ['logo','firma','imagen_corporativa'].includes(d.clase_adjunto)
    && (d.tipo == null || d.tipo === '' || d.tipo === 'otro')
    && !d._lecturaIncompleta
    && !['ilegible','recortada'].includes(d.calidad_imagen)
    && (d.campos_dudosos == null || Array.isArray(d.campos_dudosos) && d.campos_dudosos.length === 0)
    && !d.fecha && !d.fecha_texto && !d.titulo_documento
    && [d.total,d.base_imponible,d.cuota_iva,d.numero_factura].every(v => v == null || v === '')
    && (d.iva_desglose == null || Array.isArray(d.iva_desglose) && d.iva_desglose.length === 0)
    && (d.lineas == null || (Array.isArray(d.lineas) && d.lineas.length === 0));
}
