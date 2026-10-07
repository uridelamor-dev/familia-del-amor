import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizarCentroBlanes,esAliasBlanes} from '../../src/modules/facturas/centro-blanes.js';
import {DRIVE_SYNC_SCHEMA} from '../../src/modules/facturas/drive-sync.js';
test('solo reconoce alias conocidos de Blanes',()=>{
 for(const local of ['BLANES','Cooperativa - Blanes','coop blanes'])assert.equal(esAliasBlanes(local),true);
 for(const local of ['Tordera','La Tapeta - Girona',null,'La Tapeta - Blanes','Otro'])assert.equal(esAliasBlanes(local),false);
});
test('normaliza grupo e históricos sin perder documentos, conserva respaldo y es repetible',async t=>{
 if(!process.env.TEST_PGLITE_MODULE){t.skip('Requiere PostgreSQL embebido');return;}
 const {PGlite}=await import(process.env.TEST_PGLITE_MODULE);const pg=new PGlite();
 try{
 await pg.exec(`CREATE TABLE facturas(id SERIAL PRIMARY KEY,local TEXT,empresa TEXT,fecha TEXT,proveedor TEXT,numero_factura TEXT,drive_url TEXT,total NUMERIC,sheet_synced INT DEFAULT 1);
 CREATE TABLE facturas_grupos(id SERIAL PRIMARY KEY,local TEXT,group_jid TEXT);
 CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT);`+DRIVE_SYNC_SCHEMA);
 await pg.exec("INSERT INTO facturas(local,total) VALUES ('BLANES',100),('Cooperativa - Blanes',200),('La Tapeta - Girona',300); INSERT INTO facturas_grupos(local,group_jid) VALUES ('Cooperativa - Blanes','grupo-compartido'),('La Tapeta - Girona','girona');");
 const q=(s,p=[])=>pg.query(s,p);
 await q('BEGIN');assert.deepEqual(await normalizarCentroBlanes(q),{facturas:2,grupos:1});await q('COMMIT');
 const facturas=(await q('SELECT * FROM facturas ORDER BY id')).rows;
 assert.deepEqual(facturas.map(f=>f.local),['La Tapeta - Blanes','La Tapeta - Blanes','La Tapeta - Girona']);
 assert.equal(facturas.reduce((s,f)=>s+Number(f.total),0),600);
 assert.equal(facturas[0].sheet_synced,0);assert.equal(facturas[0].drive_revision,2);
 assert.equal((await q('SELECT group_jid FROM facturas_grupos ORDER BY id')).rows[0].group_jid,'grupo-compartido');
 assert.deepEqual(await normalizarCentroBlanes(q),{facturas:0,grupos:0});
 assert.equal((await q('SELECT * FROM config')).rows.length,2);
 }finally{await pg.close();}
});
