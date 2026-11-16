import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {conciliarDocumentos} from '../../src/modules/facturas/conciliar-decision.js';
const factura={id:428,tipo:'factura',proveedor:'Virutas',nif:'B123',empresa:'Empresa',local:'Blanes',total:100};
const albaran={...factura,id:252,tipo:'albaran',total:40,conciliado_con:null};
function entorno(extras={},fallar=0){
 let estado={filas:[factura,{...albaran,...extras}],auditoria:[],config:null},escrituras=0;
 const deps={autor:'Contabilidad',ahora:()=> '2026-11-16',puedeAcceder:l=>l==='Blanes',transaccion:async fn=>{
  const copia=structuredClone(estado);
  const db={get:async sql=>{assert.match(sql,/FOR UPDATE/);return copia.filas[0];},all:async sql=>{assert.match(sql,/ORDER BY id FOR UPDATE/);return copia.filas.slice(1);},run:async(sql,p)=>{
   if(++escrituras===fallar)throw Error('Fallo simulado');
   if(sql.startsWith('UPDATE facturas SET conciliado_con=NULL'))copia.filas.forEach(f=>{if(f.conciliado_con===p[0]&&!p[1].includes(f.id))f.conciliado_con=null;});
   else if(sql.includes('conciliado_por='))Object.assign(copia.filas[0],{conciliado_con:p[0],conciliado_por:p[1],conciliado_en:p[2]});
   else if(sql.startsWith('UPDATE facturas'))copia.filas.forEach(f=>{if(p[1].includes(f.id))f.conciliado_con=p[0];});
   else if(sql.startsWith('INSERT INTO fic_auditoria'))copia.auditoria.push(p);
   else copia.config=p;
  }};
  const resultado=await fn(db);estado=copia;return resultado;
 }};
 return {deps,estado:()=>estado,escrituras:()=>escrituras};
}
test('vinculación parcial bilateral, auditoría y deshacer atómicos',async()=>{
 const e=entorno();await conciliarDocumentos(e.deps,428,[252]);
 assert.equal(e.estado().filas[0].conciliado_con,'[252]');assert.equal(e.estado().filas[1].conciliado_con,'428');
 assert.equal(e.estado().auditoria.length,1);assert.equal(e.estado().filas[0].total,100);
 await conciliarDocumentos(e.deps,428,[]);
 assert.equal(e.estado().filas[0].conciliado_con,null);assert.equal(e.estado().filas[1].conciliado_con,null);
});
test('rechaza otro tipo/proveedor/local/empresa y albarán utilizado antes de escribir',async()=>{
 for(const extra of [{tipo:'factura'},{nif:'B999'},{local:'Lloret'},{empresa:'Otra'},{conciliado_con:'999'},{id:253}]){
  const e=entorno(extra);await assert.rejects(conciliarDocumentos(e.deps,428,[252]));assert.equal(e.escrituras(),0);
 }
});
test('ningún fallo intermedio deja vínculos ni auditoría parciales',async()=>{
 for(let paso=1;paso<=5;paso++){
  const e=entorno({},paso),antes=structuredClone(e.estado());
  await assert.rejects(conciliarDocumentos(e.deps,428,[252]),/Fallo simulado/);assert.deepEqual(e.estado(),antes);
 }
});
test('rechaza cuerpos malformados en vez de interpretarlos como deshacer',async()=>{
 for(const ids of [undefined,null,'252',[null],[false],[0],[-1],[1.5],['abc']]){
  const e=entorno();await assert.rejects(conciliarDocumentos(e.deps,428,ids));assert.equal(e.escrituras(),0);
 }
});
test('permite reenviar un vínculo propio y deduplica los ids',async()=>{
 const e=entorno({conciliado_con:'428'});await conciliarDocumentos(e.deps,428,[252,'252']);
 assert.equal(e.estado().filas[0].conciliado_con,'[252]');
});

test('una segunda factura no puede reutilizar un albarán ya vinculado',async()=>{
 const e=entorno();await conciliarDocumentos(e.deps,428,[252]);
 // Simula otra factura ya bloqueada después de que la primera haya confirmado.
 const segunda={...factura,id:429};
 const deps={...e.deps,transaccion:fn=>fn({get:async()=>segunda,all:async()=>[e.estado().filas[1]],run:async()=>assert.fail('No debe escribir')})};
 await assert.rejects(conciliarDocumentos(deps,429,[252]),err=>err.status===409);
 assert.equal(e.estado().filas[1].conciliado_con,'428');
});
test('bloquea factura y albaranes antes de escribir y exige tipo factura al destino',async()=>{
 const consultas=[];
 const deps={autor:'Contabilidad',ahora:()=>'',puedeAcceder:()=>true,transaccion:fn=>fn({
 get:async sql=>{consultas.push(sql);return {...factura,tipo:'ticket'};},
 all:async()=>assert.fail('Destino inválido'),run:async()=>assert.fail('Destino inválido')
 })};
 await assert.rejects(conciliarDocumentos(deps,428,[252]),err=>err.status===400);
 assert.match(consultas[0],/FOR UPDATE/);
});

test('adaptador real preserva arrays ANY y revierte un deadlock liberando conexión',async()=>{
 const source=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 const conversor=source.slice(source.indexOf('function toPositional(sql)'),source.indexOf('async function dbGet'));
 const wrapper=source.slice(source.indexOf('async function transaccionPaginas(fn)'),source.indexOf('const paginasFacturas='));
 for(const deadlock of [false,true]){
  const consultas=[];let liberado=false;
  const client={release(){liberado=true;},query:async(sql,params)=>{
   consultas.push({sql,params});
   if(deadlock&&sql.includes('FOR UPDATE'))throw Object.assign(Error('deadlock detected'),{code:'40P01'});
   return {rows:[]};
  }};
  const ctx=vm.createContext({pool:{connect:async()=>client}});vm.runInContext(conversor+wrapper,ctx);
  const ids=[252,253];
  const promise=ctx.transaccionPaginas(db=>db.all('SELECT * FROM facturas WHERE id=ANY(?) OR conciliado_con=? ORDER BY id FOR UPDATE',[ids,'428']));
  if(deadlock)await assert.rejects(promise,e=>e.code==='40P01');else await promise;
  assert.equal(consultas[1].sql,'SELECT * FROM facturas WHERE id=ANY($1) OR conciliado_con=$2 ORDER BY id FOR UPDATE');
  assert.equal(consultas[1].params[0],ids,'El array se pasa intacto a node-postgres');
  assert.deepEqual(consultas.map(c=>c.sql).filter(s=>['BEGIN','COMMIT','ROLLBACK'].includes(s)),['BEGIN',deadlock?'ROLLBACK':'COMMIT']);
  assert.equal(liberado,true);
 }
});
