// El gasto que es de toda una empresa, imputado a cada local en TODAS partes.
//
// El reparto llevaba semanas hecho pero solo se aplicaba en «Gasto por local (año)». El
// dashboard y la tira de resultado seguían cargándole la gestoría entera al local donde está
// archivado el papel: ese salía disparado y los demás, impolutos. Dos pantallas dando cifras
// distintas del mismo mes es peor que una sola cifra mala, porque no se sabe cuál creerse.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const dash = readFileSync(new URL("../src/modules/dashboard/dashboard.service.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("el gasto de empresa se imputa por local en todas las pantallas", () => {
  test("el gasto por local del dashboard deja fuera lo de empresa y lo reparte", () => {
    const consultas = dash.match(/SELECT local, COALESCE\(SUM\(total\),0\)::float t FROM facturas[^`]*/g) || [];
    assert.equal(consultas.length, 2, "son dos: mes actual y mes anterior");
    for (const q of consultas) {
      assert.match(q, /COALESCE\(reparto,''\) <> 'empresa'/,
        "sin esto, la gestoría cae entera sobre el local donde está archivada");
    }
    assert.match(dash, /imputarGastoEmpresa\(/, "y hay que volver a sumársela a cada uno");
  });

  test("la tira de resultado no cuenta los albaranes como gasto", () => {
    // Viven en la misma tabla que las facturas y son el papel de la entrega: su factura ya está
    // ahí. Contarlos duplicaba el gasto de todo proveedor que deja albarán, y ese número se
    // resta de las ventas para dar el resultado del periodo.
    const i = server.indexOf("Gastos (facturas) del MISMO rango");
    assert.ok(i > 0, "sigue existiendo la consulta de gasto del periodo");
    const bloque = server.slice(i, i + 1400);
    const q = bloque.match(/const gasRow = await dbGet\(`[^`]*`/);
    assert.ok(q, "se encuentra la consulta");
    assert.match(q[0], /\$\{SIN_ALBARANES\}/, "los albaranes no son un gasto aparte");
    assert.match(q[0], /COALESCE\(reparto,''\) <> 'empresa'/);
  });

  test("el reparto del periodo se calcula una vez, no una por local", () => {
    // Se piden hasta ocho establecimientos en serie; hacerlo dentro del bucle eran tres
    // consultas más por local en la pantalla de la que ya se quejó que iba lenta.
    const i = server.indexOf("const deLosLocales = async (q)");
    const bloque = server.slice(i, i + 700);
    assert.match(bloque, /await gastoDeEmpresaPorLocal\(/);
    assert.equal((bloque.match(/gastoDeEmpresaPorLocal\(/g) || []).length, 1,
      "una sola llamada, fuera del for");
  });

  test("el panel dice cuánto del gasto es parte imputada", () => {
    // Un número repartido sin avisar se lee como un número medido, y luego nadie entiende por
    // qué no cuadra con la lista de facturas de ese local.
    assert.match(app, /de empresa`? *: *""/, "la nota de la tira");
    assert.match(app, /notaGasto/);
    assert.match(app, /no se han podido repartir/,
      "y si una empresa se quedó sin locales, se avisa en vez de perder el dinero");
  });

  test("el servidor manda lo que no ha podido repartir", () => {
    assert.match(server, /sinRepartir/, "para poder avisarlo en pantalla");
  });
});
