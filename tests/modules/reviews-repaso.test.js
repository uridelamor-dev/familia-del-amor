import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crearRepaso} from '../../src/modules/reviews/repaso.js';
import {REPASO_ID,POLITICA,huellaResena,validarPropuesta,revisarOriginal} from '../../src/modules/reviews/repaso-politica.js';
import {buildManageQuery,mapManageRow} from '../../src/modules/reviews/reviews.service.js';
const r={id:'r1',google_name:'accounts/1/locations/2/reviews/3',text:'Muy bien',rating:5,fecha:new Date(Date.now()-86400000).toISOString(),location_name:'Blanes'};
const positive={decision:'responder',delicada:false,motivo:'Agradecimiento reciente',respuesta:'Gracias por tu visita.'};
test('la regla conservadora prevalece sobre el modelo y rechaza respuestas inválidas',()=>{
  assert.equal(validarPropuesta(positive,r).decision,'responder');
  for (const row of [{...r,rating:2},{...r,fecha:'2020-01-01'},{...r,fecha:'incorrecta'}]) assert.equal(validarPropuesta(positive,row).decision,'no_responder');
  assert.equal(validarPropuesta({...positive,delicada:true},r).decision,'no_responder');
  assert.equal(validarPropuesta({...positive,delicada:undefined},r).decision,'no_responder');
  assert.throws(()=>validarPropuesta({...positive,respuesta:''},r));
});
test('el contador nuevo incluye borradores y excluye el histórico por fecha fija',()=>{
 const cutoff='2026-10-13T15:00:00Z';
 const pending=buildManageQuery({estado:'pendientes',cutoff});
 assert.match(pending.where,/google_reply/);assert.doesNotMatch(pending.where,/NULLIF\(reply/);assert.match(pending.where,/>= \?/);assert.deepEqual(pending.params,[cutoff]);
 assert.match(buildManageQuery({estado:'historicas',cutoff}).where,/< \?/);
 assert.equal(mapManageRow({...r,reply:'Borrador'}).respondida,false);
 assert.equal(mapManageRow({...r,google_reply:'Publicada'}).respondida,true);
});
test('Google ya respondido o modificado se distingue de un envío recuperado',()=>{
 const item={snapshot:r,reply:positive.respuesta};
 assert.equal(revisarOriginal(item,{comment:r.text,starRating:'FIVE'}),'sin_respuesta');
 assert.equal(revisarOriginal(item,{comment:'Editada',starRating:'FIVE'}),'modificada');
 assert.equal(revisarOriginal(item,{reviewReply:{comment:'Respuesta de Laura'}}),'ya_respondida');
 assert.equal(revisarOriginal(item,{reviewReply:{comment:positive.respuesta}}),'ya_enviada');
});
// Doble de persistencia compartido entre trabajadores: no red, no base de producción.
function database({approved=true,state='cola',count=1}={}) {
 const campaign={id:REPASO_ID,state,cutoff:new Date().toISOString(),approved_at:approved?'yes':null,policy:POLITICA,paused:false};
 const rows=Array.from({length:count},(_,i)=>({...r,id:'r'+i,google_name:r.google_name+i}));
 const items=rows.map(row=>({review_id:row.id,snapshot:{...row},fingerprint:huellaResena(row),state:'cola',reply:positive.respuesta,attempts:0}));
 let locked=false;const errors=[];
 const db={campaign,items,rows,errors,async query(sql,p=[]){
   const result=(rows=[],rowCount=rows.length)=>({rows,rowCount});
   if(sql.startsWith('SELECT pg_try')){if(locked)return result([{locked:false}]);locked=true;return result([{locked:true}]);}
   if(sql.startsWith('SELECT pg_advisory_unlock')){locked=false;return result();}
   if(/^(CREATE|BEGIN|COMMIT|ROLLBACK)/.test(sql)) return result();
   if(sql.startsWith('INSERT INTO reviews_repaso(id'))return result();
   if(sql.startsWith('INSERT INTO reviews_repaso_items')) {items.forEach(x=>x.state='pendiente');return result();}
   if(sql.startsWith('SELECT ai_example'))return result([]);
   if(sql.startsWith('SELECT cutoff'))return result([{cutoff:campaign.cutoff}]);
   if(sql.startsWith('SELECT * FROM reviews_repaso WHERE'))return result([{...campaign}]);
   if(sql.startsWith('SELECT * FROM reviews_repaso_items'))return result(items.filter(x=>sql.includes("state='pendiente'")?x.state==='pendiente':['cola','enviando'].includes(x.state)).sort((a,b)=>(a.state==='enviando'?-1:1)).slice(0,1).map(x=>structuredClone(x)));
   if(sql.startsWith('SELECT * FROM google_reviews'))return result(rows.filter(x=>x.id===p[0]));
   if(sql.startsWith('UPDATE reviews_repaso_items')){
     const item=items.find(x=>x.review_id===p[1]);
     if(sql.includes('state=$3')) Object.assign(item,{state:p[2],reason:p[3],reply:p[4]});
     if(sql.includes('attempts=attempts+1'))item.attempts++;
     if(sql.includes('fingerprint=$3'))item.fingerprint=p[2];
     if(sql.includes("state='enviando'"))item.state='enviando';
     if(sql.includes("state='enviada'"))item.state='enviada';
     return result([],1);
   }
   if(sql.startsWith('UPDATE google_reviews')) {rows.find(x=>x.id===p[0]).google_reply=p[1];return result([],1);}
   if(sql.startsWith('UPDATE reviews_repaso SET')) {
     if(sql.includes('next_send_at=NOW()'))campaign.next_send_at=new Date(Date.now()+p[1]);
     if(sql.includes("state='terminada'"))campaign.state='terminada';
     if(sql.includes("state='cola'"))campaign.state='cola';
     if(sql.includes("state='analizando'"))Object.assign(campaign,{state:'analizando',approved_at:'now',approved_by:p[1],policy:p[2]});
     if(sql.includes('paused=$2')) {campaign.paused=p[1];if(p[2])campaign.state='cancelada';}
     if(sql.includes('paused=TRUE'))campaign.paused=true;
     if(sql.includes('error=$2'))campaign.error=p[1];
     if(sql.includes('seen_at=NOW()')){if(campaign.seen_at)return result();campaign.seen_at='yes';return result([{id:REPASO_ID}]);}
     return result([],1);
   }
   errors.push(sql);throw Error('SQL no esperado en prueba');
 },async connect(){return{query:db.query.bind(db),release(){}}}};
 return db;
}
async function harness(options={}, apiOverrides={}){
 const pool=database(options);const sent=[];
 const api={leer:async()=>({comment:r.text,starRating:'FIVE'}),publicar:async(name,reply)=>{sent.push(name);return{comment:reply,updateTime:new Date().toISOString()}},...apiOverrides};
 const deps={pool,enabled:true,analizar:async()=>positive,google:async()=>api};
 const worker=crearRepaso(deps);await worker.init();return{pool,worker,sent,deps,api};
}
test('ningún envío sin autorización y aviso solo una vez, incluso tras reiniciar',async()=>{
 const h=await harness({approved:false});await h.worker.tick();assert.equal(h.sent.length,0);
 assert.equal(await h.worker.notice(),true);
 const again=crearRepaso(h.deps);await again.init();assert.equal(await again.notice(),false);
 assert.equal(await again.cutoff(),h.pool.campaign.cutoff);
 await assert.rejects(again.authorize('user','política diferente'));
});
test('desarrollo crea el mismo esquema, pero no crea campañas ni ejecuta análisis o envíos',async()=>{
 const sql=[];
 const w=crearRepaso({enabled:false,pool:{async query(q){sql.push(q);return {rows:[]};}}});
 await w.init();await w.tick();
 assert.equal(await w.cutoff(),null);assert.deepEqual(await w.status(),{available:false});
 assert.equal(sql.length,3);assert.ok(sql.every(q=>q.startsWith('CREATE')));
 assert.ok(sql.some(q=>q.includes('CREATE TABLE IF NOT EXISTS reviews_repaso (')));
 assert.ok(sql.some(q=>q.includes('CREATE TABLE IF NOT EXISTS reviews_repaso_items (')));
});
test('reanudar tras despliegue conserva decisiones y analiza solo lo pendiente',async()=>{
 const h=await harness({state:'analizando',count:3});
 h.pool.items[0].state='omitir';h.pool.items[1].state='cola';h.pool.items[2].state='pendiente';
 const saved=structuredClone(h.pool.items.slice(0,2));
 let calls=0;const restarted=crearRepaso({...h.deps,analizar:async()=>{calls++;return positive;}});
 await restarted.init();await restarted.tick();await restarted.tick();
 assert.deepEqual(h.pool.items.slice(0,2),saved);assert.equal(calls,1);
 assert.equal(h.pool.campaign.state,'cola');assert.equal(h.sent.length,0);assert.deepEqual(h.pool.errors,[]);
});
test('persistencia del intervalo de cinco minutos y exclusión entre dos trabajadores',async()=>{
 const h=await harness({count:2});const second=crearRepaso(h.deps);await second.init();
 await Promise.all([h.worker.tick(),second.tick()]);assert.equal(h.sent.length,1);
 assert.ok(h.pool.campaign.next_send_at.getTime()>Date.now()+290000);
 await second.tick();assert.equal(h.sent.length,1);
 h.pool.campaign.next_send_at=new Date(Date.now()-1);await second.tick();assert.equal(h.sent.length,2);assert.deepEqual(h.pool.errors,[]);
});
test('un envío ambiguo se verifica tras reiniciar, sin repetir PUT',async()=>{
 const h=await harness({}, {publicar:async()=>{throw Error('timeout')}});
 await h.worker.tick();assert.equal(h.pool.items[0].state,'enviando');
 h.api.leer=async()=>({reviewReply:{comment:positive.respuesta,updateTime:'now'}});
 const restarted=crearRepaso(h.deps);await restarted.init();await restarted.tick();
 assert.equal(h.pool.items[0].state,'enviada');assert.equal(h.pool.rows[0].google_reply,positive.respuesta);assert.deepEqual(h.pool.errors,[]);
});
test('un envío no confirmado no se repite aunque Google no devuelva respuesta',async()=>{
 const h=await harness({}, {publicar:async()=>{throw Error('timeout')}});
 await h.worker.tick();await h.worker.tick();assert.equal(h.pool.items[0].state,'incierta');assert.equal(h.pool.rows[0].google_reply,undefined);
});
test('respeta borrador, edición o respuesta del equipo antes de enviar',async()=>{
 for(const change of [{reply:'Borrador'},{text:'Editada'},{google_reply:'Respuesta manual'}]){
  const h=await harness();Object.assign(h.pool.rows[0],change);await h.worker.tick();assert.equal(h.sent.length,0);assert.equal(h.pool.items[0].state,'omitir');
 }
 const h=await harness({}, {leer:async()=>({reviewReply:{comment:'Respuesta externa'}})});await h.worker.tick();assert.equal(h.sent.length,0);
});
test('pausa, reanudación, cancelación y rechazo de cuota',async()=>{
 const h=await harness();await h.worker.control('pausar');await h.worker.tick();assert.equal(h.sent.length,0);
 await h.worker.control('reanudar');await h.worker.tick();assert.equal(h.sent.length,1);
 const cancel=await harness();await cancel.worker.control('cancelar');await cancel.worker.tick();assert.equal(cancel.sent.length,0);
 const quota=await harness({}, {publicar:async()=>{throw Error('Google Business Profile: HTTP 429')}});await quota.worker.tick();assert.equal(quota.pool.campaign.paused,true);assert.equal(quota.pool.items[0].state,'enviando');
});

test('autorizar es idempotente, analiza antes de enviar y conserva el consentimiento',async()=>{
 const h=await harness({approved:false,state:'nuevo'});
 await h.worker.authorize('Uriel',POLITICA);
 assert.equal(h.pool.campaign.approved_by,'Uriel');assert.equal(h.pool.items[0].state,'pendiente');
 await h.worker.tick();assert.equal(h.pool.items[0].state,'cola');assert.equal(h.sent.length,0);
 await h.worker.authorize('Otro',POLITICA);assert.equal(h.pool.campaign.approved_by,'Uriel');
 await h.worker.tick();assert.equal(h.pool.campaign.state,'cola');await h.worker.tick();assert.equal(h.sent.length,1);assert.deepEqual(h.pool.errors,[]);
});
test('tras tres análisis fallidos conserva error y no publica',async()=>{
 const h=await harness({approved:false,state:'nuevo'});h.deps.analizar=async()=>{throw Error('IA no disponible');};
 const worker=crearRepaso(h.deps);await worker.init();await worker.authorize('Uriel',POLITICA);
 for(let i=0;i<5;i++) await worker.tick();
 assert.equal(h.pool.items[0].state,'error');assert.equal(h.sent.length,0);assert.deepEqual(h.pool.errors,[]);
});
