import {tareaHumana,enlaceConversacion} from './motivo-atencion.js';
import {instanteMadrid,sumaDias} from '../horarios/tiempo.js';
import { ARCHIVO_CTE } from './bandeja-historial.js';
import { IDENTIDAD_CTE, telefonoContacto } from './contacto-conversacion.js';

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
// Un LID es una identidad, nunca un número que se deba mostrar como teléfono.
export function contactoAtendible(jid) {
 return /^[1-9]\d*@lid$/.test(String(jid||'')) || /^[1-9]\d{9,14}@s\.whatsapp\.net$/.test(String(jid||''));
}
export function fechaRespuestaWhatsApp(msg, tipo) {
 if(tipo!=='notify' || !msg?.key?.fromMe || !msg.key.id || !contactoAtendible(msg.key.remoteJid))return null;
 const m=msg.message;
 const texto=m?.conversation || m?.extendedTextMessage?.text;
 if(!(typeof texto==='string' && texto.trim()) &&
    ![m?.audioMessage,m?.imageMessage,m?.videoMessage,m?.documentMessage].some(Boolean))return null;
 const fecha=new Date(Number(msg.messageTimestamp)*1000);
 return Number.isFinite(+fecha) && +fecha>0 ? fecha : null;
}
const breve=(v,n)=>{const t=String(v||'').replace(/https?:\/\/\S+/gi,'[enlace]').replace(/[*_~`<>]/g,'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1)+'…':t;};
// No confundir una despedida inequívoca con una consulta sin atender.
// «Ok», «sí» o «perfecto» podrían confirmar una reserva: no se excluyen.
export function cierreCortesia(texto) {
 const t=String(texto||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
 return /^(muchas gracias|gracias|moltes gracies|gracies|thank you|thanks|merci|hasta luego|hasta pronto|adeu|fins aviat)( (a ti|a tu|igualmente|igualment))?$/.test(t);
}
function accionPendiente(t) {
 if(t.motivo==='pidio_persona') return 'Ha pedido hablar con una persona. Respóndele.';
 if(t.motivo==='sin_respuesta') return 'Comprueba si ya se atendió y responde si sigue pendiente.';
 if(t.motivo?.startsWith('error_')) return 'Comprueba qué se completó antes de repetir la gestión.';
 return 'Revisa y responde a esta consulta.';
}
export function avisoAtencion(tareas,nivel) {
 const validas=tareas.filter(t=>contactoAtendible(t.jid)&&tareaHumana(t)&&!t.interno);
 if(!validas.length)return '';
 const titulo=nivel===3?'⚠️ Uriel, casos sin resolver tras 72 horas'
   :nivel===2?'🔔 Laura, recordatorio de casos pendientes':'📩 Laura, atención al cliente';
 const lineas=[`*${titulo}*`];
 for(const t of validas.slice(0,6)) {
  const tel=telefonoContacto(t.telefono_visible)||(t.jid.endsWith('@s.whatsapp.net')?telefonoContacto(t.jid.split('@')[0]):null);
  const nombre=breve(t.nombre,60)|| (tel?'+'+tel:'Contacto sin nombre');
  lineas.push('',`*${nombre}* · ${accionPendiente(t)}`);
  const contexto=breve(t.resumen,150);
  if(t.motivo!=='pidio_persona' && contexto && !contexto.startsWith('Consulta anterior pendiente'))lineas.push(contexto);
  if(t.estado==='en_curso')lineas.push(`Lo está gestionando ${breve(t.responsable==='marketing'?'Laura':t.responsable||'el equipo',60)}.`);
  lineas.push(enlaceConversacion(t.jid));
 }
 if(validas.length>6)lineas.push('',`Hay ${validas.length-6} más en el panel.`,'https://familiadelamor.org/panel/#conversaciones');
 return lineas.join('\n');
}
export function pausaBloqueante(ficha) {
 return ficha?.estado_ia === 'pausada' && !(ficha.pausado_por === 'sara' && ficha.pausa_motivo === 'consulta');
}
export function nivelAviso(tarea, ahora = new Date()) {
 if(!tareaHumana(tarea))return 0;
 const previo=Number(tarea.aviso_nivel||0);
 if(previo===0)return 1;
 if(previo===1) {
  const primerAviso=new Date(tarea.aviso_en||tarea.abierta_en);
  if(!Number.isFinite(+primerAviso))return 0;
  const recordatorio=sumaDias(instanteMadrid(primerAviso).fecha,1);
  const {fecha,minutoDia}=instanteMadrid(ahora);
  return fecha>recordatorio || (fecha===recordatorio && minutoDia>=9*60) ? 2 : 0;
 }
 if(previo===2 && tarea.estado==='pendiente' && +ahora-Date.parse(tarea.abierta_en)>=72*60*60000)return 3;
 return 0;
}
export function crearAtencion({pool,enviar,listo,recuperar,avisarAlAbrir=false,ahora=()=>new Date()}) {
 const canon=async jid=>(await pool.query('SELECT COALESCE(telefono_jid,jid) AS jid FROM wa_bandeja_chats WHERE jid=$1',[jid])).rows[0]?.jid||jid;
 async function abrir(jid,motivo,resumen,fecha=new Date()) {
  jid=await canon(jid);
  if(!contactoAtendible(jid))return;
  const guardada=await pool.query(`INSERT INTO wa_atencion(jid,motivo,resumen,ultimo_cliente) VALUES($1,$2,$3,$4)
   ON CONFLICT(jid) DO UPDATE SET
    estado=CASE WHEN (wa_atencion.estado='resuelta' OR (wa_atencion.motivo='sin_respuesta' AND EXCLUDED.motivo<>'sin_respuesta')) THEN 'pendiente' ELSE wa_atencion.estado END,
    motivo=EXCLUDED.motivo,resumen=EXCLUDED.resumen,ultimo_cliente=GREATEST(wa_atencion.ultimo_cliente,EXCLUDED.ultimo_cliente),
    abierta_en=CASE WHEN (wa_atencion.estado='resuelta' OR (wa_atencion.motivo='sin_respuesta' AND EXCLUDED.motivo<>'sin_respuesta')) THEN now() ELSE wa_atencion.abierta_en END,
    cerrada_en=NULL,actualizada_en=now(),version=wa_atencion.version+1,aviso_nivel=CASE WHEN (wa_atencion.estado='resuelta' OR (wa_atencion.motivo='sin_respuesta' AND EXCLUDED.motivo<>'sin_respuesta')) THEN 0 ELSE wa_atencion.aviso_nivel END,
    aviso_en=CASE WHEN (wa_atencion.estado='resuelta' OR (wa_atencion.motivo='sin_respuesta' AND EXCLUDED.motivo<>'sin_respuesta')) THEN NULL ELSE wa_atencion.aviso_en END,
    acuse_en=CASE WHEN (wa_atencion.estado='resuelta' OR (wa_atencion.motivo='sin_respuesta' AND EXCLUDED.motivo<>'sin_respuesta')) THEN NULL ELSE wa_atencion.acuse_en END,
    aviso_error=CASE WHEN (wa_atencion.estado='resuelta' OR (wa_atencion.motivo='sin_respuesta' AND EXCLUDED.motivo<>'sin_respuesta')) THEN false ELSE wa_atencion.aviso_error END,
    responsable=CASE WHEN (wa_atencion.estado='resuelta' OR (wa_atencion.motivo='sin_respuesta' AND EXCLUDED.motivo<>'sin_respuesta')) THEN 'marketing' ELSE wa_atencion.responsable END
   WHERE EXCLUDED.ultimo_cliente>COALESCE(wa_atencion.cerrada_en,wa_atencion.ultimo_cliente)
   RETURNING aviso_nivel`,
   [jid,motivo,String(resumen||'').slice(0,1000),fecha]);
  if(avisarAlAbrir && Number(guardada.rows[0]?.aviso_nivel)===0 && motivo!=='sin_respuesta') {
   await avisar(jid).catch(e=>console.error('[Atención WA] Primer aviso:',e.message));
  }
 }
 async function control(jid,accion,usuario) {
  jid=await canon(jid);
  if(accion==='tomar') {
   await pool.query(`INSERT INTO wa_atencion(jid,motivo,resumen) VALUES($1,'manual','Conversación tomada desde el panel') ON CONFLICT(jid) DO NOTHING`,[jid]);
   await pool.query("UPDATE wa_atencion SET estado='en_curso',responsable=$2,actualizada_en=now(),version=version+1, cerrada_en=NULL, motivo=CASE WHEN estado='resuelta' THEN 'manual' ELSE motivo END, resumen=CASE WHEN estado='resuelta' THEN 'Conversación tomada desde el panel' ELSE resumen END, abierta_en=CASE WHEN estado='resuelta' THEN now() ELSE abierta_en END, aviso_error=false, aviso_nivel=CASE WHEN estado='resuelta' THEN 0 ELSE aviso_nivel END, aviso_en=CASE WHEN estado='resuelta' THEN NULL ELSE aviso_en END WHERE jid=$1",[jid,usuario]);
  } else if(accion==='resolver') {
   await pool.query(`INSERT INTO wa_atencion(jid,estado,motivo,responsable,cerrada_en)
    VALUES($1,'resuelta','manual',$2,now()) ON CONFLICT(jid) DO UPDATE
    SET estado='resuelta',cerrada_en=now(),actualizada_en=now(),version=wa_atencion.version+1`,[jid,usuario]);
  }
 }
 async function respuestaHumana(jid,fecha) {
  if(!contactoAtendible(jid) || !Number.isFinite(+fecha) || +fecha<=0)return false;
  jid=await canon(jid);
  // WhatsApp entrega la hora de envío con precisión de segundos.
  const r=await pool.query(`UPDATE wa_atencion SET estado='en_curso',responsable='Equipo por WhatsApp',
   actualizada_en=now(),version=version+1
   WHERE jid=$1 AND estado='pendiente' AND date_trunc('second',abierta_en)<=$2
   AND date_trunc('second',ultimo_cliente)<=$2 RETURNING jid`,[jid,fecha]);
  return !!r.rows.length;
 }
 async function entrada(jid,texto,fecha=new Date()) {
  jid=await canon(jid);
  const r=await pool.query("SELECT estado,motivo FROM wa_atencion WHERE jid=$1 AND estado<>'resuelta'",[jid]);
  // Conservar el motivo del bloqueo: el siguiente «gracias» no lo sustituye.
  if(r.rows[0])await pool.query(`UPDATE wa_atencion SET ultimo_cliente=GREATEST(ultimo_cliente,$2),
   version=version+1 WHERE jid=$1 AND estado<>'resuelta'`,[jid,fecha]);
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
  for(const m of rows.filter(m=>contactoAtendible(m.jid) && !cierreCortesia(m.mensaje))) await recuperar(m,async()=>{
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
  // No convertir mensajes sin respuesta en incidencias: recuperarRecientes los atiende.
  // Las tareas históricas sin_respuesta se conservan, pero no generan avisos humanos.
  const pausadas=await pool.query(`SELECT c.jid,c.pausa_motivo FROM wa_clientes c WHERE c.estado_ia='pausada' AND (COALESCE(c.pausado_por,'')<>'sara' OR c.pausa_motivo='pidio_persona')
   AND NOT EXISTS(SELECT 1 FROM wa_atencion a WHERE a.jid=COALESCE((SELECT telefono_jid FROM wa_bandeja_chats WHERE jid=c.jid),c.jid)) LIMIT 100`);
  for(const c of pausadas.rows)await abrir(c.jid,c.pausa_motivo||'manual','Consulta anterior pendiente de revisión; consultar el historial antes de responder.');
 }
 async function avisar(jid=null) {
   if(!listo())return;
   const identidad=IDENTIDAD_CTE.replace("NULLIF(trim(t.nombre_wa),'')","NULLIF(trim(t.nombre_wa),''),NULLIF(trim(t.nombre_archivo),'')");
   const {rows}=await pool.query(`WITH ${ARCHIVO_CTE}, ${identidad}
    SELECT a.*,i.nombre,i.telefono_visible
    FROM wa_atencion a LEFT JOIN identidades i ON i.jid=a.jid
    WHERE a.estado<>'resuelta' AND (a.motivo<>'sin_respuesta' OR a.estado='en_curso') AND a.jid ~ '^([1-9][0-9]{9,14}@s[.]whatsapp[.]net|[1-9][0-9]*@lid)$'
    AND NOT COALESCE(i.interno,false) AND ($1::text IS NULL OR a.jid=$1) ORDER BY a.abierta_en LIMIT 500`,[jid]);
   const instante=ahora();
   for(const nivel of (jid?[1]:[1,2,3])) {
    const candidatas=rows.filter(t=>nivelAviso(t,instante)===nivel).slice(0,20),tomadas=[];
    for(const t of candidatas) {
     // Reclamar antes de enviar: una entrega incierta no se repite al reiniciar.
     const r=await pool.query(`UPDATE wa_atencion SET aviso_nivel=$3,aviso_en=$4,aviso_error=false
      WHERE jid=$1 AND version=$2 AND estado<>'resuelta' AND aviso_nivel<$3 RETURNING jid`,[t.jid,t.version,nivel,instante]);
     if(r.rows.length)tomadas.push(t);
    }
    if(!tomadas.length)continue;
    if(!listo())return;
    // Volver a comprobar antes del envío: un cierre o toma reciente invalida el aviso.
    const vigentes=[];
    for(const t of tomadas){const r=await pool.query("SELECT jid FROM wa_atencion WHERE jid=$1 AND version=$2 AND estado<>'resuelta'",[t.jid,t.version]);if(r.rows.length)vigentes.push(t);}
    const texto=avisoAtencion(vigentes,nivel);if(!texto)continue;
    try{await enviar(nivel===3?'34622149946':'34633018834',texto);}
    catch(e){for(const t of tomadas)await pool.query('UPDATE wa_atencion SET aviso_error=true WHERE jid=$1 AND version=$2',[t.jid,t.version]);throw e;}
   }
 }
 let ocupado=false;
 async function tick() {
  if(ocupado)return;
  ocupado=true;
  try {
   await recuperarRecientes();
   await barrer();
   await avisar();
  } finally {ocupado=false;}
 }
 return {abrir,entrada,respuestaHumana,control,acuse,iniciar,tick};
}
