import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { revisarCoherencia, cuadraTotal, cuadraIva, contraHistorial } from "../../src/modules/facturas/coherencia.js";

const BUENA = { base_imponible: 100, porcentaje_iva: 21, cuota_iva: 21, total: 121, nif_proveedor: "B17972860" };

describe("base + IVA = total", () => {
  test("una factura bien leída no dice nada", () => {
    assert.equal(cuadraTotal(BUENA), null);
  });
  test("un céntimo de redondeo tampoco: pasa en facturas normales", () => {
    assert.equal(cuadraTotal({ ...BUENA, total: 121.01 }), null);
  });
  test("pero un descuadre de verdad se canta, y se dice cuánto", () => {
    const a = cuadraTotal({ ...BUENA, total: 112 });
    assert.ok(a && a.grave);
    assert.match(a.texto, /121\.00 €, pero el total dice 112\.00 €/);
    assert.match(a.texto, /Alguno de los tres está mal leído/);
  });
  test("caza el clásico: dos cifras bailadas en el total", () => {
    assert.ok(cuadraTotal({ base_imponible: 1024.79, cuota_iva: 215.21, total: 1420 }));
  });
  test("si falta un dato no se inventa un aviso", () => {
    assert.equal(cuadraTotal({ base_imponible: 100 }), null);
    assert.equal(cuadraTotal({}), null);
  });
  test("sin IVA (una factura exenta) la base tiene que ser el total", () => {
    assert.equal(cuadraTotal({ base_imponible: 100, total: 100 }), null);
    assert.ok(cuadraTotal({ base_imponible: 100, total: 121 }));
  });
});

describe("la cuota cuadra con su porcentaje", () => {
  test("el 21 % de 100 son 21", () => {
    assert.equal(cuadraIva(BUENA), null);
  });
  test("si no cuadra se dice cuánto debería ser", () => {
    const a = cuadraIva({ ...BUENA, cuota_iva: 10 });
    assert.ok(a);
    assert.match(a.texto, /21 % de 100\.00 € son 21\.00 €/);
  });
  test("no es grave: puede ser una factura con dos tipos de IVA", () => {
    assert.equal(cuadraIva({ ...BUENA, cuota_iva: 10 }).grave, false);
    assert.match(cuadraIva({ ...BUENA, cuota_iva: 10 }).texto, /varios tipos de IVA/);
  });
  test("y en importes grandes el margen acompaña", () => {
    // 0,5 % de la base: en 10.000 € una diferencia de 40 € puede ser un tipo mixto.
    assert.equal(cuadraIva({ base_imponible: 10000, porcentaje_iva: 21, cuota_iva: 2140 }), null);
    assert.ok(cuadraIva({ base_imponible: 10000, porcentaje_iva: 21, cuota_iva: 1000 }));
  });
  test("sin porcentaje no se comprueba", () => {
    assert.equal(cuadraIva({ base_imponible: 100, cuota_iva: 5 }), null);
  });
});

describe("contra el historial del proveedor", () => {
  const hist = { nifs: ["B17972860"], totales: [380, 410, 395, 430, 405] };

  test("el NIF de siempre no dice nada", () => {
    assert.deepEqual(contraHistorial({ nif_proveedor: "B17972860", total: 400 }, hist), []);
  });
  test("un NIF distinto avisa, pero solo si hay historial suficiente", () => {
    assert.deepEqual(contraHistorial({ nif_proveedor: "B99999999" }, { nifs: ["B1"] }), [],
      "con un solo antecedente no se afirma nada");
    const a = contraHistorial({ nif_proveedor: "B99999999" }, { nifs: ["B17972860", "B17972860"] });
    assert.equal(a.length, 1);
    assert.match(a[0].texto, /no cambia de NIF/);
  });
  test("da igual cómo venga escrito el NIF", () => {
    assert.deepEqual(contraHistorial({ nif_proveedor: "b-17.972.860" }, { nifs: ["B17972860", "B17972860"] }), []);
  });

  test("el punto decimal perdido: 400 € que se leen 40.000 €", () => {
    const a = contraHistorial({ total: 40000 }, hist);
    assert.equal(a.length, 1);
    assert.ok(a[0].grave);
    assert.match(a[0].texto, /lo normal son 405\.00 €/);
    assert.match(a[0].texto, /sobre una cifra o falte una coma/);
  });
  test("un mes fuerte NO es un error", () => {
    assert.deepEqual(contraHistorial({ total: 900 }, hist), [], "el doble de lo normal es plausible");
  });
  test("con poco historial no se juzga el importe", () => {
    assert.deepEqual(contraHistorial({ total: 99999 }, { totales: [400, 410] }), []);
  });
  test("se compara con la MEDIANA, no con la media", () => {
    // Si una factura ya leída mal está en el historial, la media se dispara y taparía a las
    // siguientes. La mediana no se mueve.
    const conBasura = { totales: [380, 410, 395, 430, 405, 999999] };
    assert.equal(contraHistorial({ total: 40000 }, conBasura).length, 1);
  });
});

describe("todo junto", () => {
  test("una factura buena no genera ni un aviso", () => {
    const r = revisarCoherencia(BUENA, { nifs: ["B17972860", "B17972860"], totales: [100, 120, 110, 130] });
    assert.deepEqual(r.avisos, []);
    assert.equal(r.grave, false);
  });
  test("varios problemas a la vez se acumulan", () => {
    const r = revisarCoherencia({ base_imponible: 100, porcentaje_iva: 21, cuota_iva: 10, total: 200 },
      { totales: [100, 110, 105, 120] });
    assert.ok(r.avisos.length >= 2);
    assert.equal(r.grave, true, "el descuadre aritmético es grave");
  });
  test("lo grave se distingue de lo que solo hay que mirar", () => {
    const soloIva = revisarCoherencia({ base_imponible: 100, porcentaje_iva: 21, cuota_iva: 10, total: 110 });
    assert.ok(soloIva.avisos.length);
    assert.equal(soloIva.grave, false);
  });
  test("con datos vacíos no revienta ni inventa avisos", () => {
    assert.deepEqual(revisarCoherencia({}, {}).avisos, []);
    assert.deepEqual(revisarCoherencia().avisos, []);
  });
});
