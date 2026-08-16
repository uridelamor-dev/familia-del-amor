import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extraerClrTypes, clasificarInformes, OLOR_COMENSALES }
  from "../../src/integrations/agora/descubrir.js";

// LA PREGUNTA: nuestro «ticket medio» es €/ticket y no €/comensal porque `comensales` vale
// SIEMPRE 0 — el informe global de Ágora no los trae. Antes de prometer nada hay que saber si
// Ágora los da por otro lado, y la forma de saberlo sin adivinar es leer los nombres de informe
// del JavaScript de su propia web de administración: los llama todos, así que están ahí.

describe("qué informes conoce ese Ágora", () => {
  const JS = `
    var r = "IGT.POS.Bus.Reporting.Messages.GetGlobalSalesReportRequest";
    t("IGT.POS.Bus.Reporting.Messages.GetDinersReportRequest");
    u('IGT.POS.Bus.SystemManagement.Messages.GetAllPosGroupsRequest');
    v("IGT.POS.Bus.Reporting.Messages.GetGlobalSalesReportRequest");
  `;

  test("se sacan del JavaScript, sin repetir y ordenados", () => {
    const t = extraerClrTypes(JS);
    assert.equal(t.length, 3, "el repetido cuenta una vez");
    assert.deepEqual(t, [...t].sort());
    assert.ok(t.includes("IGT.POS.Bus.Reporting.Messages.GetDinersReportRequest"));
  });

  test("y se reparten: los que ya usamos, los que suenan a comensales y el resto", () => {
    // Mirar una lista de cincuenta nombres sin ordenar no lleva a ninguna parte.
    const c = clasificarInformes(extraerClrTypes(JS), ["IGT.POS.Bus.Reporting.Messages.GetGlobalSalesReportRequest"]);
    assert.deepEqual(c.usados.map((x) => x.corto), ["GetGlobalSalesReport"]);
    assert.deepEqual(c.comensales.map((x) => x.corto), ["GetDinersReport"]);
    assert.deepEqual(c.otros.map((x) => x.corto), ["GetAllPosGroups"]);
  });

  test("el olfato de comensales cubre cómo puede llamarse", () => {
    for (const n of ["GetDinersReport", "ComensalesPorDia", "CoversReport", "GuestCount", "PaxReport"]) {
      assert.ok(OLOR_COMENSALES.test(n), n);
    }
    assert.ok(!OLOR_COMENSALES.test("GetProductSalesReport"));
  });

  test("un texto sin nombres de informe no inventa ninguno", () => {
    assert.deepEqual(extraerClrTypes("function x(){}"), []);
    assert.deepEqual(extraerClrTypes(null), []);
  });
});

describe("cableado", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("el descubrimiento contesta la pregunta directamente", () => {
    // Sin esto habría que leer una lista larga a ojo. La respuesta trae el veredicto.
    assert.match(server, /hayComensales: informes\.comensales\.length > 0/);
    assert.match(server, /extraerClrTypes\(r\.text\)/);
  });

  test("y el sondeo prueba también los mensajes de comensales", () => {
    assert.match(server, /GetDinersReportRequest/);
    assert.match(server, /comensales \(si existe, se puede el ticket medio por persona\)/);
  });

  test("mientras no se sepa, `comensales` sigue siendo 0 y no un número inventado", () => {
    const mappers = readFileSync(new URL("../../src/integrations/agora/mappers.js", import.meta.url), "utf8");
    assert.match(mappers, /comensales: 0,\s*\/\/ el informe global no trae comensales/);
  });
});
