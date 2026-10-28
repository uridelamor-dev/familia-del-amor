import {agruparDesglose} from '../src/modules/dashboard/desglose.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ventasRecientes, completarVentasRecientes, normalizarVentasRango } from '../src/modules/dashboard/ventas-recientes.js';
import { resumenHoy } from '../src/modules/dashboard/hoy.js';
const hoy = '2026-10-13';
const vivo = { hoy, locales: [{ local:'Blanes', dias:[
  {dia:'2026-10-12',ventas:13279,tickets:998}, {dia:hoy,ventas:2142,tickets:367}
]}] };
const calcular = (from,to,extra={}) => ventasRecientes({vivo,locales:['Blanes'],from,to,hoy,...extra});
const total = r => r.serie.reduce((s,d)=>s+d.ventas,0);
test('martes: semana equivale a lunes más martes y coincide con Hoy',()=>{
  const ayer=calcular('2026-10-12','2026-10-12'),actual=calcular(hoy,hoy),semana=calcular('2026-10-12',hoy);
  assert.equal(total(semana),15421);
  assert.equal(total(semana),total(ayer)+total(actual));
  assert.equal(total(actual),resumenHoy(vivo,{hoy,locales:['Blanes']}).actual.ventas);
  assert.equal(semana.parcial,false);
});
test('respaldo sustituye al local caído sin duplicar ventas ni incorporar hoy guardado',()=>{
  const extra={locales:['Blanes','Girona'],respaldo:[
    {local:'Blanes',dia:'2026-10-12',ventas:99999},
    {local:'Blanes',dia:hoy,ventas:99999},
    {local:'Girona',dia:'2026-10-12',ventas:1000},
    {local:'Girona',dia:hoy,ventas:99999}]};
  const semana=calcular('2026-10-12',hoy,extra);
  assert.equal(total(semana),16421);
  assert.equal(semana.parcial,true);
  assert.equal(total(semana),total(calcular('2026-10-12','2026-10-12',extra))+total(calcular(hoy,hoy,extra)));
});
test('un cero leído es válido; una caché de ayer no es lectura de hoy',()=>{
  assert.equal(calcular(hoy,hoy,{vivo:{hoy,locales:[{local:'Blanes',dias:[{dia:hoy,ventas:0,tickets:0}]}]}}).parcial,false);
  assert.deepEqual(calcular(hoy,hoy,{vivo:{...vivo,hoy:'2026-10-12'}}),{serie:[],parcial:true,hoyEnVivo:false});
});
test('el rango inclusivo del dashboard se convierte al extremo exclusivo de Ágora',async()=>{
  const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
  const start=source.indexOf('async function ventasRangoLive(local, from, to)');
  const end=source.indexOf('// Ejecuta un informe de Ágora',start);
  const calls=[];
  const ctx=vm.createContext({Date,Promise,Map,Math,Object,setTimeout:()=>0,
    _ventasRangoCache:new Map(),_ventasRangoPendientes:new Map(),cacheLeer:async()=>null,cacheGuardar:async()=>{},
    claveRango:()=>'',loadAgoraConfigsActive:async()=>[{local:'Blanes',usuario:'u',password:'p'}],
    createAgoraClient:()=>({getVentasRango:async(a,b)=>{calls.push([a,b]);return[];}}),
    addDaysISO:(iso,n)=>{const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}});
  vm.runInContext(source.slice(start,end),ctx);
  await ctx.ventasRangoLive(null,'2026-09-30','2026-09-30');
  await ctx.ventasRangoLive(null,'2026-09-28','2026-09-30');
  assert.deepEqual(calls,[['2026-09-30','2026-10-01'],['2026-09-28','2026-10-01']]);
});

