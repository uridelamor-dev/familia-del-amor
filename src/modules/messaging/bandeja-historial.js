// Copia de lectura del historial de WhatsApp: nunca llama a Sara ni envía mensajes.
import { mensajeNormalizado } from './sara-adjuntos.js';
export const BANDEJA_SCHEMA = `
 CREATE TABLE IF NOT EXISTS wa_bandeja_chats (
 jid TEXT PRIMARY KEY,nombre TEXT,telefono_jid TEXT,ultimo_en TIMESTAMPTZ,tiene_chat BOOLEAN NOT NULL DEFAULT false,
 archivado BOOLEAN DEFAULT false,fijado BIGINT DEFAULT 0,interno BOOLEAN DEFAULT false);
 CREATE TABLE IF NOT EXISTS wa_bandeja_mensajes (
 id BIGSERIAL PRIMARY KEY,jid TEXT NOT NULL,mensaje_id TEXT NOT NULL,
 enviado BOOLEAN NOT NULL,texto TEXT NOT NULL,fecha TIMESTAMPTZ NOT NULL,
 UNIQUE(jid,mensaje_id));
 CREATE INDEX IF NOT EXISTS wa_bandeja_fecha ON wa_bandeja_mensajes(jid,fecha DESC,id DESC);
 CREATE TABLE IF NOT EXISTS wa_bandeja_sync(id INTEGER PRIMARY KEY CHECK(id=1),actualizado_en TIMESTAMPTZ,estado TEXT);
`;
export const jidBandeja = jid => /^[0-9-]+@(s\.whatsapp\.net|lid|g\.us)$/.test(String(jid||''));
const fecha = value => {const n=Number(value);return n>0&&n<100000000000?new Date(n*1000).toISOString():null;};
export function mensajeBandeja(msg){
 const jid=msg.key?.remoteJid,id=msg.key?.id,ts=fecha(msg.messageTimestamp);
 if(!jidBandeja(jid)||!id||!ts)return null;
 const m=mensajeNormalizado(msg.message)||{};
 let texto=m.conversation||m.extendedTextMessage?.text;
 if(!texto){for(const [key,label] of [['imageMessage','Imagen'],['videoMessage','Vídeo'],['audioMessage','Audio'],['documentMessage','Documento'],['stickerMessage','Sticker'],['contactMessage','Contacto'],['contactsArrayMessage','Contactos'],['locationMessage','Ubicación'],['liveLocationMessage','Ubicación en directo'],['pollCreationMessage','Encuesta']])if(m[key]){texto='['+label+'] '+(m[key].caption||m[key].fileName||m[key].displayName||'');break;}}
 if(!texto)return null; // No convertir recibos/protocolo en mensajes visibles.
 return {jid,id,fecha:ts,texto:String(texto),enviado:!!msg.key.fromMe,nombre:msg.key.fromMe||jid.endsWith('@g.us')?null:msg.pushName,telefono_jid:msg.key.remoteJidAlt?.endsWith('@s.whatsapp.net')?msg.key.remoteJidAlt:null};
}
export function crearArchivoBandeja(pool){
 return async function guardar({chats=[],contacts=[],messages=[],historico=false,internos={},lidPnMappings=[]}={}){
  const datos=messages.map(mensajeBandeja).filter(Boolean);
  const fichas=new Map();
  const conversaciones=new Set([...chats.map(c=>c.id),...datos.map(m=>m.jid)]);
  const añadir=c=>{if(!jidBandeja(c.jid))return;const old=fichas.get(c.jid)||{};fichas.set(c.jid,{...old,...Object.fromEntries(Object.entries(c).filter(([,v])=>v!==undefined&&v!==null))});};
  // La agenda no es la lista de chats: actualizar nombres sin inventar conversaciones.
  for(const m of lidPnMappings)añadir({jid:m.lid,telefono_jid:m.pn});
  for(const c of chats){añadir({jid:c.id,nombre:c.name,telefono_jid:c.pnJid,ultimo_en:fecha(c.conversationTimestamp||c.lastMessageRecvTimestamp),archivado:c.archived,fijado:c.pinned===undefined?undefined:Number(c.pinned)});if(c.lidJid&&c.pnJid)añadir({jid:c.lidJid,telefono_jid:c.pnJid});}
  for(const m of datos){const prev=fichas.get(m.jid);añadir({jid:m.jid,nombre:prev?.nombre||m.nombre,telefono_jid:m.telefono_jid,ultimo_en:prev?.ultimo_en>m.fecha?prev.ultimo_en:m.fecha});}
  for(const c of fichas.values()){
   await pool.query(`INSERT INTO wa_bandeja_chats(jid,nombre,telefono_jid,ultimo_en,archivado,fijado,interno,tiene_chat) VALUES($1,$2,$3,$4,COALESCE($5,false),COALESCE($6,0),$7,$8)
    ON CONFLICT(jid) DO UPDATE SET nombre=COALESCE(NULLIF(EXCLUDED.nombre,''),wa_bandeja_chats.nombre),telefono_jid=COALESCE(EXCLUDED.telefono_jid,wa_bandeja_chats.telefono_jid),ultimo_en=GREATEST(EXCLUDED.ultimo_en,wa_bandeja_chats.ultimo_en),archivado=COALESCE($5,wa_bandeja_chats.archivado),fijado=COALESCE($6,wa_bandeja_chats.fijado),interno=wa_bandeja_chats.interno OR EXCLUDED.interno,tiene_chat=wa_bandeja_chats.tiene_chat OR EXCLUDED.tiene_chat`,[c.jid,c.nombre||null,c.telefono_jid||null,c.ultimo_en||null,c.archivado??null,c.fijado??null,!!internos[c.jid],conversaciones.has(c.jid)]);
  }
  for(const c of contacts)if(jidBandeja(c.id))await pool.query(`UPDATE wa_bandeja_chats SET nombre=COALESCE(NULLIF($2,''),nombre) WHERE jid=$1`,[c.id,c.name||c.notify||null]);
  // Un cambio de fijado/archivo afecta al chat, no solo a su alias PN o LID.
  for(const c of fichas.values())if(c.archivado!==undefined||c.fijado!==undefined)await pool.query(`UPDATE wa_bandeja_chats SET archivado=COALESCE($2,archivado),fijado=COALESCE($3,fijado) WHERE COALESCE(telefono_jid,jid)=(SELECT COALESCE(telefono_jid,jid) FROM wa_bandeja_chats WHERE jid=$1)`,[c.jid,c.archivado??null,c.fijado??null]);
  // Lotes pequeños e idempotentes: un reenvío del historial no duplica documentos.
  for(let i=0;i<datos.length;i+=250)await pool.query(`INSERT INTO wa_bandeja_mensajes(jid,mensaje_id,enviado,texto,fecha) SELECT jid,id,enviado,texto,fecha::timestamptz FROM jsonb_to_recordset($1::jsonb) AS x(jid text,id text,enviado boolean,texto text,fecha text) ON CONFLICT(jid,mensaje_id) DO NOTHING`,[JSON.stringify(datos.slice(i,i+250))]);
  if(historico)await pool.query(`INSERT INTO wa_bandeja_sync VALUES(1,now(),'recibido') ON CONFLICT(id) DO UPDATE SET actualizado_en=now(),estado='recibido'`);
 };
}
// Unificar PN y LID solo cuando WhatsApp entrega la correspondencia explícita.
export const ARCHIVO_CTE=`alias AS (SELECT jid,COALESCE(telefono_jid,jid) AS canon FROM wa_bandeja_chats),
 originales_base AS (SELECT m.*,COALESCE(a.canon,m.jid) AS canon FROM wa_bandeja_mensajes m LEFT JOIN alias a ON a.jid=m.jid),
 originales AS (SELECT DISTINCT ON(canon,mensaje_id) * FROM originales_base ORDER BY canon,mensaje_id,id),
 legados AS (SELECT w.*,COALESCE(a.canon,w.jid) AS canon FROM whatsapp_messages w LEFT JOIN alias a ON a.jid=w.jid),
 eventos AS (
 SELECT 'w'||id AS clave,canon AS jid,fecha,CASE WHEN enviado THEN '' ELSE texto END AS mensaje,CASE WHEN enviado THEN texto ELSE '' END AS respuesta,CASE WHEN enviado THEN 'manual' ELSE 'recibido' END AS tipo,'[]'::jsonb AS adjuntos FROM originales
 UNION ALL
 SELECT 'l'||w.id||v.lado,canon,COALESCE(NULLIF(creado_en,'')::timestamptz,'1970-01-01'::timestamptz),
 CASE WHEN v.lado='i' THEN v.texto ELSE '' END,CASE WHEN v.lado='o' THEN v.texto ELSE '' END,
 CASE WHEN v.lado='i' THEN 'recibido' ELSE 'saliente' END,CASE WHEN v.lado='i' THEN COALESCE(adjuntos,'[]'::jsonb) ELSE '[]'::jsonb END
 FROM legados w CROSS JOIN LATERAL(VALUES('i',CASE WHEN COALESCE(w.tipo,'') NOT IN ('manual','saliente') THEN w.mensaje END),('o',w.respuesta))v(lado,texto)
 WHERE NULLIF(v.texto,'') IS NOT NULL AND v.texto<>'(sin respuesta registrada)'
 AND NOT EXISTS(SELECT 1 FROM originales o WHERE o.canon=w.canon AND o.enviado=(v.lado='o') AND o.texto=v.texto AND (COALESCE(w.historico,0)=1 OR abs(extract(epoch FROM(o.fecha-NULLIF(w.creado_en,'')::timestamptz)))<300))

), inventario AS (
 SELECT DISTINCT COALESCE(a.canon,c.jid) AS jid FROM wa_bandeja_chats c LEFT JOIN alias a ON a.jid=c.jid WHERE c.tiene_chat
 UNION SELECT jid FROM eventos
 UNION SELECT canon FROM legados
), ultimos AS (
 SELECT i.jid,e.clave AS id,split_part(i.jid,'@',1) AS telefono,e.mensaje,e.respuesta,e.tipo,
 GREATEST(e.fecha,c.ultimo_en)::text AS creado_en,c.nombre AS nombre_archivo,c.archivado,c.fijado,
 (COALESCE(c.interno,false) OR EXISTS(SELECT 1 FROM legados w WHERE w.canon=i.jid AND w.tipo='interno')) AS interno
 FROM inventario i LEFT JOIN LATERAL(SELECT * FROM eventos e WHERE e.jid=i.jid ORDER BY fecha DESC,clave DESC LIMIT 1)e ON true
 LEFT JOIN LATERAL(SELECT max(nombre) AS nombre,max(ultimo_en) AS ultimo_en,bool_or(archivado) AS archivado,max(fijado) AS fijado,bool_or(interno) AS interno FROM wa_bandeja_chats x LEFT JOIN alias a ON a.jid=x.jid WHERE COALESCE(a.canon,x.jid)=i.jid)c ON true
)`;
