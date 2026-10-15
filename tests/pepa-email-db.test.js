import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SCHEMA,createQueue,registerRoutes } from '../src/modules/pepa-email/queue.js';
let pg;try{pg=(await import('pg')).default;}catch{}
test('cola La Pepa: prioridad, baja persistente, concurrencia y respuestas inciertas',{skip:!pg||!process.env.TEST_DATABASE_URL},async()=>{
 const name='pepa_test_'+randomBytes(6).toString('hex');
 const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
 await admin.query('CREATE SCHEMA '+name);
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+name,max:5});
 try {
   await pool.query(SCHEMA);
   for(const [email,position,token] of [['last@example.com',3,'a'],['first@example.com',1,'b'],['optout@example.com',2,'c']])await pool.query("INSERT INTO pepa_email_queue(email,position,basis,source_hash,token) VALUES($1,$2,'excel_yes','source',$3)",[email,position,token.repeat(64)]);
   let sends=[],fail=false;
   const api=async(path,options={})=>{
     if(path.startsWith('/domains/'))return{name:'familiadelamor.org',status:'verified',open_tracking:false,click_tracking:false};
     if(path==='/usage')return{emails:{daily:{used:0,limit:100},monthly:{used:0,limit:3000}}};
     if(path==='/emails'){sends.push(options.body.to[0]);if(fail)throw Error('timeout');return{id:'test-id'};}
     return null;
   };
   const make=()=>createQueue({pool,api,now:()=>Date.parse('2026-10-13T12:00:00Z'),pause:async()=>{}});
   const q=make();await q.tick();assert.equal(sends.length,0,'viene apagada');
   assert.equal(await q.unsubscribe('c'.repeat(64)),true);
   assert.equal(await q.unsubscribe('c'.repeat(64)),true,'baja idempotente');
   assert.equal(await q.unsubscribe('mal'),false);
   await pool.query('UPDATE pepa_email_control SET active=TRUE,verified=TRUE');
   await pool.query(SCHEMA);
   assert.equal((await pool.query('SELECT active FROM pepa_email_control')).rows[0].active,true,'publicar de nuevo no desactiva');
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM pepa_email_queue')).rows[0].n,3,'inicialización conserva destinatarios');
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM pepa_email_exclusions')).rows[0].n,1,'inicialización conserva bajas');
   await Promise.all([q.tick(),make().tick()]);assert.deepEqual(sends,['first@example.com']);
   assert.equal((await pool.query("SELECT status FROM pepa_email_queue WHERE email='optout@example.com'")).rows[0].status,'excluded');
   fail=true;await q.tick();assert.deepEqual(sends,['first@example.com','last@example.com']);
   assert.equal((await pool.query('SELECT active FROM pepa_email_control')).rows[0].active,false);
   await pool.query('UPDATE pepa_email_control SET active=TRUE');await q.tick();assert.equal(sends.length,2,'no repite respuesta incierta');
   const routes=new Map();registerRoutes({get:(p,...h)=>routes.set('GET '+p,h.at(-1)),post:(p,...h)=>routes.set('POST '+p,h.at(-1))},{pool,auth:()=>()=>{},urlencoded:()=>()=>{},queue:q,api});
   let code=200,html='';const res={set(){return this;},status(c){code=c;return this;},send(h){html=h;return this;}};
   await routes.get('GET /la-pepa/baja/:token')({params:{token:'b'.repeat(64)}},res);assert.equal(code,200);assert.match(html,/form method="post"/);
   assert.equal((await pool.query("SELECT 1 FROM pepa_email_exclusions WHERE email='first@example.com'")).rowCount,0,'GET no da de baja por previsualización');
   await routes.get('POST /la-pepa/baja/:token')({params:{token:'b'.repeat(64)}},res);assert.match(html,/Baja confirmada/);
   assert.equal((await pool.query("SELECT 1 FROM pepa_email_exclusions WHERE email='first@example.com'")).rowCount,1);
 }finally{await pool.end();await admin.query('DROP SCHEMA '+name+' CASCADE');await admin.end();}
});
