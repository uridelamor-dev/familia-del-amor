// Dashboard — rangos de periodo (lógica pura).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rangoPreset, diaSemanaLunes, diasEntre, etiquetaRango } from "../../src/modules/dashboard/periodos.js";

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
