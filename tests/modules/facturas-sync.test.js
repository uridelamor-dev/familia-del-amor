import { test, describe } from "node:test";
import assert from "node:assert/strict";
// Estos tests SE SALTABAN en silencio. `facturas.js` importaba `pdf-lib` arriba del todo —una
// dependencia que aquí no está instalada, porque `npm install` no funciona en local— así que el
// módulo entero no se podía cargar y todo esto quedaba en «skip». Ahora `pdf-lib` se carga solo
// cuando hace falta (combinar archivos), el módulo se importa sin problema, y estas
// comprobaciones vuelven a correr de verdad. Un test que se salta no protege de nada.
import * as FACT from "../../facturas.js";
const MOTIVO_SALTO = false;
// Al nivel del fichero: estaba dentro del primer `describe`, así que el segundo no las veía.
// Un fallo que llevaba escondido justo porque estos tests no llegaban a ejecutarse.
const { mesLabelDeFecha, filaFacturaSheet } = FACT;


describe("facturas.mesLabelDeFecha", { skip: MOTIVO_SALTO }, () => {
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

describe("facturas.filaFacturaSheet", { skip: MOTIVO_SALTO }, () => {
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
