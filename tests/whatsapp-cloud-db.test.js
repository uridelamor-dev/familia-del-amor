import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ensureCloudSchema, createStore } from '../src/modules/messaging/cloud/store.js';
import { CloudError } from '../src/modules/messaging/cloud/protocol.js';

test('Cloud con PostgreSQL: deduplicación, concurrencia, ventana y envío incierto', {skip:!process.env.WA_TEST_DATABASE_URL},async t=>{
 const {default:pg}=await import(process.env.WA_TEST_PG_MODULE || 'pg');
 const pool=new pg.Pool({connectionString:process.env.WA_TEST_DATABASE_URL});
 // Este test exige una base separada y nunca toca las tablas operativas de la aplicación.
 const dbName=(await pool.query('SELECT current_database() n')).rows[0].n;
 assert.match(dbName,/^codex_whatsapp_cloud_test_/);
 await ensureCloudSchema(pool);
 await pool.query('TRUNCATE wa_cloud_audit,wa_cloud_statuses,wa_cloud_messages,wa_cloud_conversations RESTART IDENTITY CASCADE');
 const number='34600000001',cfg={ready:true,recipients:new Set([number])};let calls=0;
 const api={identity:async()=>({display_phone_number:'+1 555 000 0001'}),templates:async()=>[],send:async()=>{calls++;return 'wamid.out';}};
 const store=createStore(pool,api,cfg);
 const event={kind:'message',id:'wamid.in',phone:number,name:'Prueba',type:'text',text:'Hola',at:new Date().toISOString()};
 try{
 await t.test('un webhook duplicado guarda solo una entrada',async()=>{
  await Promise.all([store.ingest([event]),store.ingest([event])]);
  assert.equal((await store.conversation(number)).messages.length,1);
 });
 await t.test('dos operadores no pueden tomar a la vez el mismo chat',async()=>{
  const results=await Promise.allSettled([store.take(number,'Ana'),store.take(number,'Luis')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected')[0].reason.status,409);
 });
 const owner=(await store.conversation(number)).conversation.owner;
 await t.test('repetir la petición de envío no repite el mensaje',async()=>{
  const body={requestId:randomUUID(),type:'text',text:'Respuesta'};
  const results=await Promise.all([store.send(number,body,owner),store.send(number,body,owner)]);
  assert.equal(calls,1);assert.equal(results[0].id,results[1].id);
  await assert.rejects(store.send(number,{...body,text:'Otro mensaje'},owner),e=>e.status===409);
 });
 await t.test('estados desordenados y repetidos conservan la lectura',async()=>{
  await store.ingest([{kind:'status',id:'wamid.out',status:'read'},{kind:'status',id:'wamid.out',status:'sent'}]);
  assert.equal((await store.conversation(number)).messages.at(-1).status,'read');
 });
 await t.test('resolver y recibir otro mensaje reabre la atención sin activar Sara',async()=>{
  await store.resolve(number,owner);await store.ingest([{...event,id:'wamid.in2'}]);
  const c=(await store.conversation(number)).conversation;assert.equal(c.state,'pending');assert.equal(c.owner,null);
 });
 await store.take(number,owner);
 await t.test('un timeout no dispara reintentos ni permite otro envío a ciegas',async()=>{
  api.send=async()=>{calls++;throw new CloudError('Incierto',502,'uncertain');};
  const body={requestId:randomUUID(),type:'text',text:'Prueba de corte'};
  await assert.rejects(store.send(number,body,owner));const count=calls;
  const same=await store.send(number,body,owner);assert.equal(same.status,'uncertain');assert.equal(calls,count);
  await assert.rejects(store.send(number,{...body,requestId:randomUUID()},owner),e=>e.status===409);
  await assert.rejects(store.resolve(number,owner),e=>e.status===409);
  await store.ingest([{kind:'status',id:'wamid.recovered',status:'delivered',reference:body.requestId,phone:number}]);
  assert.equal((await store.conversation(number)).messages.at(-1).status,'delivered');
 });
 await t.test('el número real nunca se usa para enviar durante el piloto',async()=>{
  const previous=calls;api.identity=async()=>({display_phone_number:'+34 633 129 031'});
  await assert.rejects(store.send(number,{requestId:randomUUID(),type:'text',text:'Bloqueado'},owner),e=>e.code==='real_number');
  assert.equal(calls,previous);
 });
 }finally{await pool.end();}
});
