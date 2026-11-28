import {CAMPOS_PAGINAS,huellaPaginas} from './paginas-completar.js';
import {createHash} from 'node:crypto';
import {decidirPaginas} from './paginas-clasificacion.js';
export const PAGINAS_SCHEMA=`
ALTER TABLE facturas_recepciones ADD COLUMN IF NOT EXISTS contexto JSONB;
CREATE TABLE IF NOT EXISTS facturas_paginas (
 id BIGSERIAL PRIMARY KEY, primera BIGINT NOT NULL REFERENCES facturas_recepciones(id),
 segunda BIGINT NOT NULL REFERENCES facturas_recepciones(id), estado TEXT NOT NULL,
 pruebas JSONB NOT NULL, destino BIGINT REFERENCES facturas_recepciones(id),
 autor TEXT, creado TIMESTAMPTZ NOT NULL DEFAULT NOW(), actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(primera,segunda)
);
CREATE INDEX IF NOT EXISTS facturas_recepciones_remitente ON facturas_recepciones ((contexto->>'grupo'),(contexto->>'remitente'),creado) WHERE contexto IS NOT NULL;
`;
export function mismoOrigen(a,b){return !!a.contexto?.grupo&&!!a.contexto?.remitente&&a.contexto.grupo===b.contexto?.grupo&&a.contexto.remitente===b.contexto?.remitente&&a.local===b.local;}
const abiertos=['pendiente','leyendo','revision','paginas','error'];
export const paginaPendiente = f => abiertos.includes(f?.estado)
  && !f.resultado?.aprobacion && !f.resultado?.facturaId && !f.resultado?.pendienteId
  && !f.resultado?.resolucion && !f.resultado?.esperaConfirmacion;

export const PAGINAS_ELEGIBLES_SQL = `estado IN ('pendiente','revision','error','leyendo','paginas')
  AND original IS NOT NULL AND resultado->>'aprobacion' IS NULL
  AND resultado->>'facturaId' IS NULL AND resultado->>'pendienteId' IS NULL
  AND resultado->>'resolucion' IS NULL AND resultado->>'esperaConfirmacion' IS NULL`;

export async function proponerPaginas(tx, ids, estado, pruebas, lecturaId = null) {
 const filas=await tx.all('SELECT id,local,estado,resultado,original IS NOT NULL AS tiene_original FROM facturas_recepciones WHERE id=ANY(?::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 if(filas.length!==2 || !filas[0].local || filas[0].local!==filas[1].local ||
    filas.some(f=>!f.tiene_original || !paginaPendiente(f) || (f.estado==='leyendo' && String(f.id)!==String(lecturaId)))) return null;
 const existente=await tx.get('SELECT id,estado FROM facturas_paginas WHERE primera=? AND segunda=?',ids);
 const reabrirSugerencia = pruebas?.manual && ['distintas','repetida'].includes(existente?.estado);
 if(existente && !reabrirSugerencia && !['revision','automatica'].includes(existente.estado)) return existente;
 const activa=await tx.get(`SELECT p.id FROM facturas_paginas p
   JOIN facturas_recepciones a ON a.id=p.primera
   JOIN facturas_recepciones b ON b.id=p.segunda
   WHERE p.estado IN ('revision','automatica') AND p.id IS DISTINCT FROM ?::bigint
     AND (p.primera=ANY(?::bigint[]) OR p.segunda=ANY(?::bigint[]))
     AND a.local=b.local
     AND a.id IN (SELECT id FROM facturas_recepciones WHERE ${PAGINAS_ELEGIBLES_SQL})
     AND b.id IN (SELECT id FROM facturas_recepciones WHERE ${PAGINAS_ELEGIBLES_SQL}) LIMIT 1`,
   [existente?.id ?? null,ids,ids]);
 if(activa) return null;
 const p=existente
   ? await tx.run("UPDATE facturas_paginas SET estado='revision',pruebas=COALESCE(?::jsonb,pruebas),actualizado=NOW() WHERE id=? RETURNING id,estado",
      [reabrirSugerencia ? JSON.stringify(pruebas) : null,existente.id])
   : await tx.run('INSERT INTO facturas_paginas (primera,segunda,estado,pruebas) VALUES (?,?,?,?::jsonb) ON CONFLICT(primera,segunda) DO NOTHING RETURNING id,estado',
      [...ids,estado,JSON.stringify(pruebas)]);
 if(p?.estado==='revision'){
  await tx.run(`UPDATE facturas_recepciones SET estado='paginas',error=NULL,actualizado=NOW()
    WHERE id=ANY(?::bigint[])`,[ids]);
 }
 return p;
}

