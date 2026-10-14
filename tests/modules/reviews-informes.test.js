import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ENTREGAS,DESTINO_INFORMES,mesMadrid,seleccionar,validarTemas,analizarTemas,mensajesInforme,crearInformes} from '../../src/modules/reviews/informes.js';
const review=(id,date,star='FIVE')=>({reviewId:id,createTime:date,starRating:star,comment:'Buen servicio'});
test('mes por Madrid, cambio de mes UTC, deduplicación y media ponderada',()=>{
 assert.equal(mesMadrid('2026-09-30T22:30:00Z'),'2026-10');
 const a=review('a','2026-09-01T12:00:00Z');
 const r=seleccionar([a,a,review('b','2026-09-10T12:00:00Z','ONE'),review('c','2026-08-31T21:00:00Z')],'2026-09');
 assert.equal(r.cantidad,2);assert.equal(r.media,3);assert.equal(r.anterior,1);assert.equal(r.diferencia,1);
 assert.equal(seleccionar([],'2026-09').media,null);
 assert.throws(()=>seleccionar([{}],'2026-09'));
});
test('temas solo con identificadores existentes, recuentos deduplicados',()=>{
 const rows=[{id:'a',text:'Bien'}];
 assert.equal(validarTemas({positivos:[{tema:'Trato',ids:['a','a']}],negativos:[]},rows).positivos[0].ids.length,1);
 assert.throws(()=>validarTemas({positivos:[{tema:'Trato',ids:['otro']}],negativos:[]},rows));
});
test('sin texto no inventa temas ni llama IA',async()=>{
 const r=await analizarTemas([{id:'a',text:''}],()=>{throw Error('no');});assert.deepEqual(r.prioridades,[]);
});
const informe={consultado:'2026-10-14T09:00:00Z',locales:[{nombre:'Local A',rows:[{rating:5}],cantidad:1,media:5,diferencia:1,global:4.2,totalGlobal:100,positivos:[],negativos:[],prioridades:[]}]};
test('mensajes separan mensual y global actual, prueba y originales',()=>{
 const messages=mensajesInforme(ENTREGAS[0],informe);assert.equal(messages.length,2);
 assert.match(messages[0],/PRUEBA DE FORMATO/);assert.match(messages[0],/no son notas históricas/);assert.match(messages[1],/global actual/);
});
function harness({date='2026-10-14T09:00:00Z',enabled=true,fail=false,collectFail=false}={}){
 const stored=new Map(),sent=[];let locked=false;
 const query=async(sql,args=[])=>{
  if(sql.includes('pg_try_advisory_lock')){const ok=!locked;locked=true;return {rows:[{locked:ok}]};}
  if(sql.includes('pg_advisory_unlock')){locked=false;return {rows:[]};}
  if(sql.startsWith('SELECT value'))return {rows:stored.has(args[0])?[{value:stored.get(args[0])}]:[]};
  if(sql.startsWith('INSERT INTO config')){stored.set(args[0],args[1]);return {rows:[]};}throw Error(sql);
 };
 const pool={query,connect:async()=>({query,release(){}})};
 const opts={pool,enabled,conectado:()=>true,now:()=>new Date(date),recopilar:async()=>{if(collectFail)throw Error('Google');return structuredClone({...informe,locales:informe.locales.map(l=>({...l,rows:[]}))});},analizar:async()=>({positivos:[],negativos:[]}),enviar:async(n,m)=>{sent.push([n,m]);if(fail)throw Error('incierto');}};
 return {stored,sent,opts,service:crearInformes(opts)};
}
test('producción únicamente, horario y noviembre no se adelanta',async()=>{
 for(const options of [{enabled:false},{date:'2026-10-14T06:00:00Z'}]){const h=harness(options);await h.service.tick();assert.equal(h.sent.length,0);}
 const h=harness();await h.service.tick();assert.equal(h.sent.length,1);assert.equal(h.sent[0][0],DESTINO_INFORMES);assert.equal(h.stored.has(ENTREGAS[1].id),false);
});
test('reanuda tras reinicio sin repetir mensajes ni generar el informe otra vez',async()=>{
 const h=harness();await h.service.tick();const restarted=crearInformes({...h.opts,recopilar:async()=>{throw Error('no repetir');}});
 await restarted.tick();await restarted.tick();assert.equal(h.sent.length,2);assert.equal(JSON.parse(h.stored.get(ENTREGAS[0].id)).estado,'enviada');
});
test('envío incierto o interrumpido nunca se repite automáticamente',async()=>{
 const h=harness({fail:true});await h.service.tick();await crearInformes(h.opts).tick();assert.equal(h.sent.length,1);assert.equal(JSON.parse(h.stored.get(ENTREGAS[0].id)).estado,'incierta');
 const x=harness();x.stored.set(ENTREGAS[0].id,JSON.stringify({estado:'enviando'}));await x.service.tick();assert.equal(x.sent.length,0);assert.equal(JSON.parse(x.stored.get(ENTREGAS[0].id)).estado,'incierta');
});
test('lectura fallida no se convierte en cero reseñas ni se envía, reintento diferido',async()=>{
 const h=harness({collectFail:true});await h.service.tick();assert.equal(h.sent.length,0);assert.ok(JSON.parse(h.stored.get(ENTREGAS[0].id)).retryAt);
});
test('noviembre se entrega una sola vez y no hay recurrencia posterior',async()=>{
 const h=harness({date:'2026-11-01T09:00:00Z'});h.stored.set(ENTREGAS[0].id,JSON.stringify({estado:'enviada'}));
 await h.service.tick();await h.service.tick();await h.service.tick();assert.equal(h.sent.length,2);assert.equal(ENTREGAS.length,2);
});
