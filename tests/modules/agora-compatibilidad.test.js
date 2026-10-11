import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAgoraClient} from '../../src/integrations/agora/client.js';
import {mapearVentasHeatMap} from '../../src/integrations/agora/ventas-compatibles.js';
import {syncVentasLocal} from '../../src/integrations/agora/sync.js';
const heat = (value) => ({Message:{HeatMap:{Days:[{Day:'2026-10-10T00:00:00',Value:value}]}}});
const cfg = {host:'http://local:8984',cookie:'auth-token=test',version:'6.3.3'};

test('servidor antiguo: usa los gráficos diarios únicamente si el informe global no existe', async()=>{
 const calls=[];
 const client=createAgoraClient(cfg,{fetchFn:async(url,opts)=>{
  const m=JSON.parse(opts.body).Message; calls.push(m);
  if(m.CLRType.endsWith('GetAllPosGroupsRequest'))return Response.json({Message:{All:[{Id:1}]}});
  if(m.CLRType.endsWith('GetGlobalSalesReportRequest'))return new Response('Error al obtener método',{status:500});
  assert.equal(m.WorkplaceId,null);
  assert.equal(m.From,'2026-10-10T00:00:00.000');
  assert.equal(m.To,'2026-10-10T00:00:00.000');
  return Response.json(heat(m.CLRType.includes('Sales') ? 123.45 : m.CLRType.includes('Tickets') ? 5 : 8));
 }});
 const rows=await client.getVentasRango('2026-10-10','2026-10-11');
 assert.deepEqual(rows,[{dia:'2026-10-10',ventas:123.45,tickets:5,comensales:8,ticket_medio:24.69,base_imponible:null,cuota_iva:null}]);
 await client.getVentasRango('2026-10-10','2026-10-11');
 assert.equal(calls.filter(m=>m.CLRType.endsWith('GetGlobalSalesReportRequest')).length,1);
});

test('un fallo de permisos no activa un informe alternativo',async()=>{
 let n=0;
 const client=createAgoraClient({...cfg,posGroupsIds:[1]},{fetchFn:async()=>{n++;return new Response('Forbidden',{status:403});}});
 await assert.rejects(client.getVentasRango('2026-10-10','2026-10-11'),/bus_403/);
 assert.equal(n,1);
});

test('un informe no reconocido no se interpreta como ventas cero',async()=>{
 const client=createAgoraClient({...cfg,posGroupsIds:[1]},{fetchFn:async()=>Response.json({Message:{}})});
 await assert.rejects(client.getVentasRango('2026-10-10','2026-10-11'),/no reconocida/);
 assert.throws(()=>mapearVentasHeatMap(heat(100),{Message:{}},heat(2),'2026-10-10','2026-10-11'),/sin desglose/);
 assert.throws(()=>mapearVentasHeatMap(heat(100),heat(null),heat(2),'2026-10-10','2026-10-11'),/inválido/);
});

test('histórico por bloques: guarda lo recibido aunque otro bloque falle',async()=>{
 const calls=[],saved=[];
 const r=await syncVentasLocal({all:async()=>[],run:async(sql,p)=>saved.push(p)}, {
  ping:async()=>true,
  getVentasRango:async(a,b)=>{calls.push([a,b]);if(calls.length===2)throw Error('timeout');return [{dia:'2026-10-10',ventas:20,tickets:2,comensales:2,ticket_medio:10}];},
 },{local:'A'},{hoy:'2026-10-11',maxDias:65});
 assert.deepEqual(calls[0],['2026-09-11','2026-10-11']);
 assert.equal(saved.length,1);assert.equal(r.insertados,1);assert.equal(r.error,'timeout');
});

test('el informe moderno conserva base e IVA y no mezcla días fuera del rango',async()=>{
 const client=createAgoraClient({...cfg,posGroupsIds:[1],version:'8.7.4'},{fetchFn:async(url,opts)=>{
  const m=JSON.parse(opts.body).Message;
  assert.ok(m.CLRType.endsWith('GetGlobalSalesReportRequest'));
  return Response.json({Message:{Report:{Sales:[
   {BusinessDay:'2026-10-10',NetAmount:110,GrossAmount:100,Serie:'T',Number:1},
   {BusinessDay:'2026-10-11',NetAmount:999,GrossAmount:900,Serie:'T',Number:2},
  ]}}});
 }});
 const rows=await client.getVentasRango('2026-10-10','2026-10-11');
 assert.equal(rows.length,1);assert.equal(rows[0].ventas,110);assert.equal(rows[0].base_imponible,100);assert.equal(rows[0].cuota_iva,10);
});

test('el bus usa el usuario real de la sesión y lo renueva tras caducar',async()=>{
 let logins=0, buses=0;
 const client=createAgoraClient({host:cfg.host,version:'6.3.3',usuario:'Admin web',password:'test'}, {fetchFn:async(url,opts)=>{
  if(url.endsWith('/auth/'))return Response.json({Message:{Session:{UserId:++logins}}},{headers:{'set-cookie':'auth-token=test; Path=/'}});
  const m=JSON.parse(opts.body).Message;
  assert.equal(m.Sender.UserId,logins);
  if(++buses===1)return new Response('',{status:401});
  return Response.json(heat(12));
 }});
 await client.informe('IGT.POS.Bus.Reporting.Messages.GetWorkplaceSalesHeatMapRequest');
 assert.equal(logins,2);assert.equal(buses,2);
});
