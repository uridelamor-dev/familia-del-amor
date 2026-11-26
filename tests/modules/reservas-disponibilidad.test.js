import test from 'node:test';
import assert from 'node:assert/strict';
import {horasDisponibles,horarioConfirmado,LOCALES_RESERVA} from '../../src/modules/reservas/disponibilidad.js';
const ahora=new Date('2026-11-26T09:20:00Z');
const slots=(local,dia,extra={})=>horasDisponibles({dia,horario:horarioConfirmado(local),ahora,...extra});
test('todos los locales: 29 horas cada media hora, límites 09–23',()=>{
 for(const local of LOCALES_RESERVA){const r=slots(local,'2026-11-27');assert.equal(r.horas.length,29);assert.equal(r.horas[0],'09:00');assert.equal(r.horas.at(-1),'23:00');assert.ok(!r.horas.includes('23:30'));}
});
test('Tribeca cierra martes; demás locales abren',()=>{
 for(const local of LOCALES_RESERVA)assert.equal(slots(local,'2026-12-01').horas.length,local==='Tribeca - Palafolls'?0:29);
});
test('bloqueos, fechas inválidas y horarios desconocidos no permiten reservar',()=>{
 assert.equal(slots(LOCALES_RESERVA[0],'2026-11-27',{bloqueado:true}).horas.length,0);
 for(const dia of ['2026-02-30','2026-11-25','basura'])assert.equal(slots(LOCALES_RESERVA[0],dia).ok,false);
 assert.equal(slots('Oficina','2026-11-27').ok,false);
});
test('horas pasadas según Madrid y cierres puntuales',()=>{
 assert.equal(slots(LOCALES_RESERVA[0],'2026-11-26').horas[0],'10:30');
 assert.equal(slots(LOCALES_RESERVA[0],'2026-11-27',{horario:{fechas:{'2026-11-27':[]}}}).horas.length,0);
});
