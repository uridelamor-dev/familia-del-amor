// Mantenimiento preventivo: cálculo de fechas, validación y qué toca generar.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  sumarMeses, sumarDias, siguienteFecha, primeraFecha, validarPlan,
  planesQueTocan, alCompletar, textoCadencia,
} from "../../src/modules/mantenimiento/planes.js";

const HOY = "2026-09-03";
const plan = (o = {}) => ({
  id: 1, local: "La Tapeta - Blanes", titulo: "Filtros de aire", descripcion: null,
  cada_n: 3, unidad: "meses", aviso_dias: 0, ultima_en: null, proxima_en: HOY, activo: true, ...o,
});

describe("Preventivo · sumar meses sin desbordar el mes", () => {
  test("un caso normal", () => assert.equal(sumarMeses("2026-01-15", 3), "2026-04-15"));

  test("31 de enero + 1 mes es el 28 de febrero, NO el 3 de marzo", () => {
    // Sin tope, JavaScript desborda y un plan mensual creado un día 31 se va desplazando solo.
    assert.equal(sumarMeses("2026-01-31", 1), "2026-02-28");
  });

  test("y en año bisiesto, el 29", () => assert.equal(sumarMeses("2028-01-31", 1), "2028-02-29"));

  test("31 de marzo + 1 mes es el 30 de abril", () => assert.equal(sumarMeses("2026-03-31", 1), "2026-04-30"));

  test("cruza el año", () => {
    assert.equal(sumarMeses("2026-11-10", 3), "2027-02-10");
    assert.equal(sumarMeses("2026-04-10", 12), "2027-04-10");
  });

  test("el tope NO se arrastra: 31 ene → 28 feb → 28 mar (cada salto parte del original)", () => {
    // Es el comportamiento aceptado: la fecha se recalcula al completar, desde la real.
    assert.equal(sumarMeses(sumarMeses("2026-01-31", 1), 1), "2026-03-28");
  });

  test("una fecha ilegible devuelve null, no una fecha inventada", () => {
    for (const v of ["", "ayer", "2026-13-01x", null, undefined, "03/09/2026"]) {
      assert.equal(sumarMeses(v, 1), null);
      assert.equal(sumarDias(v, 1), null);
    }
  });
});

describe("Preventivo · siguienteFecha", () => {
  test("respeta la unidad", () => {
    assert.equal(siguienteFecha("2026-01-01", { cada_n: 3, unidad: "meses" }), "2026-04-01");
    assert.equal(siguienteFecha("2026-01-01", { cada_n: 15, unidad: "dias" }), "2026-01-16");
  });
  test("una cadencia sin sentido devuelve null", () => {
    for (const c of [{ cada_n: 0, unidad: "meses" }, { cada_n: -3, unidad: "meses" },
                     { cada_n: 1.5, unidad: "meses" }, { cada_n: 3, unidad: "lunas" }, {}]) {
      assert.equal(siguienteFecha("2026-01-01", c), null);
    }
  });
});

describe("Preventivo · alta del plan", () => {
  test("si nunca se ha hecho, toca HOY (aparece al momento, no dentro de tres meses)", () => {
    assert.equal(primeraFecha({ ultima_en: null, cada_n: 3, unidad: "meses" }, HOY), HOY);
  });

  test("si se hizo hace poco, toca cuando toque", () => {
    assert.equal(primeraFecha({ ultima_en: "2026-08-01", cada_n: 3, unidad: "meses" }, HOY), "2026-11-01");
  });

  test("si se hizo hace mucho, toca HOY y no una fecha del pasado", () => {
    assert.equal(primeraFecha({ ultima_en: "2020-01-01", cada_n: 3, unidad: "meses" }, HOY), HOY);
  });
});

describe("Preventivo · validar", () => {
  const bueno = { local: "La Tapeta - Blanes", titulo: "Filtros", cada_n: 3, unidad: "meses" };

  test("un plan correcto pasa y sale normalizado", () => {
    const r = validarPlan({ ...bueno, descripcion: "  quitar y lavar  " }, HOY);
    assert.ok(r.ok);
    assert.equal(r.plan.descripcion, "quitar y lavar");
    assert.equal(r.plan.aviso_dias, 0, "por defecto, sin antelación");
    assert.equal(r.plan.proxima_en, HOY);
    assert.equal(r.plan.ultima_en, null);
  });

  test("faltan campos", () => {
    assert.match(validarPlan({ ...bueno, local: "" }, HOY).error, /establecimiento/);
    assert.match(validarPlan({ ...bueno, titulo: "  " }, HOY).error, /título/);
  });

  test("periodicidad inválida", () => {
    assert.match(validarPlan({ ...bueno, unidad: "lunas" }, HOY).error, /días o en meses/);
    assert.match(validarPlan({ ...bueno, cada_n: 0 }, HOY).error, /1 o más/);
    assert.match(validarPlan({ ...bueno, cada_n: "tres" }, HOY).error, /1 o más/);
  });

  test("topes: una errata de un cero no crea un plan a 300 años", () => {
    assert.ok(!validarPlan({ ...bueno, cada_n: 4000 }, HOY).ok);
    assert.ok(!validarPlan({ ...bueno, unidad: "dias", cada_n: 1 }, HOY).ok, "lo diario no es mantenimiento");
    assert.ok(validarPlan({ ...bueno, unidad: "dias", cada_n: 15 }, HOY).ok);
  });

  test("el aviso previo no puede comerse el ciclo entero", () => {
    // Avisar con 30 días de algo que toca cada 15 sería generar la siguiente antes de cerrar
    // la anterior, y la lista se llenaría sola.
    assert.match(validarPlan({ ...bueno, unidad: "dias", cada_n: 15, aviso_dias: 30 }, HOY).error, /más largo que el propio ciclo/);
    assert.ok(validarPlan({ ...bueno, unidad: "dias", cada_n: 15, aviso_dias: 7 }, HOY).ok);
    assert.ok(validarPlan({ ...bueno, cada_n: 12, unidad: "meses", aviso_dias: 30 }, HOY).ok);
  });

  test("aviso fuera de rango", () => {
    assert.ok(!validarPlan({ ...bueno, aviso_dias: -1 }, HOY).ok);
    assert.ok(!validarPlan({ ...bueno, aviso_dias: 200 }, HOY).ok);
  });

  test("fecha de la última vez ilegible", () => {
    assert.match(validarPlan({ ...bueno, ultima_en: "el verano pasado" }, HOY).error, /no es válida/);
  });
});