export function crearPaginas({db,transaccion,comparar,combinar,completar}){
 async function unir(p,autor,{soloPendientes=false}={}){
  if(!autor)throw new Error('La unión requiere confirmación explícita.');
  let a=await db.get('SELECT * FROM facturas_recepciones WHERE id=?',[p.primera]);
  let b=await db.get('SELECT * FROM facturas_recepciones WHERE id=?',[p.segunda]);
  if(!a||!b||!(mismoOrigen(a,b)||(p.pruebas?.manual&&a.local&&a.local===b.local))||!a.original||!b.original)throw new Error('Los originales ya no están disponibles para unirlos');
  if(![...abiertos,'registrado'].includes(b.estado)||![...abiertos,'registrado'].includes(a.estado)||(a.estado==='registrado'&&b.estado==='registrado'))throw new Error('Los documentos han cambiado. Actualiza la lista.');
  if(soloPendientes && [a,b].some(f=>!paginaPendiente(f) || f.estado==='leyendo')) {
   throw new Error('Los documentos han cambiado. Actualiza la lista.');
  }
  const docs=p.pruebas?.documentos;
  const orden=docs?.[0]?.pagina>docs?.[1]?.pagina?[b,a]:[a,b];
  const buffer=await combinar(orden.map(f=>({buffer:f.original,mimetype:f.mime,originalname:f.nombre})));
  if(buffer.length>20*1024*1024)throw new Error('El documento unido supera 20 MB. Revisa los originales antes de unir.');
  if(b.estado==='registrado')[a,b]=[b,a];
  if(a.estado==='registrado')return completar({a,b,p,buffer,autor});
  const hash=createHash('sha256').update(buffer).digest('hex');
  return transaccion(async tx=>{
   const filas=await tx.all('SELECT * FROM facturas_recepciones WHERE id=ANY(?::bigint[]) ORDER BY id FOR UPDATE',[[a.id,b.id]]);
   if(filas.length!==2||filas.some(f=>!paginaPendiente(f) || f.estado==='leyendo'))throw new Error('Los documentos han cambiado. Actualiza la lista.');
   const actual=await tx.get('SELECT estado FROM facturas_paginas WHERE id=? FOR UPDATE',[p.id]);
   if(actual?.estado!=='revision')throw new Error('Esta propuesta ya se ha resuelto');
   const nuevo=await tx.run(`INSERT INTO facturas_recepciones (clave,hash,canal,local,nombre,mime,original,contexto)
    VALUES (?,?,?,?,'Documento con varias páginas.pdf','application/pdf',?,?::jsonb) RETURNING id`,['paginas:'+p.id,hash,a.canal,a.local,buffer,JSON.stringify({...a.contexto,agrupacion:p.id})]);
   await tx.run("UPDATE facturas_recepciones SET estado='sustituido',resultado=?::jsonb,error=NULL,actualizado=NOW() WHERE id=ANY(?::bigint[])",[JSON.stringify({paginas:true,recepcionId:nuevo.id}),[a.id,b.id]]);
   await tx.run("UPDATE facturas_paginas SET estado='unidas',destino=?,autor=?,actualizado=NOW() WHERE id=?",[nuevo.id,autor,p.id]);
   // Un único resumen por factura, con todas las fotos originales todavía enlazadas.
   await tx.run('UPDATE facturas_avisos_grupo SET recepcion_id=? WHERE recepcion_id=ANY(?::bigint[])',[nuevo.id,[a.id,b.id]]);
   return {ok:true,recepcionId:nuevo.id};
  });
 }
 async function antes(f){
  if(!f.contexto?.grupo||f.contexto.agrupacion||!f.original)return false;
  const candidatos=await db.all(`SELECT * FROM facturas_recepciones r WHERE id<>? AND local=?
   AND contexto->>'grupo'=? AND contexto->>'remitente'=? AND ${PAGINAS_ELEGIBLES_SQL}
   AND estado IN ('pendiente','revision','error')
   AND NOT EXISTS (SELECT 1 FROM facturas_paginas p
     WHERE p.primera=LEAST(r.id,?::bigint) AND p.segunda=GREATEST(r.id,?::bigint)
       AND p.estado NOT IN ('revision','automatica'))
   AND ABS(EXTRACT(EPOCH FROM (creado-?::timestamptz)))<=1800
   ORDER BY id DESC LIMIT 6`,[f.id,f.local,f.contexto.grupo,f.contexto.remitente,f.id,f.id,f.creado]);
  for(const candidato of candidatos){
   const [a,b]=Number(candidato.id)<Number(f.id)?[candidato,f]:[f,candidato];
   if(a.hash===b.hash||a.original.length+b.original.length>16*1024*1024)continue;
   const existente=await db.get('SELECT estado,pruebas FROM facturas_paginas WHERE primera=? AND segunda=?',[a.id,b.id]);
   if(existente && !['revision','automatica'].includes(existente.estado))continue;
   const pruebas=existente ? existente.pruebas : structuredClone(await comparar(a,b));
   const sugerencia=existente ? 'revision' : decidirPaginas(pruebas);
   const estado=sugerencia==='automatica'?'revision':sugerencia;
   const p=await transaccion(tx=>proponerPaginas(tx,[a.id,b.id],estado,pruebas,f.id));
   if(p?.estado==='revision')return true;
  }
  return false;
 }
 async function separar(p,autor){
  return transaccion(async tx=>{
   await tx.all('SELECT id FROM facturas_recepciones WHERE id=ANY(?::bigint[]) ORDER BY id FOR UPDATE',[[p.primera,p.segunda]]);
   const actual=await tx.get('SELECT * FROM facturas_paginas WHERE id=? FOR UPDATE',[p.id]);
   if(actual?.estado==='separadas')return {ok:true};
   if(actual?.estado!=='revision')throw new Error('Esta propuesta ya se ha resuelto');
   await tx.run("UPDATE facturas_paginas SET estado='separadas',autor=?,actualizado=NOW() WHERE id=?",[autor,p.id]);
   await tx.run(`UPDATE facturas_recepciones SET estado=CASE WHEN resultado->'datos' IS NOT NULL THEN 'revision' ELSE 'pendiente' END,
     error=NULL,proximo=NOW(),actualizado=NOW() WHERE id=ANY(?::bigint[]) AND estado='paginas'`,[[p.primera,p.segunda]]);
   return {ok:true};
  });
 }
 async function deshacer(p,autor){
  return transaccion(async tx=>{
   const actual=await tx.get('SELECT * FROM facturas_paginas WHERE id=? FOR UPDATE',[p.id]);
   if(actual?.estado!=='unidas')throw new Error('La unión ya no está activa');
   const copia=actual.pruebas?.completada;
   if(copia){
    const f=await tx.get('SELECT * FROM facturas WHERE id=? FOR UPDATE',[copia.facturaId]);
    const lineas=await tx.all('SELECT * FROM factura_lineas WHERE factura_id=? ORDER BY id',[copia.facturaId]);
    if(!f||huellaPaginas(f,lineas)!==copia.huella)throw new Error('La factura se ha editado después. Revisa sus cambios antes de deshacer la unión.');
    await tx.run(`UPDATE facturas SET ${CAMPOS_PAGINAS.map(k=>k+'=?').join(',')},sheet_synced=0 WHERE id=?`,[...CAMPOS_PAGINAS.map(k=>copia.antes[k]??null),f.id]);
    await tx.run('DELETE FROM factura_lineas WHERE factura_id=?',[f.id]);
    if(copia.lineas.length)await tx.run('INSERT INTO factura_lineas SELECT * FROM json_populate_recordset(NULL::factura_lineas,?::json)',[JSON.stringify(copia.lineas)]);
    await tx.run("UPDATE facturas_recepciones SET estado='pendiente',resultado=NULL,error=NULL,proximo=NOW() WHERE id=?",[copia.recepcionAnadida]);
    await tx.run("UPDATE facturas_recepciones SET estado='registrado',resultado=?::jsonb,error=NULL WHERE id=?",[JSON.stringify({facturaId:f.id,driveUrl:copia.antes.drive_url}),copia.recepcionAnterior]);
    await tx.run("UPDATE facturas_recepciones SET estado='sustituido',error=NULL WHERE id=?",[actual.destino]);
   }else{
    const destino=await tx.get('SELECT estado FROM facturas_recepciones WHERE id=? FOR UPDATE',[actual.destino]);
    if(!['pendiente','revision','error'].includes(destino?.estado))throw new Error('El documento unido ya se ha registrado. Revisa la factura antes de separarla para no duplicar los importes.');
    await tx.run("UPDATE facturas_recepciones SET estado='sustituido',error=NULL WHERE id=?",[actual.destino]);
    await tx.run("UPDATE facturas_recepciones SET estado='pendiente',resultado=NULL,error=NULL,proximo=NOW() WHERE id=ANY(?::bigint[])",[[p.primera,p.segunda]]);
    await tx.run("UPDATE facturas_avisos_grupo SET recepcion_id=CASE WHEN mensaje=(SELECT contexto->>'mensaje' FROM facturas_recepciones WHERE id=?) THEN ?::bigint ELSE ?::bigint END WHERE recepcion_id=?",[p.primera,p.primera,p.segunda,actual.destino]);
   }
   await tx.run("UPDATE facturas_paginas SET estado='separadas',autor=?,actualizado=NOW() WHERE id=?",[autor,p.id]);
   return {ok:true};
  });
 }
 return {antes,unir,separar,deshacer};
}
