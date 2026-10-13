import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { draftRequest, mapManageRow, locationNamesDeLocal } from '../src/modules/reviews/reviews.service.js';
const src=readFileSync(new URL('../server.js',import.meta.url),'utf8');
function setup(path,{row,scope=''}={}) {
 let handler; const writes=[],drafts=[];
 const start=src.indexOf(`app.post("${path}"`), end=src.indexOf('\n});',start)+4;
 const res={statusCode:200,status(n){this.statusCode=n;return this},json(b){this.body=b;return this}};
 vm.runInNewContext(src.slice(start,end),{app:{post:(p,a,h)=>handler=h},requireAuth:()=>{},dbGet:async()=>row,dbRun:async(...a)=>writes.push(a),localScope:()=>scope,locationNamesDeLocal,draftReplyForReview:async r=>{drafts.push(r);return 'Gracias'}});
 return {writes,drafts,async run(body){await handler({params:{id:'1'},body},res);return res}};
}
const row={id:'1',location_name:'La Tapeta - Blanes',google_reply:'Gracias por visitarnos',ai_context:'Pendiente de contrastar'};
test('aprueba solo la respuesta publicada y permite retirar el ejemplo sin tocar Google',async()=>{
 const s=setup('/api/reviews/:id/ai-context',{row});
 assert.equal((await s.run({context:' Nota ',example:true})).body.ok,true);
 assert.deepEqual(Array.from(s.writes[0][1]),['Nota',row.google_reply,'1']);
 await s.run({context:'',example:false}); assert.equal(s.writes[1][1][1],null);
 assert.doesNotMatch(s.writes[0][0],/SET google_reply|SET reply/);
});
test('contexto rechaza permisos, entradas grandes y ejemplos sin respuesta pública',async()=>{
 for(const [opts,body,status] of [[{}, {context:'',example:true},404],[{row,scope:'La Tapeta - Girona'},{context:'',example:false},403],[{row:{...row,google_reply:null}},{context:'',example:true},400],[{row},{context:'x'.repeat(2001),example:false},400],[{row},{context:'',example:'true'},400]]){
  const s=setup('/api/reviews/:id/ai-context',opts); assert.equal((await s.run(body)).statusCode,status);assert.equal(s.writes.length,0);
 }
});
test('borrador usa contexto escrito o guardado, sin persistir ni publicar automáticamente',async()=>{
 for(const body of [{id:'1'},{id:'1',context:'Aún no sabemos qué pasó'}]){
  const s=setup('/api/reviews/draft',{row:{...row}});await s.run(body);
  assert.equal(s.drafts[0].ai_context,body.context??row.ai_context);assert.equal(s.writes.length,0);
 }
 const denied=setup('/api/reviews/draft',{row,scope:'La Tapeta - Girona'});assert.equal((await denied.run({id:'1'})).statusCode,403);assert.equal(denied.drafts.length,0);
});
test('prompt limita ejemplos, separa notas de texto público y no presenta contexto como prueba',()=>{
 const p=draftRequest({...row,rating:2,text:'Tardaron mucho'},Array.from({length:5},(_,i)=>({rating:2,ai_example:`Ejemplo ${i}`})));
 assert.match(p.messages[0].content,/Pendiente de contrastar/);assert.match(p.messages[0].content,/Ejemplo 2/);assert.doesNotMatch(p.messages[0].content,/Ejemplo 3/);
 assert.match(p.system,/no una prueba independiente/);assert.match(p.system,/no reveles notas internas/);assert.match(p.system,/SOLO para el tono/);
 const mapped=mapManageRow({...row,ai_example:'Aprobada'});assert.equal(mapped.ai_example,true);assert.equal(mapped.ai_context,row.ai_context);
});
