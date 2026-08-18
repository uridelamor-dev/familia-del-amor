// El gasto que es de una empresa entera, no de un local.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { repartirImporte, pesosPorVentas, textoReparto, parteDe, imputarGastoEmpresa } from "../../src/modules/facturas/reparto.js";

const LOCALES = ["Blanes", "Lloret", "Girona"];

describe("repartir sin perder céntimos", () => {
  test("100 € entre tres suman 100 €, no 99,99", () => {
    // Ese céntimo, por doce meses y varias empresas, aparece en el cierre y nadie sabe de dónde
    // sale.
    const r = repartirImporte(100, LOCALES.map((l) => ({ local: l, peso: 1 })));
    assert.equal(r.reduce((s, x) => s + x.importe, 0).toFixed(2), "100.00");
    assert.deepEqual(r.map((x) => x.importe).sort(), [33.33, 33.33, 33.34]);
  });

  test("proporcional a las ventas", () => {
    const r = repartirImporte(300, [
      { local: "Blanes", peso: 3000 }, { local: "Lloret", peso: 2000 }, { local: "Girona", peso: 1000 },
    ]);
    assert.deepEqual(r, [{ local: "Blanes", importe: 150 }, { local: "Lloret", importe: 100 }, { local: "Girona", importe: 50 }]);
  });

  test("y con pesos raros sigue cuadrando al céntimo", () => {
    const r = repartirImporte(1234.57, [{ local: "A", peso: 7 }, { local: "B", peso: 11 }, { local: "C", peso: 13 }]);
    assert.equal(r.reduce((s, x) => s + x.importe, 0).toFixed(2), "1234.57");
  });

  test("si todos los pesos son cero, se reparte a partes iguales", () => {
    // Devolver ceros dejaría el gasto sin asignar a nadie y sin decirlo.
    const r = repartirImporte(90, LOCALES.map((l) => ({ local: l, peso: 0 })));
    assert.deepEqual(r.map((x) => x.importe), [30, 30, 30]);
  });

  test("sin locales no se reparte nada", () => {
    assert.deepEqual(repartirImporte(100, []), []);
  });
});

describe("el freno: un local sin ventas no puede quedarse fuera", () => {
  test("con ventas de todos, se reparte por ventas", () => {
    const p = pesosPorVentas([{ local: "Blanes", ventas: 100 }, { local: "Lloret", ventas: 50 }, { local: "Girona", ventas: 50 }], LOCALES);
    assert.equal(p.base, "ventas");
    assert.deepEqual(p.faltan, []);
  });

  test("si a uno le faltan, se reparte a partes iguales ENTRE TODOS", () => {
    // Repartir por ventas dejándolo fuera concentraría el gasto en los demás: no es más justo,
    // es un número falso.
    const p = pesosPorVentas([{ local: "Blanes", ventas: 100 }, { local: "Lloret", ventas: 50 }], LOCALES);
    assert.equal(p.base, "iguales");
    assert.deepEqual(p.faltan, ["Girona"]);
    assert.deepEqual(p.pesos.map((x) => x.peso), [1, 1, 1]);
  });

  test("un local con ventas a cero cuenta como que faltan", () => {
    // Cero ventas en el mes de la factura es casi siempre «no hay dato», no «no vendió nada».
    const p = pesosPorVentas([{ local: "Blanes", ventas: 100 }, { local: "Lloret", ventas: 0 }, { local: "Girona", ventas: 10 }], LOCALES);
    assert.equal(p.base, "iguales");
  });
});

describe("y se dice con qué se ha repartido", () => {
  test("por ventas", () => {
    assert.match(textoReparto({ base: "ventas", locales: LOCALES }), /según sus ventas/);
  });

  test("a partes iguales, diciendo a cuántos les faltan las ventas", () => {
    // Un número repartido sin explicación parece un número medido.
    assert.match(textoReparto({ base: "iguales", faltan: ["Girona"], locales: LOCALES }), /partes iguales.*faltan ventas de 1/);
  });
});

describe("lo que le toca a un local", () => {
  const pesos = [{ local: "Blanes", peso: 2 }, { local: "Lloret", peso: 1 }];
  test("su parte", () => {
    assert.equal(parteDe("Blanes", 300, pesos), 200);
  });

  test("y cero si ese local no es de la empresa", () => {
    // Preguntar por un local ajeno no puede sumar nada.
    assert.equal(parteDe("Girona", 300, pesos), 0);
  });
});

// ── Imputar el gasto de empresa al sumar por local ─────────────────────────────
const LOC_EMP = [
  { local: "Blanes", empresa: "Del Amor Uriel SLU" },
  { local: "Lloret", empresa: "Del Amor Uriel SLU" },
  { local: "Girona", empresa: "Del Amor Uriel SLU" },
];
const suma = (rows, c = "total") => Math.round(rows.reduce((s, r) => s + (Number(r[c]) || 0), 0) * 100) / 100;

