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
const breve=(v,n)=>{const t=String(v||'').replace(/https?:\/\/\S+/gi,'[enlace]').replace(/[*_~`<>]/g,'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1)+'…':t;};
// No confundir una despedida inequívoca con una consulta sin atender.
// «Ok», «sí» o «perfecto» podrían confirmar una reserva: no se excluyen.
export function cierreCortesia(texto) {
 const t=String(texto||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
 return /^(muchas gracias|gracias|moltes gracies|gracies|thank you|thanks|merci|hasta luego|hasta pronto|adeu|fins aviat)( (a ti|a tu|igualmente|igualment))?$/.test(t);
}
export function accionPendiente(t) {
 if(t.motivo==='pidio_persona') return 'Atender personalmente: el cliente lo ha pedido.';
 if(t.motivo==='sin_respuesta') return 'Comprobar si ya se atendió y responder si sigue pendiente.';
 if(t.motivo?.startsWith('error_')) return 'Comprobar el resultado de la gestión antes de repetirla.';
 return 'Resolver la duda indicada y responder al cliente.';
}
export function avisoAtencion(tareas,nivel,ahora=new Date()) {
 const validas=tareas.filter(t=>contactoAtendible(t.jid));
 if(!validas.length)return '';
 const antiguas=t=>+ahora-Date.parse(t.fecha_cliente||t.ultimo_cliente)>24*60*60000;
 const lineas=[`📩 *${nivel===3?'Atención pendiente · Dirección':nivel===2?'Recordatorio · Atención al cliente':'Atención al cliente'}*`,
  `${validas.length} ${validas.length===1?'conversación por revisar':'conversaciones por revisar'}.`];
 for(const [anterior,titulo] of [[false,'Últimas 24 horas'],[true,'Conversaciones anteriores · más de 24 h']]) {
  const grupo=validas.filter(t=>antiguas(t)===anterior).sort((a,b)=>Date.parse(b.fecha_cliente||b.ultimo_cliente)-Date.parse(a.fecha_cliente||a.ultimo_cliente));
  if(!grupo.length)continue;
  lineas.push('',`*${titulo}*`);
  for(const t of grupo.slice(0,3)) {
   const tel=telefonoContacto(t.telefono_visible)||(t.jid.endsWith('@s.whatsapp.net')?telefonoContacto(t.jid.split('@')[0]):null);
   const nombre=breve(t.nombre,60),etiqueta=nombre&&nombre!==tel?nombre:tel?'+'+tel:'Contacto sin nombre';
   const fecha=new Date(t.fecha_cliente||t.ultimo_cliente);
   const cuando=Number.isFinite(+fecha)?fecha.toLocaleString('es-ES',{timeZone:'Europe/Madrid',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Fecha no disponible';
   lineas.push('',`• *${etiqueta}*${tel&&etiqueta!=='+'+tel?' · +'+tel:''}`,cuando);
   if(t.ultimo_texto)lineas.push(`Último mensaje: «${breve(t.ultimo_texto,140)}»`);
   else if(t.resumen&&!t.resumen.startsWith('Consulta anterior pendiente'))lineas.push(`Contexto: ${breve(t.resumen,140)}`);
   if(t.resumen && t.motivo!=='sin_respuesta' && !t.resumen.startsWith('Consulta anterior pendiente')) lineas.push(`Motivo de revisión: ${breve(t.resumen,240)}`);
   lineas.push(`Qué falta: ${accionPendiente(t)}`);
   if(t.estado==='en_curso')lineas.push('El equipo ya está atendiendo esta conversación.');
  }
  if(grupo.length>3)lineas.push('',`Y ${grupo.length-3} más en el panel.`);
 }
 lineas.push('','*Revisar en el panel*','https://familiadelamor.org/panel/#conversaciones',
  'Filtra «Solo necesitan atención». Comprueba el historial; marca «Resuelta» cuando esté atendida.');
 return lineas.join('\n');
}
export function pausaBloqueante(ficha) {
 return ficha?.estado_ia === 'pausada' && !(ficha.pausado_por === 'sara' && ficha.pausa_motivo === 'consulta');
}
export function nivelAviso(tarea, ahora = new Date()) {
 const hora = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',hourCycle:'h23'}).format(ahora));
 if(tarea.aviso_en && +ahora-Date.parse(tarea.aviso_en)<5*60000)return 0;
 if(hora<10 || hora>=21 || tarea.estado==='resuelta')return 0;
 const minutos=(+ahora-Date.parse(tarea.abierta_en))/60000;
 const previo=Number(tarea.aviso_nivel||0);
 // Siempre avisar primero a Laura, también al recuperar una tarea antigua.
 if(previo===0)return 1;
 const desdeAviso=(+ahora-Date.parse(tarea.aviso_en||tarea.abierta_en))/60000;
 if(previo===1 && desdeAviso>=30)return 2;
 // Dirección solo tras aviso y recordatorio, con tiempo real para intervenir.
 const referencia=tarea.estado==='en_curso'?tarea.actualizada_en||tarea.abierta_en:tarea.abierta_en;
 const espera=(+ahora-Date.parse(referencia))/60000;
 if(previo===2 && desdeAviso>=60 && minutos>=120 && espera>=(tarea.estado==='en_curso'?240:120))return 3;
 return 0;
}
export function crearAtencion({pool,enviar,listo,recuperar}) {
 const canon=async jid=>(await pool.query('SELECT COALESCE(telefono_jid,jid) AS jid FROM wa_bandeja_chats WHERE jid=$1',[jid])).rows[0]?.jid||jid;
 async function abrir(jid,motivo,resumen,fecha=new Date()) {
  jid=await canon(jid);
  if(!contactoAtendible(jid))return;
  await pool.query(`INSERT INTO wa_atencion(jid,motivo,resumen,ultimo_cliente) VALUES($1,$2,$3,$4)
   ON CONFLICT(jid) DO UPDATE SET
    estado=CASE WHEN wa_atencion.estado='resuelta' THEN 'pendiente' ELSE wa_atencion.estado END,
    motivo=EXCLUDED.motivo,resumen=EXCLUDED.resumen,ultimo_cliente=GREATEST(wa_atencion.ultimo_cliente,EXCLUDED.ultimo_cliente),
    abierta_en=CASE WHEN wa_atencion.estado='resuelta' THEN now() ELSE wa_atencion.abierta_en END,
    cerrada_en=NULL,actualizada_en=now(),version=wa_atencion.version+1,aviso_nivel=CASE WHEN wa_atencion.estado='resuelta' THEN 0 ELSE wa_atencion.aviso_nivel END
   WHERE EXCLUDED.ultimo_cliente>COALESCE(wa_atencion.cerrada_en,wa_atencion.ultimo_cliente)`,
   [jid,motivo,String(resumen||'').slice(0,1000),fecha]);
 }
 async function control(jid,accion,usuario) {
  jid=await canon(jid);
  if(accion==='tomar') {
   await abrir(jid,'manual','Conversación tomada desde el panel');
   await pool.query("UPDATE wa_atencion SET estado='en_curso',responsable=$2,actualizada_en=now() WHERE jid=$1",[jid,usuario]);
  } else if(accion==='resolver') {
   await pool.query(`INSERT INTO wa_atencion(jid,estado,motivo,responsable,cerrada_en)
    VALUES($1,'resuelta','manual',$2,now()) ON CONFLICT(jid) DO UPDATE
    SET estado='resuelta',cerrada_en=now(),actualizada_en=now()`,[jid,usuario]);
  }
 }
 async function entrada(jid,texto,fecha=new Date()) {
  jid=await canon(jid);
  const r=await pool.query("SELECT estado,motivo FROM wa_atencion WHERE jid=$1 AND estado<>'resuelta'",[jid]);
  // Conservar el motivo del bloqueo: el siguiente «gracias» no lo sustituye.
  if(r.rows[0])await pool.query(`UPDATE wa_atencion SET ultimo_cliente=GREATEST(ultimo_cliente,$2),
   actualizada_en=now(),version=version+1 WHERE jid=$1 AND estado<>'resuelta'`,[jid,fecha]);
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
  // Solo crea tareas: jamás reproduce herramientas ni responde a mensajes antiguos.
  const r=await pool.query(`WITH ${ARCHIVO_CTE} SELECT w.jid,w.mensaje,w.creado_en FROM ultimos w
   WHERE NOT w.interno AND w.jid ~ '^[0-9]+@(s[.]whatsapp[.]net|lid)$'
   AND w.tipo='recibido' AND w.creado_en::timestamptz BETWEEN now()-interval '7 days' AND now()-interval '5 minutes'
   AND NOT EXISTS(SELECT 1 FROM wa_atencion a WHERE a.jid=w.jid AND (a.estado<>'resuelta' OR a.cerrada_en>=w.creado_en::timestamptz))
   ORDER BY w.creado_en::timestamptz DESC LIMIT 100`);
  for(const m of r.rows.filter(m=>!cierreCortesia(m.mensaje)))await abrir(m.jid,'sin_respuesta',m.mensaje,new Date(m.creado_en));
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
   const identidad=IDENTIDAD_CTE.replace("NULLIF(trim(t.nombre_wa),'')","NULLIF(trim(t.nombre_wa),''),NULLIF(trim(t.nombre_archivo),'')");
   const {rows}=await pool.query(`WITH ${ARCHIVO_CTE}, ${identidad}
    SELECT a.*,i.nombre,i.telefono_visible,e.mensaje AS ultimo_texto,COALESCE(e.fecha,a.ultimo_cliente) AS fecha_cliente
    FROM wa_atencion a LEFT JOIN identidades i ON i.jid=a.jid
    LEFT JOIN LATERAL(SELECT mensaje,fecha FROM eventos WHERE jid=a.jid AND tipo='recibido' ORDER BY fecha DESC,clave DESC LIMIT 1)e ON true
    WHERE a.estado<>'resuelta' AND a.jid ~ '^([1-9][0-9]{9,14}@s[.]whatsapp[.]net|[1-9][0-9]*@lid)$'
    AND NOT COALESCE(i.interno,false) ORDER BY a.abierta_en LIMIT 500`);
   for(const nivel of [1,2,3]) {
    const candidatas=rows.filter(t=>nivelAviso(t)===nivel).slice(0,20),tomadas=[];
    for(const t of candidatas) {
     // Reclamar antes de enviar: una entrega incierta no se repite al reiniciar.
     const r=await pool.query(`UPDATE wa_atencion SET aviso_nivel=$3,aviso_en=now(),aviso_error=false
      WHERE jid=$1 AND version=$2 AND estado<>'resuelta' AND aviso_nivel<$3 RETURNING jid`,[t.jid,t.version,nivel]);
     if(r.rows.length)tomadas.push(t);
    }
    if(!tomadas.length)continue;
    const texto=avisoAtencion(tomadas,nivel);
    try{await enviar(nivel===3?'34622149946':'34633018834',texto);}
    catch(e){for(const t of tomadas)await pool.query('UPDATE wa_atencion SET aviso_error=true WHERE jid=$1 AND version=$2',[t.jid,t.version]);throw e;}
   }
  } finally {ocupado=false;}
 }
 return {abrir,entrada,control,acuse,iniciar,tick};
}
