import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {reservarSalida} from '../../src/modules/captacion/ritmo.js';
import {ensureSchemaCaptacion} from '../../src/modules/captacion/schema.js';
test('cola persistente: concurrencia, pausa, horario y sin recuperación en ráfaga',async t=>{
 if(!await disponible()){t.skip(motivoSalto());return;}
 const db=await conEsquema();
 try{
  await db.run('CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT)');
  // Ejecuta el DDL real del control; el resto del esquema de captación no es necesario aquí.
  await ensureSchemaCaptacion({run:async(sql,...args)=>/cap_envio_control/.test(sql)?db.run(sql,...args):undefined});
  const at=Date.parse('2026-09-24T08:00:00Z');
  const get=(sql,args)=>db.get(sql.replace('CURRENT_TIMESTAMP',"TIMESTAMPTZ '2026-09-24 08:00:00+00'"),args);
  const claims=await Promise.all([reservarSalida(get,at),reservarSalida(get,at)]);
  assert.equal(claims.filter(Boolean).length,1);
  assert.equal(await reservarSalida(get,at+299999),undefined);
  assert.ok(await reservarSalida(get,at+300000));
  await db.run("INSERT INTO config VALUES ('captacion_cola_parada','1')");
  assert.equal(await reservarSalida(get,at+900000),undefined);
  await db.run("UPDATE config SET value='0'");
  assert.ok(await reservarSalida(get,at+900000));
  assert.equal(await reservarSalida(get,at+900000),undefined);
  await db.run('UPDATE cap_envio_control SET cantidad=2');
  assert.ok(await reservarSalida(get,at+1200000));
  assert.equal(Number((await db.get('SELECT proximo_ms FROM cap_envio_control')).proximo_ms),at+1350000);
  const night=(sql,args)=>db.get(sql.replace('CURRENT_TIMESTAMP',"TIMESTAMPTZ '2026-09-24 22:00:00+00'"),args);
  assert.equal(await reservarSalida(night,at+9999999),undefined);
  await ensureSchemaCaptacion({run:async(sql,...args)=>/cap_envio_control/.test(sql)?db.run(sql,...args):undefined});
  assert.equal((await db.get('SELECT cantidad FROM cap_envio_control')).cantidad,2);
 }finally{await db.fin();}
});
