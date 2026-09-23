import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarTurno,coberturaFranja,resumenOperativo} from '../../src/modules/horarios/operativa.js';
import {detectarConflictos} from '../../src/modules/horarios/conflictos.js';
import {construirSnapshot,cambiosPorTrabajador} from '../../src/modules/horarios/versiones.js';
import {diasSemana} from '../../src/modules/horarios/tiempo.js';
import {construirCuadrante} from '../../src/modules/horarios/cuadrante.js';
const dia='2026-09-21';
const turno=(worker_id,inicio_min=600,fin_min=840)=>({worker_id,inicio_min,fin_min,dia,area_id:1,tramo_id:1,tipo:'turno'});
test('los turnos pendientes admiten persona nula, pero no ausencias sin persona ni horas inválidas',()=>{
 assert.equal(validarTurno(turno(null)),null);
 for(const a of [{...turno(null),tipo:'baja'},turno(0),turno(1,-1),turno(1,840,600),turno(1,600,600),turno(1,1500,1600),turno(1,600,2200),{...turno(1),inicio_min:null}]) assert.ok(validarTurno(a));
 assert.equal(validarTurno(turno(1,1200,1560)),null);
});
test('la cobertura distingue huecos, turnos partidos y personas duplicadas',()=>{
 const segmentos=coberturaFranja({dia,area_id:1,inicio_min:600,fin_min:900,asignaciones:[turno(1,600,720),turno(1,660,720),turno(1,780,900),turno(null,600,900)]});
 assert.equal(Math.min(...segmentos.map(s=>s.personas)),0);
 assert.equal(Math.max(...segmentos.map(s=>s.personas)),1);
 assert.ok(segmentos.every(s=>s.sin_asignar===1));
 assert.ok(segmentos.some(s=>s.inicio_min===720&&s.fin_min===780&&s.personas===0));
});
test('el objetivo respeta contratos parciales y no inventa uno cuando falta',()=>{
 const j=resumenOperativo({dias:diasSemana(dia),equipo:[{id:1},{id:2}],contratos:[{id:4,worker_id:1,desde:dia,horas_semana:20}],asignaciones:[turno(1),turno(null)]});
 assert.equal(j.personas[0].objetivo_min,1200); assert.equal(j.personas[0].minutos,240);
 assert.equal(j.personas[1].objetivo_min,null); assert.equal(j.sin_asignar,1);
});
test('cambios de contrato a mitad de semana se marcan como referencia proporcional',()=>{
 const j=resumenOperativo({dias:diasSemana(dia),equipo:[{id:1}],contratos:[{id:1,worker_id:1,desde:dia,hasta:'2026-09-23',horas_semana:20},{id:2,worker_id:1,desde:'2026-09-24',horas_semana:40}]});
 assert.equal(j.personas[0].objetivo_min,Math.round((3*20+4*40)*60/7));assert.equal(j.personas[0].proporcional,true);
});
test('dos huecos pendientes no generan solapes, horas extra ni una persona ficticia',()=>{
 const conflictos=detectarConflictos({lunes:dia,asignaciones:[turno(null),turno(null)]});
 assert.deepEqual(conflictos.map(c=>c.tipo),['sin_asignar','sin_asignar']);
 const antes={asignaciones:[turno(null)]},despues={asignaciones:[turno(7)]};
 assert.deepEqual(cambiosPorTrabajador(antes,despues).map(c=>c.worker_id),[7]);
 assert.deepEqual(cambiosPorTrabajador(antes,{asignaciones:[]}),[]);
});
test('PDF y publicación conservan el rótulo Sin asignar',()=>{
 const snap=construirSnapshot({semana:{lunes:dia},asignaciones:[turno(null)]});
 assert.equal(snap.asignaciones[0].nombre,'Sin asignar');
 const c=construirCuadrante({lunes:dia,asignaciones:[turno(null)],areas:[{id:1}],tramos:[{id:1,inicio_min:600,fin_min:840}]});
 assert.equal(c.bloques[0].areas[0].dias[0][0].nombre,'Sin asignar');
});
test('un hueco sin asignar nunca satisface una necesidad de cobertura',()=>{
 const j=resumenOperativo({dias:diasSemana(dia),asignaciones:[turno(null)],necesidades:[{area_id:1,tramo_id:1,dow:0,minimo:1}],tramos:[{id:1,inicio_min:600,fin_min:840}]});
 assert.equal(j.cobertura[0].cubierto,0);assert.equal(j.cobertura[0].minutos_descubiertos,240);
});

test('repetir vacantes no inventa un solape entre personas sin asignar', async()=>{
 const {planRepetir}=await import('../../src/modules/horarios/repetir.js');
 const t=turno(null), otro={...turno(null,660,900),dia:'2026-09-22',area_id:2};
 const p=planRepetir({turno:t,dias:['2026-09-22'],asignaciones:[otro]});
 assert.deepEqual(p.aCrear,['2026-09-22']); assert.equal(p.conAviso,0);
});
