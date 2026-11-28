// Solo excluimos material decorativo identificado con certeza y sin datos de compra.
export function esAdjuntoDecorativo(d = {}) {
  return d.es_documento_compra === false && d.confianza_clasificacion === 'alta'
    && ['logo','firma','imagen_corporativa','icono_social'].includes(d.clase_adjunto)
    && (d.tipo == null || d.tipo === '' || d.tipo === 'otro')
    && !d._lecturaIncompleta
    && !['ilegible','recortada'].includes(d.calidad_imagen)
    && (d.campos_dudosos == null || Array.isArray(d.campos_dudosos) && d.campos_dudosos.length === 0)
    && !d.nota_manuscrita && !d.fecha && !d.fecha_texto && !d.titulo_documento
    && [d.total,d.base_imponible,d.cuota_iva,d.numero_factura].every(v => v == null || v === '')
    && (d.iva_desglose == null || Array.isArray(d.iva_desglose) && d.iva_desglose.length === 0)
    && (d.lineas == null || (Array.isArray(d.lineas) && d.lineas.length === 0));
}


const TIPOS_INFORMATIVOS = {
  voucher_datafono: 'un justificante de datáfono',
  certificado_seguro: 'un certificado o condicionado de seguro',
  extracto_cuenta: 'un extracto de cuenta',
};

export function tipoInformativo(d = {}) {
  if (d.tipo !== 'otro' || d.es_documento_compra !== false || d.confianza_clasificacion !== 'alta'
      || d.calidad_imagen !== 'legible' || d._lecturaIncompleta || d.campos_dudosos?.length
      || d.numero_factura || d.lineas?.length || d.iva_desglose?.length) return null;
  return Object.hasOwn(TIPOS_INFORMATIVOS, d.clase_adjunto) ? TIPOS_INFORMATIVOS[d.clase_adjunto] : null;
}
