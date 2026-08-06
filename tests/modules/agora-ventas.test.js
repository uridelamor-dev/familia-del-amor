// Ágora — resumen de ventas por local (lógica pura).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resumenVentasPorLocal, estadoDatosLocal, ETIQUETA_ESTADO_DATOS, resumenVivoLocal } from "../../src/modules/agora/ventas.js";

describe("resumenVentasPorLocal", () => {
  const rows = [
    { local: "Blanes", dia: "2026-08-01", ventas: "1000", tickets: 40 },
    { local: "Blanes", dia: "2026-08-03", ventas: 1500, tickets: 55 },
    { local: "Lloret", dia: "2026-08-02", ventas: 800, tickets: 30 },
  ];
  test("cuenta días, último día y agrega ventas/tickets", () => {
    const r = resumenVentasPorLocal(rows);
    const b = r.find((x) => x.local === "Blanes");
    assert.equal(b.dias, 2);
    assert.equal(b.ultimoDia, "2026-08-03");
    assert.equal(b.ventasRecientes, 2500);
    assert.equal(b.ticketsRecientes, 95);
  });
  test("ordena por último día desc", () => {
    const r = resumenVentasPorLocal(rows);
    assert.equal(r[0].local, "Blanes"); // 08-03 más reciente que 08-02
  });
  test("acota 'recientes' con desde", () => {
    const r = resumenVentasPorLocal(rows, "2026-08-03");
    const b = r.find((x) => x.local === "Blanes");
    assert.equal(b.dias, 2); // días cuenta todos
    assert.equal(b.ventasRecientes, 1500); // solo 08-03 entra en 'recientes'
  });
  test("tolera filas basura", () => {
    assert.deepEqual(resumenVentasPorLocal([{ dia: "x" }, null]), []);
  });
});

describe("estadoDatosLocal", () => {
  test("clasifica los 4 estados", () => {
    assert.equal(estadoDatosLocal({ configurado: false }), "sin_configurar");
    assert.equal(estadoDatosLocal({ configurado: true, activo: false }), "desactivado");
    assert.equal(estadoDatosLocal({ configurado: true, activo: true, dias: 0 }), "sin_datos");
    assert.equal(estadoDatosLocal({ configurado: true, activo: true, dias: 5 }), "con_datos");
  });
  test("hay etiqueta para cada estado", () => {
    for (const k of ["sin_configurar", "desactivado", "sin_datos", "con_datos"]) assert.ok(ETIQUETA_ESTADO_DATOS[k]);
  });
});

describe("resumenVivoLocal", () => {
  const dias = [
    { dia: "2026-08-04", ventas: 3473.05, tickets: 293 },
    { dia: "2026-08-05", ventas: 3320.50, tickets: 307 },
    { dia: "2026-08-06", ventas: 1948.10, tickets: 230 }, // hoy (en curso)
  ];
  test("separa hoy (en curso), ayer y suma de días cerrados", () => {
    const r = resumenVivoLocal(dias, "2026-08-06");
    assert.equal(r.hoy.ventas, 1948.10);
    assert.equal(r.ayer.dia, "2026-08-05");
    assert.equal(r.total7, 6793.55);   // 3473.05 + 3320.50 (cerrados)
    assert.equal(r.tickets7, 600);
    assert.equal(r.cerrados.length, 2);
  });
  test("sin datos de hoy → hoy null", () => {
    const r = resumenVivoLocal([{ dia: "2026-08-05", ventas: 100, tickets: 10 }], "2026-08-06");
    assert.equal(r.hoy, null);
    assert.equal(r.ayer.dia, "2026-08-05");
  });
});
