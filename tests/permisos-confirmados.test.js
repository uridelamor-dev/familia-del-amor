import test from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from './helpers/pgtmp.js';
import {PERMISOS_CONFIRMADOS_SCHEMA,registrarPermisosConfirmados} from '../src/modules/clientes/permisos-confirmados.js';
test('confirmación administrativa única, conserva bajas y no vuelve a otorgar permisos revocados',{skip:!(await disponible())&&motivoSalto()},async()=>{
 const db=await conEsquema();
 try {
  await db.raw('CREATE TABLE marketing_prefs (telefono TEXT PRIMARY KEY,correo TEXT,opt_in_wa INTEGER DEFAULT 0,opt_in_email INTEGER DEFAULT 0,baja INTEGER DEFAULT 0,updated_at TEXT)');
  await db.raw('CREATE TABLE leads (telefono TEXT)');await db.raw('CREATE TABLE reservas (telefono TEXT)');await db.raw('CREATE TABLE whatsapp_messages (telefono TEXT,tipo TEXT)');
  await db.raw(PERMISOS_CONFIRMADOS_SCHEMA);
  for(const t of ['600000001','600000002','600000003','600000004','600000005'])await db.run('INSERT INTO leads VALUES(?)',[t]);
  await db.raw("INSERT INTO marketing_prefs(telefono,correo,baja) VALUES ('34600000001','a@example.com',0),('600000002','b@example.com',1),('600000003','c@example.com',0),('+34 600000003','d@example.com',1),('600000004','b@example.com',0),('600000005','e@example.com',0),('600000006','f@example.com',0)");
  // Embedded Postgres does not emulate advisory locking; SQL behavior is otherwise real.
  const pool={connect:async()=>({query:(s,p)=>s.includes('pg_advisory_xact_lock')?Promise.resolve({rows:[]}):db.raw(s,p),release(){}})};
  assert.equal(await registrarPermisosConfirmados(pool),2);
  const yes=await db.all('SELECT telefono FROM marketing_prefs WHERE opt_in_email=1 ORDER BY telefono');
  assert.deepEqual(yes.map(c=>c.telefono),['34600000001','600000005']);
  const audit=await db.get('SELECT * FROM marketing_confirmaciones_admin');assert.equal(audit.anteriores[0].opt_in_email,0);
  await db.run("UPDATE marketing_prefs SET opt_in_email=0,baja=1 WHERE telefono='34600000001'");
  assert.equal(await registrarPermisosConfirmados(pool),0);
  assert.equal((await db.get("SELECT opt_in_email FROM marketing_prefs WHERE telefono='34600000001'")).opt_in_email,0);
  await db.raw("INSERT INTO marketing_prefs(telefono) VALUES ('600000009')");
  assert.equal((await db.get("SELECT opt_in_email FROM marketing_prefs WHERE telefono='600000009'")).opt_in_email,1);
 }finally{await db.fin();}
});
