import { ARCHIVO_CTE } from './bandeja-historial.js';

export const ATENCION_SCHEMA = `
CREATE TABLE IF NOT EXISTS wa_atencion (
 jid TEXT PRIMARY KEY, estado TEXT NOT NULL DEFAULT 'pendiente', responsable TEXT NOT NULL DEFAULT 'marketing',
 motivo TEXT NOT NULL, resumen TEXT NOT NULL DEFAULT '', abierta_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 ultimo_cliente TIMESTAMPTZ NOT NULL DEFAULT now(), actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 cerrada_en TIMESTAMPTZ, version BIGINT NOT NULL DEFAULT 1, aviso_nivel INTEGER NOT NULL DEFAULT 0,
 aviso_en TIMESTAMPTZ, acuse_en TIMESTAMPTZ, aviso_error BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS wa_entrada_procesada(jid TEXT NOT NULL,mensaje_id TEXT NOT NULL,creada_en TIMESTAMPTZ DEFAULT now(),PRIMARY KEY(jid,mensaje_id));
CREATE TABLE IF NOT EXISTS wa_entrada_recuperada(jid TEXT NOT NULL,clave TEXT NOT NULL,creada_en TIMESTAMPTZ DEFAULT now(),PRIMARY KEY(jid,clave));
CREATE INDEX IF NOT EXISTS wa_atencion_abiertas ON wa_atencion(estado,ultimo_cliente);
`;
export function pausaBloqueante(ficha) {
 return ficha?.estado_ia === 'pausada' && !(ficha.pausado_por === 'sara' && ficha.pausa_motivo === 'consulta');
}
export function nivelAviso(tarea, ahora = new Date()) {
 const hora = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',hourCycle:'h23'}).format(ahora));
 if(tarea.aviso_en && +ahora-Date.parse(tarea.aviso_en)<5*60000)return 0;
 if(hora<10 || hora>=21 || tarea.estado==='resuelta')return 0;
 const minutos=(+ahora-Date.parse(tarea.abierta_en))/60000;
 const nivel=minutos>=60?3:minutos>=30?2:1;
 return nivel>Number(tarea.aviso_nivel||0)?nivel:0;
}
export function crearAtencion({pool,enviar,listo,recuperar}) {
 const canon=async jid=>(await pool.query('SELECT COALESCE(telefono_jid,jid) AS jid FROM wa_bandeja_chats WHERE jid=$1',[jid])).rows[0]?.jid||jid;
 async function abrir(jid,motivo,resumen,fecha=new Date()) {
  jid=await canon(jid);
  if(!/^\d+@(s\.whatsapp\.net|lid)$/.test(jid))return;
  await pool.query(`INSERT INTO wa_atencion(jid,motivo,resumen,ultimo_cliente) VALUES($1,$2,$3,$4)
   ON CONFLICT(jid) DO UPDATE SET
    estado=CASE WHEN wa_atencion.estado='resuelta' THEN 'pendiente' ELSE wa_atencion.estado END,
    motivo=EXCLUDED.motivo,resumen=EXCLUDED.resumen,ultimo_cliente=GREATEST(wa_atencion.ultimo_cliente,EXCLUDED.ultimo_cliente),
    abierta_en=CASE WHEN wa_atencion.estado='resuelta' THEN now() ELSE wa_atencion.abierta_en END,
    cerrada_en=NULL,actualizada_en=now(),version=wa_atencion.version+1,aviso_nivel=0
   WHERE EXCLUDED.ultimo_cliente>COALESCE(wa_atencion.cerrada_en,wa_atencion.ultimo_cliente)`,
   [jid,motivo,String(resumen||'').slice(0,1000),fecha]);
 }
 async function control(jid,accion,usuario) {
  jid=await canon(jid);
  if(accion==='tomar') {
   await abrir(jid,'manual','Conversación tomada desde el panel');
   await pool.query("UPDATE wa_atencion SET estado='en_curso',responsable=$2,actualizada_en=now() WHERE jid=$1",[jid,usuario]);
  } else if(accion==='resolver') {
   await pool.query("UPDATE wa_atencion SET estado='resuelta',cerrada_en=now(),actualizada_en=now() WHERE jid=$1",[jid]);
  }
 }
 async function entrada(jid,texto,fecha=new Date()) {
  jid=await canon(jid);
  const r=await pool.query("SELECT estado,motivo FROM wa_atencion WHERE jid=$1 AND estado<>'resuelta'",[jid]);
  if(r.rows[0])await abrir(jid,r.rows[0].motivo,texto,fecha);
 }
 async function iniciar(jid,items) {
  jid=await canon(jid);const nuevos=[];
  for(const item of items) {
   if(!item.msg?.key?.id){nuevos.push(item);continue;}
   const r=await pool.query('INSERT INTO wa_entrada_procesada(jid,mensaje_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING jid',[jid,item.msg.key.id]);
   if(r.rows.length)nuevos.push(item);
  }
  return nuevos;
 }
 async function acuse(jid) {
  jid=await canon(jid);
  return !!(await pool.query(`UPDATE wa_atencion SET acuse_en=now() WHERE jid=$1 AND estado='pendiente'
   AND (acuse_en IS NULL OR acuse_en<now()-interval '4 hours') RETURNING jid`,[jid])).rows.length;
 }
 async function recuperarRecientes() {
  if(!recuperar||!listo())return;
  const {rows}=await pool.query(`WITH ${ARCHIVO_CTE} SELECT w.jid,w.id,w.mensaje,w.creado_en FROM ultimos w
   WHERE NOT w.interno AND w.jid ~ '^[0-9]+@(s[.]whatsapp[.]net|lid)$' AND w.tipo='recibido'
   AND w.id LIKE 'w%' AND w.mensaje NOT LIKE '[%'
   AND w.creado_en::timestamptz BETWEEN now()-interval '72 hours' AND now()-interval '5 minutes'
   AND NOT EXISTS(SELECT 1 FROM wa_entrada_recuperada r WHERE r.jid=w.jid AND r.clave=w.id)
   AND NOT EXISTS(SELECT 1 FROM wa_entrada_procesada p JOIN originales o ON o.mensaje_id=p.mensaje_id AND p.jid IN(o.jid,o.canon) WHERE o.canon=w.jid AND 'w'||o.id::text=w.id)
   AND NOT EXISTS(SELECT 1 FROM legados l WHERE l.canon=w.jid AND l.creado_en::timestamptz>=w.creado_en::timestamptz AND COALESCE(l.historico,0)=0)
   AND NOT EXISTS(SELECT 1 FROM wa_atencion a WHERE a.jid=w.jid AND (a.estado='en_curso' OR a.motivo IN ('error_respuesta','error_entrada') OR a.cerrada_en>=w.creado_en::timestamptz))
   ORDER BY w.creado_en::timestamptz DESC LIMIT 10`);
  for(const m of rows) await recuperar(m,async()=>{
   // Releer bajo la cola del contacto; cualquier procesamiento previo, respuesta o cierre impide repetir acciones.
   const r=await pool.query(`WITH ${ARCHIVO_CTE} INSERT INTO wa_entrada_recuperada(jid,clave)
    SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM ultimos WHERE jid=$1 AND id=$2 AND tipo='recibido')
    AND NOT EXISTS(SELECT 1 FROM wa_entrada_procesada p JOIN originales o ON o.mensaje_id=p.mensaje_id AND p.jid IN(o.jid,o.canon) WHERE o.canon=$1 AND 'w'||o.id::text=$2)
    AND NOT EXISTS(SELECT 1 FROM legados WHERE canon=$1 AND creado_en::timestamptz >= $3::timestamptz AND COALESCE(historico,0)=0)
    AND NOT EXISTS(SELECT 1 FROM wa_atencion WHERE jid=$1 AND (estado='en_curso' OR motivo IN ('error_respuesta','error_entrada') OR cerrada_en >= $3::timestamptz))
    ON CONFLICT DO NOTHING RETURNING jid`,[m.jid,m.id,m.creado_en]);
   return !!r.rows.length;
  });
 }
 async function barrer() {
  // Solo crea tareas: jamás reproduce herramientas ni responde a mensajes antiguos.
  const r=await pool.query(`WITH ${ARCHIVO_CTE} SELECT w.jid,w.mensaje,w.creado_en FROM ultimos w
   WHERE NOT w.interno AND w.jid ~ '^[0-9]+@(s[.]whatsapp[.]net|lid)$'
   AND w.tipo='recibido' AND w.creado_en::timestamptz BETWEEN now()-interval '7 days' AND now()-interval '5 minutes'
   AND NOT EXISTS(SELECT 1 FROM wa_atencion a WHERE a.jid=w.jid AND (a.estado<>'resuelta' OR a.cerrada_en>=w.creado_en::timestamptz))
   ORDER BY w.creado_en::timestamptz DESC LIMIT 100`);
  for(const m of r.rows)await abrir(m.jid,'sin_respuesta',m.mensaje,new Date(m.creado_en));
  const pausadas=await pool.query(`SELECT c.jid,c.pausa_motivo FROM wa_clientes c WHERE c.estado_ia='pausada'
   AND NOT EXISTS(SELECT 1 FROM wa_atencion a WHERE a.jid=COALESCE((SELECT telefono_jid FROM wa_bandeja_chats WHERE jid=c.jid),c.jid)) LIMIT 100`);
  for(const c of pausadas.rows)await abrir(c.jid,c.pausa_motivo||'manual','Consulta anterior pendiente de revisión; consultar el historial antes de responder.');
 }
 let ocupado=false;
 async function tick() {
  if(ocupado)return;ocupado=true;
  try {
   await recuperarRecientes();
   await barrer();
   if(!listo())return;
   const {rows}=await pool.query("SELECT * FROM wa_atencion WHERE estado<>'resuelta' ORDER BY abierta_en LIMIT 500");
   for(const nivel of [1,2,3]) {
    const candidatas=rows.filter(t=>nivelAviso(t)===nivel).slice(0,20),tomadas=[];
    for(const t of candidatas) {
     // Reclamar antes de enviar: una entrega incierta no se repite al reiniciar.
     const r=await pool.query(`UPDATE wa_atencion SET aviso_nivel=$3,aviso_en=now(),aviso_error=false
      WHERE jid=$1 AND version=$2 AND estado<>'resuelta' AND aviso_nivel<$3 RETURNING jid`,[t.jid,t.version,nivel]);
     if(r.rows.length)tomadas.push(t);
    }
    if(!tomadas.length)continue;
    const texto=`📩 *Consultas de WhatsApp pendientes*${nivel===3?' · Dirección':nivel===2?' · Recordatorio':''}\n\n`+
     tomadas.map(t=>`• ${t.jid.endsWith('@lid')?'Contacto pendiente de identificar': '+'+t.jid.split('@')[0]} · ${t.motivo==='sin_respuesta'?'Sin respuesta registrada':'Pendiente de resolver'} · Responsable: ${t.responsable}`).join('\n')+
     '\n\nRevisar y atender en https://familiadelamor.org/panel/#conversaciones. Marcar resuelta solo al terminar.';
    try{await enviar(nivel===3?'34622149946':'34633018834',texto);}
    catch(e){for(const t of tomadas)await pool.query('UPDATE wa_atencion SET aviso_error=true WHERE jid=$1 AND version=$2',[t.jid,t.version]);throw e;}
   }
  } finally {ocupado=false;}
 }
 return {abrir,entrada,control,acuse,iniciar,tick};
}