// Ejecuta el ensamblado real del servidor: histórico de Ágora + últimos días.
// Los importes diarios diferentes permiten detectar tanto huecos como duplicados.
for (const caso of [
  ...['2026-10-13', '2026-11-01', '2028-02-29', '2026-03-31'].map(fecha => ({ fecha, desde: fecha.slice(0, 8) + '01', hasta: fecha })),
  { fecha: '2026-10-13', desde: '2026-09-15', hasta: '2026-09-15' },
  { fecha: '2026-10-13', desde: '2026-09-27', hasta: '2026-10-09' },
  { fecha: '2026-10-13', desde: '2026-10-05', hasta: '2026-10-06' },
  { fecha: '2026-10-13', desde: '2026-10-06', hasta: '2026-10-08' },
  { fecha: '2027-01-12', desde: '2026-12-28', hasta: '2027-01-08' },
  { fecha: '2026-10-30', desde: '2026-10-24', hasta: '2026-10-26' },
  { fecha: '2026-04-10', desde: '2026-03-28', hasta: '2026-03-30' },
]) {
  const { fecha, desde, hasta } = caso;
  test(`Rango ${desde} a ${hasta}: cada día exactamente una vez`, async () => {
    const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    const sumarDias = (iso, n) => {
      const d = new Date(iso + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const inicio = desde;
    const filas = [];
    for (let dia = inicio; dia <= hasta; dia = sumarDias(dia, 1)) {
      filas.push({ dia, ventas: Number(dia.slice(-2)) * 101, tickets: Number(dia.slice(-2)) });
    }
    const inicioReciente = sumarDias(fecha, -7);
    const pedidos = [];
    const ctx = vm.createContext({ Date, Promise, Map, Math, Object, setTimeout: () => 0,
      _ventasRangoCache: new Map(), _ventasRangoPendientes:new Map(), cacheLeer: async () => null, cacheGuardar: async () => {},
      claveRango: () => '', loadAgoraConfigsActive: async () => [{ local: 'Blanes', usuario: 'u', password: 'p' }],
      createAgoraClient: () => ({ getVentasRango: async (a, b) => {
        pedidos.push([a, b]);
        return filas.filter(f => f.dia >= a && f.dia < b);
      } }),
      hoyISO: () => fecha, addDaysISO: sumarDias,
      INV_LOCALES: ['Blanes'], LOCALES_SIN_PUBLICO: new Set(), fuentesVentas: l => [l],
      ventasRecientes, completarVentasRecientes, normalizarVentasRango, agruparDesglose,
      _ventasVivoCache:{ts:Date.now(),data:{hoy:fecha,locales:[{local:'Blanes',dias:filas.filter(f=>f.dia>=inicioReciente)}]}},
      dbAll: async () => [], dbGet: async () => ({ n: 0, total: 0, base: 0 }),
      SIN_ALBARANES: 'TRUE', resultadoRegistrado: () => null,
    });
    vm.runInContext(source.slice(source.indexOf('async function ventasRangoLive(local, from, to)'), source.indexOf('// Ejecuta un informe de Ágora')), ctx);
    vm.runInContext(source.slice(source.indexOf('async function periodoDeLocal('), source.indexOf('// Estado de la integración por local (NUNCA expone el token).')), ctx);
    const mes = await ctx.periodoDeLocal({ from: inicio, to: hasta }, null);
    assert.equal(mes.ventas.total, filas.reduce((s, f) => s + f.ventas, 0));
    assert.equal(mes.ventas.parcial, false);
    assert.equal(mes.ventas.porLocal.reduce((s,r)=>s+r.total,0),mes.ventas.total);
    assert.equal(mes.hoyEnVivo, hasta === fecha);
    assert.deepEqual(Array.from(mes.ventas.serie, f => f.dia), filas.map(f => f.dia));
    if (inicio < inicioReciente) assert.deepEqual(pedidos[0], [inicio, hasta < inicioReciente ? sumarDias(hasta, 1) : inicioReciente]);
    else assert.equal(pedidos.length, 0);
    let sumaDias = 0;
    for (const fila of filas) {
      const unDia = await ctx.periodoDeLocal({ from: fila.dia, to: fila.dia }, null);
      sumaDias += unDia.ventas.total;
    }
    assert.equal(mes.ventas.total, sumaDias);
  });
}

test('semana con viernes ausente recupera el rango sin duplicar los días ya presentes',async()=>{
 const hoy='2026-10-24';
 const anterior={hoy,locales:[{local:'Blanes',dias:[{dia:'2026-10-19',ventas:7589,tickets:668}]}]};
 const vivo=await completarVentasRecientes({vivo:anterior,locales:['Blanes'],from:'2026-10-19',to:hoy,hoy,leer:async()=>[{dia:'2026-10-19',ventas:7589,tickets:668},{dia:'2026-10-23',ventas:2981,tickets:200}]});
 const r=ventasRecientes({vivo,locales:['Blanes'],from:'2026-10-19',to:hoy,hoy});
 assert.equal(total(r),10570);assert.equal(r.parcial,false);
});
test('fallo de recuperación conserva parcial y no inventa cero para un local caído',async()=>{
 const vivo=await completarVentasRecientes({vivo:{hoy,locales:[]},locales:['Girona'],from:hoy,to:hoy,hoy,leer:async()=>null});
 assert.equal(ventasRecientes({vivo,locales:['Girona'],from:hoy,to:hoy,hoy}).parcial,true);
});

test('recupera cada barra afectada, conserva las completas y no mezcla locales',async()=>{
 const hoy='2026-10-24',from='2026-10-23',calls=[];
 const originales={hoy,locales:[{local:'A',dias:[{dia:from,ventas:10},{dia:hoy,ventas:20}]},{local:'B',error:'timeout',dias:[]}]};
 const vivo=await completarVentasRecientes({vivo:originales,locales:['A','B','B','C'],from,to:hoy,hoy,leer:async local=>{calls.push(local);return local==='B'?[{dia:from,ventas:30}]:null;}});
 assert.deepEqual(calls,['B','C']);
 const r=ventasRecientes({vivo,locales:['A','B','C'],from,to:hoy,hoy});assert.equal(total(r),60);assert.equal(r.parcial,true);
});

test('rango vacio confirmado es cero; fallo y datos invalidos no lo son',()=>{
 assert.deepEqual(normalizarVentasRango([],hoy,hoy),[{dia:hoy,ventas:0,tickets:0}]);
 assert.equal(normalizarVentasRango(null,hoy,hoy),null);
 assert.equal(normalizarVentasRango([{dia:hoy,ventas:null}],hoy,hoy),null);
});
test('las recuperaciones de locales avanzan simultaneamente',async()=>{
 const iniciados=[];let liberar;
 const espera=new Promise(resolve=>{liberar=resolve;});
 const tarea=completarVentasRecientes({vivo:{hoy,locales:[]},locales:['A','B','C'],from:hoy,to:hoy,hoy,leer:async local=>{iniciados.push(local);await espera;return [];}});
 assert.deepEqual(iniciados,['A','B','C']);
 liberar();const vivo=await tarea;
 assert.equal(ventasRecientes({vivo,locales:iniciados,from:hoy,to:hoy,hoy}).parcial,false);
});
test('historico sin ventas confirmado queda completo; respaldo con huecos queda parcial',async()=>{
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const ctx=vm.createContext({hoyISO:()=>hoy,addDaysISO:(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);},
 INV_LOCALES:['A'],LOCALES_SIN_PUBLICO:new Set(),fuentesVentas:l=>[l],normalizarVentasRango,agruparDesglose,
 ventasRangoLive:async()=>[],dbAll:async()=>[],dbGet:async()=>({n:0,total:0,base:0}),SIN_ALBARANES:'TRUE',resultadoRegistrado:()=>null});
 vm.runInContext(source.slice(source.indexOf('async function periodoDeLocal('),source.indexOf('// Estado de la integración por local (NUNCA expone el token).')),ctx);
 const q={from:'2026-09-01',to:'2026-09-03'};
 const completo=await ctx.periodoDeLocal(q,null);
 assert.equal(completo.ventas.disponible,true);assert.equal(completo.ventas.parcial,false);assert.equal(completo.ventas.total,0);
 ctx.ventasRangoLive=async()=>null;
 const fallido=await ctx.periodoDeLocal(q,null);
 assert.equal(fallido.ventas.disponible,false);assert.equal(fallido.ventas.parcial,true);
});

test('lectura en vivo paralela: local sin ventas completo y local caido distinguible',async()=>{
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const iniciados=[];let liberar;const espera=new Promise(r=>{liberar=r;});
 const ctx=vm.createContext({_ventasVivoCache:{ts:0},hoyISO:()=>hoy,hoyMas:n=>n===1?'2026-10-14':'2026-10-06',
 cacheLeer:async()=>null,cacheGuardar:async()=>{},CLAVE_VIVO:'vivo',normalizarVentasRango,
 loadAgoraConfigsActive:async()=>['A','B'].map(local=>({local,usuario:'u',password:'p'})),
 createAgoraClient:cfg=>({getVentasRango:async()=>{iniciados.push(cfg.local);await espera;if(cfg.local==='B')throw Error('offline');return [];}}),dbRun:async()=>{}});
 vm.runInContext(source.slice(source.indexOf('async function leerVentasVivo(force)'),source.indexOf('app.get("/api/agora/ventas-vivo"')),ctx);
 const tarea=ctx.leerVentasVivo(false);
 await new Promise(r=>setImmediate(r));assert.deepEqual(iniciados,['A','B']);liberar();
 const vivo=await tarea;
 assert.equal(vivo.locales[0].dias.length,8);assert.equal(vivo.locales[0].error,null);
 assert.equal(vivo.locales[1].error,'offline');
});

test('el histórico empieza mientras la lectura reciente sigue pendiente',async()=>{
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 let soltar;const puerta=new Promise(r=>soltar=r);const pedidos=[];
 const ctx=vm.createContext({hoyISO:()=>hoy,addDaysISO:(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);},
 INV_LOCALES:['A'],LOCALES_SIN_PUBLICO:new Set(),fuentesVentas:l=>[l],normalizarVentasRango,agruparDesglose,ventasRecientes,completarVentasRecientes,
 _ventasVivoCache:{ts:0},ventasRangoLive:async(l,from)=>{pedidos.push(from);if(from!=='2026-09-01')await puerta;return [];},
 dbAll:async()=>[],dbGet:async()=>({n:0,total:0,base:0}),SIN_ALBARANES:'TRUE',resultadoRegistrado:()=>null});
 vm.runInContext(source.slice(source.indexOf('async function periodoDeLocal('),source.indexOf('// Estado de la integración por local (NUNCA expone el token).')),ctx);
 const tarea=ctx.periodoDeLocal({from:'2026-09-01',to:hoy},null);
 await new Promise(r=>setImmediate(r));assert.equal(pedidos.length,2);assert.ok(pedidos.includes('2026-09-01'));
 soltar();const per=await tarea;assert.equal(per.ventas.parcial,false);
});
