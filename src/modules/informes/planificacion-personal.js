import {desplazarMes} from './mensuales.js';
import {fuentesVentas} from '../locales/centros.js';
export const LOCALES_PERSONAL=['La Tapeta - Blanes','La Tapeta - Lloret','La Tapeta - Girona','Can Mateu - Tordera','La Tapa Ibérica - Tordera'];
export const DESTINO_PERSONAL='34622065974';
const euros=n=>n.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const titulo=mes=>new Date(mes+'-15T12:00:00Z').toLocaleDateString('es-ES',{month:'long',year:'numeric',timeZone:'UTC'});
const valido=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
// Solo el ciclo vigente: no enviar planes de meses ya pasados tras una desconexión larga.
export function cicloPersonal(now){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const mes=`${p.year}-${p.month}`;
 if(mes<'2026-10'||+p.day<20||+p.hour<10||+p.hour>=21)return null;
 return {mes,objetivo:desplazarMes(mes,1),referencia:desplazarMes(mes,-11)};
}
export async function leerPersonal(referencia,{configs,leer,respaldo=async()=>null}){
 const desde=referencia+'-01',hasta=desplazarMes(referencia,1)+'-01',resultado=[];
 const serieValida=rows=>Array.isArray(rows)&&rows.length>0&&rows.every(r=>r.dia&&r.dia>=desde&&r.dia<hasta&&valido(r.ventas));
 for(const local of LOCALES_PERSONAL){
  let base=0,ventas=0,sinBase=false;const faltan=[];
  for(const barra of fuentesVentas(local)){
   const fuentes=configs.filter(c=>c.local===barra&&c.usuario&&c.password);
   let series=[];
   try{
    if(!fuentes.length)throw Error('sin configuración');
    for(const cfg of fuentes)series.push(await leer(cfg,desde,hasta));
    if(series.some(rows=>!serieValida(rows)))throw Error('sin histórico');
   }catch{
    const guardado=await respaldo(barra,desde,hasta).catch(()=>null);
    series=guardado?[guardado]:[];
   }
   if(!series.length){faltan.push(barra);continue;}
   for(const rows of series){
    if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r.dia||r.dia<desde||r.dia>=hasta||!valido(r.ventas))){faltan.push(barra);continue;}
    for(const r of rows){
     ventas+=Number(r.ventas);
     if(!valido(r.base_imponible)||(Number(r.ventas)>0&&Number(r.base_imponible)===0)){
      sinBase=true;base+=Number(r.ventas)/1.10;
     }else base+=Number(r.base_imponible);
    }
   }
  }
  resultado.push({local,ventas:faltan.length?null:ventas,base:faltan.length?null:Math.round(ventas/1.10*100)/100,faltan:[...new Set(faltan)],sinBase});
 }
 return resultado;
}
const redondear=n=>Math.round((n+Number.EPSILON)*100)/100;
const nombres=['Blanes','Lloret','Girona','Can Mateu','La Tapa Ibérica'];
export function mensajesPersonal(ciclo,rows){
 if(rows.length!==5||!LOCALES_PERSONAL.every(l=>rows.filter(r=>r.local===l).length===1)||rows.some(r=>!valido(r.ventas)||r.faltan?.length))throw Error('Faltan ventas completas en el informe');
 // Criterio acordado: total mensual / 1,10, redondeo por local y suma de importes visibles.
 const datos=LOCALES_PERSONAL.map((local,i)=>{
  const base=redondear(Number(rows.find(r=>r.local===local).ventas)/1.10);
  const presupuesto=redondear(Math.max(0,base)*.35);
  const personas=(presupuesto/2200).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  return {base,presupuesto,texto:`📍 *${nombres[i]}*\nFacturación sin IVA: *${euros(base)}*\nPersonal: *${euros(presupuesto)} (${personas} personas)*`};
 });
 const base=redondear(datos.reduce((s,r)=>s+r.base,0));
 const personal=redondear(datos.reduce((s,r)=>s+r.presupuesto,0));
 return [`📅 *PLANIFICACIÓN · ${titulo(ciclo.objetivo).toLocaleUpperCase('es-ES')}*\n\nReferencia: facturación de ${titulo(ciclo.referencia)}, sin IVA (total ÷ 1,10).\nPresupuesto de personal: *35 %*, incluyendo salarios y Seguridad Social.\n\n${datos.map(r=>r.texto).join('\n\n')}\n\n*TOTAL*\nFacturación sin IVA: *${euros(base)}*\nPersonal: *${euros(personal)}*\n\nPersonas equivalentes a jornada completa, con *2.200 €/mes de coste de empresa*. Referencia orientativa para organizar la plantilla.`];
}
// Estado persistente por ciclo y mensaje; nunca repetir una entrega de resultado incierto.
export function crearPlanificacionPersonal({pool,enabled,conectado,preparar,enviar,now=()=>new Date()}){
 let busy=false;
 return {async tick(){
  const ciclo=cicloPersonal(now());if(!enabled||busy||!ciclo||!conectado())return;
  busy=true;let c,lock=false;
  try{
   c=await pool.connect();lock=(await c.query('SELECT pg_try_advisory_lock(73992023) AS locked')).rows[0].locked;if(!lock)return;
   const key=`planificacion_personal_${ciclo.mes}_v3`;
   const stored=await c.query('SELECT value FROM config WHERE key=$1',[key]);
   let state=stored.rows.length?JSON.parse(stored.rows[0].value):{};
   const save=()=>c.query('INSERT INTO config(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',[key,JSON.stringify(state)]);
   if(['enviada','incierta'].includes(state.estado))return;
   if(state.estado==='enviando'){state.estado='incierta';await save();console.error('[Personal] Entrega incierta: revisar',key);return;}
   if(state.retryAt&&new Date(state.retryAt)>now())return;
   if(!state.mensajes){
    try{
     const rows=await preparar(ciclo.referencia);
     if(rows.length!==5||!LOCALES_PERSONAL.every(l=>rows.filter(r=>r.local===l).length===1)||rows.some(r=>!valido(r.ventas)||r.faltan?.length)){
      state.intentosDatos=(state.intentosDatos||0)+1;state.error='Informe retenido: faltan ventas completas de Ágora';state.retryAt=new Date(+now()+15*60000).toISOString();await save();return;
     }
     const anterior=await c.query('SELECT value FROM config WHERE key IN ($1,$2)',[`planificacion_personal_${ciclo.mes}_v1`,`planificacion_personal_${ciclo.mes}_v2`]);
     const rectificacion=anterior.rows.length>0;
     state.mensajes=mensajesPersonal(ciclo,rows).map(m=>(rectificacion?'🔄 *INFORME ACTUALIZADO · sustituye al anterior*\n\n':'')+m);
     state.enviados=0;state.destino=DESTINO_PERSONAL;state.ciclo=ciclo;
    }
    catch{state.error='No se pudo preparar el informe';state.retryAt=new Date(+now()+30*60000).toISOString();await save();return;}
   }
   if(!conectado())return;
   state.estado='enviando';state.intentado=now().toISOString();await save();
   try{await enviar(state.destino,state.mensajes[state.enviados]);}
   catch{state.estado='incierta';state.error='Envío no confirmado: revisar antes de repetir';await save();console.error('[Personal] Entrega incierta: revisar',key);return;}
   state.enviados++;state.estado=state.enviados===state.mensajes.length?'enviada':'preparada';state.retryAt=null;state.error=null;await save();
  }finally{if(c){try{if(lock)await c.query('SELECT pg_advisory_unlock(73992023)');}finally{c.release();}}busy=false;}
 }};
}
