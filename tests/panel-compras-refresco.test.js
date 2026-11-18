import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const extras=Array.from({length:4},deferred),list=deferred(),busy=new Set();
 const boxes={facRes:{isConnected:true,innerHTML:'old',classList:{add:x=>busy.add(x),remove:x=>busy.delete(x)}},facKpis:{outerHTML:'old'},facCalidadAvisos:{},facPendientes:{innerHTML:'old'}};
 const ctx=vm.createContext({document:{getElementById:id=>boxes[id]},_facSeq:0,CURRENT:'facturas',FAC_LIST:[],FAC_TOT:{},FAC_HAY_MAS:false,FAC_PEND:[],FAC_RECEPCIONES_ANTES:null,
 facScope(){},facGuardarPosicionRevision:()=>()=>{},facQS:()=>'',facRevisionQS:()=>'',pidePorLocales:()=>list.promise,facSumaTotales:x=>x.total,
 facTablaHtml:rows=>'table '+rows.length,facCalidadHtml:()=> 'checked',facKpisHtml:()=> 'new totals',facCargarMiniaturas(){},
 apiOptional:()=>extras[0].promise,facDuplicados:()=>extras[1].promise,facCargarRecepciones:()=>extras[2].promise,facAvisoLocales:()=>extras[3].promise,
 facPendientesHtml:rows=>'pending '+rows.length,errorCard:e=>e});
 vm.runInContext(source.slice(source.indexOf('async function facRefresh('),source.indexOf('function fac303Csv()')),ctx);
 return {ctx,boxes,busy,list,extras};
}
test('refresco publica tabla, comprobaciones y totales juntos sin esperar avisos; guardar y seguir espera todos',async()=>{
 const t=setup();let done=false;const run=t.ctx.facRefresh({mantenerRevision:true}).then(()=>done=true);
 t.list.resolve({data:[{id:1}],total:42});await tick();
 assert.equal(t.boxes.facRes.innerHTML,'table 1');assert.equal(t.boxes.facKpis.outerHTML,'new totals');assert.equal(t.boxes.facCalidadAvisos.innerHTML,'checked');assert.equal(t.busy.size,0);assert.equal(done,false);
 t.extras[0].resolve([{id:2}]);t.extras[1].resolve();t.extras[2].resolve();await tick();assert.equal(done,false);
 t.extras[3].resolve();await run;assert.equal(t.boxes.facPendientes.innerHTML,'pending 1');
});
test('los avisos tardíos no reemplazan los de otro filtro y un fallo se muestra expresamente',async()=>{
 for(const stale of [false,true]){
 const t=setup();const run=t.ctx.facRefresh();t.list.resolve({data:[],total:0});await tick();
 if(stale)t.ctx._facSeq++;
 t.extras.forEach(d=>d.resolve(null));await run;
 assert.equal(t.boxes.facRes.innerHTML,'table 0');
 if(stale)assert.equal(t.boxes.facPendientes.innerHTML,'old');else assert.match(t.boxes.facPendientes.innerHTML,/No se pudieron cargar/);
 }
});
test('cancelar miniaturas aborta solicitudes y no pinta una respuesta tardía',async()=>{
 const request=deferred();let signal,painted=0,created=0;
 const box={dataset:{},isConnected:true,getAttribute:()=> '1',replaceWith:()=>painted++,remove(){}};
 const ctx=vm.createContext({AbortController,window:{},document:{querySelectorAll:()=>[box]},token:()=> 'test',fetch:(url,opts)=>{signal=opts.signal;return request.promise;},URL:{createObjectURL:()=>{created++;return 'blob:test';}},Image:class{}});
 vm.runInContext(source.slice(source.indexOf('let THUMB_OBS ='),source.indexOf('const PILL_PAGO')),ctx);
 ctx.facCargarMiniaturas();assert.equal(signal.aborted,false);ctx.facCancelarMiniaturas();assert.equal(signal.aborted,true);
 request.resolve({ok:true,blob:async()=>({})});await tick();assert.equal(painted,0);assert.equal(created,0);
});
