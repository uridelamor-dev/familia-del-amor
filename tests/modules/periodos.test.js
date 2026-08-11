// Dashboard — rangos de periodo (lógica pura).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rangoPreset, diaSemanaLunes, diasEntre, etiquetaRango, rangoAnterior, variacion } from "../../src/modules/dashboard/periodos.js";

describe("rangoPreset", () => {
  const hoy = "2026-08-06"; // jueves
  test("hoy y ayer son un solo día", () => {
    assert.deepEqual(rangoPreset("hoy", hoy), { preset: "hoy", from: "2026-08-06", to: "2026-08-06", label: "Hoy" });
    assert.deepEqual(rangoPreset("ayer", hoy), { preset: "ayer", from: "2026-08-05", to: "2026-08-05", label: "Ayer" });
  });
  test("semana = lunes de esta semana → hoy", () => {
    const r = rangoPreset("semana", hoy);
    assert.equal(r.from, "2026-08-03"); // lunes
    assert.equal(r.to, "2026-08-06");
  });
  test("mes = día 1 del mes → hoy", () => {
    const r = rangoPreset("mes", hoy);
    assert.equal(r.from, "2026-08-01");
    assert.equal(r.to, "2026-08-06");
  });
  test("preset desconocido → semana", () => {
    assert.equal(rangoPreset("xxx", hoy).preset, "semana");
  });
  test("semana en lunes = ese mismo día", () => {
    assert.equal(rangoPreset("semana", "2026-08-03").from, "2026-08-03");
  });
});

describe("diaSemanaLunes", () => {
  test("lunes=0 … domingo=6", () => {
    assert.equal(diaSemanaLunes("2026-08-03"), 0);
    assert.equal(diaSemanaLunes("2026-08-06"), 3);
    assert.equal(diaSemanaLunes("2026-08-09"), 6);
  });
});

describe("diasEntre / etiquetaRango", () => {
  test("cuenta días inclusive", () => {
    assert.equal(diasEntre("2026-08-03", "2026-08-06"), 4);
    assert.equal(diasEntre("2026-08-06", "2026-08-06"), 1);
    assert.equal(diasEntre("2026-08-06", "2026-08-01"), 0); // invertido
  });
  test("etiqueta", () => {
    assert.equal(etiquetaRango("2026-08-06", "2026-08-06"), "2026-08-06");
    assert.equal(etiquetaRango("2026-08-01", "2026-08-06"), "2026-08-01 → 2026-08-06");
  });
});

// ── Contra qué se compara ───────────────────────────────────────────────────
// Una cifra sola no dice nada: «17.000 €» solo significa algo al lado de con cuánto se compara.
// Y la comparación tiene que ser la que haría una persona, no la que sale de restar días.

describe("rangoAnterior — el mes", () => {
  test("un mes entero se compara con el mes entero anterior, aunque tenga otros días", () => {
    // Agosto (31) contra julio (31), pero marzo (31) contra febrero (28). Restando días,
    // marzo se compararía con «los 31 días de antes», que empiezan en enero: sin sentido.
    assert.deepEqual(rangoAnterior("2026-08-01", "2026-08-31", "mes"),
      { from: "2026-07-01", to: "2026-07-31", etiqueta: "julio" });
    assert.deepEqual(rangoAnterior("2026-03-01", "2026-03-31", "mes"),
      { from: "2026-02-01", to: "2026-02-28", etiqueta: "febrero" });
  });

  test("enero se compara con diciembre del año anterior", () => {
    assert.deepEqual(rangoAnterior("2026-01-01", "2026-01-31", "mes"),
      { from: "2025-12-01", to: "2025-12-31", etiqueta: "diciembre" });
  });

  test("«lo que va de mes» se compara con el MISMO trozo del mes anterior", () => {
    // Del 1 al 11 de agosto contra del 1 al 11 de julio. Restando once días saldría del 21 al
    // 31 de julio: otro trozo del mes, con otro ritmo, y el número no valdría nada.
    assert.deepEqual(rangoAnterior("2026-08-01", "2026-08-11", "mes"),
      { from: "2026-07-01", to: "2026-07-11", etiqueta: "julio" });
  });

  test("y no se pasa del último día del mes anterior", () => {
    assert.deepEqual(rangoAnterior("2026-05-01", "2026-05-30", "mes"),
      { from: "2026-04-01", to: "2026-04-30", etiqueta: "abril" });
    assert.deepEqual(rangoAnterior("2026-03-01", "2026-03-30", "mes"),
      { from: "2026-02-01", to: "2026-02-28", etiqueta: "febrero" });
  });
});

