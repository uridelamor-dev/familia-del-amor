import {agruparPorCentro} from '../locales/centros.js';
const DESTINO='622149946';
const euros=n=>Number(n).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const titulo=mes=>new Date(mes+'-15T12:00:00Z').toLocaleDateString('es-ES',{month:'long',year:'numeric',timeZone:'UTC'});
const suma=(rows,key)=>rows.reduce((n,r)=>n+Number(r[key] || 0),0);
export function mensajeCompras(mes,{rows,excluidos=0,incompletos=0}) {
 const locales=agruparPorCentro(rows,['total','base','iva','documentos']).sort((a,b)=>b.total-a.total);
 return `🛒 *COMPRAS REGISTRADAS*\n${titulo(mes)}\n\n💶 *Total con IVA: ${euros(suma(rows,'total'))}*\n${suma(rows,'documentos')} facturas y tickets\n\n📍 *Por local / empresa*\n${locales.map(r=>`• ${r.local || 'Sin asignar'}: *${euros(r.total)}*`).join('\n') || 'Sin documentos registrados.'}\n\n🧾 *Desglose del total*\nBase imponible: ${euros(suma(rows,'base'))}\nIVA registrado: ${euros(suma(rows,'iva'))}\n\n${excluidos?`⚠️ ${excluidos} posibles duplicados excluidos, pendientes de revisión.\n`:''}${incompletos?`⚠️ ${incompletos} documentos con importes incompletos; resumen provisional.\n`:''}Según fecha de factura y documentos registrados al preparar el informe. No incluye albaranes ni representa todos los costes del negocio. Los gastos comunes se muestran por empresa, sin atribuirlos a un local.\n\nDetalle: https://familiadelamor.org/panel/#facturas/facturas`;
}
export function mensajeVentas(mes,rows) {
 const disponibles=rows.filter(r=>r.disponible), faltan=rows.filter(r=>!r.disponible);
 const agrupados=agruparPorCentro(rows.map(r=>({...r,ventas:r.disponible?r.ventas:0,tickets:r.disponible?r.tickets:0,faltan:r.disponible?0:1})),['ventas','tickets','faltan']);
 const total=suma(disponibles,'ventas'),tickets=suma(disponibles,'tickets');
 return `💶 *FACTURACIÓN · VENTAS TPV*\n${titulo(mes)}\n\n*${faltan.length?'Subtotal disponible':'Total vendido'}: ${disponibles.length?euros(total):'Sin datos'}*\n${tickets} tickets registrados\nTicket medio: ${tickets?euros(total/tickets):'No disponible'}\n\n📍 *Por local*\n${agrupados.map(r=>`• ${r.local}: ${r.faltan?'Datos incompletos':`*${euros(r.ventas)}* · ${r.tickets} tickets`}`).join('\n')}\n\n${faltan.length?`⚠️ Sin datos confirmados de: ${faltan.map(r=>r.local).join(', ')}. El subtotal no representa todo el grupo.\n\n`:''}Importes de ventas comunicados por los TPV. No son beneficio ni saldo bancario.\n\nDetalle: https://familiadelamor.org/panel/#dashboard`;
}
export function mensajesCompras(mes,data) {
 const general=mensajeCompras(mes,data);
 const rows=agruparPorCentro(data.rows,['total','base','iva','documentos']);
 return [general,...rows.filter(r=>!r.local?.startsWith('Empresa · ')).map(r=>`📍 *COMPRAS · ${(r.local || 'SIN ASIGNAR').toLocaleUpperCase('es-ES')}*\n${titulo(mes)}\n\n🛒 *Total registrado: ${euros(r.total)}*\n${r.documentos} facturas y tickets\n\n🧾 *Desglose*\n• Base imponible: ${euros(r.base)}\n• IVA registrado: ${euros(r.iva)}\n\n${data.incompletos?'⚠️ Hay importes incompletos en el informe del grupo; consultar el detalle.\n\n':''}Según fecha de las facturas registradas. No incluye albaranes ni gastos comunes de empresa. No representa todos los costes del local ni cuánto queda por pagar.`)];
}
export function desplazarMes(mes,n) {
 const [y,m]=mes.split('-').map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);
}
function comparar(actual,anterior,label) {
 if(actual==null || anterior==null)return `• ${label}: No disponible`;
 const diff=actual-anterior;
 const pct=anterior>0?` · ${diff>=0?'+':''}${(diff/anterior*100).toLocaleString('es-ES',{maximumFractionDigits:1})} %`:'';
 return `• ${label}: ${diff>=0?'+':'−'}${euros(Math.abs(diff))}${pct}${anterior===0?' (periodo anterior: 0 €)':''}`;
}
function agruparVentas(rows) {
 return agruparPorCentro(rows.map(r=>({...r,ventas:r.disponible?r.ventas:0,tickets:r.disponible?r.tickets:0,faltan:r.disponible?0:1})),['ventas','tickets','faltan']);
}
export function mensajesVentas(mes,data) {
 const rows=Array.isArray(data)?data:data.actual;
 const anterior=agruparVentas(data.anterior || []),anual=agruparVentas(data.anual || []);
 const actuales=agruparVentas(rows);
 const totalCompleto=lista=>lista.length && lista.every(r=>!r.faltan)?suma(lista,'ventas'):null;
 const mismoAmbito=lista=>lista.length===actuales.length && actuales.every(r=>lista.some(a=>a.local===r.local));
 const comparaciones=local=>{
  const valor=(lista)=>local?(lista.find(r=>r.local===local && !r.faltan)?.ventas ?? null):(mismoAmbito(lista)?totalCompleto(lista):null);
  const actual=valor(actuales);
  return `📈 *Comparación*\n${comparar(actual,valor(anterior),titulo(desplazarMes(mes,-1)))}\n${comparar(actual,valor(anual),titulo(desplazarMes(mes,-12)))}`;
 };
 const general=mensajeVentas(mes,rows).replace('\n\nImportes de ventas',`\n\n${comparaciones()}\n\nImportes de ventas`);
 return [general,...actuales.map(r=>`📍 *VENTAS · ${r.local.toLocaleUpperCase('es-ES')}*\n${titulo(mes)}\n\n💶 *Total vendido: ${r.faltan?'No disponible · datos incompletos':euros(r.ventas)}*\n\n${comparaciones(r.local)}\n\n🧾 *Actividad*\n${r.faltan?'Datos incompletos':`${r.tickets} tickets\nTicket medio: ${r.tickets?euros(r.ventas/r.tickets):'No disponible'}`}\n\nVentas registradas en el TPV. No representan el beneficio.`)];
}

