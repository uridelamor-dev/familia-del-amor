import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CARTAS_LOCALES_SQL } from '../src/modules/messaging/sara-cartas-locales.js';
test('cartas y semanal: locales correctos, independientes e instalación que respeta ediciones', {skip:!process.env.TEST_PGLITE_MODULE}, async()=>{
 const {PGlite}=await import(process.env.TEST_PGLITE_MODULE); const db=new PGlite();
 try{
 await db.exec('CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE contents(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE sara_respuestas(tema TEXT,disparadores TEXT,respuesta TEXT,documento_url TEXT,local TEXT,activo INTEGER);');
 await db.exec(CARTAS_LOCALES_SQL);
 const {rows}=await db.query('SELECT * FROM sara_respuestas');assert.equal(rows.length,8);
 const weekly=rows.filter(r=>r.tema.startsWith('Menú semanal'));
 assert.deepEqual(weekly.map(r=>r.local).sort(),['Cooperativa - Blanes','La Tapeta - Blanes','La Tapeta - Girona','La Tapeta - Lloret']);
 assert.equal(rows.filter(r=>r.local==='La Tapa Ibérica - Tordera').length,1);
 for(const row of rows){assert.ok(existsSync(new URL('../public'+row.documento_url,import.meta.url)));assert.match(row.disparadores,/preguntarlo antes/);}
 assert.equal((await db.query("SELECT * FROM contents WHERE key LIKE 'local_cooperativa_%'")).rows.length,2);
 for(const row of weekly){assert.match(row.respuesta,/lunes a viernes de 13:00 a 16:00/);assert.match(row.respuesta,/suplemento 3/);}
 await db.exec("UPDATE sara_respuestas SET activo=0; UPDATE contents SET value='/editado.pdf';");
 await db.exec(CARTAS_LOCALES_SQL);
 assert.equal((await db.query('SELECT * FROM sara_respuestas')).rows.length,8);
 assert.equal((await db.query('SELECT * FROM sara_respuestas WHERE activo=1')).rows.length,0);
 assert.ok((await db.query('SELECT * FROM contents')).rows.every(r=>r.value==='/editado.pdf'));
 }finally{await db.close();}
});
