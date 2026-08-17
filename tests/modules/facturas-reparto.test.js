// El gasto que es de una empresa entera, no de un local.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { repartirImporte, pesosPorVentas, textoReparto, parteDe } from "../../src/modules/facturas/reparto.js";

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