// Desde octubre de 2026. Ventas el día 1 y compras el 10 del siguiente; recuperar también
// meses vencidos evita perder el envío si el servidor o WhatsApp estaban desconectados.
export function mesesVencidos(now, dia=10) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 if(+parts.hour<9 || +parts.hour>=21)return [];
 const limite=new Date(Date.UTC(+parts.year,+parts.month-(+parts.day>=dia?2:3),1));
 const result=[];
 for(let d=new Date('2026-10-01T00:00:00Z');d<=limite;d.setUTCMonth(d.getUTCMonth()+1))result.push(d.toISOString().slice(0,7));
 return result;
}
export function crearMensuales({pool,enabled,conectado,compras,ventas,enviar,now=()=>new Date()}) {
 let busy=false;
 return {async tick(){
  if(!enabled || busy || !conectado())return;
  busy=true;let c,lock=false;
  try {
   c=await pool.connect();lock=(await c.query('SELECT pg_try_advisory_lock(73992015) AS locked')).rows[0].locked;if(!lock)return;
   for(const tipo of ['ventas','compras'])for(const mes of mesesVencidos(now(),tipo==='ventas'?1:10)){
    const key=`informe_${tipo}_${mes}_v1`;
    const stored=await c.query('SELECT value FROM config WHERE key=$1',[key]);
    let state=stored.rows.length?JSON.parse(stored.rows[0].value):{};
    const save=()=>c.query('INSERT INTO config(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',[key,JSON.stringify(state)]);
    if(['enviada','incierta'].includes(state.estado))continue;
    if(state.estado==='enviando'){state.estado='incierta';await save();continue;}
    if(state.retryAt && new Date(state.retryAt)>now())continue;
    if(tipo==='compras'){
     const old=await c.query("SELECT value FROM config WHERE key='resumen_mensual_ultimo'");
     if(old.rows[0]?.value===mes){state={estado:'enviada',legado:true};await save();continue;}
    }
    try {
     if(!state.mensajes){
      state.mensajes=state.mensaje?[state.mensaje]:(tipo==='compras'?mensajesCompras(mes,await compras(mes)):mensajesVentas(mes,await ventas(mes)));
      state.enviados=0;
     }
    }catch{state.error='No se pudo preparar el informe';state.retryAt=new Date(+now()+30*60000).toISOString();await save();continue;}
    if(!conectado())return;
    state.estado='enviando';state.intentado=now().toISOString();await save();
    try{await enviar(DESTINO,state.mensajes[state.enviados]);}catch{state.estado='incierta';state.error='Envío no confirmado; revisar antes de repetir';await save();return;}
    state.enviados++;state.estado=state.enviados===state.mensajes.length?'enviada':'preparada';state.error=null;state.retryAt=null;await save();return;
   }
  }finally{if(c){try{if(lock)await c.query('SELECT pg_advisory_unlock(73992015)');}finally{c.release();}}busy=false;}
 }};
}
