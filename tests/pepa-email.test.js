import test from 'node:test';
import assert from 'node:assert/strict';
import {remaining,validateImport,payload,remoteExcluded,checkDomain,resendClient,createQueue,END} from '../src/modules/pepa-email/queue.js';
test('cupo compartido: diarios, mensuales y respuesta incompleta',()=>{
 assert.equal(remaining({emails:{daily:{used:7,limit:100},monthly:{used:2998,limit:3000}}}),2);
 assert.equal(remaining({emails:{daily:{used:101,limit:100},monthly:{used:2,limit:3000}}}),0);
 assert.throws(()=>remaining({}),/cupo/);
});
test('importación rechaza duplicados normalizados, permisos y orden inválidos',()=>{
 const body={enabled:false,source_sha256:'a'.repeat(64),candidates:[{email:' USER@example.com ',position:1,basis:'excel_yes'}]};
 assert.equal(validateImport(body)[0].email,'user@example.com');
 assert.throws(()=>validateImport({...body,candidates:[...body.candidates,{email:'user@example.com',position:2,basis:'excel_yes'}]}));
 assert.throws(()=>validateImport({...body,enabled:true}));
 assert.throws(()=>validateImport({...body,candidates:[{email:'x@y.es',position:1,basis:'no'}]}));
});
test('correo individual conserva enlace comercial y contiene baja propia RFC8058',()=>{
 const p=payload({email:'X@y.es',token:'a'.repeat(64)});
 assert.deepEqual(p.to,['x@y.es']);assert.equal(p.reply_to,'marketing@la-tapeta.com');
 assert.match(p.html,/privacidad.html#la-pepa/);assert.doesNotMatch(p.html,/RESEND_UNSUBSCRIBE|__BAJA_URL__|Muestra para revisión/);
 assert.equal(p.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 assert.match(p.html,/uriel-del-amor-ayllon\/events\/pepaween--31-10-2026-V24D/);
});
test('exclusiones remotas no se omiten si Resend falla',async()=>{
 assert.equal(await remoteExcluded(async()=>({origin:'bounce'}),'a@b.es'),true);
 assert.equal(await remoteExcluded(async p=>p.startsWith('/contacts')?{unsubscribed:true}:null,'a@b.es'),true);
 assert.equal(await remoteExcluded(async()=>null,'a@b.es'),false);
 await assert.rejects(remoteExcluded(async()=>{throw Error('fallo');},'a@b.es'));
});
test('no se inicia con seguimiento no verificado ni dominio incorrecto',async()=>{
 await assert.rejects(checkDomain(async()=>({name:'familiadelamor.org',status:'verified'})),/seguimiento/);
 await checkDomain(async()=>({name:'familiadelamor.org',status:'verified',open_tracking:false,click_tracking:false}));
});
test('cliente nunca reintenta un envío incierto',async()=>{
 let calls=0;const api=resendClient({env:{PEPA_RESEND_API_KEY:'test'},fetcher:async()=>{calls++;throw Error('timeout');}});
 await assert.rejects(api('/emails',{method:'POST',body:{},key:'same-key'}));assert.equal(calls,1);
});
test('fecha límite impide llamadas de envío',async()=>{
 let calls=0;const queries=[];const client={query:async sql=>{queries.push(sql);if(sql.includes('try_advisory'))return{rows:[{locked:true}]};if(sql.includes('SELECT * FROM pepa_email_control'))return{rows:[{active:true,verified:true}]};return{rows:[]};},release(){}};
 const q=createQueue({pool:{connect:async()=>client},api:async()=>{calls++;},now:()=>END});await q.tick();
 assert.equal(calls,0);assert.ok(queries.some(s=>s.includes('Campaña finalizada')));
});
