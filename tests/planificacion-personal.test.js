import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cicloPersonal,leerPersonal,mensajesPersonal,crearPlanificacionPersonal,LOCALES_PERSONAL,DESTINO_PERSONAL} from '../src/modules/informes/planificacion-personal.js';
import {fuentesVentas} from '../src/modules/locales/centros.js';
const rows=LOCALES_PERSONAL.map(local=>({local,base:40000,ventas:44000,faltan:[],sinBase:false}));
test('día 20 a las 10 Madrid, recuperación del 23 y cambio de año',()=>{
 assert.equal(cicloPersonal(new Date('2026-10-19T12:00Z')),null);
 assert.equal(cicloPersonal(new Date('2026-10-20T07:59Z')),null);
 assert.deepEqual(cicloPersonal(new Date('2026-10-20T08:00Z')),{mes:'2026-10',objetivo:'2026-11',referencia:'2025-11'});
 assert.equal(cicloPersonal(new Date('2026-10-23T12:00Z')).referencia,'2025-11');
 assert.equal(cicloPersonal(new Date('2026-12-20T12:00Z')).referencia,'2026-01');
 assert.equal(cicloPersonal(new Date('2026-10-23T19:00Z')),null);
});
test('un mensaje con todos los locales, presupuesto y personas',()=>{
 const mensajes=mensajesPersonal(cicloPersonal(new Date('2026-10-23T12:00Z')),rows);
 assert.equal(mensajes.length,1);assert.match(mensajes[0],/14.000,00/);assert.match(mensajes[0],/6,36 personas/);assert.match(mensajes[0],/70.000,00/);
 assert.throws(()=>mensajesPersonal({},rows.map((r,i)=>i===0?{...r,ventas:null}:r)),/Faltan ventas/);
});
test('consulta mes completo y estima bases ausentes al 10 %',async()=>{
 const configs=LOCALES_PERSONAL.flatMap(l=>fuentesVentas(l)).map(local=>({local,usuario:'u',password:'p'}));
 const result=await leerPersonal('2025-11',{configs,leer:async(c,from,to)=>{
  assert.equal(from,'2025-11-01');assert.equal(to,'2025-12-01');
  return [{dia:'2025-11-03',ventas:110,base_imponible:c.local.includes('Girona')?null:100}];
 }});
 assert.equal(result[0].base,100*fuentesVentas(LOCALES_PERSONAL[0]).length);
 assert.equal(result[2].base,100);assert.equal(result[2].sinBase,true);assert.equal(result[2].ventas,110);
});
function fixture({error=false,estado=null}={}){
 let value=estado&&JSON.stringify(estado),entregas=[],preparaciones=0;
 const client={query:async(sql,args)=>{
  if(sql.includes('pg_try'))return {rows:[{locked:true}]};
  if(sql.startsWith('SELECT value'))return {rows:value?[{value}]:[]};
  if(sql.startsWith('INSERT'))value=args[1];
  return {rows:[]};
 },release(){}};
 const deps={pool:{connect:async()=>client},enabled:true,conectado:()=>true,now:()=>new Date('2026-10-23T12:00Z'),preparar:async()=>{preparaciones++;return rows;},enviar:async(t,m)=>{assert.equal(t,DESTINO_PERSONAL);entregas.push(m);if(error)throw Error('incierto');}};
 return {deps,entregas,estado:()=>JSON.parse(value),preparaciones:()=>preparaciones};
}
test('al publicar envía un mensaje y conserva el progreso entre reinicios',async()=>{
 const f=fixture();
 for(let i=0;i<8;i++)await crearPlanificacionPersonal(f.deps).tick();
 assert.equal(f.entregas.length,1);assert.equal(f.preparaciones(),1);assert.equal(f.estado().estado,'enviada');
});
test('desconectado no prepara ni envía; entrega incierta nunca se repite',async()=>{
 const f=fixture({error:true});await crearPlanificacionPersonal({...f.deps,conectado:()=>false}).tick();assert.equal(f.preparaciones(),0);
 await crearPlanificacionPersonal(f.deps).tick();await crearPlanificacionPersonal(f.deps).tick();assert.equal(f.entregas.length,1);assert.equal(f.estado().estado,'incierta');
 const interrupted=fixture({estado:{estado:'enviando'}});await crearPlanificacionPersonal(interrupted.deps).tick();assert.equal(interrupted.entregas.length,0);assert.equal(interrupted.estado().estado,'incierta');
});

