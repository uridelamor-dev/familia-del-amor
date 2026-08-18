// Qué cambia entre dos versiones de un horario, contado como lo cuenta una persona.
//
// La regla de fondo: se avisa de lo que cambia lo que alguien TIENE QUE HACER. Ni una vez más.
// Un aviso que salta por algo que no le afecta enseña a ignorar los avisos, y el día que
// importe de verdad nadie lo mirará.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { compararSnapshots, cambiosPorTrabajador, construirSnapshot } from "../../src/modules/horarios/versiones.js";

const LUNES = "2026-08-17";
const JUE = "2026-08-20", VIE = "2026-08-21", SAB = "2026-08-22";
const EQUIPO = [{ id: 1, nombre: "Juan" }, { id: 2, nombre: "Marta" }];
const BASE = { semana: { local: "Blanes", lunes: LUNES, version: 1 }, trabajadores: EQUIPO, dias: [], areas: [], tramos: [] };
const t = (o) => ({ tipo: "turno", area_id: 10, tramo_id: 20, fin_abierto: false, ...o });
const snap = (asignaciones, version = 1) => construirSnapshot({ ...BASE, semana: { ...BASE.semana, version }, asignaciones });

// El caso de todos los días: Juan de tarde el jueves, Marta de mañana.
const V1 = snap([
  t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440 }),
  t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
]);

describe("solo se avisa a quien le cambia algo", () => {
  test("Juan entra dos horas más tarde: Juan afectado, Marta no", () => {
    const V2 = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 1080, fin_min: 1440 }),
      t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
    ], 2);
    const c = cambiosPorTrabajador(V1, V2);
    assert.equal(c.length, 1);
    assert.equal(c[0].worker_id, 1);
    assert.equal(c[0].dias.length, 1);
    assert.equal(c[0].dias[0].tipo, "modificado");
    assert.equal(c[0].dias[0].antes[0].inicio_min, 960);
    assert.equal(c[0].dias[0].ahora[0].inicio_min, 1080);
  });

  test("dos snapshots iguales no generan nada", () => {
    assert.deepEqual(cambiosPorTrabajador(V1, snap([
      t({ id: 9, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440 }),
      t({ id: 8, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
    ], 2)), [], "el id de la fila no cuenta: lo que importa es el horario");
  });

  test("sin publicación anterior no hay cambio que comunicar", () => {
    // La primera publicación no es un cambio: es el horario.
    assert.deepEqual(cambiosPorTrabajador(null, V1), []);
  });

  test("cambiar el NOMBRE de alguien no es un cambio de horario", () => {
    // Corregir cómo se escribe «Juan» no puede producir un «tu horario ha cambiado».
    const V2 = construirSnapshot({
      ...BASE, semana: { ...BASE.semana, version: 2 },
      trabajadores: [{ id: 1, nombre: "Juan Pérez" }, { id: 2, nombre: "Marta" }],
      asignaciones: [
        t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440 }),
        t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
      ],
    });
    assert.deepEqual(cambiosPorTrabajador(V1, V2), []);
  });

  test("cambiar una NOTA interna tampoco", () => {
    // Es un recordatorio del encargado. Avisar por eso enseña a ignorar los avisos.
    const V2 = snap([
      { ...t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440 }), nota: "que traiga el cambio" },
      t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
    ], 2);
    assert.deepEqual(cambiosPorTrabajador(V1, V2), []);
  });
});

describe("los tipos de cambio", () => {
  test("turno AÑADIDO: antes no trabajaba ese día", () => {
    const V2 = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440 }),
      t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
      t({ id: 3, worker_id: 1, dia: SAB, inicio_min: 960, fin_min: 1440 }),
    ], 2);
    const d = cambiosPorTrabajador(V1, V2)[0].dias[0];
    assert.equal(d.tipo, "anadido");
    assert.equal(d.antes.length, 0);
    assert.equal(d.ahora.length, 1);
  });

  test("turno ELIMINADO: ese día pasa a librar", () => {
    const V2 = snap([t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 })], 2);
    const d = cambiosPorTrabajador(V1, V2)[0].dias[0];
    assert.equal(d.tipo, "quitado");
    assert.equal(d.ahora.length, 0);
  });

  test("cambio de ÁREA con las mismas horas", () => {
    const V2 = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440, area_id: 11 }),
      t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
    ], 2);
    const d = cambiosPorTrabajador(V1, V2)[0].dias[0];
    assert.equal(d.tipo, "modificado");
    assert.equal(d.antes[0].area_id, 10);
    assert.equal(d.ahora[0].area_id, 11);
  });

  test("pasar de hora fija a «hasta cierre» ES un cambio", () => {
    // Estaba fuera de la comparación y no se detectaba: pasar de «20:00–00:00» a
    // «20:00–cierre» cambia a qué hora se va alguien a su casa.
    const V2 = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440, fin_abierto: true }),
      t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
    ], 2);
    const c = cambiosPorTrabajador(V1, V2);
    assert.equal(c.length, 1);
    assert.equal(c[0].dias[0].ahora[0].fin_abierto, true);
  });

  test("convertir un turno en una libranza también", () => {
    const V2 = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440, tipo: "libranza" }),
      t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
    ], 2);
    assert.equal(cambiosPorTrabajador(V1, V2).length, 1);
  });
});

