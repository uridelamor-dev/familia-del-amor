import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
function entorno(valores,total=100){
 const caja={},cont={},button={disabled:false,getAttribute:()=>total};
 const marcados=valores.map((v,i)=>({getAttribute:k=>k==='data-total'?v:String(i+1)}));
 const card={querySelector:()=>button,querySelectorAll:()=>marcados};
 const avisos=[],writes=[];
 const ctx=vm.createContext({document:{getElementById:()=>cont,querySelector:s=>s.startsWith('[data-concsuma')?caja:card},CSS:{escape:String},eur2:v=>Number(v).toFixed(2)+' €',eur:String,esc:String,num:String,fechaCorta:String,nombreCortoLocal:String,stat:(a,b,c)=>`${a}: ${c}`,cargaContable:()=>()=>true,periodoVista:()=>({}),contAmbitoQS:()=>new URLSearchParams(),CONC:{filtro:''},CONC_FILTROS:[],apiRaw:async()=>({resumen:{aMedias:1,importeAMedias:100},propuestas:[{estado:'conciliada',factura:{id:5,total:100},albaranes:valores.map((v,i)=>({id:i+1,total:v}))}]}),confirmModal:async a=>{avisos.push(a);return true;},apiSend:async(...a)=>writes.push(a),toast:()=>{}});
 vm.runInContext(code.slice(code.indexOf('function concImporte('),code.indexOf('async function loadConciliacion(')),ctx);
 vm.runInContext(code.slice(code.indexOf('async function refrescarConciliacion('),code.indexOf('/**\n * DESCARTAR una propuesta.')),ctx);
 return {ctx,caja,cont,button,avisos,writes};
}
test('distingue importes ausentes de cero real',()=>{
 const {ctx}=entorno([]);
 for(const v of [null,undefined,'','  ','null','undefined'])assert.equal(ctx.concImporteTexto(v),'Sin importe');
 assert.equal(ctx.concImporteTexto(0),'0.00 €');assert.equal(ctx.concImporteTexto('0'),'0.00 €');
});
test('selección y confirmación sin importe permiten vincular sin inventar diferencias',async()=>{
 const e=entorno([null,40]);e.ctx.concPintarSuma(5);
 assert.match(e.caja.innerHTML,/1 sin importe/);assert.doesNotMatch(e.caja.innerHTML,/60|cuadra con/);assert.equal(e.button.disabled,false);
 await e.ctx.concMarcados(5);assert.match(e.avisos[0],/faltan importes/);assert.doesNotMatch(e.avisos[0],/coinciden|60/);assert.equal(e.writes.length,1);
});
test('cero real conserva el cálculo y factura sin total no inventa diferencia',()=>{
 const e=entorno([0],0);e.ctx.concPintarSuma(5);assert.match(e.caja.innerHTML,/cuadra con/);
 const sin=entorno([40],null);sin.ctx.concPintarSuma(5);assert.match(sin.caja.innerHTML,/factura sin importe/);
});
test('render muestra Sin importe y no presenta como cerrada una vinculación desconocida',async()=>{
 const e=entorno([null,0]);await e.ctx.refrescarConciliacion();
 assert.match(e.cont.innerHTML,/>Sin importe<\/b>/);assert.match(e.cont.innerHTML,/>0.00 €<\/b>/);
 assert.match(e.cont.innerHTML,/Vinculación por comprobar · sin importe/);assert.match(e.cont.innerHTML,/Faltan importes/);assert.doesNotMatch(e.cont.innerHTML,/>Conciliada<\/span>/);
});
