import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { descansosPorDia, areaHabitual, motivoDelDia, esTramoDescanso, PARECE_DESCANSO } from "../../src/modules/horarios/descansos.js";

const DIAS = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"];
const AREAS = [{ id: 1, nombre: "SALA" }, { id: 2, nombre: "COCINA" }];
// La plantilla de la captura de Can Mateu.
const EQUIPO = [
  { id: 10, nombre: "Isa" }, { id: 11, nombre: "Manoli" }, { id: 12, nombre: "Marita" },
  { id: 13, nombre: "Vero" }, { id: 14, nombre: "Alex" }, { id: 15, nombre: "Mateu" },
];
const turno = (worker_id, dia, area_id, inicio_min = 660, fin_min = 960) =>
  ({ worker_id, dia, area_id, tramo_id: area_id === 2 ? 1 : 1, tipo: "turno", inicio_min, fin_min });

/** Lunes a sábado de sala/cocina; el domingo cierra. Es lo que se ve en la captura. */
function semanaCanMateu() {
  const a = [];
  for (const d of DIAS.slice(0, 6)) {
    for (const w of [10, 11, 12]) a.push(turno(w, d, 1));
    a.push(turno(13, d, 2));
    for (const w of [14, 15]) a.push(turno(w, d, 1, 1140, 1500));
  }
  return a;
}

describe("quién libra: el domingo que cierra el local", () => {
  const r = descansosPorDia({ dias: DIAS, trabajadores: EQUIPO, asignaciones: semanaCanMateu(), areas: AREAS });

  test("de lunes a sábado no libra nadie", () => {
    assert.deepEqual(r.totales.slice(0, 6), [0, 0, 0, 0, 0, 0]);
  });
  test("el domingo libran los seis, sin que nadie lo haya escrito", () => {
    assert.equal(r.totales[6], 6);
  });
  test("cada uno sale en SU fila: Vero en COCINA, el resto en SALA", () => {
    const sala = r.areas[0].dias[6].map((x) => x.nombre);
    const cocina = r.areas[1].dias[6].map((x) => x.nombre);
    assert.deepEqual(cocina, ["Vero"]);
    assert.deepEqual(sala.sort(), ["Alex", "Isa", "Manoli", "Marita", "Mateu"]);
  });
  test("librar no lleva etiqueta: es lo normal", () => {
    assert.ok(r.areas[0].dias[6].every((x) => x.motivo === "fiesta" && x.etiqueta === null));
  });
  test("nadie se queda sin área si esa semana ha trabajado algún día", () => {
    assert.deepEqual(r.sinArea, DIAS.map(() => []));
  });
});

describe("quién libra: el descanso entre semana", () => {
  test("si a Marita le quitas el miércoles, aparece librando ese miércoles", () => {
    const asigs = semanaCanMateu().filter((a) => !(a.worker_id === 12 && a.dia === "2026-08-05"));
    const r = descansosPorDia({ dias: DIAS, trabajadores: EQUIPO, asignaciones: asigs, areas: AREAS });
    assert.deepEqual(r.areas[0].dias[2].map((x) => x.nombre), ["Marita"]);
    assert.equal(r.totales[2], 1);
  });

  test("un turno partido no la cuenta dos veces ni la saca de la fila de fiesta", () => {
    const asigs = semanaCanMateu().concat([turno(10, "2026-08-03", 1, 1140, 1440)]);
    const r = descansosPorDia({ dias: DIAS, trabajadores: EQUIPO, asignaciones: asigs, areas: AREAS });
    assert.equal(r.totales[0], 0, "Isa trabaja mañana y tarde: no libra");
  });

  test("quien está en formación NO libra: eso es trabajo", () => {
    const asigs = semanaCanMateu().filter((a) => !(a.worker_id === 12 && a.dia === "2026-08-05"))
      .concat([{ worker_id: 12, dia: "2026-08-05", area_id: 1, tipo: "formacion", inicio_min: 600, fin_min: 840 }]);
    const r = descansosPorDia({ dias: DIAS, trabajadores: EQUIPO, asignaciones: asigs, areas: AREAS });
    assert.equal(r.totales[2], 0);
  });
});

