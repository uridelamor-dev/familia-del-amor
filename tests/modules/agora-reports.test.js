// Ágora — registro de informes (mappers puros). Muestras JSON reales del TPV.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mapProducto, getInforme, listaInformes, calcularTotales, INFORMES } from "../../src/integrations/agora/reports.js";

describe("mapProducto", () => {
  // Muestra real (2 filas del informe GetProductSalesReport de Lloret).
  const resp = { Message: { Report: { Sales: [
    { FamilyName: "1#CAFÉ", ProductName: "Café amb Llet", ProductQuantity: 169, ProductNetAmount: 239.4, ProductGrossAmount: 217.6 },
    { FamilyName: "2#CERVESA", ProductName: "Cervesa Copa", ProductQuantity: 95, ProductNetAmount: 237.5, ProductGrossAmount: 215.9 },
    { FamilyName: "1#CAFÉ", ProductName: "Café sol", ProductQuantity: 0, ProductNetAmount: 0, ProductGrossAmount: 0 }, // sin ventas → fuera
  ] } } };
  test("normaliza filas, ordena por importe y descarta sin ventas", () => {
    const r = mapProducto(resp);
    assert.equal(r.filas.length, 2);
    assert.equal(r.filas[0].producto, "Café amb Llet"); // mayor importe primero
    assert.equal(r.filas[0].uds, 169);
    assert.equal(r.filas[0].importe, 239.4);
    assert.equal(r.filas[0].base, 217.6);
    assert.equal(r.ordenPor, "importe");
    assert.equal(r.columnas.find((c) => c.key === "importe").tipo, "eur");
  });
  test("respuesta vacía / basura → filas vacías, no lanza", () => {
    assert.deepEqual(mapProducto(null).filas, []);
    assert.deepEqual(mapProducto({ Message: {} }).filas, []);
  });
});

describe("registro de informes", () => {
  test("producto está registrado con CLRType y needs", () => {
    const d = getInforme("producto");
    assert.equal(d.clrType, "IGT.POS.Bus.Reporting.Messages.GetProductSalesReportRequest");
    assert.ok(d.needs.includes("familias"));
    assert.equal(typeof d.map, "function");
    assert.equal(typeof d.buildExtra, "function");
  });
  test("buildExtra de producto compone From/To inclusivos + familias", () => {
    const e = INFORMES.producto.buildExtra({ from: "2026-08-05", to: "2026-08-05", groups: [1, 2, 3], familias: [1, 2] });
    assert.equal(e.From, "2026-08-05T00:00:00.000");
    assert.equal(e.To, "2026-08-05T00:00:00.000");
    assert.deepEqual(e.PosGroupsIds, [1, 2, 3]);
    assert.deepEqual(e.FamiliesIds, [1, 2]);
  });
  test("listaInformes devuelve key+label; getInforme desconocido → null", () => {
    assert.ok(listaInformes().some((x) => x.key === "producto"));
    assert.equal(getInforme("xxx"), null);
  });
});

describe("calcularTotales", () => {
  test("suma columnas num/eur, ignora texto", () => {
    const cols = [{ key: "p", tipo: "texto" }, { key: "uds", tipo: "num" }, { key: "importe", tipo: "eur" }];
    const t = calcularTotales(cols, [{ p: "a", uds: 2, importe: 10 }, { p: "b", uds: 3, importe: 5.5 }]);
    assert.deepEqual(t, { uds: 5, importe: 15.5 });
  });
});
