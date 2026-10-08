import fs from 'node:fs';
import {inicial} from './catalogo.js';
import {SCHEMA,postgresStore} from './repositorio.js';
export function estadoDemo(){
 const s=inicial();s.config.publicActive=true;s.config.demo=true;s.config.preparationCostCents=null;
 s.config.delivery=[{id:'recogida-demo',name:{es:'Recogida',ca:'Recollida'},active:true,priceCents:0,taxBps:0,pending:false},{id:'domicilio-demo',name:{es:'Domicilio',ca:'Domicili'},active:true,priceCents:0,taxBps:2100,pending:true},{id:'multi',name:{es:'Varios destinos',ca:'Diverses destinacions'},active:true,priceCents:0,taxBps:2100,pending:true}];
 const photos=JSON.parse(fs.readFileSync(new URL('../../../docs/tienda/imagenes-reales.json',import.meta.url),'utf8'));
 for(const p of s.catalog){p.taxBps=p.alcohol||p.kind==='packaging'?2100:1000;const photo=photos.find(x=>x.id===p.id);if(photo)p.images=[{url:`/tienda/images/${p.id}-cutout.png`,alt:p.name,source:photo.source,provisional:true,verified:false}];}
 return s;
}
// Solo crea el espacio nuevo de tienda, transaccional e idempotente. Nunca toca módulos existentes.
export function tiendaDemoPersistente(pool){
 const repo=postgresStore(pool);let ready;
 async function prepare(){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(812764103)");await c.query(SCHEMA);const r=await c.query('SELECT id FROM tienda_config WHERE id=1');if(!r.rows.length){const s=estadoDemo();await c.query('INSERT INTO tienda_config(id,datos) VALUES(1,$1)',[s.config]);for(const type of ['catalog','bundles'])for(const d of s[type])await c.query('INSERT INTO tienda_registros(tipo,id,datos) VALUES($1,$2,$3)',[type,d.id,d]);}await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 const init=()=>ready||(ready=prepare().catch(e=>{ready=null;throw e;}));
 return {async read(){await init();return repo.read();},async mutate(fn){await init();return repo.mutate(fn);}};
}