describe("Preventivo · qué toca generar hoy", () => {
  test("el que vence hoy, sí", () => {
    assert.equal(planesQueTocan([plan()], HOY).length, 1);
  });

  test("el que vence mañana, no", () => {
    assert.equal(planesQueTocan([plan({ proxima_en: "2026-09-04" })], HOY).length, 0);
  });

  test("el que venció hace tiempo, sí, y con la fecha en que TOCABA", () => {
    const [t] = planesQueTocan([plan({ proxima_en: "2026-06-01" })], HOY);
    assert.equal(t.vence_en, "2026-06-01", "guardar hoy escondería el retraso");
  });

  test("con aviso previo se adelanta, y ni un día antes", () => {
    const p = plan({ proxima_en: "2026-09-18", aviso_dias: 15 });   // avisa desde el 03-09
    assert.equal(planesQueTocan([p], "2026-09-02").length, 0);
    assert.equal(planesQueTocan([p], "2026-09-03").length, 1);
  });

  test("si su incidencia anterior sigue abierta, NO se genera otra", () => {
    // Dos tareas no arreglan lo que no se hizo; solo ensucian la lista.
    assert.equal(planesQueTocan([plan()], HOY, new Set([1])).length, 0);
  });

  test("un plan pausado no genera nada", () => {
    for (const v of [false, 0]) assert.equal(planesQueTocan([plan({ activo: v })], HOY).length, 0);
  });

  test("un plan con la fecha rota se salta, sin romper a los demás", () => {
    const r = planesQueTocan([plan({ id: 1, proxima_en: "cuando sea" }), plan({ id: 2 })], HOY);
    assert.deepEqual(r.map((x) => x.plan_id), [2]);
  });

  test("sin descripción propia, se pone una que explica de dónde sale", () => {
    assert.match(planesQueTocan([plan()], HOY)[0].descripcion, /periódico/);
  });

  test("hoy ilegible ⇒ no se genera nada (mejor nada que fechas inventadas)", () => {
    assert.deepEqual(planesQueTocan([plan()], "ayer"), []);
  });
});

describe("Preventivo · al dar la tarea por hecha", () => {
  test("la próxima cuenta desde el día REAL, no desde el que tocaba", () => {
    // Tocaba el 1 de junio, se hizo el 20. La próxima es el 20 de septiembre.
    const r = alCompletar(plan(), "2026-06-20", "2026-06-20");
    assert.equal(r.ultima_en, "2026-06-20");
    assert.equal(r.proxima_en, "2026-09-20");
  });

  test("cerrar una tarea muy vieja NO desata las que se saltó", () => {
    // Se cierra hoy una de hace tres años: la próxima queda por delante de hoy, una sola vez.
    const r = alCompletar(plan(), "2023-01-10", HOY);
    assert.ok(r.proxima_en > HOY, `la próxima (${r.proxima_en}) tiene que ser futura`);
    assert.equal(r.proxima_en, "2026-10-10");
  });

  test("una fecha ilegible no mueve el plan", () => {
    assert.equal(alCompletar(plan(), "el martes", HOY), null);
  });
});

describe("Preventivo · cómo se lee la periodicidad", () => {
  const casos = [
    [{ cada_n: 1, unidad: "meses" }, "cada mes"],
    [{ cada_n: 3, unidad: "meses" }, "cada 3 meses"],
    [{ cada_n: 12, unidad: "meses" }, "cada año"],
    [{ cada_n: 24, unidad: "meses" }, "cada 2 años"],
    [{ cada_n: 15, unidad: "dias" }, "cada 15 días"],
    [{ cada_n: 0, unidad: "meses" }, ""],
  ];
  for (const [c, esperado] of casos) {
    test(`${JSON.stringify(c)} → «${esperado}»`, () => assert.equal(textoCadencia(c), esperado));
  }
});
