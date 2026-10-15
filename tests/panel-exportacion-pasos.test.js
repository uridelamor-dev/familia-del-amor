import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');const a=src.indexOf('function facExport(seleccion'),b=src.indexOf('\nasync function',a);
function preparar(seleccion=false,zip=false){
 const campos={};for(const id of ['fxFlujo','fxAlcance','fxFiltros','fxLocal','fxDesde','fxHasta','fxFormato','fxAyuda','fxResumen','fxDescargar','fxError'])campos['#'+id]={value:'',querySelector:()=>({})};
 campos['#fxAlcance'].value=seleccion?'seleccion':'filtro';campos['#fxFormato'].value=zip?'zip':'csv';campos['#fxLocal'].value='Girona';campos['#fxDesde'].value='2026-10-01';
 const ov={querySelector:s=>s==='.modal'?{classList:{add(){}}}:campos[s],addEventListener(){},remove(){}};
 const calls=[],ids=new Set([10,20]);
 const ctx=vm.createContext({URLSearchParams,FAC_SEL:ids,facQS:()=> 'proveedor=Demo&estado=pendiente&local=Girona',LOCALES:['Girona'],visiblesFE:(a,b)=>b,modal:()=>ov,marketingPasos:()=>({cuerpos:[{},{},{}],abrir(){}}),esc:String,token:()=> 'demo',toast(){},bajarBlob(){},fetch:async(url,opts)=>{calls.push({url,opts});return {ok:true,blob:async()=>({}),headers:{get:()=>null}};}});
 vm.runInContext(src.slice(a,b),ctx);ctx.facExport(seleccion);return {campos,calls,ids};
}
test('exportar por filtros mantiene proveedor y estado sin modificar los filtros del panel',async()=>{const t=preparar();await t.campos['#fxDescargar'].onclick();const url=new URL(t.calls[0].url,'http://demo');assert.equal(url.searchParams.get('proveedor'),'Demo');assert.equal(url.searchParams.get('estado'),'pendiente');assert.equal(url.searchParams.get('from'),'2026-10-01');assert.equal(url.searchParams.get('local'),'Girona');});
test('la selección de exportación queda fijada al abrir y se envía por POST',async()=>{const t=preparar(true,true);t.ids.add(30);await t.campos['#fxDescargar'].onclick();assert.equal(t.calls[0].url,'/api/facturas/export.zip');assert.deepEqual(JSON.parse(t.calls[0].opts.body).ids,[10,20]);assert.equal(t.calls[0].opts.method,'POST');});
test('fechas invertidas no provocan ninguna descarga',async()=>{const t=preparar();t.campos['#fxHasta'].value='2026-09-01';await t.campos['#fxDescargar'].onclick();assert.equal(t.calls.length,0);});
