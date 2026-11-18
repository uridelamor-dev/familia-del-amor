import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function facPintarPapel(');
const code=source.slice(start,source.indexOf('\n/**',start));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(){
 const calls=[],paint=[],observers=[];
 const box={isConnected:true,textContent:'',append(b){this.button=b;}};
 const ctx=vm.createContext({AbortController,token:()=> 'test',document:{body:{},createElement:()=>({})},
 MutationObserver:class{constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}},
 fetch:(url,opts)=>{const d=deferred();calls.push({...d,url,opts});return d.promise;},URL:{createObjectURL:()=> 'blob:test'},
 facVistaDocumento:(...args)=>paint.push(args)});
 vm.runInContext(code,ctx);return {ctx,calls,paint,box,observers};
}
test('cerrar una factura aborta su original y una respuesta tardía no crea vista previa',async()=>{
 const t=setup();const run=t.ctx.facPintarPapel(t.box,12);assert.equal(t.calls[0].opts.headers.Authorization,'Bearer test');
 t.box.isConnected=false;t.observers[0].cb();assert.equal(t.calls[0].opts.signal.aborted,true);
 t.calls[0].resolve({ok:true,blob:async()=>({type:'application/pdf'})});await run;assert.equal(t.paint.length,0);assert.equal(t.observers[0].disconnected,true);
});
test('original correcto muestra PDF y libera el observador de descarga',async()=>{
 const t=setup();const run=t.ctx.facPintarPapel(t.box,12);t.calls[0].resolve({ok:true,blob:async()=>({type:'application/pdf;charset=utf-8'})});await run;
 assert.equal(t.paint[0][2],'application/pdf');assert.equal(t.observers[0].disconnected,true);
});
test('un fallo permite reintentar solo la vista previa sin reconstruir el formulario',async()=>{
 const t=setup();const run=t.ctx.facPintarPapel(t.box,12);t.calls[0].resolve({ok:false});await run;
 assert.equal(t.box.button.textContent,'Reintentar vista previa');t.box.button.onclick();assert.equal(t.calls.length,2);
 t.calls[1].resolve({ok:true,blob:async()=>({type:'image/jpeg'})});await new Promise(r=>setImmediate(r));assert.equal(t.paint.length,1);
});
