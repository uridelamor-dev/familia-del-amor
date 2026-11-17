import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function compras(){
 const pendientes=deferred(),stats=deferred();
 const cajas={'#facPendientes':{innerHTML:''},'#facEstadisticas':{innerHTML:''}};
 const view={innerHTML:'',isConnected:true,querySelector:s=>cajas[s]};
 const ctx=vm.createContext({clearTimeout,_facTimer:null,_facSeq:0,FACTAB:'facturas',CURRENT:'facturas',
 document:{getElementById:()=>view},skeleton:()=> 'loading',facScope(){},facRevisionQS:()=>'',viendoVarios:()=>false,facFiltrosActivos:()=>[],FACF:{},
 apiOptional:p=>p.includes('pendientes')?pendientes.promise:p.includes('stats')?stats.promise:Promise.resolve(['empresa']),
 pidePorLocales:async()=>({data:[{id:1}]}),facQS:()=>'',facSumaTotales:()=>({}),
 renderFacturas:()=> 'tabla disponible',facPendientesHtml:p=>'pendientes '+p.length,facEstadisticasHtml:s=>s?'estadisticas':'',
 facCargarRecepciones(){},facCargarMiniaturas(){},facAvisoLocales(){},facDuplicados(){},errorCard:e=>e,
 FAC_LIST:[],FAC_EMPRESAS:[],FAC_TOT:{},FAC_HAY_MAS:false,FAC_PEND:[]});
 vm.runInContext(source.slice(source.indexOf('async function loadFacturas()'),source.indexOf('// `ir` = true')),ctx);
 return {ctx,view,cajas,pendientes,stats};
}
test('la lista abre antes de que terminen pendientes e informe; completarlos no reemplaza la tabla',async()=>{
 const t=compras();await t.ctx.loadFacturas();assert.equal(t.view.innerHTML,'tabla disponible');
 assert.match(t.cajas['#facPendientes'].innerHTML,/Cargando/);
 t.pendientes.resolve([{id:2}]);t.stats.resolve({});await tick();
 assert.equal(t.cajas['#facPendientes'].innerHTML,'pendientes 1');assert.equal(t.cajas['#facEstadisticas'].innerHTML,'estadisticas');
 assert.equal(t.view.innerHTML,'tabla disponible');
});
test('respuestas de una navegación anterior no contaminan otra pantalla ni filtro',async()=>{
 for(const cambio of ['CURRENT="clientes"','_facSeq++']){
 const t=compras();await t.ctx.loadFacturas();vm.runInContext(cambio,t.ctx);
 t.pendientes.resolve([{id:2}]);t.stats.resolve({});await tick();assert.equal(t.ctx.FAC_PEND.length,0);
 assert.equal(t.cajas['#facEstadisticas'].innerHTML,'');
 }
});
test('error en pendientes no se presenta como lista vacía confirmada',async()=>{
 const t=compras();await t.ctx.loadFacturas();t.pendientes.resolve(null);t.stats.resolve(null);await tick();
 assert.match(t.cajas['#facPendientes'].innerHTML,/No se pudieron cargar/);assert.equal(t.view.innerHTML,'tabla disponible');
});
function whatsapp(){
 let sesion='a';const calls=[],paint=[];
 const ctx=vm.createContext({Date,token:()=>sesion,fetch:()=>{const d=deferred();calls.push(d);return d.promise;},document:{getElementById:()=>null}});
 vm.runInContext(source.slice(source.indexOf('let WA_PILL ='),source.indexOf('// ── Modal')),ctx);
 ctx.pintarWaPill=v=>paint.push(v);
 return {ctx,calls,paint,session:s=>sesion=s};
}
test('cambios rápidos comparten una consulta WhatsApp y reutilizan la respuesta fresca',async()=>{
 const t=whatsapp();const a=t.ctx.refreshWaPill(),b=t.ctx.refreshWaPill(true);assert.equal(t.calls.length,1);
 t.calls[0].resolve({ok:true,json:async()=>({connected:true})});await Promise.all([a,b]);await t.ctx.refreshWaPill();assert.equal(t.calls.length,1);
});
test('respuesta de otra sesión no modifica el estado actual',async()=>{
 const t=whatsapp();const a=t.ctx.refreshWaPill();t.session('b');const b=t.ctx.refreshWaPill();
 t.calls[0].resolve({ok:true,json:async()=>({connected:true})});await a;assert.deepEqual(t.paint,[]);
 t.calls[1].resolve({ok:true,json:async()=>({connected:false})});await b;assert.deepEqual(t.paint,[false]);
});
test('un error HTTP de WhatsApp no se guarda como desconexión y permite reintentar',async()=>{
 const t=whatsapp();const a=t.ctx.refreshWaPill();t.calls[0].resolve({ok:false});await a;assert.deepEqual(t.paint,[]);
 const b=t.ctx.refreshWaPill();assert.equal(t.calls.length,2);t.calls[1].resolve({ok:true,json:async()=>({connected:true})});await b;
});
