import test from 'node:test';
import assert from 'node:assert/strict';
import {validarCorreo,htmlCorreo,configuracionCorreo,consultarDominioResend} from '../src/modules/campaigns/email.js';

test('valida contenidos y conserva solo filtros admitidos',()=>{
 assert.deepEqual(validarCorreo({asunto:' Hola ',mensaje:' Gracias ',filtros:{local:'Girona',inyectado:'x'}}),{asunto:'Hola',mensaje:'Gracias',filtros:{local:'Girona'}});
 for(const b of [{asunto:'a\nb',mensaje:'x'},{asunto:'x',mensaje:''},{asunto:'x',mensaje:'{{{RESEND_UNSUBSCRIBE_URL}}}'},{asunto:'x',mensaje:'x',filtros:{local:{}}}]) assert.throws(()=>validarCorreo(b));
});
test('el HTML escapa contenido e incorpora baja de Resend',()=>{
 const html=htmlCorreo('<script>alert(1)</script>\nHola');
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('{{{RESEND_UNSUBSCRIBE_URL}}}'));assert.ok(html.includes('<br>'));
});
test('la configuración pública nunca revela la clave ni habilita envío',()=>{
 const c=configuracionCorreo({RESEND_API_KEY:'secreto',RESEND_FROM:'Familia <familiadelamor@familiadelamor.org>'});
 assert.equal(c.credencial_configurada,true);assert.equal(c.envio_habilitado,false);
 assert.ok(!JSON.stringify(c).includes('secreto'));
 assert.equal(configuracionCorreo({RESEND_FROM:'bad\n@example.com'}).remitente_configurado,false);
});
test('sin configuración no se consulta la red',async()=>{
 const c=await consultarDominioResend({env:{},fetcher:()=>{throw Error('no debe llamar');}});
 assert.equal(c.dominio_verificado,false);
});
test('dominio debe estar verificado y coincidir con el remitente',async()=>{
 const env={RESEND_API_KEY:'secreto',RESEND_FROM:'Familia <hola@familiadelamor.org>',RESEND_DOMAIN_ID:'123'};
 const fetcher=async(url,opts)=>{assert.equal(url,'https://api.resend.com/domains/123');assert.equal(opts.headers.Authorization,'Bearer secreto');return {ok:true,json:async()=>({status:'verified',name:'familiadelamor.org'})};};
 assert.equal((await consultarDominioResend({env,fetcher})).dominio_verificado,true);
 assert.equal((await consultarDominioResend({env,fetcher:async()=>({ok:true,json:async()=>({status:'verified',name:'otro.org'})})})).dominio_verificado,false);
 await assert.rejects(consultarDominioResend({env,fetcher:async()=>({ok:false})}),/No se pudo comprobar/);
});

test('la prueba solo sale al buzón interno y conserva clave para reintentos',async()=>{
 const {enviarPruebaCorreo}=await import('../src/modules/campaigns/email.js');
 const env={RESEND_TEST_ENABLED:'true',RESEND_API_KEY:'secreto',RESEND_FROM:'Familia <familiadelamor@familiadelamor.org>',RESEND_DOMAIN_ID:'123'};
 const calls=[];
 const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/emails')?{id:'email-1'}:{status:'verified',name:'familiadelamor.org'}};};
 const body={asunto:'Hola',mensaje:'Texto <seguro>',to:'cliente@example.com'};
 await enviarPruebaCorreo(body,{env,fetcher,idempotencyKey:'prueba-1234567890123456'});
 const payload=JSON.parse(calls[1].options.body);
 assert.deepEqual(payload.to,['marketing@la-tapeta.com']);
 assert.equal(payload.reply_to,'marketing@la-tapeta.com');
 assert.ok(payload.subject.startsWith('[PRUEBA]'));
 assert.ok(!payload.html.includes('{{{'));
 assert.equal(calls[1].options.headers['Idempotency-Key'],'prueba-1234567890123456');
 await assert.rejects(enviarPruebaCorreo(body,{env:{},fetcher:()=>{throw Error('red inesperada')}}),/no están configuradas/);
 let sends=0;
 await assert.rejects(enviarPruebaCorreo(body,{env,idempotencyKey:'prueba-1234567890123456',fetcher:async()=>{sends++;return {ok:true,json:async()=>({status:'pending',name:'familiadelamor.org'})};}}),/no está verificado/);
 assert.equal(sends,1);
});
