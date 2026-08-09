import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { construirCuadrante, bloqueQueMasSolapa } from "../../src/modules/horarios/cuadrante.js";
import { construirSnapshot } from "../../src/modules/horarios/versiones.js";

const AREAS = [{ id: 1, nombre: "SALA" }, { id: 2, nombre: "COCINA" }];
// Los tramos tal cual están en Can Mateu, incluida la FIESTA de 20 a 3 que había a mano.
const TRAMOS = [
  { id: 1, nombre: "MAÑANA", inicio_min: 660, fin_min: 960 },
  { id: 2, nombre: "TARDE", inicio_min: 1140, fin_min: 1500 },
  { id: 3, nombre: "FIESTA", inicio_min: 1200, fin_min: 1620, tipo: "descanso" },
];
const EQUIPO = [{ id: 1, nombre: "Isa" }, { id: 2, nombre: "Vero" }, { id: 3, nombre: "Mateu" }];
const LUNES = "2026-08-03";
const t = (worker_id, dia, tramo_id, area_id, inicio_min, fin_min) =>
  ({ id: `${worker_id}${dia}${tramo_id}`, worker_id, dia, tramo_id, area_id, inicio_min, fin_min, tipo: "turno" });

// Isa de mañana en sala, Vero de mañana en cocina, Mateu de tarde en sala. Domingo cerrado.
const SEMANA = [];
for (const d of ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"]) {
  SEMANA.push(t(1, d, 1, 1, 660, 960), t(2, d, 1, 2, 660, 960), t(3, d, 2, 1, 1140, 1500));
}

describe("el cuadrante rellena solo la fila de fiesta", () => {
  const c = construirCuadrante({ lunes: LUNES, tramos: TRAMOS, areas: AREAS, asignaciones: SEMANA, trabajadores: EQUIPO });
  const fiesta = c.bloques.find((b) => b.tramo.nombre === "FIESTA");

  test("el bloque de fiesta queda marcado como calculado", () => {
    assert.equal(fiesta.calculado, true);
  });
  test("nadie libra de lunes a sábado", () => {
    for (let i = 0; i < 6; i++) {
      assert.equal(fiesta.areas.reduce((s, a) => s + a.dias[i].length, 0), 0, `día ${i}`);
    }
  });
  test("el domingo libran los tres, cada uno en su área", () => {
    assert.deepEqual(fiesta.areas[0].dias[6].map((x) => x.nombre), ["Isa", "Mateu"]);
    assert.deepEqual(fiesta.areas[1].dias[6].map((x) => x.nombre), ["Vero"]);
  });
  test("los totales cuentan turnos, no fiestas: el domingo es 0", () => {
    assert.deepEqual(c.totales, [3, 3, 3, 3, 3, 3, 0]);
  });
  test("un cuadrante sin bloque de descanso sigue funcionando igual que antes", () => {
    const sin = construirCuadrante({ lunes: LUNES, tramos: TRAMOS.slice(0, 2), areas: AREAS, asignaciones: SEMANA, trabajadores: EQUIPO });
    assert.equal(sin.bloques.length, 2);
    assert.deepEqual(sin.totales, [3, 3, 3, 3, 3, 3, 0]);
  });
});

describe("la fila de fiesta no se traga turnos", () => {
  test("un turno de noche NO cae en el bloque de fiesta aunque solape con él", () => {
    // FIESTA iba de 20:00 a 03:00 y TARDE de 19:00 a 01:00: un 21-01 solapa más con FIESTA.
    const nocturno = { worker_id: 1, dia: LUNES, area_id: 1, inicio_min: 1260, fin_min: 1500, tipo: "turno" };
    assert.equal(bloqueQueMasSolapa(nocturno, TRAMOS), 1, "va a TARDE, que es el índice 1");
  });

  test("una asignación vieja que arrastra el tramo_id de FIESTA se recoloca, no se pierde", () => {
    const colgado = { id: 99, worker_id: 3, dia: LUNES, tramo_id: 3, area_id: 1, inicio_min: 1260, fin_min: 1500, tipo: "turno" };
    const c = construirCuadrante({ lunes: LUNES, tramos: TRAMOS, areas: AREAS, asignaciones: [colgado], trabajadores: EQUIPO });
    const tarde = c.bloques.find((b) => b.tramo.nombre === "TARDE");
    assert.deepEqual(tarde.areas[0].dias[0].map((x) => x.nombre), ["Mateu"]);
    assert.equal(c.fuera.length, 0, "no se ha ido a «fuera de la rejilla»");
    const fiesta = c.bloques.find((b) => b.tramo.nombre === "FIESTA");
    assert.ok(!fiesta.areas.some((a) => a.dias[0].some((x) => x.nombre === "Mateu")), "y ese lunes Mateu no libra");
  });
});

