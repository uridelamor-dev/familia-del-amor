import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {conEsquema,disponible,motivoSalto} from './helpers/pgtmp.js';
import {indiceCategorias} from '../src/modules/facturas/categorias.js';
import {gastoDesglosado,categoriasGastoEntrega} from '../src/modules/dashboard/desglose.js';
const app=readFileSync(new URL('../public/panel/app.js',import.meta.url),'utf8');
const servidor=readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('la tarjeta pide el mes actual por defecto y el rango filtrado después, conservando locales',async()=>{
 for(const [from,to,esperado]of [['2026-10-28','2026-10-28',['2026-10-01','2026-10-31']],['2026-09-01','2026-09-30',['2026-09-01','2026-09-30']]]){
  const urls=[];const ctx=vm.createContext({Date,nombreCortoLocal:String,DASH_VISTOS:new Map(),DASH_COMPARAR:null,sinPublico:()=>false,DASH_RANGE:{from,to},DASH_CARGA:0,CURRENT:'dashboard',PERIOD:'custom',todayStr:()=> '2026-10-28',viendoVarios:()=>true,localesDelAmbito:()=>['Blanes','Girona'],document:{getElementById:()=>({})},skeleton:()=>'',renderDashboard:()=>'',repintarBarra(){},api:async()=>({}),apiDashboard:async()=>null,apiOptional:async u=>{urls.push(u);return null;}});
  vm.runInContext(app.slice(app.indexOf('async function loadDashboard()'),app.indexOf('// Rango personalizado (días o meses')),ctx);await ctx.loadDashboard();
  const u=new URL(urls.find(u=>u.startsWith('/api/dashboard/gastos')),'http://local');assert.equal(u.searchParams.get('from'),esperado[0]);assert.equal(u.searchParams.get('to'),esperado[1]);assert.equal(u.searchParams.get('locales'),'Blanes,Girona');
  assert.equal(ctx.DASH_GASTOS,null);assert.equal(ctx.DASH_GASTOS_ESTADO,'error');
 }
});
function rutaGastos(dbAll,empresa=null,local='A'){
 let handler;
 const ctx=vm.createContext({crearCachePeriodo:()=>{},app:{get:(p,a,h)=>handler=h},requireAuth:()=>()=>{},localesScope:()=>[local],barrasDelCentro:l=>[l],SIN_DUDAS:"COALESCE(dup_estado,'') <> 'duda'",gastoDesglosado,categoriasGastoEntrega,indiceCategorias,dbAll,gastoDeEmpresaPorLocal:async()=>empresa,repartirGastoDashboard:async()=>null});
 vm.runInContext(servidor.slice(servidor.indexOf("const FACTURADO_DASHBOARD"),servidor.indexOf('app.get("/api/dashboard/periodo"')),ctx);
 return async (from,to)=>{
  let resultado;
  await handler({query:{from,to}},{json:r=>resultado=r,status(){return this;}});
  assert.equal(resultado.ok,true,resultado.error);
  return resultado;
 };
}
test('gasto: usa las fechas solicitadas y solo el ámbito autorizado',async()=>{
 const consultas=[];
 const consultar=rutaGastos(async(s,p)=>{
  consultas.push([s,p]);
  if(s.includes('facturas_proveedor_cats'))return [];
  if(s.includes('NOT EXISTS'))return[{local:'A',total:30,cantidad:2,sin_importe:1}];
  if(s.includes('WITH importes_entregados'))return[{local:'A',total:130,sin_importe:1}];
  return[{local:'A',total:100}];
 },{porLocal:new Map([['A',20],['B',80]]),sinRepartir:[]});
 const resultado=await consultar('2026-09-01','2026-09-30');
 assert.equal(resultado.data.total,120);assert.equal(resultado.data.porLocal.length,1);assert.deepEqual(Array.from(consultas[0][1].slice(0,2)),['2026-09-01','2026-09-30']);assert.match(consultas[0][0],/local = ANY/);
 assert.equal(resultado.data.gastoEntrega.total,130);
 assert.equal(resultado.data.albaranesPendientes.total,30);
 assert.equal(resultado.data.albaranesPendientes.cantidad,2);
 assert.equal(resultado.data.albaranesPendientes.sinImporte,1);
 assert.match(consultas[1][0],/NOT EXISTS[\s\S]*f.id::text=a.conciliado_con/);
 assert.doesNotMatch(consultas[1][0].split('NOT EXISTS')[1],/f.fecha/);
 assert.deepEqual(Array.from(consultas[1][1][2]),['A']);
});
test('el desglose visible no recorta el quinto local y diferencia cero de no disponible',()=>{
 const ctx=vm.createContext({esc:String,nombreCortoLocal:String,eur:n=>n+' €'});vm.runInContext(app.slice(app.indexOf('function dashDesgloseLocales('),app.indexOf('function renderDashboard(')),ctx);
 const html=ctx.dashDesgloseLocales(['A','B','C','D','Blanes'].map(local=>({local,total:0,disponible:local!=='D'})));
 assert.match(html,/Blanes/);assert.match(html,/No disponible/);assert.match(html,/0 €/);
});

