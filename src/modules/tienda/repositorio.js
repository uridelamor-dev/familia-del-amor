import fs from 'node:fs/promises';
import path from 'node:path';
import {inicial} from './catalogo.js';
export const SCHEMA = `CREATE TABLE IF NOT EXISTS tienda_config (id INTEGER PRIMARY KEY CHECK(id=1), datos JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS tienda_registros (tipo TEXT NOT NULL, id TEXT NOT NULL, datos JSONB NOT NULL, PRIMARY KEY(tipo,id));`;
const colecciones=['catalog','bundles','orders','quotes','audit','outbox'];
// La demo usa un archivo privado; nunca una conexión a la base de producción.
export function localStore(file) {
 let queue=Promise.resolve();
 async function read(){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return inicial();}}
 return {read,mutate(fn){const next=queue.then(async()=>{const s=await read();const r=await fn(s);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(s),{mode:0o600});await fs.rename(tmp,file);return r;});queue=next.catch(()=>{});return next;}};
}
export function postgresStore(pool) {
 async function readWith(c){const conf=await c.query('SELECT datos FROM tienda_config WHERE id=1');if(!conf.rows.length)throw new Error('Tienda pendiente de preparar');const s={config:conf.rows[0].datos};colecciones.forEach(k=>s[k]=[]);const rows=await c.query('SELECT tipo,datos FROM tienda_registros ORDER BY id');for(const r of rows.rows)if(s[r.tipo])s[r.tipo].push(r.datos);s.bundles.sort((a,b)=>(a.sort??0)-(b.sort??0));return s;}
 return {async read(){const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const s=await readWith(c);await c.query('COMMIT');return s;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},async mutate(fn){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM tienda_config WHERE id=1 FOR UPDATE');const s=await readWith(c);const r=await fn(s);await c.query('UPDATE tienda_config SET datos=$1 WHERE id=1',[s.config]);for(const tipo of colecciones)for(const d of s[tipo])await c.query('INSERT INTO tienda_registros(tipo,id,datos) VALUES($1,$2,$3) ON CONFLICT(tipo,id) DO UPDATE SET datos=EXCLUDED.datos',[tipo,d.id,d]);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
}
