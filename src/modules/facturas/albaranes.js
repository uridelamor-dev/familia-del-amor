import {unidadComparable} from './precio-referencia.js';
const falta=v=>v==null||v==='';
export const albaranSinValorar=f=>f?.tipo==='albaran'&&falta(f.total)&&falta(f.base_imponible);
// Nunca sustituir los importes del original. La valoración es un dato aparte.
export function valorarAlbaran(f,lineas,historial=[]){
 if(f.tipo!=='albaran')return lineas;
 return lineas.map(l=>{
  if(!falta(l.precio_unitario)||!falta(l.importe))return l;
  const unidad=unidadComparable(l.unidad);
  const ref=unidad&&historial.find(h=>h.clave===l.clave&&unidadComparable(h.unidad)===unidad&&Number(h.factor_unidad||1)===Number(l.factor_unidad||1)&&Number(h.precio)>0);
  return {...l,sin_valorar:true,...(ref?{precio_referencia:Number(ref.precio),fecha_referencia:ref.fecha,factura_referencia:ref.factura_id,importe_referencia:Number(l.cantidad)>0?Math.round(Number(l.cantidad)*Number(ref.precio)*100)/100:null}:{})};
 });
}
export async function referenciasAlbaran(dbAll,f,lineas){
 if(f.tipo!=='albaran'||!f.fecha||!f.proveedor)return lineas;
 const claves=[...new Set(lineas.filter(l=>l.precio_unitario==null&&l.importe==null).map(l=>l.clave).filter(Boolean))];
 if(!claves.length)return lineas;
 const historial=await dbAll(`SELECT l.clave,l.unidad,l.factor_unidad,l.precio_unitario::float AS precio,f.fecha,f.id AS factura_id
 FROM factura_lineas l JOIN facturas f ON f.id=l.factura_id
 WHERE f.tipo='factura' AND LOWER(TRIM(f.proveedor))=LOWER(TRIM(?))
 AND COALESCE(f.nif,'')=COALESCE(?,'') AND COALESCE(f.empresa,'')=COALESCE(?,'') AND f.local=?
 AND f.fecha<=? AND f.id<>? AND COALESCE(f.dup_estado,'') NOT IN ('duda','duplicado')
 AND f.lineas_estado='ok' AND f.iva_estado='manual' AND COALESCE(f.revisar,'') IN ('','[]')
 AND l.dudosa=FALSE AND l.precio_unitario>0 AND l.clave=ANY(?)
 ORDER BY f.fecha DESC,f.id DESC,l.orden DESC LIMIT 5000`,[f.proveedor,f.nif,f.empresa,f.local,f.fecha,f.id,claves]);
 return valorarAlbaran(f,lineas,historial);
}
export function estadoAlbaran(f){
 if(albaranSinValorar(f)&&f.lineas_estado==='descuadre'&&f.lineas_aviso==='El detalle se leyó, pero la factura no trae base imponible con la que contrastarlo.')return {...f,lineas_estado:'sin_valorar',lineas_aviso:null,sin_valorar:true};
 return {...f,sin_valorar:albaranSinValorar(f)};
}
