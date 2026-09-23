import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {guardarHorasFicha} from '../../src/modules/rrhh/horas-ficha.js';
test('horas de ficha: histórico, misma tabla de Horarios y rollback de errores',async t=>{
 if(!await disponible()){t.skip(motivoSalto());return;}
 const db=await conEsquema(),client={query:db.raw};
 try{
  await db.run('CREATE TABLE hor_contratos(id SERIAL PRIMARY KEY,worker_id INTEGER,desde TEXT,hasta TEXT,horas_semana NUMERIC,dias_semana INTEGER,creado_en TEXT,creado_por TEXT)');
  await db.run("INSERT INTO hor_contratos(worker_id,desde,horas_semana) VALUES(1,'2026-01-01',40)");
  const args={workerId:1,horas:20,desde:'2026-09-23',hoy:'2026-09-23',autor:'prueba',tipoJornada:'parcial'};
  await db.raw('BEGIN');await guardarHorasFicha(client,args);await db.raw('COMMIT');
  let rows=await db.all('SELECT * FROM hor_contratos ORDER BY id');
  assert.equal(rows.length,2);assert.equal(rows[0].hasta,'2026-09-22');assert.equal(Number(rows[1].horas_semana),20);assert.equal(rows[1].creado_por,'prueba');
  await db.raw('BEGIN');await guardarHorasFicha(client,args);await db.raw('COMMIT');
  assert.equal((await db.all('SELECT * FROM hor_contratos')).length,2);
  await db.raw('BEGIN');await guardarHorasFicha(client,{...args,horas:30});await db.raw('ROLLBACK');
  assert.equal(Number((await db.get('SELECT * FROM hor_contratos WHERE id=2')).horas_semana),20);
  for(const horas of ['',0,-2,61,'abc',20.3])await assert.rejects(()=>guardarHorasFicha(client,{...args,horas}),/horas/);
  await assert.rejects(()=>guardarHorasFicha(client,{...args,desde:'2026-02-30'}),/fecha/);
  await db.raw('BEGIN');
  await assert.rejects(()=>guardarHorasFicha(client,{...args,horas:25,desde:'2026-01-02'}),/posterior/);
  await db.raw('ROLLBACK');
 }finally{await db.fin();}
});
