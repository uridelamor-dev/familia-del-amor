import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { esNombreResena } from '../src/modules/reviews/business-profile.js';
import { locationNamesDeLocal } from '../src/modules/reviews/reviews.service.js';
const src=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const route=src.slice(src.indexOf('app.post("/api/reviews/:id/publish"'),src.indexOf('// Guardar un borrador no publica'));
function setup({row,scope='',fail=false}={}) {
 let handler; const writes=[],sent=[]; const res={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
 vm.runInNewContext(route,{app:{post:(path,auth,fn)=>handler=fn},requireAuth:()=>{},dbGet:async()=>row,dbRun:async(...a)=>writes.push(a),localScope:()=>scope,locationNamesDeLocal,esNombreResena,getGoogleAccessToken:async()=>'test',clienteBusinessProfile:()=>({publicar:async(name,reply)=>{sent.push({name,reply});if(fail)throw Error('timeout');return {comment:reply,updateTime:'today'}}}),console:{error(){}}});
 return {async run(reply='Gracias'){await handler({params:{id:'1'},body:{reply}},res);return res},writes,sent};
}
const row={id:'1',location_name:'La Tapeta - Blanes',origen:'business_profile',google_name:'accounts/1/locations/2/reviews/3',reply:'Borrador anterior'};
test('publicación bloqueada sin reseña, fuera de local o desde Places',async()=>{
 for (const [opts,status] of [[{},404],[{row,scope:'La Tapeta - Girona'},403],[{row:{...row,origen:'places'}},409]]){
  const s=setup(opts); assert.equal((await s.run()).statusCode,status);assert.equal(s.sent.length,0);assert.equal(s.writes.length,0);
 }
});
test('solo persiste una respuesta que Google haya confirmado',async()=>{
 const s=setup({row});assert.equal((await s.run()).body.published,true);assert.equal(s.sent.length,1);assert.equal(s.writes.length,1);assert.equal(s.writes[0][1][2],'Borrador anterior');
 const bad=setup({row,fail:true});assert.equal((await bad.run()).statusCode,502);assert.equal(bad.sent.length,1);assert.equal(bad.writes.length,0);
});
test('no envía texto vacío o demasiado largo',async()=>{
 for(const reply of ['', 'x'.repeat(4097)]){const s=setup({row});assert.equal((await s.run(reply)).statusCode,400);assert.equal(s.sent.length,0)}
});
