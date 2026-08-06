import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFechaNac, esCumpleHoy, hoyMadrid, resumenEnvios, normalizarEstado, construirSegmento, describirAudiencia } from "../../src/modules/campaigns/campaigns.service.js";

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

describe("campaigns.construirSegmento", () => {
  test("limpia vacíos y conserva solo filtros con valor", () => {
    const seg = construirSegmento({ local: "La Tapeta - Blanes", poblacion: "", genero: "F", q: "  " });
    assert.deepEqual(seg, { local: "La Tapeta - Blanes", genero: "F" });
  });
  test("cumple_mes (checkbox) → mes actual inyectado, con cero a la izquierda", () => {
    assert.equal(construirSegmento({ cumple_mes: true }, { mesActual: 8 }).cumple_mes, "08");
    assert.equal(construirSegmento({ cumple_mes: true }, { mesActual: 12 }).cumple_mes, "12");
    assert.ok(!("cumple_mes" in construirSegmento({ cumple_mes: false }, { mesActual: 8 })));
  });
  test("con_email/con_telefono solo si verdaderos; excluir_telefonos y soloOptIn", () => {
    const seg = construirSegmento({ con_email: true, con_telefono: false, excluir_telefonos: ["600", "", "601"], soloOptIn: true });
    assert.equal(seg.con_email, 1);
    assert.ok(!("con_telefono" in seg));
    assert.deepEqual(seg.excluir_telefonos, ["600", "601"]);
    assert.equal(seg.soloOptIn, true);
  });
  test("ignora claves no reconocidas", () => {
    const seg = construirSegmento({ hack: "x", idioma: "ca" });
    assert.deepEqual(seg, { idioma: "ca" });
  });
});

describe("campaigns.describirAudiencia", () => {
  test("compone descripción legible", () => {
    const d = describirAudiencia({ local: "Blanes", genero: "M", con_email: 1, excluir_telefonos: ["a", "b"] });
    assert.match(d, /Local: Blanes/);
    assert.match(d, /Hombres/);
    assert.match(d, /Con email/);
    assert.match(d, /Excluye 2/);
  });
  test("sin filtros → 'Todos los contactos'", () => {
    assert.equal(describirAudiencia({}), "Todos los contactos");
  });
});