describe("turnos partidos", () => {
  const PARTIDO = snap([
    t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 720, fin_min: 960 }),    // 12–16
    t({ id: 2, worker_id: 1, dia: JUE, inicio_min: 1200, fin_min: 1440 }),  // 20–00
  ]);

  test("si cambia UN tramo, se enseñan LOS DOS", () => {
    // Enseñar solo el que se movió mentiría por omisión: parecería que ese día solo trabaja
    // por la tarde.
    const V2 = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 720, fin_min: 960 }),
      t({ id: 2, worker_id: 1, dia: JUE, inicio_min: 1140, fin_min: 1380 }),   // 19–23
    ], 2);
    const d = cambiosPorTrabajador(PARTIDO, V2)[0].dias[0];
    assert.equal(d.tipo, "modificado");
    assert.equal(d.antes.length, 2, "los dos tramos de antes");
    assert.equal(d.ahora.length, 2, "y los dos de ahora");
    assert.deepEqual(d.antes.map((x) => x.inicio_min), [720, 1200]);
    assert.deepEqual(d.ahora.map((x) => x.inicio_min), [720, 1140]);
  });

  test("y no se funden en un solo tramo de 12 a 23", () => {
    const V2 = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 720, fin_min: 960 }),
      t({ id: 2, worker_id: 1, dia: JUE, inicio_min: 1140, fin_min: 1380 }),
    ], 2);
    const d = cambiosPorTrabajador(PARTIDO, V2)[0].dias[0];
    assert.notEqual(d.ahora.length, 1);
  });

  test("quitar uno de los dos tramos es «modificado», no «quitado»", () => {
    const V2 = snap([t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 720, fin_min: 960 })], 2);
    const d = cambiosPorTrabajador(PARTIDO, V2)[0].dias[0];
    assert.equal(d.tipo, "modificado", "ese día sigue trabajando");
    assert.equal(d.ahora.length, 1);
  });
});

describe("turnos que cruzan medianoche", () => {
  test("los minutos pasan de 1440 y se conservan tal cual", () => {
    // 20:00 → 02:00 es 1200 → 1560. Convertirlo a 00:30 del mismo día perdería el contexto.
    const antes = snap([t({ id: 1, worker_id: 1, dia: SAB, inicio_min: 1200, fin_min: 1560 })]);
    const despues = snap([t({ id: 1, worker_id: 1, dia: SAB, inicio_min: 1200, fin_min: 1470 })], 2);
    const d = cambiosPorTrabajador(antes, despues)[0].dias[0];
    assert.equal(d.antes[0].fin_min, 1560);
    assert.equal(d.ahora[0].fin_min, 1470);
  });
});

describe("varios cambios de la misma persona", () => {
  test("van juntos, en una sola comunicación y ordenados por día", () => {
    const antes = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 960, fin_min: 1440 }),
      t({ id: 3, worker_id: 1, dia: SAB, inicio_min: 720, fin_min: 1200 }),
    ]);
    const despues = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 1080, fin_min: 1440 }),   // se mueve
      t({ id: 2, worker_id: 1, dia: VIE, inicio_min: 960, fin_min: 1440 }),    // nuevo
      // el del sábado desaparece
    ], 2);
    const c = cambiosPorTrabajador(antes, despues);
    assert.equal(c.length, 1, "una sola persona");
    assert.deepEqual(c[0].dias.map((d) => [d.dia, d.tipo]),
      [[JUE, "modificado"], [VIE, "anadido"], [SAB, "quitado"]]);
  });
});

describe("refuerzos", () => {
  test("un refuerzo es una asignación más: se detecta igual", () => {
    // En el snapshot un refuerzo es una fila con `tramo_id` nulo y sus horas. No hace falta
    // ninguna regla aparte.
    const antes = snap([]);
    const despues = snap([t({ id: 5, worker_id: 1, dia: SAB, inicio_min: 1080, fin_min: 1320, tramo_id: null })], 2);
    const c = cambiosPorTrabajador(antes, despues);
    assert.equal(c.length, 1);
    assert.equal(c[0].dias[0].tipo, "anadido");
    assert.equal(c[0].dias[0].ahora[0].tramo_id, null);
  });
});

describe("compararSnapshots sigue siendo la única fuente", () => {
  test("los cambios por trabajador salen de su diferencia, no de otro cálculo", () => {
    const V2 = snap([
      t({ id: 1, worker_id: 1, dia: JUE, inicio_min: 1080, fin_min: 1440 }),
      t({ id: 2, worker_id: 2, dia: JUE, inicio_min: 480, fin_min: 960 }),
    ], 2);
    const plano = compararSnapshots(V1, V2);
    const porPersona = cambiosPorTrabajador(V1, V2);
    // Un turno movido son una fila quitada y otra añadida en el conjunto, y UN día modificado
    // para la persona. Las dos vistas cuentan lo mismo desde sitios distintos.
    assert.equal(plano.total, 2);
    assert.equal(porPersona.length, 1);
    assert.equal(porPersona[0].dias.length, 1);
  });
  test("si no hay diferencia, no se agrupa nada", () => {
    assert.equal(compararSnapshots(V1, V1).total, 0);
    assert.deepEqual(cambiosPorTrabajador(V1, V1), []);
  });
});
