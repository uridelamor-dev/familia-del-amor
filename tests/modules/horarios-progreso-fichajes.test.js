import {test} from 'node:test';
import assert from 'node:assert/strict';
import {progresoFichajes,cargarProgresoFichajes} from '../../src/modules/horarios/progreso-fichajes.js';
const dia='2026-10-28',inicio=Date.parse(dia+'T00:00:00Z');
const a={id:1,worker_id:7,dia,inicio_min:480,fin_min:960,tipo:'turno'};
const e=(tipo,min,extra={})=>({id:min,worker_id:7,dia_negocio:dia,tipo,minuto_local:min,epoch_ms:inicio+min*60000,...extra});
const r=(eventos,ahora,asig=[a])=>progresoFichajes(asig,eventos,inicio+ahora*60000);
test('Entrada tardía: de 10 a 12 cuenta 25%, y de 10 a 18 cuenta 100%',()=>{
 assert.equal(r([e('entrada',600)],720)[1].porcentaje,25);
 assert.equal(r([e('entrada',600)],960)[1].porcentaje,75);
 assert.deepEqual(r([e('entrada',600),e('salida',1080)],1200)[1],{minutos:480,objetivo:480,porcentaje:100,estado:'salida'});
});
test('Al llegar al objetivo sigue trabajando hasta que conste una salida; salir antes congela el porcentaje',()=>{
 assert.equal(r([e('entrada',600)],1080)[1].estado,'trabajando');
 assert.equal(r([e('entrada',600),e('salida',720)],1080)[1].porcentaje,25);
});
test('Pausas abiertas y cerradas no suman tiempo trabajado',()=>{
 const ev=[e('entrada',600),e('pausa_inicio',660)];
 assert.equal(r(ev,720)[1].minutos,60);assert.equal(r(ev,720)[1].estado,'pausa');
 assert.equal(r([...ev,e('pausa_fin',690)],750)[1].minutos,120);
 assert.equal(r([...ev,e('salida',720)],800)[1].minutos,60);
});
test('Turno partido: cada sesión aporta a una sola barra',()=>{
 const b={...a,id:2,inicio_min:1200,fin_min:1440};
 const out=r([e('entrada',480),e('salida',960),e('entrada',1200)],1260,[a,b]);
 assert.equal(out[1].minutos,480);assert.equal(out[2].minutos,60);assert.equal(out[2].porcentaje,25);
});
test('Varias entradas y salidas del mismo turno se acumulan sin duplicar una entrada repetida',()=>{
 assert.equal(r([e('entrada',480),e('entrada',490),e('salida',540),e('entrada',600),e('salida',660)],720)[1].minutos,120);
});
test('No inventa fichajes: ignora anulados, futuros, otras personas, otros días y salidas huérfanas',()=>{
 const ev=[e('entrada',480,{anulado_por:2}),e('salida',600),e('entrada',800),e('entrada',500,{worker_id:8}),e('entrada',500,{dia_negocio:'2026-10-27'})];
 assert.equal(r(ev,720)[1].estado,'sin_fichar');
 assert.equal(r(ev,720)[1].minutos,0);
});
test('Una salida olvidada no rellena la barra indefinidamente',()=>{
 assert.equal(r([e('entrada',480)],1500)[1].estado,'sin_salida');
 assert.equal(r([e('entrada',480)],1500)[1].porcentaje,0);
});
test('El progreso se limita a 100% pero conserva los minutos extra',()=>{
 const out=r([e('entrada',480),e('salida',1080)],1200)[1];
 assert.equal(out.porcentaje,100);assert.equal(out.minutos,600);
});
test('Turno nocturno y cambio de hora: mide la duración real por epoch',()=>{
 const b={...a,inicio_min:1200,fin_min:1680};
 assert.equal(r([e('entrada',1200),e('salida',1500)],1600,[b])[1].minutos,300);
 const ev=[e('entrada',1200),e('salida',1500,{epoch_ms:inicio+1560*60000})];
 assert.equal(r(ev,1600,[b])[1].minutos,360);
});
test('Sin duración fija, sin persona o descanso no se inventa un porcentaje',()=>{
 assert.deepEqual(r([],720,[{...a,fin_abierto:true},{...a,id:2,worker_id:null},{...a,id:3,tipo:'descanso'}]),{});
});
test('Lectura acotada al local, personas y fechas del cuadrante, sin escrituras',async()=>{
 let llamada;
 const out=await cargarProgresoFichajes(async(sql,params)=>{llamada={sql,params};return [e('entrada',600)];},[a],['Oficina'],inicio+720*60000);
 assert.match(llamada.sql,/local=ANY\(\?\)/);assert.deepEqual(llamada.params,[[7],['Oficina'],dia,dia]);assert.equal(out[1].porcentaje,25);
});


test('Llegar tarde al primer turno no traslada sus horas al segundo turno contiguo',()=>{
 const out=r([e('entrada',840)],900,[a,{...a,id:2,inicio_min:960,fin_min:1440}]);
 assert.equal(out[1].minutos,60);assert.equal(out[2].minutos,0);
});
test('La actualización de progreso rechaza semanas de otros locales antes de consultar fichajes',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 const start=source.indexOf("app.get('/api/horarios/semana/:id/progreso'");
 let handler,lecturas=0,estado=200;
 runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),{
  app:{get:(p,a,h)=>handler=h},requireAuth:()=>{},HORARIOS_ROLES:[],dbGet:async()=>({id:1,local:'Otro local'}),
  rrhhPuedeLocal:()=>false,dbAll:async()=>{lecturas++;},cargarProgresoFichajes:async()=>{lecturas++;},ficLocales:x=>[x]
 });
 await handler({params:{id:1}},{status:n=>{estado=n;return{json(){}};},json(){}});
 assert.equal(estado,403);assert.equal(lecturas,0);
});