describe("las ausencias salen marcadas y el PDF las sabe pintar", () => {
  const c = construirCuadrante({
    lunes: LUNES, tramos: TRAMOS, areas: AREAS, trabajadores: EQUIPO,
    asignaciones: SEMANA.filter((a) => a.worker_id !== 2),
    ausencias: [{ worker_id: 2, tipo: "vacaciones", desde: "2026-08-01", hasta: "2026-08-31" }],
  });
  const fiesta = c.bloques.find((b) => b.tramo.nombre === "FIESTA");

  test("Vero, de vacaciones toda la semana, no se coloca en un área inventada", () => {
    const sinRotulo = fiesta.areas.find((a) => a.area.nombre === "—");
    assert.ok(sinRotulo, "hay una fila sin rótulo");
    assert.deepEqual(sinRotulo.dias[0].map((x) => x.nombre), ["Vero"]);
    assert.ok(!fiesta.areas[1].dias[0].length, "y NO está en COCINA");
  });

  test("el motivo viaja como `franja`, que es lo que el PDF dibuja delante del nombre", () => {
    const sinRotulo = fiesta.areas.find((a) => a.area.nombre === "—");
    assert.equal(sinRotulo.dias[0][0].franja, "vacaciones");
  });

  test("quien simplemente libra no lleva nada delante", () => {
    assert.equal(fiesta.areas[0].dias[6].find((x) => x.nombre === "Isa").franja, null);
  });
});

describe("el snapshot congela lo que hace falta para reproducir la fila años después", () => {
  const snap = construirSnapshot({
    semana: { local: "Can Mateu - Tordera", lunes: LUNES, version: 1 },
    dias: ["2026-08-03"], areas: AREAS, tramos: TRAMOS, asignaciones: SEMANA,
    trabajadores: [{ id: 2, nombre: "Vero", fecha_alta: "2024-01-01", fecha_baja: null }],
    ausencias: [{ worker_id: 2, tipo: "vacaciones", desde: "2026-08-03", hasta: "2026-08-09" }],
  });

  test("guarda la plantilla de aquel día, no la de hoy", () => {
    assert.deepEqual(snap.plantilla, [{ id: 2, nombre: "Vero", fecha_alta: "2024-01-01", fecha_baja: null }]);
  });
  test("guarda las ausencias de aquella semana", () => {
    assert.equal(snap.ausencias[0].tipo, "vacaciones");
  });
  test("guarda qué bloque era el de descanso", () => {
    assert.equal(snap.tramos.find((t2) => t2.nombre === "FIESTA").tipo, "descanso");
    assert.equal(snap.tramos.find((t2) => t2.nombre === "TARDE").tipo, "turno");
  });

  test("un snapshot v1 (sin `tipo`) NO gana una fila de fiesta que no tenía", () => {
    // Un PDF ya enviado al grupo no puede cambiar al regenerarlo.
    const v1 = { tramos: TRAMOS.map(({ tipo, ...r }) => r), areas: AREAS, asignaciones: SEMANA };
    const c = construirCuadrante({
      lunes: LUNES, tramos: v1.tramos, areas: v1.areas, asignaciones: v1.asignaciones,
      trabajadores: EQUIPO,
    });
    assert.ok(c.bloques.every((b) => !b.calculado), "ningún bloque se rellena solo");
    const fiesta = c.bloques.find((b) => b.tramo.nombre === "FIESTA");
    assert.equal(fiesta.areas.reduce((s, a) => s + a.dias[6].length, 0), 0, "el domingo sigue vacío");
  });
});
