import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csvComparativo,rangoComparativoValido} from '../../src/modules/fichajes/comparativo.js';
const fila={worker_id:1,nombre:'=HYPERLINK("x")',dia:'2026-09-21',minPlanificado:480,minFichado:510,minPausa:30,minEfectivo:480,jornada:{minEfectivo:480,minPlanificado:480},estado:'validada',validacion:{minutos:450,por:'Nerea'}};
test('el comparativo conserva las tres magnitudes y neutraliza fórmulas en los nombres',()=>{
 const csv=csvComparativo([fila]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('8,00;8,50;0,50;8,00;7,50;validado;7,50;7,50;validada;Nerea'));
});
test('una aprobación caducada no aparece como vigente',()=>{
 const csv=csvComparativo([{...fila,estado:'validacion_caducada'}]);assert.ok(csv.includes(';propuesto;;7,50;validacion_caducada;'));
});
test('sin aprobación queda vacío, no cero ni el horario previsto',()=>{
 const csv=csvComparativo([{...fila,validacion:null,estado:'requiere_revision'}]);assert.ok(csv.includes(';propuesto;;;requiere_revision;'));
});
test('rangos reales, ordenados y limitados; rechaza días inexistentes',()=>{
 assert.equal(rangoComparativoValido('2026-09-01','2026-09-30'),true);
 for(const [d,h] of [['2026-02-30','2026-03-02'],['2026-09-30','2026-09-01'],['2025-01-01','2026-01-01'],['x','x']]) assert.equal(rangoComparativoValido(d,h),false);
});
