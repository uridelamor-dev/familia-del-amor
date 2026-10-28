// Progreso visual: el plan es el objetivo; solo el reloj aporta minutos trabajados.
// No modifica fichajes, horarios ni la bolsa de horas.
import {faltaLaSalida} from '../fichajes/maquina.js';

export function progresoFichajes(asignaciones=[],eventos=[],ahoraMs=Date.now()) {
 const resultado={},grupos=new Map();
 for(const a of asignaciones){
  if(a.worker_id==null||(a.tipo||'turno')!=='turno')continue;
  const objetivo=Number(a.fin_min)-Number(a.inicio_min);
  if(!Number.isFinite(objetivo)||objetivo<=0||a.fin_abierto)continue;
  const key=`${a.worker_id}|${a.dia}`;
  if(!grupos.has(key))grupos.set(key,[]);
  grupos.get(key).push(a);
  resultado[a.id]={minutos:0,objetivo,porcentaje:0,estado:'sin_fichar'};
 }
 const porPersonaDia=new Map();
 for(const e of eventos){
  if(e.anulado_por||!Number.isFinite(Number(e.epoch_ms))||Number(e.epoch_ms)>ahoraMs)continue;
  const key=`${e.worker_id}|${e.dia_negocio}`;
  if(!porPersonaDia.has(key))porPersonaDia.set(key,[]);
  porPersonaDia.get(key).push(e);
 }
 for(const [key,turnos] of grupos){
  // Una sesión pertenece al turno que contiene la entrada real; fuera de ellos, al más cercano.
  // No recortamos al horario previsto: entrar a las 10 para un 8–16 cuenta hasta las 18.
  // Cada sesión se asigna una sola vez, también cuando hay turno partido.
  const lista=(porPersonaDia.get(key)||[]).sort((a,b)=>Number(a.epoch_ms)-Number(b.epoch_ms)||Number(a.id)-Number(b.id));
  let sesion=null;
  const terminar=(fin,cerrada)=>{
   if(!sesion)return;
   const {a,inicio,pausaInicio,pausa}=sesion,r=resultado[a.id];
   const olvidada=!cerrada&&faltaLaSalida({abiertaDesdeMs:inicio,sinSalida:true},{ahoraMs});
   if(!olvidada)r.minutos+=Math.max(0,(fin-inicio-pausa-(pausaInicio==null?0:fin-pausaInicio))/60000);
   r.estado=olvidada?'sin_salida':cerrada?'salida':pausaInicio==null?'trabajando':'pausa';
   sesion=null;
  };
  for(const e of lista){
   const ms=Number(e.epoch_ms);
   if(e.tipo==='entrada'){
    if(sesion)continue; // Una entrada duplicada no reinicia ni duplica el tiempo.
    const inicio=Number(e.minuto_local);
    if(!Number.isFinite(inicio))continue;
    const distancia=a=>inicio<Number(a.inicio_min)?Number(a.inicio_min)-inicio:inicio>=Number(a.fin_min)?inicio-Number(a.fin_min)+1:0;
    const orden=[...turnos].sort((a,b)=>distancia(a)-distancia(b)||Math.abs(Number(a.inicio_min)-inicio)-Math.abs(Number(b.inicio_min)-inicio)||Number(a.inicio_min)-Number(b.inicio_min));
    sesion={a:orden[0],inicio:ms,pausaInicio:null,pausa:0};
   }else if(sesion&&e.tipo==='pausa_inicio'&&sesion.pausaInicio==null)sesion.pausaInicio=ms;
   else if(sesion&&e.tipo==='pausa_fin'&&sesion.pausaInicio!=null){sesion.pausa+=ms-sesion.pausaInicio;sesion.pausaInicio=null;}
   else if(e.tipo==='salida')terminar(ms,true);
  }
  terminar(ahoraMs,false);
 }
 for(const r of Object.values(resultado)){
  r.minutos=Math.floor(r.minutos);
  r.porcentaje=Math.min(100,Math.floor(r.minutos/r.objetivo*100));
 }
 return resultado;
}

export async function cargarProgresoFichajes(dbAll,asignaciones,locales,ahoraMs=Date.now()){
 const personas=[...new Set(asignaciones.filter(a=>a.worker_id!=null).map(a=>a.worker_id))];
 const dias=asignaciones.map(a=>String(a.dia)).sort();
 if(!personas.length||!dias.length)return {};
 const eventos=await dbAll(`SELECT id,worker_id,dia_negocio,tipo,epoch_ms,minuto_local,anulado_por
 FROM fic_eventos WHERE worker_id=ANY(?) AND local=ANY(?) AND dia_negocio BETWEEN ? AND ?
 ORDER BY epoch_ms,id`,[personas,locales,dias[0],dias[dias.length-1]]);
 return progresoFichajes(asignaciones,eventos,ahoraMs);
}
