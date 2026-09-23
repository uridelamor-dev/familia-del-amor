// Ejecuta las rutas reales de crear/editar contra un esquema PostgreSQL desechable.
import {test,before,after,describe} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {conEsquema,disponible,motivoSalto} from '../helpers/pgtmp.js';
import {ensureSchemaHorarios,sembrarLocal} from '../../src/modules/horarios/schema.js';
import {validarTurno} from '../../src/modules/horarios/operativa.js';
import {diasSemana,lunesDe} from '../../src/modules/horarios/tiempo.js';
import {esTramoDescanso} from '../../src/modules/horarios/descansos.js';
import {estaConfigurado} from '../../src/modules/horarios/capacidades.js';
const disponibleBD=await disponible();
describe('turnos sin asignar y aislamiento de las rutas reales',{skip:disponibleBD?false:motivoSalto()},()=>{
 let db,semana,area,tramo,ctx;
 const rutas=new Map();
 before(async()=>{
  db=await conEsquema();
  await db.run('CREATE TABLE users (id SERIAL PRIMARY KEY,nombre TEXT,username TEXT,local TEXT,rol TEXT,activo INTEGER,fecha_alta TEXT,fecha_baja TEXT)');
  await ensureSchemaHorarios(db);
  await sembrarLocal(db,'A','x'); await sembrarLocal(db,'B','x');
  await db.run("INSERT INTO users (id,nombre,local,rol,activo) VALUES (1,'Uno','A','trabajador',1),(2,'Dos','B','trabajador',1),(3,'Tres','A-extra','trabajador',1)");
  semana=await db.run("INSERT INTO hor_semanas(local,lunes,creado_en) VALUES ('A','2026-09-21','x') RETURNING *");
  area=await db.get("SELECT * FROM hor_areas WHERE local='A' ORDER BY id LIMIT 1");
  tramo=await db.get("SELECT * FROM hor_tramos WHERE local='A' AND tipo='turno' ORDER BY id LIMIT 1");
  const app={post:(p,...hs)=>rutas.set('POST '+p,hs.at(-1)),patch:(p,...hs)=>rutas.set('PATCH '+p,hs.at(-1))};
  ctx=vm.createContext({app,console,dbGet:db.get,dbRun:db.run,dbAll:db.all,HORARIOS_ROLES:[],requireAuth:()=>()=>{},
   rrhhPuedeLocal:(req,l)=>l==='A',personasDe:l=>l==='A'?['A','A-extra']:[l],diasSemana,lunesDe,isoConOffset:()=>new Date().toISOString(),validarTurno,esTramoDescanso,estaConfigurado,SQL_PLANTILLA:'1=1',
   horContexto:async()=>({ausencias:[]}),horCapacidades:async()=>({indice:new Map()}),activoAhora:()=>true,puedeEnArea:()=>true});
  const source=readFileSync('server.js','utf8');
  vm.runInContext(source.slice(source.indexOf('async function horSemanaEditable('),source.indexOf('// ── Repetir un turno en otros días')),ctx);
  vm.runInContext(source.slice(source.indexOf('app.post("/api/horarios/semana/:id/copiar"'),source.indexOf('// Publicar. Es una transacción')),ctx);
 });
 after(async()=>{if(db)await db.fin()});
 const llamar=async(metodo,body,params={})=>{
  let estado=200,data;
  const res={status(n){estado=n;return this},json(j){data=j;return this}};
  await rutas.get(metodo)({body,params,user:{username:'prueba'}},res);
  return {estado,data};
 };
 const nuevo=worker_id=>({semana_id:semana.id,worker_id,dia:'2026-09-21',area_id:area.id,tramo_id:tramo.id,inicio_min:600,fin_min:840,tipo:'turno'});
 test('crear vacante, asignarla y volverla a dejar pendiente sin duplicar',async()=>{
  const a=await llamar('POST /api/horarios/asignacion',nuevo(null));assert.equal(a.estado,200);assert.equal(a.data.asignacion.worker_id,null);
  const id=a.data.asignacion.id;
  const b=await llamar('PATCH /api/horarios/asignacion/:id',{worker_id:1},{id});assert.equal(b.estado,200);assert.equal(b.data.asignacion.worker_id,1);
  const c=await llamar('PATCH /api/horarios/asignacion/:id',{worker_id:null},{id});assert.equal(c.estado,200);assert.equal(c.data.asignacion.worker_id,null);
  assert.equal((await db.get('SELECT count(*)::int AS n FROM hor_asignaciones WHERE id=?',[id])).n,1);
 });
 test('rechaza otra persona, área o tramo de fuera del centro',async()=>{
  assert.equal((await llamar('POST /api/horarios/asignacion',nuevo(2))).estado,403);
  const ajena=await db.get("SELECT id FROM hor_areas WHERE local='B' LIMIT 1");
  assert.equal((await llamar('POST /api/horarios/asignacion',{...nuevo(null),area_id:ajena.id})).estado,400);
  const ajeno=await db.get("SELECT id FROM hor_tramos WHERE local='B' AND tipo='turno' LIMIT 1");
  assert.equal((await llamar('POST /api/horarios/asignacion',{...nuevo(null),tramo_id:ajeno.id})).estado,400);
 });
 test('acepta persona de otro local del mismo centro',async()=>assert.equal((await llamar('POST /api/horarios/asignacion',nuevo(3))).estado,200));
 test('un PATCH inválido no estropea las horas guardadas',async()=>{
  const a=await llamar('POST /api/horarios/asignacion',nuevo(1)),id=a.data.asignacion.id;
  assert.equal((await llamar('PATCH /api/horarios/asignacion/:id',{fin_min:500},{id})).estado,400);
  assert.equal((await db.get('SELECT fin_min FROM hor_asignaciones WHERE id=?',[id])).fin_min,840);
 });
 test('copiar semana conserva huecos pendientes y miembros del centro compartido',async()=>{
  const destino=await db.run("INSERT INTO hor_semanas(local,lunes,creado_en) VALUES ('A','2026-09-28','x') RETURNING *");
  const r=await llamar('POST /api/horarios/semana/:id/copiar',{lunes:semana.lunes},{id:destino.id});
  assert.equal(r.estado,200);
  const filas=await db.all('SELECT * FROM hor_asignaciones WHERE semana_id=?',[destino.id]);
  assert.ok(filas.some(a=>a.worker_id==null));assert.ok(filas.some(a=>a.worker_id===3));
  assert.ok(filas.every(a=>a.dia==='2026-09-28'));
 });
 test('una semana publicada no admite turnos nuevos ni cambios',async()=>{
  const a=await llamar('POST /api/horarios/asignacion',nuevo(1)),id=a.data.asignacion.id;
  await db.run("UPDATE hor_semanas SET estado='publicado' WHERE id=?",[semana.id]);
  assert.equal((await llamar('POST /api/horarios/asignacion',nuevo(null))).estado,409);
  assert.equal((await llamar('PATCH /api/horarios/asignacion/:id',{worker_id:null},{id})).estado,409);
 });
});
