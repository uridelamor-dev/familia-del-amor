import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CARTA_TAPETA_SQL } from '../src/modules/messaging/sara-carta-tapeta.js';

test('carta compartida: instala web y Sara solo en Lloret/Girona y respeta cambios posteriores', { skip: !process.env.TEST_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.TEST_PGLITE_MODULE);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE contents(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
      CREATE TABLE sara_respuestas(tema TEXT,disparadores TEXT,respuesta TEXT,documento_url TEXT,local TEXT,activo INTEGER);
      INSERT INTO contents VALUES ('local_la-tapeta-blanes_menu_pdf','/otra.pdf','hoy');`);
    await db.exec(CARTA_TAPETA_SQL);
    const { rows } = await db.query('SELECT * FROM sara_respuestas ORDER BY local');
    assert.deepEqual(rows.map(x=>x.local), ['La Tapeta - Girona','La Tapeta - Lloret']);
    for (const row of rows) {
      assert.ok(existsSync(new URL('../public'+row.documento_url, import.meta.url)));
      assert.match(row.disparadores, /preguntarlo antes/);
      assert.equal(row.activo,1);
    }
    const web = await db.query("SELECT value FROM contents WHERE key='local_la-tapeta-girona_menu_pdf'");
    assert.equal(web.rows[0].value, rows[0].documento_url);
    await db.exec("UPDATE sara_respuestas SET activo=0; UPDATE contents SET value='/nueva.pdf' WHERE key='local_la-tapeta-girona_menu_pdf';");
    await db.exec(CARTA_TAPETA_SQL);
    assert.equal((await db.query('SELECT * FROM sara_respuestas')).rows.length,2);
    assert.equal((await db.query('SELECT * FROM sara_respuestas WHERE activo=1')).rows.length,0);
    assert.equal((await db.query("SELECT value FROM contents WHERE key='local_la-tapeta-girona_menu_pdf'")).rows[0].value,'/nueva.pdf');
    assert.equal((await db.query("SELECT value FROM contents WHERE key='local_la-tapeta-blanes_menu_pdf'")).rows[0].value,'/otra.pdf');
  } finally { await db.close(); }
});
