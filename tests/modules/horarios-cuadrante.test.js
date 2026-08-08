import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  franjaSiDifiere, construirCuadrante, personasPorDia, porPersona, solapesDe,
} from "../../src/modules/horarios/cuadrante.js";

const LUNES = "2026-08-10";
const TRAMOS = [
  { id: 1, nombre: "MAÑANA", orden: 1, inicio_min: 660, fin_min: 960 },   // 11-16
  { id: 2, nombre: "TARDE", orden: 2, inicio_min: 1140, fin_min: 1500 },  // 19-01
];
const AREAS = [{ id: 10, nombre: "SALA", orden: 1 }, { id: 11, nombre: "COCINA", orden: 2 }];
const EQUIPO = [
  { id: 1, nombre: "KEVIN" }, { id: 2, nombre: "JUDIT" }, { id: 3, nombre: "ARNAU" },
  { id: 4, nombre: "LELY" }, { id: 5, nombre: "AITANA" },
];
const asig = (o) => ({ tipo: "turno", area_id: 10, tramo_id: 1, fin_abierto: false, ...o });

describe("cuadrante — la hora solo se escribe si difiere del tramo", () => {
  const tramo = TRAMOS[0];
  test("quien va con el tramo no lleva hora al lado", () => {
    assert.equal(franjaSiDifiere({ inicio_min: 660, fin_min: 960 }, tramo), null);
  });
  test("quien se sale del tramo sí la lleva", () => {
    assert.equal(franjaSiDifiere({ inicio_min: 660, fin_min: 900 }, tramo), "11-15");
    assert.equal(franjaSiDifiere({ inicio_min: 720, fin_min: 960 }, tramo), "12-16");
  });
  test("un turno de fin abierto se escribe «-cierre», como en el papel", () => {
    assert.equal(
      franjaSiDifiere({ inicio_min: 1200, fin_min: 1560, fin_abierto: true }, TRAMOS[1]),
      "20-cierre"
    );
  });
  test("sin tramo asignado siempre se escribe la hora", () => {
    assert.equal(franjaSiDifiere({ inicio_min: 660, fin_min: 960 }, null), "11-16");
  });
});

describe("cuadrante — estructura de la rejilla", () => {
  const base = {
    lunes: LUNES, tramos: TRAMOS, areas: AREAS, trabajadores: EQUIPO,
    asignaciones: [
      asig({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 960 }),           // KEVIN, tramo
      asig({ id: 2, worker_id: 2, dia: "2026-08-10", inicio_min: 660, fin_min: 900 }),           // JUDIT 11-15
      asig({ id: 3, worker_id: 4, dia: "2026-08-10", inicio_min: 660, fin_min: 960, area_id: 11 }), // LELY cocina
      asig({ id: 4, worker_id: 3, dia: "2026-08-15", inicio_min: 1200, fin_min: 1560, tramo_id: 2, fin_abierto: true }),
    ],
  };

  test("cada bloque tiene sus áreas y cada área sus 7 días", () => {
    const c = construirCuadrante(base);
    assert.equal(c.dias.length, 7);
    assert.equal(c.bloques.length, 2);
    assert.equal(c.bloques[0].areas.length, 2);
    assert.equal(c.bloques[0].areas[0].dias.length, 7);
  });

  test("cada persona cae en su celda", () => {
    const c = construirCuadrante(base);
    const salaLunes = c.bloques[0].areas[0].dias[0].map((p) => p.nombre);
    assert.deepEqual(salaLunes, ["KEVIN", "JUDIT"], "primero quien va con el tramo");
    assert.deepEqual(c.bloques[0].areas[1].dias[0].map((p) => p.nombre), ["LELY"]);
    assert.deepEqual(c.bloques[1].areas[0].dias[5].map((p) => p.nombre), ["ARNAU"], "sábado, tarde");
  });

  test("solo lleva hora quien se sale del tramo", () => {
    const c = construirCuadrante(base);
    const [kevin, judit] = c.bloques[0].areas[0].dias[0];
    assert.equal(kevin.franja, null);
    assert.equal(judit.franja, "11-15");
  });

  test("NO SE PIERDE NADIE: lo que no encaja en la rejilla sale aparte", () => {
    const c = construirCuadrante({
      ...base,
      asignaciones: [
        ...base.asignaciones,
        asig({ id: 5, worker_id: 5, dia: "2026-08-11", tramo_id: 99, inicio_min: 600, fin_min: 800 }), // tramo inexistente
        asig({ id: 6, worker_id: 5, dia: "2026-08-12", tipo: "vacaciones", inicio_min: 0, fin_min: 0 }),
      ],
    });
    assert.equal(c.fuera.length, 2, "un turno con tramo desconocido y unas vacaciones");
    assert.ok(c.fuera.some((f) => f.tipo === "vacaciones"));
  });

  test("una asignación de un día fuera de la semana no revienta ni se cuela", () => {
    const c = construirCuadrante({
      ...base,
      asignaciones: [asig({ id: 7, worker_id: 1, dia: "2026-09-01", inicio_min: 660, fin_min: 960 })],
    });
    assert.equal(c.totales.reduce((a, b) => a + b, 0), 0);
    assert.equal(c.fuera.length, 1);
  });

  test("cuenta personas por día sin duplicar a quien parte el turno", () => {
    const c = construirCuadrante({
      ...base,
      asignaciones: [
        asig({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 900 }),
        asig({ id: 2, worker_id: 1, dia: "2026-08-10", inicio_min: 1200, fin_min: 1500, tramo_id: 2 }),
      ],
    });
    assert.deepEqual(personasPorDia(c)[0], 1, "es la misma persona dos veces, no dos personas");
    assert.equal(c.totales[0], 2, "pero son dos turnos");
  });
});

