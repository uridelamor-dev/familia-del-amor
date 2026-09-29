import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolverPoblacion,filtrarGeografia,sugerirPoblaciones} from '../../src/modules/captacion/geografia.js';
import {construirSegmento} from '../../src/modules/campaigns/campaigns.service.js';
import {sanearSegmento} from '../../src/modules/marketing/segmento.js';
test('variantes, acentos, código postal y errata conservan identidad',()=>{
  for(const s of ['Girona','Gerona','girona centro','Girrona','17001','17001 Girona'])assert.equal(resolverPoblacion(s)?.nombre,'Girona',s);
  assert.equal(resolverPoblacion('08001')?.nombre,'Barcelona');
  assert.equal(resolverPoblacion('Celra')?.nombre,'Celrà');
  assert.equal(resolverPoblacion('17001 Blanes'),null);
  assert.equal(resolverPoblacion('población inventada'),null);
});
test('postal compartido no asigna arbitrariamente',()=>{
  const data=JSON.parse(readFileSync(new URL('../../src/data/poblaciones-es.json',import.meta.url)));
  const cps=new Map(); for(const p of data)for(const cp of p.cp){if(!cps.has(cp))cps.set(cp,new Set());cps.get(cp).add(p.id);}
  const cp=[...cps].find(([cp,ids])=>ids.size>1)[0];
  assert.equal(resolverPoblacion(cp),null);
});
const clientes=['Gerona','Girrona','17001','Celra','Fornells de la Selva','Blanes','desconocida',''].map(poblacion=>({poblacion}));
test('radio incluye cercanas, excluye lejanas y desconocidas; conserva original',()=>{
  const out=filtrarGeografia(clientes,{cerca_de:'Girona',radio_km:15});
  assert.equal(out.length,5);assert.equal(out[0].poblacion,'Girona');assert.equal(out[0].poblacion_original,'Gerona');
  assert.equal(clientes[0].poblacion,'Gerona');
  assert.ok(out.find(p=>p.poblacion==='Celrà').distancia_km>0);
  assert.equal(filtrarGeografia(clientes,{cerca_de:'Girona',radio_km:0}).length,3);
  assert.equal(filtrarGeografia(clientes,{poblacion:'Gerona'}).length,3);
});
test('radio inválido no amplía audiencia',()=>{
 for(const f of [{cerca_de:'desconocido',radio_km:15},{cerca_de:'Girona'},{radio_km:15},{cerca_de:'Girona',radio_km:-1},{cerca_de:'Girona',radio_km:'no'},{cerca_de:'Girona',radio_km:501}])assert.throws(()=>filtrarGeografia(clientes,f));
});
test('segmento de campaña mantiene audiencia geográfica y radio cero',()=>{
 for(const radio_km of [0,15]) {
  const filtros={cerca_de:'Girona',radio_km};
  const {segmento}=sanearSegmento(construirSegmento(filtros));
  assert.deepEqual(filtrarGeografia(clientes,segmento),filtrarGeografia(clientes,filtros));
 }
 assert.ok(sugerirPoblaciones('gerona').some(p=>p.nombre==='Girona'));
});
test('lista, exportación y envíos pasan por la misma selección',()=>{
 const server=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 for(const route of ['app.get("/api/contactos",','app.get("/api/leads/export.csv",','app.post("/api/campanas/preview",','app.post("/api/campanas",']) {
  const start=server.indexOf(route); assert.ok(start>=0);
  assert.match(server.slice(start,start+1800),/await contactosGeograficos\(/,route);
 }
 const panel=readFileSync(new URL('../../public/panel/app.js',import.meta.url),'utf8');
 assert.match(panel,/const HEREDABLES = \["cerca_de", "radio_km"/);
});