test('Blanes: facturar en diciembre conserva el gasto de la entrega en noviembre',async t=>{
 if(!await disponible()){t.skip(motivoSalto());return;}
 const db=await conEsquema();
 try{
  await db.raw(`CREATE TABLE facturas(id integer,local text,tipo text,fecha text,total numeric,
    conciliado_con text,empresa text,reparto text,dup_estado text,proveedor text);
    CREATE TABLE facturas_proveedor_cats(prov_clave text,categoria text,subcategoria text);
    INSERT INTO facturas_proveedor_cats VALUES
      ('coca cola','Bebidas','Refrescos'),('proveedor mixto','Bebidas',''),('proveedor mixto','Pan y bollería','');
    INSERT INTO facturas VALUES
     (1,'Blanes','factura','2026-11-21',108.65,NULL,NULL,NULL,NULL,'Proveedor Mixto'),
     (2,'Blanes','albaran','2026-11-24',333.39,NULL,NULL,NULL,NULL,'Coca Cola'),
     (3,'Blanes','albaran','2026-11-24',2928.96,NULL,NULL,NULL,NULL,'Sin etiqueta'),
     (4,'Girona','albaran','2026-11-24',999.99,NULL,NULL,NULL,NULL,'Coca Cola')`);
  const consultar=rutaGastos(db.all,null,'Blanes');
  const noviembre=()=>consultar('2026-11-01','2026-11-30');
  const diciembre=()=>consultar('2026-12-01','2026-12-31');
  const antes=(await noviembre()).data;
  assert.equal(antes.total,108.65);
  assert.equal(antes.albaranesPendientes.total,3262.35);
  assert.equal(antes.gastoEntrega.total,3371);
  const categorias=antes.gastoEntrega.porCategoria;
  assert.equal(categorias.sinClasificar.importe,2928.96);
  assert.equal(categorias.estimado,108.65);
  assert.equal(categorias.categorias.length,2);
  const importes=categorias.categorias.map(c=>Math.round(c.importe*100));
  assert.equal(importes.reduce((s,n)=>s+n,0),44204);
  assert.ok(Math.abs(categorias.categorias.reduce((s,c)=>s+c.porcentaje,categorias.sinClasificar.porcentaje)-100)<1e-9);
  await db.raw(`INSERT INTO facturas VALUES (5,'Blanes','factura','2026-12-01',333.39,'[2]',NULL,NULL,NULL,'Coca Cola');
    UPDATE facturas SET conciliado_con='5' WHERE id=2`);
  const nov=(await noviembre()).data;
  const dic=(await diciembre()).data;
  assert.equal(nov.albaranesPendientes.total,2928.96);
  assert.equal(nov.gastoEntrega.total,3371);
  assert.deepEqual(nov.gastoEntrega.porCategoria,categorias);
  assert.equal(dic.total,333.39);
  assert.equal(dic.gastoEntrega.total,0);
  await db.raw('UPDATE facturas SET total=353.39 WHERE id=5');
  assert.equal((await diciembre()).data.gastoEntrega.total,20);
 }finally{await db.fin();}
});
