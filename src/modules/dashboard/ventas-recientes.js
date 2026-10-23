// Misma lectura para cualquier selección de los últimos siete días.
// El respaldo solo sustituye días cerrados; nunca se suma a la lectura del TPV.
export function ventasRecientes({ vivo, respaldo = [], locales, from, to, hoy }) {
  const serie = [];
  let parcial = false, hoyEnVivo = false;
  const valida = r => r && r.ventas != null && Number.isFinite(Number(r.ventas));
  for (let dia = from; dia <= to && dia <= hoy;) {
    let ventas = 0, tickets = 0, disponibles = 0;
    for (const local of new Set(locales)) {
      const fuente = vivo?.hoy === hoy ? vivo.locales?.find(l => l.local === local && !l.error) : null;
      const lectura = fuente?.dias?.find(r => r.dia === dia && valida(r));
      const fila = lectura || (dia < hoy ? respaldo.find(r => r.local === local && r.dia === dia && valida(r)) : null);
      if (fila) {
        disponibles++;
        ventas += Number(fila.ventas);
        tickets += Number(fila.tickets) || 0;
        if (dia === hoy && lectura) hoyEnVivo = true;
      } else parcial = true;
    }
    if (disponibles) serie.push({ dia, ventas: Math.round(ventas * 100) / 100, tickets });
    const siguiente = new Date(dia + 'T00:00:00Z');
    siguiente.setUTCDate(siguiente.getUTCDate() + 1);
    dia = siguiente.toISOString().slice(0, 10);
  }
  return { serie, parcial, hoyEnVivo };
}

// Si la instantánea de siete días tiene huecos, consultar el rango solicitado por
// barra. No sumar el resultado encima: sustituir la serie de esa barra completa.
export async function completarVentasRecientes({vivo,locales,from,to,hoy,leer}) {
 const fin=to<hoy?to:hoy;
 if(from>fin)return vivo;
 const salida={...vivo,hoy,locales:[]};
 for(const local of new Set(locales)){
  const original=vivo?.hoy===hoy?vivo.locales?.find(l=>l.local===local):null;
  let falta=!original||!!original.error;
  for(let dia=from;!falta&&dia<=fin;){
   falta=!original.dias?.some(r=>r.dia===dia&&r.ventas!=null&&Number.isFinite(Number(r.ventas)));
   const d=new Date(dia+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);dia=d.toISOString().slice(0,10);
  }
  if(!falta){salida.locales.push(original);continue;}
  let rows;try{rows=await leer(local,from,fin);}catch{rows=null;}
  if(!Array.isArray(rows)||rows.some(r=>!r.dia||r.dia<from||r.dia>fin||r.ventas==null||!Number.isFinite(Number(r.ventas)))){
   if(original)salida.locales.push(original);continue;
  }
  // Una consulta de rango correcta no devuelve filas en días sin ventas.
  const dias=[];
  for(let dia=from;dia<=fin;){
   dias.push(rows.find(r=>r.dia===dia)||{dia,ventas:0,tickets:0});
   const d=new Date(dia+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);dia=d.toISOString().slice(0,10);
  }
  salida.locales.push({local,error:null,dias});
 }
 return salida;
}
