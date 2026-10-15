import test from 'node:test';
import assert from 'node:assert/strict';
import {listCampaign,tokenFromEmail,SUBJECT} from '../src/modules/pepa-email/recovery.js';
const row={id:'id1',to:['buyer@example.com'],from:'La Pepa <familiadelamor@familiadelamor.org>',subject:SUBJECT,created_at:'2026-10-13T10:00:00Z'};
const old={...row,id:'old',subject:'Otro correo',created_at:'2026-10-12T10:00:00Z'};
test('recupera solo campaña, exige historial anterior y recorre todas las páginas',async()=>{
 const calls=[];const got=await listCampaign(async path=>{calls.push(path);return calls.length===1?{data:[row],has_more:true}:{data:[old],has_more:false};},async()=>{});
 assert.equal(got.length,1);assert.match(calls[1],/after=id1/);
 await assert.rejects(listCampaign(async()=>({data:[row],has_more:false}),async()=>{}),/cobertura/);
 await assert.rejects(listCampaign(async()=>({data:[row,row,old],has_more:false}),async()=>{}),/duplicados/);
});
test('recupera exactamente el enlace original y rechaza datos ambiguos',()=>{
 const url='https://familiadelamor.org/la-pepa/baja/';
 assert.equal(tokenFromEmail({text:url+'a'.repeat(64)}),'a'.repeat(64));
 assert.throws(()=>tokenFromEmail({text:'sin enlace'}));
 assert.throws(()=>tokenFromEmail({text:url+'a'.repeat(64)+' '+url+'b'.repeat(64)}));
});
