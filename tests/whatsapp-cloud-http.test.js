import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHmac } from 'node:crypto';
import { mountCloud } from '../src/modules/messaging/cloud/routes.js';

test('rutas Cloud: autenticación, firma original y no confirmar un webhook si falla la base',async()=>{
 const app=express();let queries=0;
 const pool={query:async()=>{queries++;return {rows:[]};},connect:async()=>({query:async()=>{queries++;throw new Error('fallo de base privado');},release(){}})};
 const env={WA_CLOUD_MODE:'pilot',WA_CLOUD_PHONE_NUMBER_ID:'10',WA_CLOUD_WABA_ID:'20',WA_CLOUD_ACCESS_TOKEN:'not-real',WA_CLOUD_APP_SECRET:'test-secret',WA_CLOUD_VERIFY_TOKEN:'verify-secret',WA_CLOUD_API_VERSION:'v99.0',WA_CLOUD_TEST_RECIPIENTS:'34600000001'};
 mountCloud({app,express,pool,env,requireAuth:roles=>(req,res,next)=>{
   if(req.get('authorization')!=='Bearer test-direction')return res.sendStatus(403);
   assert.deepEqual(roles,['direccion']);req.user={username:'direccion'};next();
 }});
 app.use(express.json());
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/whatsapp/cloud`;
 try{
  assert.equal((await fetch(base+'/status')).status,403);
  assert.equal((await fetch(base+'/conversations')).status,403);
  const st=await(await fetch(base+'/status',{headers:{Authorization:'Bearer test-direction'}})).json();
  assert.equal(st.configured,true);assert.equal(JSON.stringify(st).includes('test-secret'),false);
  assert.equal((await fetch(base+'/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123')).status,403);
  assert.equal(await(await fetch(base+'/webhook?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=123')).text(),'123');
  assert.equal((await fetch(base+'/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal(queries,0);
  const raw='{"object":"whatsapp_business_account","entry":[]}';
  const signature='sha256='+createHmac('sha256',env.WA_CLOUD_APP_SECRET).update(raw).digest('hex');
  const result=await fetch(base+'/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':signature},body:raw});
  assert.equal(result.status,500);assert.equal((await result.text()).includes('privado'),false);
 }finally{await new Promise(r=>server.close(r));}
});