describe("no es lo mismo librar que estar de baja", () => {
  const equipo = EQUIPO;
  const asigs = semanaCanMateu().filter((a) => a.worker_id !== 11); // Manoli no tiene turnos

  test("una baja aprobada sale marcada, no como fiesta a secas", () => {
    const r = descansosPorDia({
      dias: DIAS, trabajadores: equipo, asignaciones: asigs, areas: AREAS,
      ausencias: [{ worker_id: 11, tipo: "baja", desde: "2026-08-01", hasta: "2026-08-31", estado: "aprobada" }],
    });
    const lunes = [...r.areas[0].dias[0], ...r.sinArea[0]];
    const manoli = lunes.find((x) => x.nombre === "Manoli");
    assert.equal(manoli.motivo, "baja");
    assert.equal(manoli.etiqueta, "baja");
  });

  test("las vacaciones solo cubren sus días, ni uno más", () => {
    const r = descansosPorDia({
      dias: DIAS, trabajadores: equipo, asignaciones: asigs, areas: AREAS,
      ausencias: [{ worker_id: 11, tipo: "vacaciones", desde: "2026-08-03", hasta: "2026-08-05" }],
    });
    const dia = (i) => [...r.areas[0].dias[i], ...r.sinArea[i]].find((x) => x.nombre === "Manoli");
    assert.equal(dia(0).motivo, "vacaciones");
    assert.equal(dia(2).motivo, "vacaciones");
    assert.equal(dia(3).motivo, "fiesta", "el jueves ya no son vacaciones: es fiesta");
  });

  test("una ausencia pendiente de aprobar NO tapa la realidad", () => {
    const r = descansosPorDia({
      dias: DIAS, trabajadores: equipo, asignaciones: asigs, areas: AREAS,
      ausencias: [{ worker_id: 11, tipo: "vacaciones", desde: "2026-08-03", hasta: "2026-08-09", estado: "pendiente" }],
    });
    const m = [...r.areas[0].dias[0], ...r.sinArea[0]].find((x) => x.nombre === "Manoli");
    assert.equal(m.motivo, "fiesta");
  });

  test("un turno manda sobre una ausencia: si se le ha puesto turno, trabaja", () => {
    // No es un caso teórico: se aprueban vacaciones y luego se cubre un día suelto.
    const r = descansosPorDia({
      dias: DIAS, trabajadores: EQUIPO, asignaciones: semanaCanMateu(), areas: AREAS,
      ausencias: [{ worker_id: 10, tipo: "vacaciones", desde: "2026-08-03", hasta: "2026-08-09" }],
    });
    assert.equal(r.totales[0], 0);
  });

  test("dentro de la celda, primero quien libra y luego lo demás", () => {
    const asigs2 = semanaCanMateu().filter((a) => a.dia !== "2026-08-06");
    const r = descansosPorDia({
      dias: DIAS, trabajadores: EQUIPO, asignaciones: asigs2, areas: AREAS,
      ausencias: [{ worker_id: 10, tipo: "baja", desde: "2026-08-06", hasta: "2026-08-06" }],
    });
    const jueves = r.areas[0].dias[3];
    assert.equal(jueves[jueves.length - 1].nombre, "Isa", "la baja va al final");
    assert.ok(jueves.slice(0, -1).every((x) => x.motivo === "fiesta"));
  });
});

describe("altas y bajas: no se libra antes de entrar ni después de irse", () => {
  test("quien entra el jueves no aparece librando lunes, martes ni miércoles", () => {
    const nuevo = { id: 20, nombre: "Nuevo", fecha_alta: "2026-08-06" };
    const r = descansosPorDia({ dias: DIAS, trabajadores: [nuevo], asignaciones: [], areas: AREAS });
    assert.deepEqual(r.totales, [0, 0, 0, 1, 1, 1, 1]);
  });
  test("quien se va el martes no aparece el resto de la semana", () => {
    const saliente = { id: 21, nombre: "Saliente", fecha_baja: "2026-08-04" };
    const r = descansosPorDia({ dias: DIAS, trabajadores: [saliente], asignaciones: [], areas: AREAS });
    assert.deepEqual(r.totales, [1, 1, 0, 0, 0, 0, 0]);
  });
});

