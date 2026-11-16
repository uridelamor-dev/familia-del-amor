import {MISMO_PROVEEDOR} from './duplicados.js';
const normalizar=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fallo=(status,mensaje)=>{throw Object.assign(new Error(mensaje),{status});};

/** Relación bilateral y auditoría en una sola transacción; nunca vincula propuestas sola. */
export async function conciliarDocumentos({transaccion,puedeAcceder,autor,ahora},facturaId,albaranes) {
 const id=Number(facturaId);
 if(!Number.isSafeInteger(id)||id<=0)fallo(400,'Factura no válida.');
 if(!Array.isArray(albaranes)||albaranes.some(v=>!['number','string'].includes(typeof v)||!Number.isSafeInteger(Number(v))||Number(v)<=0))fallo(400,'Selecciona albaranes válidos.');
 const ids=[...new Set(albaranes.map(Number))];
 return transaccion(async db=>{
  const f=await db.get('SELECT * FROM facturas WHERE id=? FOR UPDATE',[id]);
  if(!f)fallo(404,'Factura no encontrada');
  if(!puedeAcceder(f.local))fallo(403,'Sin acceso');
  if((f.tipo||'factura')!=='factura')fallo(400,'Solo una factura puede agrupar albaranes.');
  // Bloquear también los antiguos: reemplazar o deshacer no debe dejar vínculos a medias.
  const filas=await db.all('SELECT * FROM facturas WHERE id=ANY(?) OR conciliado_con=? ORDER BY id FOR UPDATE',[ids,String(id)]);
  if(filas.some(a=>!puedeAcceder(a.local)))fallo(403,'Sin acceso a uno de los albaranes vinculados.');
  for(const aid of ids){
   const a=filas.find(row=>Number(row.id)===aid);
   if(!a)fallo(404,'Uno de los albaranes ya no existe. Actualiza la lista.');
   if(!puedeAcceder(a.local))fallo(403,'Sin acceso a uno de los albaranes.');
   if(a.tipo!=='albaran')fallo(400,'Solo se pueden vincular documentos de tipo albarán.');
   if(!MISMO_PROVEEDOR(f,a)||normalizar(f.local)!==normalizar(a.local)||normalizar(f.empresa)!==normalizar(a.empresa))fallo(400,'Los albaranes deben corresponder al mismo proveedor, establecimiento y empresa.');
   if(a.conciliado_con!=null&&String(a.conciliado_con)!==String(id))fallo(409,'Un albarán ya está conciliado con otra factura. Actualiza la lista.');
  }
  const fecha=ahora();
  await db.run('UPDATE facturas SET conciliado_con=NULL WHERE conciliado_con=? AND NOT (id=ANY(?))',[String(id),ids]);
  await db.run('UPDATE facturas SET conciliado_con=?,conciliado_por=?,conciliado_en=? WHERE id=?',[ids.length?JSON.stringify(ids):null,ids.length?autor:null,ids.length?fecha:null,id]);
  if(ids.length)await db.run('UPDATE facturas SET conciliado_con=? WHERE id=ANY(?)',[String(id),ids]);
  await db.run('INSERT INTO fic_auditoria (entidad,entidad_id,accion,local,worker_id,autor,detalle,creado_en) VALUES (?,?,?,?,?,?,?,?)',['facturas',id,ids.length?'conciliada':'conciliacion_deshecha',f.local||null,null,autor,ids.length?JSON.stringify({albaranes:ids,total:f.total}):null,fecha]);
  await db.run('INSERT INTO config (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['facturas_anuales_reintentar',String(Date.now())]);
  return {ok:true,mensaje:ids.length?`${ids.length} albarán(es) vinculados.`:'Vinculación deshecha.'};
 });
}
