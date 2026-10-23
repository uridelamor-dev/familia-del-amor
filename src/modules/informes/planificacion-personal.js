import {desplazarMes} from './mensuales.js';
import {barras as barrasDelCentro} from '../locales/centros.js';
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
export async function leerPersonal(referencia,{configs,leer}){
 const desde=referencia+'-01',hasta=desplazarMes(referencia,1)+'-01',resultado=[];
 for(const local of LOCALES_PERSONAL){
  let base=0,ventas=0,sinBase=false;const faltan=[];
  for(const barra of barrasDelCentro(local,'ventas')){
   const fuentes=configs.filter(c=>c.local===barra&&c.usuario&&c.password);
   if(!fuentes.length){faltan.push(barra);continue;}
   for(const cfg of fuentes){
    try{
     const rows=await leer(cfg,desde,hasta);
     if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r.dia||r.dia<desde||r.dia>=hasta||!valido(r.ventas)))throw Error('sin histórico fiable');
     ventas+=rows.reduce((s,r)=>s+Number(r.ventas),0);
     if(rows.some(r=>!valido(r.base_imponible)||(Number(r.ventas)>0&&Number(r.base_imponible)===0)))sinBase=true;
     else base+=rows.reduce((s,r)=>s+Number(r.base_imponible),0);
    }catch{faltan.push(barra);}
   }
  }
  resultado.push({local,ventas:faltan.length?null:ventas,base:faltan.length||sinBase?null:base,faltan:[...new Set(faltan)],sinBase});
 }
 return resultado;
}
const nota='Referencia histórica, no previsión garantizada. El 35 % incluye salarios brutos y Seguridad Social de empresa. Equivalencias a 2.200 €/mes por jornada completa: orientativas, sin redondear al alza; ajustar turnos, descansos, reservas y días de apertura.';
function detalle(r){
 if(r.base==null)return `${r.ventas==null?'Ventas: datos pendientes':`Ventas con IVA: ${euros(r.ventas)}`}\n⚠️ ${r.faltan.length?'No se pudo obtener el histórico de: '+r.faltan.join(', '):'Ágora no facilita la base sin IVA en este informe'}. Presupuesto y plantilla pendientes; no se consideran cero.`;
 const presupuesto=Math.round(Math.max(0,r.base)*.35*100)/100;
 return `💶 Ventas sin IVA: *${euros(r.base)}*\n👥 Presupuesto de personal (35 %): *${euros(presupuesto)}*\nEquivale a *${(presupuesto/2200).toLocaleString('es-ES',{maximumFractionDigits:2})} jornadas completas* durante el mes.`;
}
export function mensajesPersonal(ciclo,rows){
 if(rows.length!==5||!LOCALES_PERSONAL.every(l=>rows.some(r=>r.local===l)))throw Error('Faltan locales en el informe');
 const cabecera=`📅 *PLANIFICACIÓN DE PERSONAL · ${titulo(ciclo.objetivo).toLocaleUpperCase('es-ES')}*\nReferencia: ventas de ${titulo(ciclo.referencia)} en Ágora.`;
 const mensajes=rows.map(r=>`${cabecera}\n📍 *${r.local}*\n\n${detalle(r)}\n\n${nota}`);
 const completas=rows.every(r=>r.base!=null);
 const total=rows.reduce((s,r)=>s+(r.base??0),0);
 mensajes.push(`${cabecera}\n🏘️ *RESUMEN GENERAL · 5 LOCALES*\n\n${rows.map(r=>`📍 *${r.local}*\n${detalle(r)}`).join('\n\n')}\n\n${completas?'*TOTAL DEL GRUPO*\n'+detalle({base:total}):'⚠️ Total del grupo pendiente: hay locales sin datos suficientes.'}\n\n${nota}`);
 return mensajes;
}
// Estado persistente por ciclo y mensaje; nunca repetir una entrega de resultado incierto.
export function crearPlanificacionPersonal({pool,enabled,conectado,preparar,enviar,now=()=>new Date()}){
 let busy=false;
 return {async tick(){
  const ciclo=cicloPersonal(now());if(!enabled||busy||!ciclo||!conectado())return;
  busy=true;let c,lock=false;
  try{
   c=await pool.connect();lock=(await c.query('SELECT pg_try_advisory_lock(73992023) AS locked')).rows[0].locked;if(!lock)return;
   const key=`planificacion_personal_${ciclo.mes}_v1`;
   const stored=await c.query('SELECT value FROM config WHERE key=$1',[key]);
   let state=stored.rows.length?JSON.parse(stored.rows[0].value):{};
   const save=()=>c.query('INSERT INTO config(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',[key,JSON.stringify(state)]);
   if(['enviada','incierta'].includes(state.estado))return;
   if(state.estado==='enviando'){state.estado='incierta';await save();console.error('[Personal] Entrega incierta: revisar',key);return;}
   if(state.retryAt&&new Date(state.retryAt)>now())return;
   if(!state.mensajes){
    try{state.mensajes=mensajesPersonal(ciclo,await preparar(ciclo.referencia));state.enviados=0;state.destino=DESTINO_PERSONAL;state.ciclo=ciclo;}
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
