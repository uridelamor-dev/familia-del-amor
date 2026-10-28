import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {gastoDesglosado} from '../src/modules/dashboard/desglose.js';
const app=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const servidor=readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('la tarjeta pide el mes actual por defecto y el rango filtrado después, conservando locales',async()=>{
 for(const [from,to,esperado]of [['2026-10-28','2026-10-28',['2026-10-01','2026-10-31']],['2026-09-01','2026-09-30',['2026-09-01','2026-09-30']]]){
  const urls=[];const ctx=vm.createContext({Date,DASH_VISTOS:new Map(),DASH_COMPARAR:null,sinPublico:()=>false,DASH_RANGE:{from,to},DASH_CARGA:0,CURRENT:'dashboard',PERIOD:'custom',todayStr:()=> '2026-10-28',viendoVarios:()=>true,localesDelAmbito:()=>['Blanes','Girona'],document:{getElementById:()=>({})},skeleton:()=>'',renderDashboard:()=>'',repintarBarra(){},api:async()=>({}),apiOptional:async u=>{urls.push(u);return null;}});
  vm.runInContext(app.slice(app.indexOf('async function loadDashboard()'),app.indexOf('// Rango personalizado (días o meses')),ctx);await ctx.loadDashboard();
  const u=new URL(urls.find(u=>u.startsWith('/api/dashboard/gastos')),'http://local');assert.equal(u.searchParams.get('from'),esperado[0]);assert.equal(u.searchParams.get('to'),esperado[1]);assert.equal(u.searchParams.get('locales'),'Blanes,Girona');
  assert.equal(ctx.DASH_GASTOS,null);assert.equal(ctx.DASH_GASTOS_ESTADO,'error');
 }
});
test('gasto: usa las fechas solicitadas y solo el ámbito autorizado',async()=>{
 let handler;const consultas=[];const ctx=vm.createContext({crearCachePeriodo:()=>{},app:{get:(p,a,h)=>handler=h},requireAuth:()=>()=>{},localesScope:()=>['A'],barrasDelCentro:l=>[l],SIN_ALBARANES:'tipo <> \'albaran\'',gastoDesglosado,
 dbAll:async(s,p)=>{consultas.push([s,p]);return[{local:'A',total:100}];},gastoDeEmpresaPorLocal:async()=>({porLocal:new Map([['A',20],['B',80]]),sinRepartir:[]})});
 vm.runInContext(servidor.slice(servidor.indexOf("app.get('/api/dashboard/gastos'"),servidor.indexOf('app.get("/api/dashboard/periodo"')),ctx);
 let resultado;await handler({query:{from:'2026-09-01',to:'2026-09-30'}},{json:r=>resultado=r,status(){return this;}});
 assert.equal(resultado.data.total,120);assert.equal(resultado.data.porLocal.length,1);assert.deepEqual(Array.from(consultas[0][1].slice(0,2)),['2026-09-01','2026-09-30']);assert.match(consultas[0][0],/local = ANY/);
});
test('el desglose visible no recorta el quinto local y diferencia cero de no disponible',()=>{
 const ctx=vm.createContext({esc:String,nombreCortoLocal:String,eur:n=>n+' €'});vm.runInContext(app.slice(app.indexOf('function dashDesgloseLocales('),app.indexOf('function renderDashboard(')),ctx);
 const html=ctx.dashDesgloseLocales(['A','B','C','D','Blanes'].map(local=>({local,total:0,disponible:local!=='D'})));
 assert.match(html,/Blanes/);assert.match(html,/No disponible/);assert.match(html,/0 €/);
});
