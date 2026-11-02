// Un mes consultado correctamente puede no tener ventas. Un fallo no equivale a cero.
export function resumirMes(rows, mes, {respaldo=false}={}) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)||!Array.isArray(rows))return null;
 const [y,m]=mes.split('-').map(Number),dias=new Date(Date.UTC(y,m,0)).getUTCDate();
 const vistos=new Set();let centimos=0,tickets=0;
 for(const r of rows){
  const dia=String(r?.dia||'');
  if(!new RegExp(`^${mes}-\\d{2}$`).test(dia)||Number(dia.slice(8))<1||Number(dia.slice(8))>dias||vistos.has(dia))return null;
  if(r.ventas==null||r.tickets==null||String(r.ventas).trim()===''||String(r.tickets).trim()===''||!Number.isFinite(Number(r.ventas))||!Number.isSafeInteger(Number(r.tickets))||Number(r.tickets)<0)return null;
  vistos.add(dia);centimos+=Math.round(Number(r.ventas)*100);tickets+=Number(r.tickets);
 }
 if(respaldo&&vistos.size!==dias)return null;
 return {ventas:centimos/100,tickets};
}
export async function leerMesVentas({mes,locales,configurados,leer,respaldo}) {
 const [y,m]=mes.split('-').map(Number),from=mes+'-01',to=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
 const rows=[];
 for(const local of new Set(locales)){
  if(!configurados.has(local)){rows.push({local,disponible:false,motivo:'sin_configurar'});continue;}
  let serie;try{serie=await leer(local,from,to);}catch{serie=null;}
  let total=resumirMes(serie,mes),fuente='tpv';
  if(!total){let guardado;try{guardado=await respaldo(local,from,to);}catch{guardado=null;}total=resumirMes(guardado,mes,{respaldo:true});fuente='guardado';}
  rows.push(total?{local,disponible:true,...total,fuente}:{local,disponible:false,motivo:'lectura_pendiente'});
 }
 return rows;
}
export function ventasPendientes(data){
 const rows=Array.isArray(data)?data:data?.actual;
 return !Array.isArray(rows)||!rows.some(r=>r.disponible)||rows.some(r=>!r.disponible&&r.motivo!=='sin_configurar');
}
