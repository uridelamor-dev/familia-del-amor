// Recuperación conservadora: solo consultas a Resend; nunca envía ni reactiva.
export const SUBJECT = '🐥 PEPAWEEN · Tu Halloween en Lloret este 31 de octubre';
const START = Date.parse('2026-10-13T00:00:00Z');
export async function listCampaign(api, pause = ms => new Promise(r=>setTimeout(r,ms))) {
 const found = new Map(); let after = '';
 for(let page=0;page<100;page++) {
  await pause(650);
  const result=await api('/emails?limit=100'+(after?'&after='+encodeURIComponent(after):''));
  if(!Array.isArray(result.data)||typeof result.has_more!=='boolean') throw Error('Historial de Resend incompleto');
  let older=false;
  for(const row of result.data) {
   const date=Date.parse(row.created_at);
   if(!Number.isFinite(date)) throw Error('Fecha de Resend no válida');
   if(date<START) older=true;
   if(row.subject!==SUBJECT || date<START) continue;
   if(!row.id || row.to?.length!==1 || !String(row.from).includes('<familiadelamor@familiadelamor.org>')) throw Error('Envío de campaña no reconocido');
   const email=row.to[0].trim().toLowerCase();
   if(email==='info@la-tapeta.com') continue;
   if(found.has(email)) throw Error('Hay envíos duplicados: revisión manual necesaria');
   found.set(email,row);
  }
  if(older) return [...found.entries()];
  if(!result.has_more) throw Error('No se acredita cobertura anterior al inicio de la campaña');
  const next=result.data.at(-1)?.id;
  if(!next||next===after) throw Error('Paginación de Resend incompleta');
  after=next;
 }
 throw Error('Historial demasiado extenso');
}
export function tokenFromEmail(detail) {
 const tokens=[...new Set([...String(detail.text||'').matchAll(/https:\/\/familiadelamor\.org\/la-pepa\/baja\/([a-f0-9]{64})/g)].map(m=>m[1]))];
 if(tokens.length!==1) throw Error('No se ha recuperado el enlace original de baja');
 return tokens[0];
}
export async function recoverCampaign({pool,api,pause=ms=>new Promise(r=>setTimeout(r,ms))}) {
 const c=await pool.connect();let locked=false;
 try {
  locked=(await c.query('SELECT pg_try_advisory_lock(810026) AS locked')).rows[0].locked;
  if(!locked) throw Error('La cola está ocupada');
  const control=(await c.query('SELECT * FROM pepa_email_control WHERE id=1')).rows[0];
  if(control.active) throw Error('Pausa la campaña antes de recuperar');
  const size=Number((await c.query("SELECT count(*) AS n FROM pepa_email_queue WHERE basis<>'test'")).rows[0].n);
  if(size!==3286) throw Error('Falta la lista original completa de 3286 destinatarios');
  const sent=await listCampaign(api,pause);
  if(sent.length<158) throw Error('Resend no acredita los 158 envíos conocidos');
  // Primero todos los enviados quedan protegidos, incluso si la consulta de detalles falla.
  await c.query('BEGIN');
  const records=JSON.stringify(sent.map(([email,r])=>({email,id:r.id,created_at:r.created_at})));
  const missing=await c.query(`SELECT s.email FROM jsonb_to_recordset($1::jsonb) AS s(email text,id text,created_at text) LEFT JOIN pepa_email_queue q USING(email) WHERE q.email IS NULL LIMIT 1`,[records]);
  if(missing.rowCount) throw Error('Destinatario enviado ajeno a la lista recuperada');
  await c.query(`UPDATE pepa_email_queue q SET status=CASE WHEN q.status='excluded' THEN q.status ELSE 'accepted' END,resend_id=s.id,attempted_at=s.created_at::timestamptz,reason=CASE WHEN q.resend_id IS DISTINCT FROM s.id THEN 'recuperar enlace original' ELSE q.reason END FROM jsonb_to_recordset($1::jsonb) AS s(email text,id text,created_at text) WHERE q.email=s.email`,[records]);
  await c.query(`INSERT INTO pepa_email_exclusions(email,reason) SELECT s.email,'Recuperación: enviado anteriormente, no reenviar' FROM jsonb_to_recordset($1::jsonb) AS s(email text,id text,created_at text) ON CONFLICT DO NOTHING`,[records]);
  await c.query('COMMIT');
  const pending=(await c.query("SELECT email,resend_id FROM pepa_email_queue WHERE reason='recuperar enlace original' ORDER BY position LIMIT 10")).rows;
  for(const row of pending) {
   await pause(650);const detail=await api('/emails/'+encodeURIComponent(row.resend_id));
   if(detail.subject!==SUBJECT||detail.to?.length!==1||detail.to[0].toLowerCase()!==row.email) throw Error('Detalle de Resend no coincide');
   const token=tokenFromEmail(detail);
   await c.query("UPDATE pepa_email_queue SET token=$2,reason='Recuperado de Resend; no reenviar' WHERE email=$1",[row.email,token]);
  }
  const left=Number((await c.query("SELECT count(*) AS n FROM pepa_email_queue WHERE reason='recuperar enlace original'")).rows[0].n);
  await c.query('UPDATE pepa_email_control SET notice=$1,updated_at=NOW() WHERE id=1',[left?'Recuperación en curso: faltan '+left+' enlaces de baja':'Historial recuperado. Enviados protegidos; comprobar baja antes de activar.']);
  return {sent:sent.length,remaining:left};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{if(locked)await c.query('SELECT pg_advisory_unlock(810026)').catch(()=>{});c.release();}
}