describe("cuadrante — vista por persona (la que evita las horas extra)", () => {
  const datos = {
    lunes: LUNES, tramos: TRAMOS, trabajadores: EQUIPO,
    asignaciones: [
      asig({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 960 }),  // 5 h
      asig({ id: 2, worker_id: 1, dia: "2026-08-11", inicio_min: 660, fin_min: 960 }),  // 5 h
      asig({ id: 3, worker_id: 1, dia: "2026-08-15", inicio_min: 1200, fin_min: 1560, tramo_id: 2 }), // 6 h, cruza medianoche
      asig({ id: 4, worker_id: 2, dia: "2026-08-12", tipo: "vacaciones", inicio_min: 0, fin_min: 0 }),
    ],
  };
  test("suma las horas de la semana, incluidos los turnos de madrugada", () => {
    const { filas } = porPersona(datos);
    const kevin = filas.find((f) => f.worker.id === 1);
    assert.equal(kevin.horas, 16, "5 + 5 + 6");
    assert.equal(kevin.diasTrabajados, 3);
  });
  test("las vacaciones no suman horas", () => {
    const { filas } = porPersona(datos);
    const judit = filas.find((f) => f.worker.id === 2);
    assert.equal(judit.horas, 0);
    assert.equal(judit.diasTrabajados, 0);
    assert.equal(judit.dias[2][0].tipo, "vacaciones", "pero el día se ve marcado");
  });
  test("quien no tiene nada aparece igualmente, con 0 horas", () => {
    const { filas } = porPersona(datos);
    assert.equal(filas.length, EQUIPO.length, "el equipo entero, para poder repartir");
    assert.equal(filas.find((f) => f.worker.id === 5).horas, 0);
  });
  test("los turnos del día salen ordenados por hora de entrada", () => {
    const { filas } = porPersona({
      ...datos,
      asignaciones: [
        asig({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 1200, fin_min: 1500, tramo_id: 2 }),
        asig({ id: 2, worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 900 }),
      ],
    });
    const dia = filas.find((f) => f.worker.id === 1).dias[0];
    assert.deepEqual(dia.map((t) => t.etiqueta), ["11-15", "20-1"]);
  });
});

describe("cuadrante — solapes", () => {
  test("un turno partido normal no es un solape", () => {
    const s = solapesDe([
      asig({ worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 900 }),
      asig({ worker_id: 1, dia: "2026-08-10", inicio_min: 1200, fin_min: 1500 }),
    ]);
    assert.deepEqual(s, []);
  });
  test("dos turnos que se pisan sí lo son", () => {
    const s = solapesDe([
      asig({ worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 960 }),
      asig({ worker_id: 1, dia: "2026-08-10", inicio_min: 900, fin_min: 1200 }),
    ]);
    assert.equal(s.length, 1);
  });
  test("dos personas a la misma hora no se pisan entre sí", () => {
    const s = solapesDe([
      asig({ worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 960 }),
      asig({ worker_id: 2, dia: "2026-08-10", inicio_min: 660, fin_min: 960 }),
    ]);
    assert.deepEqual(s, []);
  });
  test("turnos que se tocan justo no se pisan", () => {
    const s = solapesDe([
      asig({ worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 900 }),
      asig({ worker_id: 1, dia: "2026-08-10", inicio_min: 900, fin_min: 1140 }),
    ]);
    assert.deepEqual(s, []);
  });
});
