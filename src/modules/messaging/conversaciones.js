// Las conversaciones internas y los grupos nunca entran en la bandeja de clientes.
export const CLIENTE_SQL = `w.jid ~ '^[0-9]+@(s[.]whatsapp[.]net|lid)$'
 AND NOT EXISTS (SELECT 1 FROM whatsapp_messages i WHERE i.jid=w.jid AND i.tipo='interno')`;
export function jidValido(jid) { return /^\d+@(s\.whatsapp\.net|lid)$/.test(String(jid || '')); }
export function registrarConversaciones(app, {auth, pool, enviar, listo, bloquear, olvidar}) {
 const permiso=auth(['direccion','marketing']);
 const ruta='/api/conversaciones';
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){console.error('[Conversaciones]',e.message);res.status(e.status||500).json({ok:false,error:e.status?e.message:'No se pudo completar. Actualiza la conversación antes de volver a enviar.'});}};
 const existe=async jid=>{
  if(!jidValido(jid)) throw Object.assign(Error('Conversación no válida'),{status:400});
  const r=await pool.query(`SELECT w.jid FROM whatsapp_messages w WHERE w.jid=$1 AND ${CLIENTE_SQL} LIMIT 1`,[jid]);
  if(!r.rows.length) throw Object.assign(Error('Conversación no disponible'),{status:404});
 };
 const estado=async(jid,pausa,usuario)=>{
  await pool.query(`INSERT INTO wa_clientes(jid,telefono,estado_ia,pausa_motivo,pausado_en,pausado_por)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(jid) DO UPDATE SET estado_ia=EXCLUDED.estado_ia,
   pausa_motivo=EXCLUDED.pausa_motivo,pausado_en=EXCLUDED.pausado_en,pausado_por=EXCLUDED.pausado_por`,
   [jid,jid.split('@')[0],pausa?'pausada':'activa',pausa?'manual':null,pausa?new Date().toISOString():null,pausa?usuario:null]);
  olvidar(jid);
 };
 app.get(ruta,permiso,wrap(async(req,res)=>{
  const q=String(req.query.q||'').slice(0,100), offset=Math.max(0,Math.min(100000,Math.floor(Number(req.query.offset)||0)));
  const r=await pool.query(`WITH ultimos AS (SELECT DISTINCT ON(w.jid) w.* FROM whatsapp_messages w WHERE ${CLIENTE_SQL} ORDER BY w.jid,w.id DESC)
   SELECT w.jid,COALESCE(c.nombre,c.telefono,w.telefono,w.jid) AS nombre,w.mensaje,w.respuesta,w.tipo,w.creado_en,
   COALESCE(c.estado_ia,'activa') AS estado_ia,c.pausado_por,
   (COALESCE(c.estado_ia,'activa')='pausada' OR (COALESCE(w.tipo,'intercambio')='intercambio' AND (NULLIF(w.respuesta,'') IS NULL OR w.respuesta='(sin respuesta registrada)'))) AS pendiente
   FROM ultimos w LEFT JOIN wa_clientes c ON c.jid=w.jid
   WHERE ($1='' OR COALESCE(c.nombre,'') ILIKE '%'||$1||'%' OR COALESCE(c.telefono,w.telefono,'') ILIKE '%'||$1||'%')
   AND ($2::boolean=false OR c.estado_ia='pausada' OR (COALESCE(w.tipo,'intercambio')='intercambio' AND (NULLIF(w.respuesta,'') IS NULL OR w.respuesta='(sin respuesta registrada)')))
   ORDER BY w.id DESC LIMIT 51 OFFSET $3`,[q,req.query.pendientes==='1',offset]);
  res.json({ok:true,data:r.rows.slice(0,50),mas:r.rows.length>50,connected:listo()});
 }));
 app.get(ruta+'/detalle',permiso,wrap(async(req,res)=>{
  const jid=String(req.query.jid||'');await existe(jid);
  const antes=Number(req.query.antes)||2147483647;
  const r=await pool.query('SELECT id,mensaje,respuesta,tipo,origen,creado_en,adjuntos FROM whatsapp_messages WHERE jid=$1 AND id<$2 ORDER BY id DESC LIMIT 101',[jid,antes]);
  const c=await pool.query('SELECT nombre,estado_ia,pausado_por,pausa_motivo FROM wa_clientes WHERE jid=$1',[jid]);
  res.json({ok:true,data:r.rows.slice(0,100).reverse(),mas:r.rows.length>100,cliente:c.rows[0]||{},connected:listo()});
 }));
 app.post(ruta+'/control',permiso,wrap(async(req,res)=>{
  const {jid,pausa}=req.body||{};await existe(jid);
  if(typeof pausa!=='boolean')return res.status(400).json({ok:false,error:'Indica si quieres atender o devolver a Sara'});
  await bloquear(jid,()=>estado(jid,pausa,req.user.username));res.json({ok:true});
 }));
 app.post(ruta+'/enviar',permiso,wrap(async(req,res)=>{
  const {jid,mensaje}=req.body||{};await existe(jid);
  if(typeof mensaje!=='string'||!mensaje.trim()||mensaje.length>4000)return res.status(400).json({ok:false,error:'Escribe un mensaje de hasta 4.000 caracteres'});
  if(!listo())return res.status(503).json({ok:false,error:'WhatsApp está desconectado. El mensaje no se ha enviado.'});
  await bloquear(jid,async()=>{await estado(jid,true,req.user.username);await enviar(jid,mensaje.trim());});
  res.json({ok:true});
 }));
}
