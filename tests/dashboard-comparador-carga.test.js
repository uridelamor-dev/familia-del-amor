import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
test('la comparación inicia sin esperar al resumen, se conserva al llegar el periodo y termina al fallar',async()=>{
 const pendientes=[];let resumen;
 const ctx={Date,nombreCortoLocal:String,DASH_VISTOS:new Map(),DASH_COMPARAR:null,DASH_RANGE:{from:'2026-10-01',to:'2026-10-28'},DASH_CARGA:0,CURRENT:'dashboard',PERIOD:'mes',todayStr:()=> '2026-10-28',viendoVarios:()=>false,localActualFE:()=> 'Girona',sinPublico:()=>false,document:{getElementById:()=>({})},skeleton:()=>'',renderDashboard:()=>'',repintarBarra(){},api:()=>new Promise(r=>resumen=r),apiOptional:async()=>null,apiDashboard:url=>new Promise(resolve=>pendientes.push({url,resolve}))};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('async function loadDashboard()'),src.indexOf('// Rango personalizado (días o meses')),ctx);
 const load=ctx.loadDashboard();assert.equal(pendientes.length,2);assert.match(pendientes[1].url,/comparar=1/);
 pendientes[1].resolve({comparacion:{ventas:10}});await tick();assert.equal(ctx.DASH_COMPARANDO,false);
 pendientes[0].resolve({reservas:{total:3},ventas:{total:100}});await tick();assert.equal(ctx.DASH_PERIODO.comparacion.ventas,10);
 resumen({});await load;
 const segundo=ctx.loadDashboard();pendientes[2].resolve({reservas:{total:3}});pendientes[3].resolve(null);await tick();assert.equal(ctx.DASH_COMPARACION_ERROR,true);assert.equal(ctx.DASH_COMPARANDO,false);resumen({});await segundo;
});
test('petición bloqueada se aborta y sale de carga sin devolver datos falsos',async()=>{
 let timeout,limpio=false;const ctx={AbortController,token:()=>'',setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>limpio=true,fetch:(_u,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('abort'))))};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('async function apiDashboard'),src.indexOf('async function apiSend')),ctx);
 const p=ctx.apiDashboard('/test');timeout();assert.equal(await p,null);assert.equal(limpio,true);
});
