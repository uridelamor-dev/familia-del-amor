import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Ejecuta la consulta real del pase contra PostgreSQL. Solo usa una tabla temporal.
test('Wallet consulta promociones sin error 42P18, con local y sin local', {
  skip: !process.env.WALLET_TEST_DATABASE_URL,
}, async () => {
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const bloque = source.slice(source.indexOf('async function walProyeccion('));
  const sql = bloque.match(/`(SELECT \* FROM fid_promos[^`]+)`/)[1];
  let n = 0;
  const query = sql.replace(/\?/g, () => `$${++n}`);
  const client = new pg.Client({ connectionString: process.env.WALLET_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('CREATE TEMP TABLE fid_promos (id integer, estado text, local text)');
    await client.query(`INSERT INTO fid_promos VALUES
      (1, 'publicada', NULL), (2, 'publicada', 'Blanes'),
      (3, 'publicada', 'Girona'), (4, 'borrador', NULL)`);
    for (const [local, ids] of [[null, [1, 2, 3]], ['Blanes', [1, 2]], ['Lloret', [1]]]) {
      const result = await client.query(query, [local, local]);
      assert.deepEqual(result.rows.map(r => r.id).sort(), ids);
    }
  } finally {
    await client.end();
  }
});
