// Expresiones fijas: el cliente solo elige uno de los dos criterios permitidos.
export const RECEPCION_REAL_SQL = `(SELECT MIN(r.creado) FROM facturas_recepciones r WHERE r.resultado->>'facturaId'=facturas.id::text OR (facturas.file_hash IS NOT NULL AND r.hash=facturas.file_hash))`;
export const RECEPCION_SQL = `COALESCE(${RECEPCION_REAL_SQL},NULLIF(facturas.creado_en,'')::timestamptz)`;
export const DIA_RECEPCION_SQL = `to_char(${RECEPCION_SQL} AT TIME ZONE 'Europe/Madrid','YYYY-MM-DD')`;
export function criterioFechaCompras(query={}) {
 return query.fecha_tipo==='recepcion'
  ? {campo:DIA_RECEPCION_SQL,orden:`${RECEPCION_SQL} DESC NULLS LAST, id DESC`}
  : {campo:'fecha',orden:'fecha DESC NULLS LAST, creado_en DESC, id DESC'};
}

// La subconsulta agregada lateral se ejecuta una vez por factura y se reutiliza
// para las tres columnas, el filtro y el orden. Solo sustituye SQL generado aquí.
export function listadoFacturasSQL({where='',orden,limite=500}) {
 const reutilizar = sql => sql.replaceAll(RECEPCION_REAL_SQL,'recepcion.real');
 return `SELECT facturas.*, ${reutilizar(RECEPCION_SQL)} AS recibido_en,
 ${reutilizar(DIA_RECEPCION_SQL)} AS fecha_recepcion,
 (recepcion.real IS NOT NULL) AS recepcion_confirmada
 FROM facturas LEFT JOIN LATERAL (
   SELECT MIN(r.creado) AS real FROM facturas_recepciones r
   WHERE r.resultado->>'facturaId'=facturas.id::text
      OR (facturas.file_hash IS NOT NULL AND r.hash=facturas.file_hash)
 ) recepcion ON true
 ${reutilizar(where)} ORDER BY ${reutilizar(orden)} LIMIT ${limite}`;
}
