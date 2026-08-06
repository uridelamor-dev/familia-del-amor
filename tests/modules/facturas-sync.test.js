import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mesLabelDeFecha, filaFacturaSheet } from "../../facturas.js";

describe("facturas.mesLabelDeFecha", () => {
  test("fecha ISO → 'Mes AAAA' en español", () => {
    assert.equal(mesLabelDeFecha("2026-08-06"), "Agosto 2026");
    assert.equal(mesLabelDeFecha("2026-01-15"), "Enero 2026");
    assert.equal(mesLabelDeFecha("2025-12-31"), "Diciembre 2025");
  });
  test("acepta timestamp con hora y descarta inválidos", () => {
    assert.equal(mesLabelDeFecha("2026-03-02T09:00:00"), "Marzo 2026");
    assert.equal(mesLabelDeFecha("no-fecha"), null);
  });
});

describe("facturas.filaFacturaSheet", () => {
  test("mapea una factura de BD a la fila del Sheet (orden CABECERAS, 13 col)", () => {
    const f = { fecha: "2026-08-01", numero_factura: "F-22", tipo: "factura", proveedor: "Makro", nif: "B123", concepto: "Bebidas", base_imponible: 1000, porcentaje_iva: 21, cuota_iva: 210, total: 1210, canal: "Manual", drive_url: "http://d/x", creado_en: "2026-08-06 10:00" };
    const fila = filaFacturaSheet(f);
    assert.equal(fila.length, 13);
    assert.deepEqual(fila, ["2026-08-01", "F-22", "factura", "Makro", "B123", "Bebidas", 1000, 21, 210, 1210, "Manual", "http://d/x", "2026-08-06 10:00"]);
  });
  test("nulos → cadena vacía (no rompe el Sheet)", () => {
    const fila = filaFacturaSheet({ proveedor: "X" });
    assert.equal(fila.length, 13);
    assert.equal(fila[0], ""); assert.equal(fila[3], "X"); assert.equal(fila[10], "");
  });
});
