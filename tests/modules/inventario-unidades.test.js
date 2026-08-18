// Las unidades de inventario y cómo se adivinan de una factura.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UNIDADES, esUnidadValida, unidadDeFactura, unidadSugerida } from "../../src/modules/inventario/unidades.js";

describe("traducir la unidad que viene en la factura", () => {
  test("las escrituras habituales se reconocen", () => {
    for (const [txt, esperado] of [
      ["UD", "unidades"], ["uds.", "unidades"], ["U", "unidades"], ["Pza", "unidades"],
      ["KG", "kilos"], ["Kgs", "kilos"], ["kilo", "kilos"],
      ["L", "litros"], ["LT", "litros"], ["Litro", "litros"],
      ["CJ", "cajas"], ["CAJA", "cajas"], ["BOT.", "botellas"], ["Bolsa", "bolsas"],
      ["BARRIL", "barriles"], ["Pack", "packs"],
    ]) assert.equal(unidadDeFactura(txt), esperado, txt);
  });

  test("lo que NO se reconoce devuelve null, nunca «unidades»", () => {
    // Es la decisión que sostiene toda la pantalla. Caer en «unidades» por defecto dejaría un
    // dato inventado con la misma pinta que uno leído, y el stock necesario se pondría sobre
    // una unidad que nadie ha visto.
    for (const txt of ["PACK 3", "BID", "XYZ", "", null, undefined, "  ", "docena"]) {
      assert.equal(unidadDeFactura(txt), null, JSON.stringify(txt));
    }
  });
});

describe("qué unidad se propone para un producto", () => {
  test("una sola y reconocida, esa", () => {
    assert.equal(unidadSugerida(["kg"]), "kilos");
    assert.equal(unidadSugerida(["CJ", "caja", "Cajas"]), "cajas");
  });
  test("dos distintas, ninguna", () => {
    // Con «kg» en unas facturas y «ud» en otras, elegir cualquiera es inventarse el dato.
    assert.equal(unidadSugerida(["kg", "ud"]), null);
  });
  test("sin unidades o solo con desconocidas, ninguna", () => {
    assert.equal(unidadSugerida([]), null);
    assert.equal(unidadSugerida(null), null);
    assert.equal(unidadSugerida(["BID", "XYZ"]), null);
  });
});

describe("la lista de unidades es la misma en el servidor y en el panel", () => {
  test("UNIDADES coincide con INV_UNIDADES de app.js", () => {
    // Vivía SOLO en el navegador, así que el servidor aceptaba cualquier texto. Si se separan,
    // el panel ofrece una unidad que el servidor rechaza (o al revés) y nadie lo ve venir.
    const app = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");
    const m = app.match(/const INV_UNIDADES = (\[[^\]]*\]);/);
    assert.ok(m, "sigue existiendo INV_UNIDADES en app.js");
    assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), UNIDADES);
  });
  test("esUnidadValida no se deja colar nada de fuera", () => {
    assert.equal(esUnidadValida("cajas"), true);
    assert.equal(esUnidadValida("cajitas"), false);
    assert.equal(esUnidadValida(""), false);
  });
});
