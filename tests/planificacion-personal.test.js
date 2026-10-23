import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cicloPersonal,leerPersonal,mensajesPersonal,crearPlanificacionPersonal,LOCALES_PERSONAL,DESTINO_PERSONAL} from '../src/modules/informes/planificacion-personal.js';
import {barras as barrasDelCentro} from '../src/modules/locales/centros.js';
const rows=LOCALES_PERSONAL.map(local=>({local,base:40000,ventas:44000,faltan:[],sinBase:false}));
test('día 20 a las 10 Madrid, recuperación del 23 y cambio de año',()=>{
 assert.equal(cicloPersonal(new Date('2026-10-19T12:00Z')),null);
 assert.equal(cicloPersonal(new Date('2026-10-20T07:59Z')),null);
 assert.deepEqual(cicloPersonal(new Date('2026-10-20T08:00Z')),{mes:'2026-10',objetivo:'2026-11',referencia:'2025-11'});
 assert.equal(cicloPersonal(new Date('2026-10-23T12:00Z')).referencia,'2025-11');
 assert.equal(cicloPersonal(new Date('2026-12-20T12:00Z')).referencia,'2026-01');
 assert.equal(cicloPersonal(new Date('2026-10-23T19:00Z')),null);
});
test('cinco locales y general, cálculo sobre base y jornadas equivalentes',()=>{
 const mensajes=mensajesPersonal(cicloPersonal(new Date('2026-10-23T12:00Z')),rows);
 assert.equal(mensajes.length,6);assert.match(mensajes[0],/14.000,00/);assert.match(mensajes[0],/6,36 jornadas/);assert.match(mensajes[5],/70.000,00/);
 const incompletos=rows.map((r,i)=>i===0?{...r,base:null,sinBase:true}:r);
 assert.match(mensajesPersonal(cicloPersonal(new Date('2026-10-23T12:00Z')),incompletos)[5],/Total del grupo pendiente/);
});
test('consulta mes completo, suma barras de Blanes y estima bases ausentes al 10 %',async()=>{
 const configs=LOCALES_PERSONAL.flatMap(l=>barrasDelCentro(l,'ventas')).map(local=>({local,usuario:'u',password:'p'}));
 const result=await leerPersonal('2025-11',{configs,leer:async(c,from,to)=>{
  assert.equal(from,'2025-11-01');assert.equal(to,'2025-12-01');
  return [{dia:'2025-11-03',ventas:110,base_imponible:c.local.includes('Girona')?null:100}];
 }});
 assert.equal(result[0].base,100*barrasDelCentro(LOCALES_PERSONAL[0],'ventas').length);
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
test('al publicar envía seis mensajes y conserva el progreso entre reinicios',async()=>{
 const f=fixture();
 for(let i=0;i<8;i++)await crearPlanificacionPersonal(f.deps).tick();
 assert.equal(f.entregas.length,6);assert.equal(f.preparaciones(),1);assert.equal(f.estado().estado,'enviada');
});
test('desconectado no prepara ni envía; entrega incierta nunca se repite',async()=>{
 const f=fixture({error:true});await crearPlanificacionPersonal({...f.deps,conectado:()=>false}).tick();assert.equal(f.preparaciones(),0);
 await crearPlanificacionPersonal(f.deps).tick();await crearPlanificacionPersonal(f.deps).tick();assert.equal(f.entregas.length,1);assert.equal(f.estado().estado,'incierta');
 const interrupted=fixture({estado:{estado:'enviando'}});await crearPlanificacionPersonal(interrupted.deps).tick();assert.equal(interrupted.entregas.length,0);assert.equal(interrupted.estado().estado,'incierta');
});

test('un fallo de TPV usa el respaldo por barra y no duplica resultados parciales',async()=>{
 const configs=LOCALES_PERSONAL.flatMap(l=>barrasDelCentro(l,'ventas')).map(local=>({local,usuario:'u',password:'p'}));
 let respaldos=0;
 const r=await leerPersonal('2025-11',{configs,leer:async()=>{throw Error('timeout');},respaldo:async(local,desde,hasta)=>{respaldos++;assert.equal(desde,'2025-11-01');assert.equal(hasta,'2025-12-01');return [{dia:'2025-11-10',ventas:1100}];}});
 assert.equal(respaldos,configs.length);assert.ok(r.every(x=>x.base>0&&x.sinBase));
 assert.equal(r[0].base,1000*barrasDelCentro(LOCALES_PERSONAL[0],'ventas').length);
 const msg=mensajesPersonal(cicloPersonal(new Date('2026-10-23T12:00Z')),r);assert.match(msg[0],/total ÷ 1,10/);
});
test('datos ausentes se reintentan antes de enviar el aviso de falta de datos',async()=>{
 const f=fixture();let now=new Date('2026-10-23T12:00Z'),lecturas=0;
 const deps={...f.deps,now:()=>now,preparar:async()=>{lecturas++;return rows.map(r=>({...r,base:null,ventas:null,faltan:[r.local]}));}};
 await crearPlanificacionPersonal(deps).tick();assert.equal(f.entregas.length,0);assert.equal(lecturas,1);
 await crearPlanificacionPersonal(deps).tick();assert.equal(lecturas,1);
 now=new Date(+now+16*60000);await crearPlanificacionPersonal(deps).tick();assert.equal(lecturas,2);assert.equal(f.entregas.length,0);
});
