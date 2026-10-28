import {createHash} from 'node:crypto';
export const DECISIONES_SCHEMA=`CREATE TABLE IF NOT EXISTS panel_avisos_decisiones (
 usuario TEXT NOT NULL, fuente TEXT NOT NULL, id TEXT NOT NULL, version TEXT NOT NULL,
 accion TEXT NOT NULL CHECK(accion IN ('descartar','posponer')), motivo TEXT NOT NULL DEFAULT '',
 hasta TIMESTAMPTZ, actualizado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(usuario,fuente,id));`;
export const claveAviso=a=>a.fuente==='rrhh'&&a.campos?`persona:${a.worker_id}`:a.id;
export function versionAviso(a){
 return createHash('sha256').update(JSON.stringify([a.sev,a.detalle,a.local,a.campos?[...a.campos].sort():a.campo,a.primera?new Date(a.primera).toISOString():null])).digest('hex');
}
export function repartirAvisos(items,decisiones,ahora=Date.now()){
 const mapa=new Map(decisiones.map(d=>[`${d.fuente}:${d.id}`,d]));
 const data=[],ocultos=[];
 for(const item of items){
  const a={...item,clave:claveAviso(item),version:versionAviso(item)};
  const d=mapa.get(`${a.fuente}:${a.clave}`);
  if(d?.version===a.version&&(d.accion==='descartar'||Date.parse(d.hasta)>ahora))ocultos.push({...a,decision:d.accion,motivo:d.motivo,hasta:d.hasta});
  else data.push(a);
 }
 return {data,ocultos};
}
