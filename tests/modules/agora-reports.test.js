// Ágora — registro de informes (mappers puros). Muestras JSON reales del TPV.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mapProducto, mapEmpleado, mapCancelaciones, mapDescuentos, mapInvitaciones, getInforme, listaInformes, calcularTotales, INFORMES } from "../../src/integrations/agora/reports.js";

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

describe("mapEmpleado (UserSalesFile → agrega por usuario)", () => {
  // Muestra real: filas por (usuario × método); MethodTotalAmount = cobrado.
  const resp = { Message: { Report: { Sales: [
    { UserName: "Coleti", MethodName: "Efectiu", MethodTotalAmount: 600, CancellationNetAmount: 0 },
    { UserName: "Coleti", MethodName: "Targeta", MethodTotalAmount: 412.7, CancellationNetAmount: 0 },
    { UserName: "Ana", MethodName: "Efectiu", MethodTotalAmount: 625.4, CancellationNetAmount: 3.5 },
    { UserName: "admin", MethodName: "Efectiu", MethodTotalAmount: 0, CancellationNetAmount: 0 }, // sin ventas → fuera
  ] } } };
  test("suma MethodTotalAmount por usuario y ordena por ventas", () => {
    const r = mapEmpleado(resp);
    assert.equal(r.filas.length, 2);
    assert.equal(r.filas[0].empleado, "Coleti");     // 1012.7 > 625.4
    assert.equal(r.filas[0].ventas, 1012.7);
    assert.equal(r.filas.find((f) => f.empleado === "Ana").cancelado, 3.5);
    assert.equal(r.ordenPor, "ventas");
  });
});

describe("mapCancelaciones", () => {
  const resp = { Message: { Report: { Cancellations: [
    { UserName: "Andres", ProductName: "America", Reason: "cambio por oferta", Quantity: 1, CancellationAmount: 0 },
    { UserName: "Ana", ProductName: "Cervesa", Reason: "error", Quantity: 2, CancellationAmount: 5 },
  ] } } };
  test("mapea filas de cancelación", () => {
    const r = mapCancelaciones(resp);
    assert.equal(r.filas.length, 2);
    assert.equal(r.filas[0].empleado, "Andres");
    assert.equal(r.filas[0].producto, "America");
    assert.equal(r.filas[0].motivo, "cambio por oferta");
    assert.equal(r.filas[1].importe, 5);
    assert.equal(r.ordenPor, "uds");
  });
});

describe("mapDescuentos", () => {
  const resp = { Message: { Report: { Discounts: [
    { UserName: "Lolilla", DiscountName: "DESCUENTO TRABAJADOR", DiscountType: "Ticket", DiscountCount: 4, DiscountAmount: 6.76 },
  ] } } };
  test("mapea descuentos por usuario y tipo", () => {
    const r = mapDescuentos(resp);
    assert.equal(r.filas[0].empleado, "Lolilla");
    assert.equal(r.filas[0].descuento, "DESCUENTO TRABAJADOR");
    assert.equal(r.filas[0].tipo, "Ticket");
    assert.equal(r.filas[0].n, 4);
    assert.equal(r.filas[0].importe, 6.76);
  });
  test("vacío → []", () => { assert.deepEqual(mapDescuentos({ Message: { Report: { Discounts: [] } } }).filas, []); });
});

describe("mapInvitaciones", () => {
  const resp = { Message: { Report: { Invitations: [
    { BusinessDay: "2026-08-05T00:00:00+02:00", ProductName: "Café", Quantity: 3, NetAmount: 4.5, GrossAmount: 4.1 },
  ] } } };
  test("mapea invitaciones por jornada", () => {
    const r = mapInvitaciones(resp);
    assert.equal(r.filas[0].dia, "2026-08-05");
    assert.equal(r.filas[0].producto, "Café");
    assert.equal(r.filas[0].uds, 3);
    assert.equal(r.filas[0].importe, 4.5);
  });
});

describe("registro completo (4 informes nuevos)", () => {
  test("empleado/cancelaciones/descuentos/invitaciones registrados con CLRType correcto", () => {
    assert.equal(getInforme("empleado").clrType, "IGT.POS.Bus.Reporting.Messages.GetUserSalesFileReportRequest");
    assert.ok(getInforme("cancelaciones").needs.includes("categorias"));
    assert.equal(getInforme("descuentos").clrType, "IGT.POS.Bus.Reporting.Messages.GetDiscountsByUserAndTypeReportRequest");
    assert.equal(getInforme("invitaciones").clrType, "IGT.POS.Bus.Reporting.Messages.GetInvitationsByBusinessDayReportRequest");
    assert.equal(listaInformes().length, 5);
  });
});
