import { test, describe } from "node:test";
import assert from "node:assert/strict";
// `facturas.js` importa `pdf-lib`, que aquí no está instalado (npm install no funciona en
// local: el lockfile apunta al firewall de Replit). Se carga en tiempo de ejecución y, si
// falta, estos tests se SALTAN con el motivo escrito. Dejarlos en rojo por una dependencia
// que sí existe en producción enseña a ignorar el rojo, que es peor que no tenerlos.
let FACT = null, MOTIVO_SALTO = null;
try { FACT = await import("../../facturas.js"); }
catch (e) { MOTIVO_SALTO = `facturas.js no se puede cargar aquí: ${e.message.split("\n")[0]}`; }


describe("facturas.mesLabelDeFecha", { skip: MOTIVO_SALTO }, () => {
  const { mesLabelDeFecha, filaFacturaSheet } = FACT || {};
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