test('un fallo de TPV usa el respaldo por barra y no duplica resultados parciales',async()=>{
 const configs=LOCALES_PERSONAL.flatMap(l=>fuentesVentas(l)).map(local=>({local,usuario:'u',password:'p'}));
 let respaldos=0;
 const r=await leerPersonal('2025-11',{configs,leer:async()=>{throw Error('timeout');},respaldo:async(local,desde,hasta)=>{respaldos++;assert.equal(desde,'2025-11-01');assert.equal(hasta,'2025-12-01');return [{dia:'2025-11-10',ventas:1100}];}});
 assert.equal(respaldos,configs.length);assert.ok(r.every(x=>x.base>0&&x.sinBase));
 assert.equal(r[0].base,1000*fuentesVentas(LOCALES_PERSONAL[0]).length);
 const msg=mensajesPersonal(cicloPersonal(new Date('2026-10-23T12:00Z')),r);assert.match(msg[0],/total ÷ 1,10/);
});
test('datos ausentes retienen el informe sin enviar cifras incompletas',async()=>{
 const f=fixture();let now=new Date('2026-10-23T12:00Z'),lecturas=0;
 const deps={...f.deps,now:()=>now,preparar:async()=>{lecturas++;return rows.map(r=>({...r,base:null,ventas:null,faltan:[r.local]}));}};
 await crearPlanificacionPersonal(deps).tick();assert.equal(f.entregas.length,0);assert.equal(lecturas,1);
 await crearPlanificacionPersonal(deps).tick();assert.equal(lecturas,1);
 now=new Date(+now+16*60000);await crearPlanificacionPersonal(deps).tick();assert.equal(lecturas,2);assert.equal(f.entregas.length,0);
 for(let i=0;i<5;i++){now=new Date(+now+16*60000);await crearPlanificacionPersonal(deps).tick();}
 assert.equal(lecturas,7);assert.equal(f.entregas.length,0);
});

test('diciembre real usa siempre total dividido entre 1,10 y suma presupuestos redondeados',()=>{
 const ventas=[57585.14,63762.49,32803.97,27095.24,57345.90];
 const [m]=mensajesPersonal({objetivo:'2026-12',referencia:'2025-12'},rows.map((r,i)=>({...r,ventas:ventas[i],base:999})));
 for(const importe of ['52.350,13','57.965,90','29.821,79','24.632,04','52.132,64','216.902,50','75.915,87'])assert.ok(m.includes(importe));
 for(const personas of ['8,33','9,22','4,74','3,92','8,29'])assert.ok(m.includes(personas+' personas'));
 assert.match(m,/DICIEMBRE DE 2026/);assert.match(m,/diciembre de 2025/);
});
test('publicar formato nuevo no reenvía ciclos completados ni entregas inciertas',async()=>{
 for(const estado of ['enviada','incierta']){
  const f=fixture({estado:{estado,enviados:6,mensajes:Array(6).fill('anterior')}});
  await crearPlanificacionPersonal(f.deps).tick();assert.equal(f.entregas.length,0);assert.equal(f.preparaciones(),0);
 }
});
test('serie inválida intenta el respaldo sin sumar datos erróneos',async()=>{
 const configs=LOCALES_PERSONAL.flatMap(l=>fuentesVentas(l)).map(local=>({local,usuario:'u',password:'p'}));
 const r=await leerPersonal('2025-11',{configs,leer:async()=>[{dia:'2025-12-01',ventas:999999}],respaldo:async()=>[{dia:'2025-11-01',ventas:110}]});
 assert.ok(r.every(x=>x.ventas>0&&x.ventas<1000&&x.base>0));
});


test('Blanes incluye Cooperativa: no consulta ni exige un segundo servidor ni duplica ventas', async()=>{
 const consultas=[];
 const configs=[...LOCALES_PERSONAL,'Cooperativa - Blanes'].map(local=>({local,usuario:'u',password:'p'}));
 const resultado=await leerPersonal('2025-12',{configs,leer:async cfg=>{
   consultas.push(cfg.local);
   return [{dia:'2025-12-01',ventas:1100,base_imponible:1000}];
 },respaldo:async()=>{throw Error('No debe necesitar respaldo');}});
 assert.equal(consultas.includes('Cooperativa - Blanes'),false);
 assert.equal(resultado[0].ventas,1100);
 assert.deepEqual(resultado[0].faltan,[]);
 const f=fixture();
 await crearPlanificacionPersonal({...f.deps,preparar:async()=>resultado}).tick();
 assert.equal(f.entregas.length,1);
});
