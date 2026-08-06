import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFechaNac, esCumpleHoy, hoyMadrid, resumenEnvios, normalizarEstado } from "../../src/modules/campaigns/campaigns.service.js";

describe("campaigns.parseFechaNac", () => {
  test("ISO y DD/MM/AAAA", () => {
    assert.deepEqual(parseFechaNac("1990-05-14"), { mm: 5, dd: 14 });
    assert.deepEqual(parseFechaNac("14/05/1990"), { mm: 5, dd: 14 });
    assert.deepEqual(parseFechaNac("14-05-90"), { mm: 5, dd: 14 });
  });
  test("vacío o inválido ⇒ null", () => {
    assert.equal(parseFechaNac(""), null);
    assert.equal(parseFechaNac("no-fecha"), null);
    assert.equal(parseFechaNac(null), null);
  });
});

describe("campaigns.esCumpleHoy", () => {
  test("coincide mes y día independientemente del año", () => {
    assert.equal(esCumpleHoy("1990-05-14", { mm: 5, dd: 14 }), true);
    assert.equal(esCumpleHoy("14/05/1985", { mm: 5, dd: 14 }), true);
    assert.equal(esCumpleHoy("1990-05-15", { mm: 5, dd: 14 }), false);
    assert.equal(esCumpleHoy("", { mm: 5, dd: 14 }), false);
  });
});

describe("campaigns.hoyMadrid", () => {
  test("deriva mm/dd de una fecha inyectada", () => {
    const h = hoyMadrid(new Date("2026-08-06T10:00:00Z"));
    assert.equal(h.mm, 8);
    assert.equal(h.dd, 6);
    assert.equal(h.iso, "2026-08-06");
  });
});

describe("campaigns.resumenEnvios", () => {
  test("cuenta enviados vs errores", () => {
    const r = resumenEnvios([{ estado: "enviado" }, { estado: "error" }, { estado: "enviado" }]);
    assert.deepEqual(r, { enviados: 2, errores: 1, total: 3 });
  });
});

describe("campaigns.normalizarEstado", () => {
  test("valores conocidos y fallback a borrador", () => {
    assert.equal(normalizarEstado("Programada"), "programada");
    assert.equal(normalizarEstado("xxx"), "borrador");
    assert.equal(normalizarEstado(undefined), "borrador");
  });
});
