import {tareaHumana,motivoAtencion} from './motivo-atencion.js';
import { ARCHIVO_CTE, jidBandeja } from './bandeja-historial.js';
import { IDENTIDAD_CTE, telefonoContacto } from './contacto-conversacion.js';
// Las conversaciones internas y los grupos nunca entran en la bandeja de clientes.
export const CLIENTE_SQL = `w.jid ~ '^[0-9]+@(s[.]whatsapp[.]net|lid)$'
 AND NOT EXISTS (SELECT 1 FROM whatsapp_messages i WHERE i.jid=w.jid AND i.tipo='interno')`;
export function jidValido(jid) { return /^\d+@(s\.whatsapp\.net|lid)$/.test(String(jid || '')); }
// Un mensaje sin respuesta o sin leer no implica una gestión humana.
const PENDIENTE_SQL = `(NOT w.interno AND w.jid NOT LIKE '%@g.us' AND
 ((a.estado IN ('pendiente','en_curso') AND (a.motivo<>'sin_respuesta' OR a.estado='en_curso')) OR
 (w.estado_ia='pausada' AND (COALESCE(w.pausado_por,'')<>'sara' OR w.pausa_motivo='pidio_persona'))))`;
export function conversacionPendiente(cliente,tarea){
 if(cliente.solo_lectura||cliente.interno||cliente.jid?.endsWith('@g.us'))return false;
 return Boolean(tareaHumana(tarea)||
 (cliente.estado_ia==='pausada'&&(cliente.pausado_por!=='sara'||cliente.pausa_motivo==='pidio_persona')));
}
export function motivoPendiente(cliente,tarea){
 if(!conversacionPendiente(cliente,tarea))return null;
 return motivoAtencion(tarea||{},cliente);
}
export function registrarConversaciones(app, {auth, pool, enviar, listo, bloquear, olvidar, resolverTelefono,atencion}) {
 const permiso=auth(['direccion','marketing']);
 const ruta='/api/conversaciones';
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){console.error('[Conversaciones]',e.message);res.status(e.status||500).json({ok:false,error:e.status?e.message:'No se pudo completar. Actualiza la conversación antes de volver a enviar.'});}};
 const existe=async jid=>{
  if(!jidValido(jid)) throw Object.assign(Error('Conversación no válida'),{status:400});
  const r=await pool.query(`WITH ${ARCHIVO_CTE} SELECT w.jid FROM ultimos w WHERE w.jid=$1 AND NOT w.interno AND w.jid NOT LIKE '%@g.us' LIMIT 1`,[jid]);
  if(!r.rows.length) throw Object.assign(Error('Conversación no disponible'),{status:404});
 };
 const estado=async(jid,pausa,usuario)=>{
  await pool.query(`INSERT INTO wa_clientes(jid,telefono,estado_ia,pausa_motivo,pausado_en,pausado_por)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(jid) DO UPDATE SET estado_ia=EXCLUDED.estado_ia,
   pausa_motivo=EXCLUDED.pausa_motivo,pausado_en=EXCLUDED.pausado_en,pausado_por=EXCLUDED.pausado_por`,
   [jid,jid.split('@')[0],pausa?'pausada':'activa',pausa?'manual':null,pausa?new Date().toISOString():null,pausa?usuario:null]);
  olvidar(jid);
 };
 const conIdentidades=async(jid,fn)=>{
  const r=await pool.query('SELECT jid FROM wa_bandeja_chats WHERE jid=$1 OR COALESCE(telefono_jid,jid)=COALESCE((SELECT telefono_jid FROM wa_bandeja_chats WHERE jid=$1),$1) UNION SELECT COALESCE((SELECT telefono_jid FROM wa_bandeja_chats WHERE jid=$1),$1)',[jid]);
  const jids=[...new Set([jid,...r.rows.map(x=>x.jid)])].sort();
  const tomar=i=>i===jids.length?fn(jids):bloquear(jids[i],()=>tomar(i+1));
  return tomar(0);
 };
 const visibleSQL=`w.jid ~ '^[0-9-]+@(s[.]whatsapp[.]net|lid|g[.]us)$' AND ($1::boolean OR (NOT w.interno AND w.jid NOT LIKE '%@g.us'))`;
 const identidadArchivo=IDENTIDAD_CTE.replace("NULLIF(trim(t.nombre_wa),'')","NULLIF(trim(t.nombre_wa),''),NULLIF(trim(t.nombre_archivo),'')")
  .replace('LEFT JOIN wa_clientes c ON c.jid=w.jid',`LEFT JOIN LATERAL(SELECT x.* FROM wa_clientes x LEFT JOIN alias a ON a.jid=x.jid WHERE COALESCE(a.canon,x.jid)=w.jid ORDER BY (x.estado_ia='pausada') DESC NULLS LAST,(x.jid=w.jid) DESC LIMIT 1)c ON true`)
  .replace('LEFT JOIN wa_contacto_vinculos v ON v.jid=t.jid',`LEFT JOIN LATERAL(SELECT x.* FROM wa_contacto_vinculos x LEFT JOIN alias a ON a.jid=x.jid WHERE COALESCE(a.canon,x.jid)=t.jid ORDER BY (x.jid=t.jid) DESC,x.actualizado_en DESC LIMIT 1)v ON true`);
 app.get(ruta,permiso,wrap(async(req,res)=>{
  const q=String(req.query.q||'').slice(0,100), offset=Math.max(0,Math.floor(Number(req.query.offset)||0));
  const r=await pool.query(`WITH ${ARCHIVO_CTE}, ${identidadArchivo},
   no_leidos AS (SELECT e.jid,count(*)::int AS cantidad FROM eventos e
    LEFT JOIN wa_bandeja_lecturas lectura ON lectura.jid=e.jid AND lectura.usuario=$6
    WHERE e.tipo IN ('recibido','intercambio') AND (lectura.fecha IS NULL OR (e.fecha,e.clave)>(lectura.fecha,lectura.clave)) GROUP BY e.jid)
   SELECT w.*,w.telefono_visible AS telefono, a.estado AS atencion_estado,a.responsable,a.motivo AS atencion_motivo,
   (w.interno OR w.jid LIKE '%@g.us') AS solo_lectura,
   COALESCE(w.estado_ia,'activa') AS estado_ia,
   COALESCE(${PENDIENTE_SQL},false) AS pendiente,
   COALESCE(leidos.cantidad,0) AS no_leidos, count(*) OVER()::int AS total
   FROM identidades w LEFT JOIN wa_atencion a ON a.jid=w.jid
   LEFT JOIN no_leidos leidos ON leidos.jid=w.jid
   WHERE ${visibleSQL} AND ($2='' OR w.nombre ILIKE '%'||$2||'%' OR COALESCE(w.telefono_visible,'') ILIKE '%'||$2||'%')
   AND ($3::boolean=false OR ${PENDIENTE_SQL})
   AND ($5='todos' OR ($5='clientes' AND NOT w.interno AND w.jid NOT LIKE '%@g.us') OR ($5='internas' AND (w.interno OR w.jid LIKE '%@g.us')))
   AND ($7::boolean=false OR leidos.cantidad>0)
   ORDER BY COALESCE(w.fijado,0) DESC,w.creado_en::timestamptz DESC NULLS LAST,w.jid LIMIT 51 OFFSET $4`,[req.user?.rol==='direccion',q,req.query.pendientes==='1',offset,['clientes','internas'].includes(req.query.tipo)?req.query.tipo:'todos',String(req.user.username),req.query.no_leidos==='1']);
  const sync=await pool.query('SELECT actualizado_en,estado FROM wa_bandeja_sync WHERE id=1');
  res.json({ok:true,data:r.rows.slice(0,50),mas:r.rows.length>50,total:r.rows[0]?.total||0,sync:sync.rows[0]||null,connected:listo()});
 }));
 app.get(ruta+'/detalle',permiso,wrap(async(req,res)=>{
  const jid=String(req.query.jid||'');if(!jidBandeja(jid))return res.status(400).json({ok:false,error:'Conversación no válida'});
  const c=await pool.query(`WITH ${ARCHIVO_CTE}, ${identidadArchivo} SELECT w.*,telefono_visible AS telefono,(w.interno OR w.jid LIKE '%@g.us') AS solo_lectura FROM identidades w WHERE ${visibleSQL} AND w.jid=$2`,[req.user?.rol==='direccion',jid]);
  if(!c.rows.length)return res.status(404).json({ok:false,error:'Conversación no disponible'});
  if(jid.endsWith('@lid')&&resolverTelefono){
   const tel=telefonoContacto(await resolverTelefono(jid));
   if(tel)await pool.query(`INSERT INTO wa_clientes(jid,telefono) VALUES($1,$2) ON CONFLICT(jid) DO UPDATE SET telefono=EXCLUDED.telefono`,[jid,tel]);
  }
  let cursor=null;try{cursor=req.query.cursor?JSON.parse(String(req.query.cursor)):null;}catch{}
  if(cursor&&(!Array.isArray(cursor)||cursor.length!==2||!Number.isFinite(Date.parse(cursor[0]))))return res.status(400).json({ok:false,error:'Página no válida'});
  const r=await pool.query(`WITH ${ARCHIVO_CTE} SELECT clave AS id,mensaje,respuesta,tipo,fecha AS creado_en,COALESCE((SELECT jsonb_agg(a.id) FROM wa_adjuntos a JOIN originales o ON o.canon=COALESCE((SELECT canon FROM alias WHERE jid=a.jid),a.jid) AND o.mensaje_id=a.mensaje_id WHERE 'w'||o.id=e.clave),adjuntos) AS adjuntos FROM eventos e WHERE jid=$1 AND ($2::timestamptz IS NULL OR (fecha,clave)<($2::timestamptz,$3::text)) ORDER BY fecha DESC,clave DESC LIMIT 101`,[jid,cursor?.[0]||null,cursor?.[1]||'']);
  const datos=r.rows.slice(0,100).reverse();
  const ids=[...new Set(datos.flatMap(m=>Array.isArray(m.adjuntos)?m.adjuntos:[]))].filter(id=>/^[0-9a-f-]{36}$/i.test(id));
  const archivos=ids.length?(await pool.query("SELECT id,nombre,mime FROM wa_adjuntos WHERE id=ANY($1::uuid[]) AND creado_en >= NOW()-INTERVAL '30 days'",[ids])).rows:[];
  const porId=new Map(archivos.map(a=>[a.id,a]));
  for(const m of datos)m.adjuntos=(Array.isArray(m.adjuntos)?m.adjuntos:[]).map(id=>porId.get(id)||{id,disponible:false});
  const tarea=(await pool.query('SELECT * FROM wa_atencion WHERE jid=$1',[jid])).rows[0]||null;
  res.json({ok:true,pendiente:conversacionPendiente(c.rows[0],tarea),motivo_pendiente:motivoPendiente(c.rows[0],tarea),data:datos,mas:r.rows.length>100,cursor:datos.length?[datos[0].creado_en,datos[0].id]:null,cliente:c.rows[0],atencion:tarea,connected:listo()});
 }));
 // Las lecturas pertenecen a cada usuario del panel, no al estado de atención de Sara.
 app.post(ruta+'/leer',permiso,wrap(async(req,res)=>{
  const {jid,hasta}=req.body||{};
  if(!jidBandeja(jid)||!Array.isArray(hasta)||hasta.length!==2||!Number.isFinite(Date.parse(hasta[0]))||typeof hasta[1]!=='string')return res.status(400).json({ok:false,error:'Lectura no válida'});
  const visible=await pool.query(`WITH ${ARCHIVO_CTE} SELECT e.fecha,e.clave FROM eventos e JOIN ultimos w ON w.jid=e.jid WHERE ${visibleSQL} AND w.jid=$2 AND e.fecha=$3::timestamptz AND e.clave=$4`,[req.user?.rol==='direccion',jid,hasta[0],hasta[1]]);
  if(!visible.rows.length)return res.status(404).json({ok:false,error:'Mensaje no disponible'});
  await pool.query(`INSERT INTO wa_bandeja_lecturas(usuario,jid,fecha,clave) VALUES($1,$2,$3,$4)
   ON CONFLICT(usuario,jid) DO UPDATE SET fecha=EXCLUDED.fecha,clave=EXCLUDED.clave
   WHERE (wa_bandeja_lecturas.fecha,wa_bandeja_lecturas.clave)<(EXCLUDED.fecha,EXCLUDED.clave)`,[String(req.user.username),jid,visible.rows[0].fecha,visible.rows[0].clave]);
  res.json({ok:true});
 }));
 app.get(ruta+'/adjunto/:id',permiso,wrap(async(req,res)=>{
  const jid=String(req.query.jid||''),id=String(req.params.id||'');
  if(!jidBandeja(jid)||!/^[0-9a-f-]{36}$/i.test(id))return res.status(404).json({ok:false,error:'Archivo no disponible'});
  const r=await pool.query(`WITH ${ARCHIVO_CTE} SELECT a.nombre,a.mime,a.datos FROM wa_adjuntos a LEFT JOIN alias x ON x.jid=a.jid JOIN ultimos w ON w.jid=COALESCE(x.canon,a.jid) WHERE ${visibleSQL} AND w.jid=$2 AND a.id=$3::uuid AND a.creado_en >= NOW()-INTERVAL '30 days'`,[req.user?.rol==='direccion',jid,id]);
  const a=r.rows[0];if(!a)return res.status(404).json({ok:false,error:'El archivo ha caducado o no está disponible.'});
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':a.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(a.nombre)}`});res.send(a.datos);
 }));
 app.get(ruta+'/contactos',permiso,wrap(async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,100);
  if(q.length<2)return res.json({ok:true,data:[]});
  const r=await pool.query("SELECT id,trim(concat_ws(' ',nombre,apellidos)) AS nombre,telefono FROM leads WHERE concat_ws(' ',nombre,apellidos) ILIKE '%'||$1||'%' OR telefono ILIKE '%'||$1||'%' ORDER BY nombre,apellidos,id LIMIT 30",[q]);
  res.json({ok:true,data:r.rows});
 }));
 app.post(ruta+'/vincular',permiso,wrap(async(req,res)=>{
  const {jid,lead_id}=req.body||{};await existe(jid);
  if(lead_id!==null && (!Number.isSafeInteger(lead_id)||lead_id<1))return res.status(400).json({ok:false,error:'Elige un contacto válido'});
  if(lead_id!==null){const c=await pool.query('SELECT id FROM leads WHERE id=$1',[lead_id]);if(!c.rows.length)return res.status(404).json({ok:false,error:'El contacto ya no existe'});}
  await pool.query(`INSERT INTO wa_contacto_vinculos(jid,lead_id,actualizado_por) VALUES($1,$2,$3)
   ON CONFLICT(jid) DO UPDATE SET lead_id=EXCLUDED.lead_id,actualizado_por=EXCLUDED.actualizado_por,actualizado_en=now()`,[jid,lead_id,req.user.username]);
  res.json({ok:true});
 }));
 app.post(ruta+'/control',permiso,wrap(async(req,res)=>{
  const {jid,pausa}=req.body||{};await existe(jid);
  if(typeof pausa!=='boolean')return res.status(400).json({ok:false,error:'Indica si quieres atender o devolver a Sara'});
  await conIdentidades(jid,async jids=>{for(const id of jids)await estado(id,pausa,req.user.username);if(pausa)await atencion?.control(jid,'tomar',req.user.username);});res.json({ok:true});
 }));
 app.post(ruta+'/resolver',permiso,wrap(async(req,res)=>{
  const {jid}=req.body||{};await existe(jid);
  await conIdentidades(jid,async jids=>{for(const id of jids)await estado(id,false,req.user.username);await atencion?.control(jid,'resolver',req.user.username);});
  res.json({ok:true});
 }));
 app.post(ruta+'/enviar' ,permiso,wrap(async(req,res)=>{
  const {jid,mensaje}=req.body||{};await existe(jid);
  if(typeof mensaje!=='string'||!mensaje.trim()||mensaje.length>4000)return res.status(400).json({ok:false,error:'Escribe un mensaje de hasta 4.000 caracteres'});
  if(!listo())return res.status(503).json({ok:false,error:'WhatsApp está desconectado. El mensaje no se ha enviado.'});
  await conIdentidades(jid,async jids=>{for(const id of jids)await estado(id,true,req.user.username);await atencion?.control(jid,'tomar',req.user.username);await enviar(jid,mensaje.trim());});
  res.json({ok:true});
 }));
}
