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
const abiertos=['pendiente','leyendo','revision','paginas'];
export function crearPaginas({db,transaccion,comparar,combinar,completar}){
 async function unir(p,autor='automático'){
  let a=await db.get('SELECT * FROM facturas_recepciones WHERE id=?',[p.primera]);
  let b=await db.get('SELECT * FROM facturas_recepciones WHERE id=?',[p.segunda]);
  if(!a||!b||!(mismoOrigen(a,b)||(p.pruebas?.manual&&a.local&&a.local===b.local))||!a.original||!b.original)throw new Error('Los originales ya no están disponibles para unirlos');
  if(![...abiertos,'registrado'].includes(b.estado)||![...abiertos,'registrado'].includes(a.estado)||(a.estado==='registrado'&&b.estado==='registrado'))throw new Error('Los documentos han cambiado. Actualiza la lista.');
  const docs=p.pruebas?.documentos;
  const orden=docs?.[0]?.pagina>docs?.[1]?.pagina?[b,a]:[a,b];
  const buffer=await combinar(orden.map(f=>({buffer:f.original,mimetype:f.mime,originalname:f.nombre})));
  if(buffer.length>20*1024*1024)throw new Error('El documento unido supera 20 MB. Revisa los originales antes de unir.');
  if(b.estado==='registrado')[a,b]=[b,a];
  if(a.estado==='registrado')return completar({a,b,p,buffer,autor});
  const hash=createHash('sha256').update(buffer).digest('hex');
  return transaccion(async tx=>{
   const filas=await tx.all('SELECT * FROM facturas_recepciones WHERE id=ANY(?::bigint[]) ORDER BY id FOR UPDATE',[[a.id,b.id]]);
   if(filas.length!==2||filas.some(f=>!abiertos.includes(f.estado)))throw new Error('Los documentos han cambiado. Actualiza la lista.');
   const actual=await tx.get('SELECT estado FROM facturas_paginas WHERE id=? FOR UPDATE',[p.id]);
   if(!['revision','automatica'].includes(actual?.estado))throw new Error('Esta propuesta ya se ha resuelto');
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
  const candidatos=await db.all(`SELECT * FROM facturas_recepciones WHERE id<>? AND local=?
   AND contexto->>'grupo'=? AND contexto->>'remitente'=? AND original IS NOT NULL
   AND estado IN ('pendiente','revision','registrado','error') AND ABS(EXTRACT(EPOCH FROM (creado-?::timestamptz)))<=1800
   ORDER BY id DESC LIMIT 6`,[f.id,f.local,f.contexto.grupo,f.contexto.remitente,f.creado]);
  for(const candidato of candidatos){
   const [a,b]=Number(candidato.id)<Number(f.id)?[candidato,f]:[f,candidato];
   if(a.hash===b.hash||a.original.length+b.original.length>16*1024*1024)continue;
   const existente=await db.get('SELECT * FROM facturas_paginas WHERE primera=? AND segunda=?',[a.id,b.id]);
   if(existente){
    if(existente.estado==='automatica'){await unir(existente);return true;}
    if(existente.estado==='revision'){await db.run("UPDATE facturas_recepciones SET estado='paginas',error='Comprueba las páginas del documento antes de registrar.' WHERE id=ANY(?::bigint[]) AND estado IN ('pendiente','leyendo','revision','error')",[[a.id,b.id]]);return true;}
    continue;
   }
   const pruebas=structuredClone(await comparar(a,b));let estado=decidirPaginas(pruebas);
   if(estado==='automatica'){const segunda=await comparar(a,b);if(decidirPaginas(segunda)!=='automatica'||JSON.stringify(segunda.documentos)!==JSON.stringify(pruebas.documentos))estado='revision';pruebas.contraste=segunda;}
   if(estado==='automatica'&&(a.estado==='registrado'||b.estado==='registrado'))estado='revision';
   const p=await db.run('INSERT INTO facturas_paginas (primera,segunda,estado,pruebas) VALUES (?,?,?,?::jsonb) ON CONFLICT(primera,segunda) DO NOTHING RETURNING *',[a.id,b.id,estado,JSON.stringify(pruebas)]);
   if(!p)continue;
   if(estado==='automatica'){await unir(p);return true;}
   if(estado==='revision'){
    await db.run("UPDATE facturas_recepciones SET estado='paginas',error='Posibles páginas del mismo documento. Comprueba ambas fotos antes de registrar.',actualizado=NOW() WHERE id=ANY(?::bigint[]) AND estado IN ('pendiente','leyendo','revision')",[[a.id,b.id]]);
    return true;
   }
  }
  return false;
 }
 async function separar(p,autor){
  return transaccion(async tx=>{
   const actual=await tx.get('SELECT * FROM facturas_paginas WHERE id=? FOR UPDATE',[p.id]);
   if(actual?.estado!=='revision')throw new Error('Esta propuesta ya se ha resuelto');
   await tx.run("UPDATE facturas_paginas SET estado='separadas',autor=?,actualizado=NOW() WHERE id=?",[autor,p.id]);
   await tx.run("UPDATE facturas_recepciones SET estado=CASE WHEN resultado->'datos' IS NOT NULL THEN 'revision' ELSE 'pendiente' END,error=NULL,proximo=NOW(),actualizado=NOW() WHERE id=ANY(?::bigint[]) AND estado='paginas'",[[p.primera,p.segunda]]);
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
