import {gastoPorCategoria} from '../facturas/categorias.js';
import {canonico} from '../locales/centros.js';

// Agrupar barras del mismo centro sin perder importes sin asignar ni confundir falta de datos con cero.
export function agruparDesglose(filas,ambito='ventas'){
 const mapa=new Map();
 for(const fila of filas){
  const local=canonico(fila.local,ambito)||'Sin local asignado';
  const actual=mapa.get(local)||{local,total:0,disponible:false,parcial:false};
  actual.total+=Number(fila.total)||0;
  actual.disponible ||= !!fila.disponible;
  actual.parcial ||= !!fila.parcial||fila.disponible===false;
  mapa.set(local,actual);
 }
 return [...mapa.values()].map(r=>({...r,total:Math.round(r.total*100)/100})).sort((a,b)=>b.total-a.total||a.local.localeCompare(b.local));
}
export function gastoDesglosado(base,empresaPartes,locales=[]){
 const permitidos=new Set(locales.map(l=>canonico(l,'compras')));
 const filas=base.map(r=>({local:r.local,total:Number(r.total)||0,disponible:true}));
 for(const [local,total] of empresaPartes?.porLocal||[])filas.push({local,total,disponible:true});
 if(!locales.length)for(const r of empresaPartes?.sinRepartir||[])filas.push({local:'Sin reparto de empresa',total:r.total,disponible:true});
 const porLocal=agruparDesglose(filas,'compras').filter(r=>!permitidos.size||permitidos.has(r.local));
 return {total:Math.round(porLocal.reduce((s,r)=>s+r.total,0)*100)/100,porLocal};
}

export function categoriasGastoEntrega(filas,etiquetas,locales=[]){
 const permitidos=new Set(locales.map(l=>canonico(l,'compras')));
 const alcance=filas.filter(r=>!permitidos.size||permitidos.has(canonico(r.local,'compras')));
 const resultado=gastoPorCategoria(alcance.map(r=>({proveedor:r.proveedor,importe:r.total})),etiquetas,{cuadrarCentimos:true});
 const porcentaje=n=>resultado.total>0 ? 100*n/resultado.total : null;
 const categorias=resultado.categorias.map(r=>({categoria:r.categoria,importe:r.importe,estimado:r.estimado,porcentaje:porcentaje(r.importe)}));
 return {
  categorias,
  sinClasificar:{importe:resultado.sinCategoria,porcentaje:porcentaje(resultado.sinCategoria)},
  estimado:resultado.repartido,
 };
}