describe("rangoAnterior — la semana (lo que más se equivoca)", () => {
  test("«lo que va de semana» se compara con los MISMOS días de la semana pasada", () => {
    // ESTE es el caso que importa: lunes y martes contra el lunes y el martes de la semana
    // pasada. Restando dos días se compararían con el SÁBADO y el DOMINGO — en un restaurante
    // eso no es una comparación, es un disparate que encima parece un dato.
    assert.deepEqual(rangoAnterior("2026-08-10", "2026-08-11", "semana"),
      { from: "2026-08-03", to: "2026-08-04", etiqueta: "la semana pasada" });
  });

  test("una semana entera, con la semana entera anterior", () => {
    assert.deepEqual(rangoAnterior("2026-08-10", "2026-08-16", "semana"),
      { from: "2026-08-03", to: "2026-08-09", etiqueta: "la semana pasada" });
  });

  test("y a caballo de dos meses no se lía", () => {
    assert.deepEqual(rangoAnterior("2026-07-27", "2026-08-02", "semana"),
      { from: "2026-07-20", to: "2026-07-26", etiqueta: "la semana pasada" });
  });
});

describe("rangoAnterior — el resto", () => {
  test("un solo día se compara con el día anterior", () => {
    assert.deepEqual(rangoAnterior("2026-08-11", "2026-08-11", "hoy"),
      { from: "2026-08-10", to: "2026-08-10", etiqueta: "ayer" });
  });

  test("un rango a mano se compara con el trozo de antes del mismo tamaño", () => {
    assert.deepEqual(rangoAnterior("2026-05-03", "2026-06-20", "custom"),
      { from: "2026-03-15", to: "2026-05-02", etiqueta: "el periodo anterior" });
  });

  test("sin preset se adivina, y se adivina bien", () => {
    // Siete días que empiezan el 1 son una semana, no un mes: se comparan con los siete de
    // antes (mismos días de la semana), no con el 1-7 del mes pasado.
    assert.deepEqual(rangoAnterior("2026-08-01", "2026-08-07"),
      { from: "2026-07-25", to: "2026-07-31", etiqueta: "la semana pasada" });
    // Veinticinco días desde el 1 sí son «lo que va de mes».
    assert.equal(rangoAnterior("2026-06-01", "2026-06-25").etiqueta, "mayo");
  });

  test("un rango imposible no se compara con nada", () => {
    assert.equal(rangoAnterior("2026-08-16", "2026-08-10"), null);
    assert.equal(rangoAnterior("", "2026-08-10"), null);
    assert.equal(rangoAnterior("ayer", "hoy"), null);
  });
});

describe("variacion", () => {
  test("sube y baja en porcentaje, con un decimal", () => {
    assert.equal(variacion(120, 100), 20);
    assert.equal(variacion(80, 100), -20);
    assert.equal(variacion(133, 100), 33);
  });

  test("sin dato anterior NO se inventa un porcentaje", () => {
    // «+100 %» respecto a nada no es una subida, es un estreno. Y un porcentaje falso en una
    // tarjeta se lee como un dato bueno: mejor no enseñar nada.
    assert.equal(variacion(500, 0), null);
    assert.equal(variacion(500, null), null);
    assert.equal(variacion(500, undefined), null);
    assert.equal(variacion(null, 100), null);
  });

  test("con un anterior negativo se mide contra su tamaño, no contra su signo", () => {
    // Pasar de −100 € de resultado a −50 € es una mejora del 50 %, no un −50 %.
    assert.equal(variacion(-50, -100), 50);
  });
});
