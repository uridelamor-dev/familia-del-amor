import { readFileSync } from 'node:fs';
import { normalizar } from './municipios.js';
const datos = JSON.parse(readFileSync(new URL('../../data/poblaciones-es.json', import.meta.url), 'utf8'));
const nombres = new Map(), postales = new Map(), porId = new Map(datos.map(p => [p.id,p]));
const norm = s => normalizar(s).replace(/[’']/g, '').replace(/[-]/g,' ').replace(/\s+/g,' ').trim();
function add(map,k,id) { if (!map.has(k)) map.set(k,new Set()); map.get(k).add(id); }
for (const p of datos) {
  for (const n of [p.nombre,...p.alias]) add(nombres,norm(n),p.id);
  for (const cp of p.cp) add(postales,cp,p.id);
}
for (const [alias,nombre] of Object.entries({gerona:'Girona',lerida:'Lleida', 'girona centro':'Girona', 'gerona centro':'Girona'})) {
  const ids=nombres.get(norm(nombre)); if (ids) nombres.set(alias,ids);
}
function unError(a,b) {
  if (Math.abs(a.length-b.length)>1) return false;
  let i=0,j=0,e=0;
  while(i<a.length && j<b.length) { if(a[i]===b[j]) {i++;j++;continue;} if(++e>1)return false; if(a.length>=b.length)i++;if(b.length>=a.length)j++; }
  return e+(i<a.length || j<b.length ? 1:0)<=1;
}
const cache=new Map();
export function resolverPoblacion(texto) {
  const raw=String(texto||'').trim(); const key=norm(raw);
  if(cache.has(key)) return cache.get(key);
  let ids; let metodo='exacto';
  if(/^\d{5}$/.test(raw)) {ids=postales.get(raw);metodo='postal';}
  else {
    ids=nombres.get(key);
    if(!ids) {
      const cp=raw.match(/\b\d{5}\b/); const nombre=norm(raw.replace(/\b\d{5}\b/g,'').replace(/[,()]/g,' '));
      if(cp) { const n=nombres.get(nombre), p=postales.get(cp[0]); ids=new Set([...(n||[])].filter(id=>p?.has(id)));metodo='postal'; }
      else {
        const sinCentro=key.replace(/\s+(centro|centre)$/,'');
        ids=nombres.get(sinCentro);
        if(!ids && key.length>=5 && key.length<=60) {
          ids=new Set();metodo='aproximado';
          for(const [n, candidatos] of nombres) if(unError(key,n)) for(const id of candidatos) ids.add(id);
        }
      }
    }
  }
  const resultado=ids?.size===1 ? {...porId.get([...ids][0]),metodo} : null;
  if(cache.size>5000)cache.clear();cache.set(key,resultado); return resultado;
}
export function distanciaKm(a,b) {
  const rad=n=>n*Math.PI/180;
  const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function filtrarGeografia(rows, filtros={}) {
  const activo=!!String(filtros.cerca_de||'').trim();
  const centro=activo ? resolverPoblacion(filtros.cerca_de):null;
  const radio=Number(filtros.radio_km);
  if(activo && (!centro || !Number.isFinite(radio) || radio<0 || radio>500 || filtros.radio_km==null || filtros.radio_km==='')) throw new Error('Elige una población reconocida y un radio entre 0 y 500 km.');
  if(!activo && filtros.radio_km!==undefined && filtros.radio_km!=='') throw new Error('Indica la población desde la que calcular el radio.');
  const poblacion=filtros.poblacion ? resolverPoblacion(filtros.poblacion):null;
  return rows.flatMap(c=>{
    const original=c.poblacion_original ?? c.poblacion ?? '';
    const p=resolverPoblacion(original);
    if(filtros.poblacion && (poblacion ? p?.id!==poblacion.id : norm(original)!==norm(filtros.poblacion)))return [];
    const km=centro && p ? distanciaKm(centro,p):null;
    if(activo && (km===null || km>radio))return [];
    return [{...c,poblacion_original:original,poblacion:p?.nombre || original,poblacion_identificada:!!p,distancia_km:km===null?null:Math.round(km*10)/10}];
  });
}
export function sugerirPoblaciones(q) {
  const k=norm(q); if(k.length<2)return [];
  const exacto=resolverPoblacion(q);
  const candidatos=datos.filter(p=>norm(p.nombre).startsWith(k) || p.cp.some(cp=>cp.startsWith(k)));
  return [...new Map([...(exacto?[exacto]:[]),...candidatos].map(p=>[p.id,p])).values()].slice(0,12).map(({id,nombre,provincia})=>({id,nombre,provincia}));
}
