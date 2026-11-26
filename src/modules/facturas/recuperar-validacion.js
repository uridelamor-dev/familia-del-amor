import {esAdjuntoDecorativo} from './clasificacion.js';
import {normNif} from './emisor.js';
import {normalizarLinea} from './lineas.js';
// Lote identificado en producción el 26/11/2026 a las 17:53 UTC.
// No amplía el repaso a documentos ajenos ni a excepciones humanas anteriores.
export const LOTE_RECUPERACION = ["3042", "3041", "3028", "2997", "2996", "2995", "2993", "2991", "2982", "2964", "2941", "2940", "2938", "2937", "2936", "2935", "2923", "2903", "2881", "2878", "2703", "2694", "2693", "2692", "2668", "2641", "2640", "2597", "2592", "2591", "2590", "2550", "2508", "2504", "2501", "2500", "2391", "2161", "2146", "2145", "2076", "2075", "2074", "2073", "2071", "2070", "1904", "1778", "1759", "1718", "1717", "1701", "1695", "1694", "1692", "1645", "1641", "1639", "1524", "1521", "1520", "1427", "1426", "978", "977", "961", "951", "950", "949", "948", "947", "946", "824"];
export const VERSION_MEJORA_LECTURA = '2026-11-26-lectura-dirigida-v5';
export const VERSION_RECUPERACION = '2026-11-26-falsos-pendientes';
// Identifica candidatos, NO concede aprobación ni sustituye la lectura del original.
export function motivosRecuperacion(resultado = {}) {
 if(!resultado || typeof resultado!=='object')return [];
 if(resultado.aprobacion || resultado.revalidacion || Number(resultado.contraste?.version)>=4)return [];
 const lecturas=[resultado.contraste?.primera||resultado.datos,resultado.contraste?.segunda||resultado.segunda,resultado.contraste?.tercera].filter(Boolean);
 const motivos=[];
 if(lecturas.length>=2 && lecturas.every(esAdjuntoDecorativo))motivos.push('decorativo');
 if(lecturas.some(d=>String(d.nif_proveedor||'').replace(/[\s.\-/]/g,'').toUpperCase()!==normNif(d.nif_proveedor)))motivos.push('prefijo_ES');
 if(lecturas.some(d=>(d.lineas||[]).some(l=>{
  const n=normalizarLinea(l);
  return l.importe_neto==null && l.descuento_pct>0 && n.importe_bruto!=null
   && Math.abs(n.importe-Number(l.importe))<0.001 && !n.dudosa;
 })))motivos.push('descuento_neto');
 return motivos;
}
// Lotes pequeños; cada recepción se reevalúa una sola vez. El trabajador habitual
// vuelve a leer el original y aplica TODOS los controles, deduplicación y archivo.
export function crearRecuperacionValidacion({db,lock,ahora=()=>new Date()}) {
 let cursor=0,terminado=false;
 return async function recuperar(){
  if(terminado)return 0;
  const filas=await db.all(`SELECT id FROM facturas_recepciones WHERE id>? AND id=ANY(?::bigint[]) AND estado='revision'
    AND original IS NOT NULL AND resultado->'aprobacion' IS NULL
    AND COALESCE(resultado->'revalidacion'->>'version','') <> ?
    ORDER BY id LIMIT 50`,[cursor,LOTE_RECUPERACION,VERSION_MEJORA_LECTURA]);
  let n=0;
  for(const fila of filas){
   const inicial=await db.get('SELECT hash FROM facturas_recepciones WHERE id=?',[fila.id]);
   if(inicial)await lock(inicial.hash,async()=>{
    const f=await db.get('SELECT * FROM facturas_recepciones WHERE id=?',[fila.id]);
    if(f?.estado!=='revision'||!f.original)return;
    if(f.resultado?.aprobacion || Number(f.resultado?.contraste?.version)>=5 || f.resultado?.revalidacion?.version===VERSION_MEJORA_LECTURA)return;
    const motivos=motivosRecuperacion(f.resultado);
    if(!motivos.length && Number(f.resultado?.contraste?.version)===4 && (!f.resultado?.revalidacion || f.resultado.revalidacion.version===VERSION_RECUPERACION))motivos.push('lectura_dirigida_y_formatos');
    if(!motivos.length)return;
    const resultado={...f.resultado,revalidacion:{version:VERSION_MEJORA_LECTURA,fecha:ahora().toISOString(),motivos,anterior:f.resultado}};
    await db.run(`UPDATE facturas_recepciones SET estado='pendiente',resultado=?::jsonb,intentos=0,proximo=NOW(),error=NULL,actualizado=NOW() WHERE id=? AND estado='revision'`,[JSON.stringify(resultado),f.id]);
    n++;
   });
   cursor=fila.id;
   if(n>=2)return n;
  }
  if(filas.length<50)terminado=true;
  return n;
 };
}
