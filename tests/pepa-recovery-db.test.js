import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {SCHEMA} from '../src/modules/pepa-email/queue.js';
import {recoverCampaign,SUBJECT} from '../src/modules/pepa-email/recovery.js';
test('recupera 158 envíos, sus bajas y 3128 pendientes sin enviar',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const name='pepa_recovery_'+randomBytes(6).toString('hex');
 const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query('CREATE SCHEMA '+name);
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+name});
 try{
  await pool.query(SCHEMA);
  await pool.query(`INSERT INTO pepa_email_queue(email,position,basis,source_hash,token) SELECT 'u'||n||'@example.com',n,'excel_yes','source',lpad(n::text,64,'0') FROM generate_series(1,3286) n`);
  const sent=Array.from({length:158},(_,i)=>({id:'id'+(i+1),to:['u'+(i+1)+'@example.com'],from:'La Pepa <familiadelamor@familiadelamor.org>',subject:SUBJECT,created_at:'2026-10-13T10:00:00Z'}));
  const api=async(path,opts={})=>{assert.notEqual(opts.method,'POST');if(path.startsWith('/emails?'))return{data:[...sent,{created_at:'2026-10-12T10:00:00Z',subject:'otro'}],has_more:false};const row=sent.find(r=>'/emails/'+r.id===path);return{...row,text:'https://familiadelamor.org/la-pepa/baja/'+'a'+row.id.slice(2).padStart(63,'0')};};
  let result;do{result=await recoverCampaign({pool,api,pause:async()=>{}});}while(result.remaining);
  assert.equal(result.sent,158);
  assert.equal(Number((await pool.query("SELECT count(*) n FROM pepa_email_queue WHERE status='pending'")).rows[0].n),3128);
  assert.equal(Number((await pool.query('SELECT count(*) n FROM pepa_email_exclusions')).rows[0].n),158);
  assert.equal((await pool.query("SELECT token FROM pepa_email_queue WHERE email='u1@example.com'")).rows[0].token,'a'+'1'.padStart(63,'0'));
  await pool.query(SCHEMA);assert.equal(Number((await pool.query("SELECT count(*) n FROM pepa_email_queue WHERE status='accepted'")).rows[0].n),158);
 }finally{await pool.end();await admin.query('DROP SCHEMA '+name+' CASCADE');await admin.end();}
});