describe("sinArea: no se inventa dónde va quien no trabaja ningún día", () => {
  test("quien está de vacaciones toda la semana no se coloca en SALA por defecto", () => {
    const r = descansosPorDia({
      dias: DIAS, trabajadores: [{ id: 30, nombre: "Pau" }], asignaciones: [], areas: AREAS,
      ausencias: [{ worker_id: 30, tipo: "vacaciones", desde: "2026-08-01", hasta: "2026-08-31" }],
    });
    assert.equal(r.areas[0].dias[0].length, 0);
    assert.equal(r.areas[1].dias[0].length, 0);
    assert.deepEqual(r.sinArea[0].map((x) => x.nombre), ["Pau"]);
    assert.equal(r.totales[0], 1, "cuenta igual en el total: no se pierde");
  });
});

describe("areaHabitual", () => {
  const asigs = [
    { worker_id: 1, area_id: 1, tipo: "turno" }, { worker_id: 1, area_id: 1, tipo: "turno" },
    { worker_id: 1, area_id: 2, tipo: "turno" },
  ];
  test("la que más repite esa semana", () => {
    assert.equal(areaHabitual(1, asigs, AREAS), "1");
  });
  test("a empate, la que va antes en el cuadrante (para que no baile entre semanas)", () => {
    const emp = [{ worker_id: 2, area_id: 2, tipo: "turno" }, { worker_id: 2, area_id: 1, tipo: "turno" }];
    assert.equal(areaHabitual(2, emp, AREAS), "1");
  });
  test("sin turnos, null: no se adivina", () => {
    assert.equal(areaHabitual(9, asigs, AREAS), null);
  });
  test("una libranza no marca área", () => {
    assert.equal(areaHabitual(3, [{ worker_id: 3, area_id: 1, tipo: "libranza" }], AREAS), null);
  });
});

describe("motivoDelDia", () => {
  const w = { id: 1 };
  test("con turno, no libra", () => {
    assert.equal(motivoDelDia(w, "2026-08-03", [{ tipo: "turno" }]), null);
  });
  test("sin nada, fiesta", () => {
    assert.equal(motivoDelDia(w, "2026-08-03", [], []), "fiesta");
  });
  test("una libranza escrita a mano se respeta tal cual", () => {
    assert.equal(motivoDelDia(w, "2026-08-03", [{ tipo: "libranza" }], []), "libranza");
  });
  test("un tipo de ausencia desconocido no rompe: cae en permiso", () => {
    assert.equal(motivoDelDia(w, "2026-08-03", [], [{ worker_id: 1, tipo: "inventado", desde: "2026-08-01", hasta: "2026-08-31" }]), "permiso");
  });
});

describe("reconocer la fila de descanso", () => {
  test("manda la columna tipo, no el nombre", () => {
    assert.equal(esTramoDescanso({ nombre: "FIESTA", tipo: "turno" }), false);
    assert.equal(esTramoDescanso({ nombre: "LO QUE SEA", tipo: "descanso" }), true);
    assert.equal(esTramoDescanso(null), false);
  });
  test("los nombres que ya se usaban a mano se reconocen al migrar", () => {
    for (const n of ["FIESTA", "fiesta", " Descanso ", "LIBRE", "Festa", "libranza"]) {
      assert.ok(PARECE_DESCANSO.test(n), n);
    }
  });
  test("y no se confunde con un bloque de trabajo que mencione la palabra", () => {
    for (const n of ["FIESTA MAYOR", "TARDE", "MAÑANA", "Refuerzo fiesta"]) {
      assert.ok(!PARECE_DESCANSO.test(n), n);
    }
  });
});