describe("imputar el gasto de empresa a cada local", () => {
  test("sin facturas de empresa, el gasto por local no se toca", () => {
    const base = [{ local: "Blanes", total: 300 }, { local: "Lloret", total: 100 }];
    const { porLocal, repartos } = imputarGastoEmpresa({ base, locEmp: LOC_EMP });
    assert.deepEqual(porLocal.map((r) => [r.local, r.total]), [["Blanes", 300], ["Lloret", 100]]);
    assert.equal(repartos.length, 0);
  });

  test("LA INVARIANTE: la suma total es la misma antes y después", () => {
    // Esto no crea ni destruye gasto, solo cambia a quién se le imputa. Si el total se moviera,
    // el dashboard y Compras dejarían de cuadrar y no habría forma de saber cuál miente.
    const base = [{ local: "Blanes", total: 1000 }, { local: "Lloret", total: 500 }, { local: "Girona", total: 250 }];
    const { porLocal } = imputarGastoEmpresa({
      base, locEmp: LOC_EMP,
      deEmpresa: [{ empresa: "Del Amor Uriel SLU", total: 900 }],
      ventas: [{ local: "Blanes", ventas: 60 }, { local: "Lloret", ventas: 30 }, { local: "Girona", ventas: 10 }],
    });
    assert.equal(suma(porLocal), 1750 + 900);
  });

  test("se reparte según las ventas, y cada fila dice cuánto es suyo y cuánto le han imputado", () => {
    const { porLocal, repartos } = imputarGastoEmpresa({
      base: [{ local: "Blanes", total: 1000 }, { local: "Lloret", total: 500 }, { local: "Girona", total: 250 }],
      locEmp: LOC_EMP,
      deEmpresa: [{ empresa: "Del Amor Uriel SLU", total: 900 }],
      ventas: [{ local: "Blanes", ventas: 60 }, { local: "Lloret", ventas: 30 }, { local: "Girona", ventas: 10 }],
    });
    const b = porLocal.find((r) => r.local === "Blanes");
    assert.equal(b.propio, 1000);
    assert.equal(b.deEmpresa, 540);   // el 60 % de 900
    assert.equal(b.total, 1540);
    assert.equal(porLocal.find((r) => r.local === "Girona").deEmpresa, 90);
    assert.match(repartos[0].texto, /según sus ventas/);
  });

  test("un local de la empresa que no tiene gasto propio aparece igual", () => {
    // Si no apareciera, su parte se perdería y además el local parecería no existir.
    const { porLocal } = imputarGastoEmpresa({
      base: [{ local: "Blanes", total: 100 }],
      locEmp: LOC_EMP,
      deEmpresa: [{ empresa: "Del Amor Uriel SLU", total: 300 }],
    });
    const g = porLocal.find((r) => r.local === "Girona");
    assert.ok(g, "Girona tiene que salir aunque no tenga facturas propias");
    assert.equal(g.propio, 0);
    assert.equal(g.total, 100);
    assert.equal(suma(porLocal), 400);
  });

  test("sin ventas de alguno se reparte a partes iguales y el texto lo dice", () => {
    const { porLocal, repartos } = imputarGastoEmpresa({
      base: [], locEmp: LOC_EMP,
      deEmpresa: [{ empresa: "Del Amor Uriel SLU", total: 100 }],
      ventas: [{ local: "Blanes", ventas: 900 }],   // faltan Lloret y Girona
    });
    assert.equal(suma(porLocal), 100);
    assert.match(repartos[0].texto, /partes iguales/);
    assert.match(repartos[0].texto, /faltan ventas de 2/);
  });

  test("una empresa sin locales configurados se DICE, no se pierde en silencio", () => {
    // Es el caso peligroso: la factura ya está fuera del gasto propio, así que si tampoco se
    // reparte, ese dinero desaparece de la suma sin que nadie lo note.
    const { porLocal, sinRepartir } = imputarGastoEmpresa({
      base: [{ local: "Blanes", total: 100 }],
      locEmp: LOC_EMP,
      deEmpresa: [{ empresa: "Otra Sociedad SL", total: 400 }],
    });
    assert.equal(suma(porLocal), 100);
    assert.deepEqual(sinRepartir, [{ empresa: "Otra Sociedad SL", total: 400 }]);
  });

  test("los céntimos no se pierden: 100 € entre tres", () => {
    const { porLocal } = imputarGastoEmpresa({
      base: [], locEmp: LOC_EMP,
      deEmpresa: [{ empresa: "Del Amor Uriel SLU", total: 100 }],
    });
    assert.equal(suma(porLocal), 100);
  });

  test("se conservan las demás columnas de la fila, como el número de facturas", () => {
    const { porLocal } = imputarGastoEmpresa({
      base: [{ local: "Blanes", total: 100, num: 7 }],
      locEmp: LOC_EMP,
      deEmpresa: [{ empresa: "Del Amor Uriel SLU", total: 30 }],
    });
    assert.equal(porLocal.find((r) => r.local === "Blanes").num, 7);
  });
});
