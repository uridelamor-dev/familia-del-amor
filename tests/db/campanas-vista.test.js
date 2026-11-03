import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
const server=fs.readFileSync(new URL('../../server.js',import.meta.url),'utf8');
test('SQL real: progreso en curso y cumpleaños separados por fecha',async t=>{
 if(!await disponible())return t.skip(motivoSalto());const db=await conEsquema();
 try{
 await db.raw('CREATE TABLE campanas_wa(id INTEGER,total_enviados INTEGER,total_errores INTEGER,creado_en TEXT); CREATE TABLE campana_envios(campana_id INTEGER,estado TEXT); CREATE TABLE cap_cola(campana TEXT,estado TEXT,enviado_en TEXT)');
 await db.raw("INSERT INTO campanas_wa VALUES(1,0,0,'2026-11-03'),(2,8,2,'2026-11-02'); INSERT INTO campana_envios VALUES(1,'enviado'),(1,'enviado'),(1,'error'); INSERT INTO cap_cola VALUES('cumple:2026-11-03','enviado','2026-11-03T10:00:00Z'),('cumple:2026-11-03','pendiente',NULL),('cumple:2026-11-02','enviado','2026-11-02T10:00:00Z')");
 const block=server.slice(server.indexOf('app.get("/api/campanas",'));
 const sql=block.match(/dbAll\(`([\s\S]*?)`\)/)[1];const rows=(await db.raw(sql)).rows;
 assert.equal(rows[0].enviados_reales,2);assert.equal(rows[0].errores_reales,1);assert.equal(rows[1].enviados_reales,8);
 const config=server.slice(server.indexOf('app.get("/api/campanas-config",'));
 const sum=config.match(/dbGet\(`([\s\S]*?)`/)[1].replace('?', '$1');const r=(await db.raw(sum,['cumple:2026-11-03'])).rows[0];assert.equal(r.enviados,1);assert.equal(r.pendientes,1);assert.equal(r.fallidos,0);
 }finally{await db.fin();}
});
