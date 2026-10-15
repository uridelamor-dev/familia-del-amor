import { randomBytes, createHash } from 'node:crypto';
import { recoverCampaign, listCampaign } from './recovery.js';
import { readFileSync } from 'node:fs';

export const END = Date.parse('2026-10-31T23:00:00Z');
export const DOMAIN = '0e80c683-e82d-4da5-9892-6a97cb1fc8b8';
const BASE = 'https://familiadelamor.org';
const TEMPLATE = readFileSync(new URL('./template.html', import.meta.url), 'utf8');
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS pepa_email_control (
 id INTEGER PRIMARY KEY CHECK(id=1), active BOOLEAN NOT NULL DEFAULT FALSE,
 verified BOOLEAN NOT NULL DEFAULT FALSE, notice TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
INSERT INTO pepa_email_control(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS pepa_email_queue (
 email TEXT PRIMARY KEY, position INTEGER NOT NULL, basis TEXT NOT NULL,
 source_hash TEXT NOT NULL, token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
 attempted_at TIMESTAMPTZ, resend_id TEXT, reason TEXT);
CREATE TABLE IF NOT EXISTS pepa_email_exclusions (
 email TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;

export function remaining(usage) {
 const windows = [usage?.emails?.daily, usage?.emails?.monthly];
 if (windows.some(w=>!w || !Number.isInteger(w.used) || w.used<0 || !Number.isInteger(w.limit) || w.limit<0)) throw Error('No se pudo verificar el cupo de Resend');
 return Math.max(0, Math.min(100-windows[0].used,...windows.map(w=>w.limit-w.used)));
}
export function normalize(email) {
 const value=String(email||'').trim().toLowerCase();
 if(value.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) throw Error('Email no válido');
 return value;
}
export function validateImport(body) {
 if(body?.enabled!==false || !/^[a-f0-9]{64}$/.test(body.source_sha256||'') || !Array.isArray(body.candidates) || body.candidates.length>5000) throw Error('Archivo de cola no válido');
 const seen=new Set();
 return body.candidates.map((r,i)=>{
   const email=normalize(r.email);
   if(seen.has(email) || !['excel_yes','user_explicit_recipient'].includes(r.basis) || r.position!==i+1) throw Error('Orden, duplicados o permiso no válidos');
   seen.add(email);
   return {email, position:r.position, basis:r.basis};
 });
}
export function payload(row) {
 if(!/^[a-f0-9]{64}$/.test(row.token)) throw Error('Token no válido');
 const url=BASE+'/la-pepa/baja/'+row.token;
 return {from:'La Pepa · PEPAWEEN <familiadelamor@familiadelamor.org>',to:[normalize(row.email)],reply_to:'marketing@la-tapeta.com',
   subject:'🐥 PEPAWEEN · Tu Halloween en Lloret este 31 de octubre',
   html:TEMPLATE.replaceAll('__BAJA_URL__',url),
   text:'PEPAWEEN · Noche del 31 de octubre al 1 de noviembre de 2026. 00:30–06:00 h. Discotropics, Lloret de Mar. +18.\nTú pones el disfraz. Tu grupo, las ganas.\nComprar entradas: https://www.fourvenues.com/uriel-del-amor-ayllon/events/pepaween--31-10-2026-V24D\nViva la Pepa Costa Brava SL · B13834312 · Camí Ral, 8, Tordera\nPrivacidad: '+BASE+'/privacidad.html#la-pepa\nBaja: '+url,
   headers:{'List-Unsubscribe':'<'+url+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},
   tags:[{name:'campaign',value:'pepaween-2026'}]};
}
export function resendClient({env=process.env,fetcher=fetch}={}) {
 return async(path,{method='GET',body,key,nullable=false}={})=>{
   const credential = method==='GET' ? env.RESEND_API_KEY : env.PEPA_RESEND_API_KEY;
   if(!credential) throw Error('Falta la clave de envío o la conexión de consulta de Resend');
   const r=await fetcher('https://api.resend.com'+path,{method,headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
   if(nullable && r.status===404) return null;
   if(!r.ok) { const error=Error('Resend respondió '+r.status+'; no se reintenta ningún envío incierto'); error.retryableRead=method==='GET'&&(r.status===429||r.status>=500); throw error; }
   return r.json();
 };
}
export async function checkDomain(api) {
 const d=await api('/domains/'+DOMAIN);
 if(d.name!=='familiadelamor.org' || d.status!=='verified') throw Error('Dominio no verificado');
 if(d.open_tracking!==false || d.click_tracking!==false) throw Error('Debe comprobarse y desactivarse el seguimiento de aperturas y clics antes de activar La Pepa');
}
export async function remoteExcluded(api,email) {
 const suppression=await api('/suppressions/'+encodeURIComponent(email),{nullable:true});
 if(suppression) return true;
 const contact=await api('/contacts/'+encodeURIComponent(email),{nullable:true});
 if(contact && typeof contact.unsubscribed!=='boolean') throw Error('No se pudo verificar la baja del contacto');
 return contact?.unsubscribed===true;
}

export function createQueue({pool,api=resendClient(),now=()=>Date.now(),pause=ms=>new Promise(r=>setTimeout(r,ms))}) {
 let running=false;
 async function tick() {
   if(running) return;
   running=true;
   let c,locked=false,claimed=false;
   try {
     c=await pool.connect();
     locked=(await c.query('SELECT pg_try_advisory_lock(810026) AS locked')).rows[0].locked;
     if(!locked) return;
     const control=(await c.query('SELECT * FROM pepa_email_control WHERE id=1')).rows[0];
     if(!control.active || !control.verified) return;
     if(now()>=END) {await c.query("UPDATE pepa_email_control SET active=FALSE,notice='Campaña finalizada por fecha',updated_at=NOW() WHERE id=1");return;}
     const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',hour:'2-digit',hourCycle:'h23'}).format(new Date(now())));
     if(hour<10 || hour>=21) return;
     // A restart after an uncertain response is held for review, never sent again.
     await c.query("UPDATE pepa_email_queue SET status='review',reason='Envío interrumpido: comprobar Resend antes de repetir' WHERE status='sending'");
     await checkDomain(api); await pause(600);
     if(!remaining(await api('/usage'))) return;
     const daily=(await c.query("SELECT COUNT(*)::int AS n FROM pepa_email_queue WHERE attempted_at >= date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'")).rows[0].n;
     if(daily>=100) return;
     const row=(await c.query("SELECT * FROM pepa_email_queue WHERE status='pending' ORDER BY position LIMIT 1")).rows[0];
     if(!row) {await c.query("UPDATE pepa_email_control SET active=FALSE,notice='Cola completada',updated_at=NOW() WHERE id=1");return;}
     const local=(await c.query('SELECT 1 FROM pepa_email_exclusions WHERE email=$1',[row.email])).rowCount;
     await pause(600);
     if(local || await remoteExcluded(async(...args)=>{await pause(600);return api(...args);},row.email)) {
       await c.query("UPDATE pepa_email_queue SET status='excluded',reason='Baja o bloqueo' WHERE email=$1",[row.email]);return;
     }
     // Commit the claim BEFORE contacting Resend. A crash cannot create a duplicate.
     await c.query('BEGIN');
     await c.query('SELECT email FROM pepa_email_queue WHERE email=$1 FOR UPDATE',[row.email]);
     const gate=(await c.query('SELECT active,verified FROM pepa_email_control WHERE id=1')).rows[0];
     if(!gate.active || !gate.verified || now()>=END || (await c.query('SELECT 1 FROM pepa_email_exclusions WHERE email=$1',[row.email])).rowCount) {await c.query('ROLLBACK');return;}
     claimed=true;
     await c.query("UPDATE pepa_email_queue SET status='sending',attempted_at=NOW() WHERE email=$1 AND status='pending'",[row.email]);
     await c.query('COMMIT');
     // The per-recipient lock serializes an unsubscribe with the final send operation.
     await c.query('BEGIN');
     const current=(await c.query('SELECT status FROM pepa_email_queue WHERE email=$1 FOR UPDATE',[row.email])).rows[0];
     if(current.status!=='sending' || (await c.query('SELECT 1 FROM pepa_email_exclusions WHERE email=$1',[row.email])).rowCount) {await c.query('ROLLBACK');return;}
     try {
       await pause(600);
       const result=await api('/emails',{method:'POST',body:payload(row),key:'pepaween-2026-'+createHash('sha256').update(row.email).digest('hex')});
       if(!result.id) throw Error('Resend no confirmó el envío');
       await c.query("UPDATE pepa_email_queue SET status='accepted',resend_id=$2 WHERE email=$1",[row.email,result.id]);
       await c.query('COMMIT');
     } catch(e) {
       await c.query('ROLLBACK');
       await c.query("UPDATE pepa_email_queue SET status='review',reason=$2 WHERE email=$1 AND status='sending'",[row.email,e.message]);
       throw e;
     }
   } catch(e) {
     if(c) {await c.query('ROLLBACK').catch(()=>{});const retry=!claimed&&(e.retryableRead||['TimeoutError','AbortError'].includes(e.name));await c.query('UPDATE pepa_email_control SET active=CASE WHEN $2 THEN active ELSE FALSE END,notice=$1,updated_at=NOW() WHERE id=1',[retry?'Consulta temporalmente no disponible; se volverá a comprobar sin enviar: '+e.message:e.message,retry]).catch(()=>{});}
   } finally {
     if(c) {if(locked) await c.query('SELECT pg_advisory_unlock(810026)').catch(()=>{});c.release();}
     running=false;
   }
 }
 async function unsubscribe(token) {
   if(!/^[a-f0-9]{64}$/.test(token||'')) return false;
   const c=await pool.connect();
   try {
     await c.query('BEGIN');
     const row=(await c.query('SELECT email FROM pepa_email_queue WHERE token=$1 FOR UPDATE',[token])).rows[0];
     if(!row) {await c.query('ROLLBACK');return false;}
     await c.query("INSERT INTO pepa_email_exclusions(email,reason) VALUES($1,'Baja solicitada') ON CONFLICT DO NOTHING",[row.email]);
     await c.query("UPDATE pepa_email_queue SET status='excluded',reason='Baja solicitada' WHERE email=$1 AND status IN ('pending','sending','review')",[row.email]);
     await c.query('COMMIT');return true;
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 return {tick,unsubscribe};
}

const page=(body)=>`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>La Pepa · Preferencias de correo</title><style>body{margin:0;background:#071219;color:#f8fafc;font:18px/1.6 Arial,sans-serif}main{max-width:540px;margin:10vh auto;padding:28px}button{background:#f6c851;color:#071219;border:0;border-radius:8px;padding:18px;font-size:18px;font-weight:bold;cursor:pointer;width:100%}a{color:#f6c851}</style><main><h1>La Pepa</h1>${body}<p><a href="/privacidad.html#la-pepa">Privacidad</a></p></main></html>`;
export function registerRoutes(app,{pool,auth,urlencoded,queue,api=resendClient()}) {
 app.get('/la-pepa/baja/:token',async(req,res)=>{
   res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});
   if(!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(404).send(page('<p>Enlace no válido.</p>'));
   try {
     const found=await pool.query('SELECT 1 FROM pepa_email_queue WHERE token=$1',[req.params.token]);
     if(!found.rowCount) return res.status(404).send(page('<p>Enlace no válido.</p>'));
     res.send(page('<p>Dejarás de recibir promociones por correo de La Pepa. No afecta a tus entradas.</p><form method="post"><button type="submit">Dejar de recibir promociones</button></form>'));
   }catch{res.status(503).send(page('<p>No podemos comprobar el enlace ahora. Inténtalo de nuevo o escribe a marketing@la-tapeta.com.</p>'));}
 });
 app.post('/la-pepa/baja/:token',urlencoded({extended:false,limit:'2kb'}),async(req,res)=>{
   res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});
   try {const ok=await queue.unsubscribe(req.params.token);res.status(ok?200:404).send(page(ok?'<h2>Baja confirmada</h2><p>No recibirás más promociones por correo de La Pepa.</p>':'<p>Enlace no válido.</p>'));}
   catch{res.status(503).send(page('<p>No se ha podido guardar la baja. Inténtalo de nuevo o escribe a marketing@la-tapeta.com.</p>'));}
 });
 app.get('/api/la-pepa/email',auth(['direccion']),async(req,res)=>{
   res.set('Cache-Control','no-store');
   try {res.json({control:(await pool.query('SELECT * FROM pepa_email_control WHERE id=1')).rows[0],counts:(await pool.query('SELECT status,COUNT(*)::int AS total FROM pepa_email_queue GROUP BY status')).rows});}
   catch{res.status(503).json({error:'No se pudo consultar la cola'});}
 });
 app.post('/api/la-pepa/email/recover',auth(['direccion']),async(req,res)=>{
   try{res.json(await recoverCampaign({pool,api}));}catch(e){res.status(400).json({error:e.message});}
 });
 app.post('/api/la-pepa/email/import',auth(['direccion']),async(req,res)=>{
   let c;
   try {
     const rows=validateImport(req.body);c=await pool.connect();await c.query('BEGIN');
     const control=(await c.query('SELECT active FROM pepa_email_control WHERE id=1 FOR UPDATE')).rows[0];
     if(control.active) throw Error('Pausa la cola antes de importar');
     await c.query(`INSERT INTO pepa_email_queue(email,position,basis,source_hash,token) SELECT email,position,basis,$2,token FROM jsonb_to_recordset($1::jsonb) AS r(email text,position integer,basis text,token text) ON CONFLICT(email) DO NOTHING`,[JSON.stringify(rows.map(r=>({...r,token:randomBytes(32).toString('hex')}))),req.body.source_sha256]);
     await c.query('COMMIT');res.json({ok:true,imported:rows.length});
   }catch(e){if(c)await c.query('ROLLBACK');res.status(400).json({error:e.message});}finally{if(c)c.release();}
 });
 app.post('/api/la-pepa/email/test',auth(['direccion']),async(req,res)=>{
   try {
     const email='info@la-tapeta.com';
     await pool.query("INSERT INTO pepa_email_queue(email,position,basis,source_hash,token,status) VALUES($1,0,'test','test',$2,'test') ON CONFLICT(email) DO NOTHING",[email,randomBytes(32).toString('hex')]);
     const row=(await pool.query('SELECT * FROM pepa_email_queue WHERE email=$1',[email])).rows[0];
     if(row.basis!=='test') throw Error('El destinatario de prueba ya está en la campaña');
     const url=BASE+'/la-pepa/baja/'+row.token;
     res.json({ok:true,url});
   }catch(e){res.status(400).json({error:e.message});}
 });
 app.post('/api/la-pepa/email/control',auth(['direccion']),async(req,res)=>{
   try {
     if(typeof req.body.active!=='boolean') throw Error('Indica activar o pausar');
     if(req.body.active) {
       if(Number((await pool.query("SELECT count(*) AS n FROM pepa_email_queue WHERE basis<>'test'")).rows[0].n)!==3286) throw Error('La cola está vacía o incompleta: recuperar antes de activar');
       if((await pool.query("SELECT 1 FROM pepa_email_queue WHERE reason='recuperar enlace original' LIMIT 1")).rowCount) throw Error('Termina la recuperación de enlaces antes de activar');
       const history=await listCampaign(api);
       for(const [email,row] of history){if(!(await pool.query("SELECT 1 FROM pepa_email_queue WHERE email=$1 AND resend_id=$2 AND status IN ('accepted','excluded')",[email,row.id])).rowCount) throw Error('El historial no coincide con Resend: recuperar antes de activar');}
       if(req.body.verified!==true) throw Error('Primero verifica una baja real de prueba y el alcance de los permisos');
       if(Date.now()>=END) throw Error('El evento ya ha llegado');
       await checkDomain(api);await new Promise(r=>setTimeout(r,600));remaining(await api('/usage'));
       if(!(await pool.query("SELECT 1 FROM pepa_email_exclusions WHERE email='info@la-tapeta.com'")).rowCount) throw Error('Falta una baja de prueba verificada');
     }
     await pool.query('UPDATE pepa_email_control SET active=$1,verified=$2,notice=NULL,updated_at=NOW() WHERE id=1',[req.body.active,req.body.active]);
     res.json({ok:true,active:req.body.active});
   }catch(e){res.status(400).json({error:e.message});}
 });
}
