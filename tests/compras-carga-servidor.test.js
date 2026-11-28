import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {listadoFacturasSQL} from '../src/modules/facturas/fecha-listado.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function actualizarCuadreVisibleTickets('),source.indexOf('// Editar los campos de una factura'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
function preparar(){
 let run,response,status,scope,filtered;const rows=deferred(),totals=deferred(),audits=deferred(),started=[];
 const ctx=vm.createContext({app:{get(_p,_a,f){run=f;}},requireAuth:()=>()=>{},actualizarPagosEmpresa:async()=>started.push('pagos'),localScope:()=> 'Blanes',
 facturasQueryCategorias:async q=>{scope=q;return q;},facturasWhere:()=>({where:'WHERE local = ?',params:['Blanes']}),listadoFacturasSQL,criterioFechaCompras:()=>({orden:'fecha DESC'}),
 dbAll:(_s,p)=>{started.push('lista');assert.deepEqual(Array.from(p),['Blanes']);return rows.promise;},dbGet:(_s,p)=>{started.push('totales');assert.equal(p.at(-1),'Blanes');return totals.promise;},
 cargarDistintivos:async r=>{started.push('distintivos');await audits.promise;r[0].auditoria_completa={vigente:false};},
 instanteMadrid:()=>({fecha:'2026-11-17'}),hoyISO:()=> '2026-11-17',hoyMas:()=> '2026-11-24',SIN_ALBARANES:"tipo<>'albaran'",estadoPago:()=>({estado:'pendiente'}),
 revisarFacturas:r=>{filtered=true;return r;}});
 vm.runInContext(handler,ctx);
 const request=()=>run({query:{local:'Girona'}},{status:s=>{status=s;return {json:r=>response=r};},json:r=>response=r});
 return {request,rows,totals,audits,started,get response(){return response;},get status(){return status;},get scope(){return scope;},get filtered(){return filtered;}};
}
test('lista y totales empiezan juntos; no responde hasta verificar distintivos, ámbito y avisos',async()=>{
 const t=preparar(),done=t.request();await tick();assert.deepEqual(t.started,['pagos','lista','totales']);assert.equal(t.scope.local,'Blanes');
 t.rows.resolve([{id:1,drive_thumb:'imagen'}]);t.totals.resolve({docs:1,albaranes:0});await tick();assert.equal(t.response,undefined);assert.equal(t.started.at(-1),'distintivos');
 t.audits.resolve();await done;assert.equal(t.response.ok,true);assert.equal(t.filtered,true);assert.equal(t.response.data[0].drive_thumb,undefined);assert.equal(t.response.data[0].auditoria_completa.vigente,false);
});
test('error de distintivos o totales no devuelve una lista validada parcialmente',async()=>{
 for(const falla of ['audits','totals']){
 const t=preparar(),done=t.request();await tick();t.rows.resolve([{id:1}]);t[falla].reject(Error('fallo de lectura'));
 if(falla==='audits')t.totals.resolve({docs:1});else t.audits.resolve();
 await done;assert.equal(t.status,500);assert.equal(t.response.ok,false);assert.equal(t.filtered,undefined);
 }
});
