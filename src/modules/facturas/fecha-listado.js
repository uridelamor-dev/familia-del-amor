// Expresiones fijas: el cliente solo elige uno de los dos criterios permitidos.
export const RECEPCION_REAL_SQL = `(SELECT MIN(r.creado) FROM facturas_recepciones r WHERE r.resultado->>'facturaId'=facturas.id::text OR (facturas.file_hash IS NOT NULL AND r.hash=facturas.file_hash))`;
export const RECEPCION_SQL = `COALESCE(${RECEPCION_REAL_SQL},NULLIF(facturas.creado_en,'')::timestamptz)`;
export const DIA_RECEPCION_SQL = `to_char(${RECEPCION_SQL} AT TIME ZONE 'Europe/Madrid','YYYY-MM-DD')`;
export function criterioFechaCompras(query={}) {
 return query.fecha_tipo==='recepcion'
  ? {campo:DIA_RECEPCION_SQL,orden:`${RECEPCION_SQL} DESC NULLS LAST, id DESC`}
  : {campo:'fecha',orden:'fecha DESC NULLS LAST, creado_en DESC, id DESC'};
}
