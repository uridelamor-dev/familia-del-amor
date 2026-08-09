import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canonizarLocal, esLocalCanonico, agruparNoCanonicos, LOCALES } from "../../src/modules/facturas/local-canonico.js";

describe("local canónico — lo que ya está bien no se toca", () => {
  test("los ocho nombres buenos se devuelven tal cual", () => {
    for (const l of LOCALES) assert.equal(canonizarLocal(l), l);
  });
  test("da igual el caso, los acentos o los espacios de más", () => {
    assert.equal(canonizarLocal("  LA TAPETA - BLANES "), "La Tapeta - Blanes");
    assert.equal(canonizarLocal("la tapa iberica - tordera"), "La Tapa Ibérica - Tordera");
    assert.equal(canonizarLocal("BOTIGA D'EN MATEU - TORDERA"), "Botiga d'en Mateu - Tordera");
  });
});

describe("local canónico — lo que había suelto en las facturas", () => {
  test("«BLANES» es La Tapeta - Blanes", () => {
    assert.equal(canonizarLocal("BLANES"), "La Tapeta - Blanes");
  });
  test("«Lloret» es La Tapeta - Lloret", () => {
    assert.equal(canonizarLocal("Lloret"), "La Tapeta - Lloret");
    assert.equal(canonizarLocal("LLORET DE MAR"), "La Tapeta - Lloret");
  });
  test("«TAPETA LLORET», que es como lo escriben los proveedores", () => {
    assert.equal(canonizarLocal("TAPETA LLORET"), "La Tapeta - Lloret");
  });
  test("«Can Mateu Tordera» sin el guion", () => {
    assert.equal(canonizarLocal("Can Mateu Tordera"), "Can Mateu - Tordera");
  });
  test("y cuando viene dentro de una frase entera", () => {
    assert.equal(canonizarLocal("Factura para LA TAPETA - LLORET, Carrer Sant Pere 84"), "La Tapeta - Lloret");
    assert.equal(canonizarLocal("Entrega en cooperativa"), "Cooperativa - Blanes");
  });
});

describe("local canónico — cuándo NO se adivina", () => {
  test("«TORDERA» A SECAS NO SE RESUELVE: hay tres locales allí", () => {
    // Acertaría uno de cada tres, y una factura contada en el local equivocado descuadra
    // los dos a la vez. Mejor que la asigne una persona.
    assert.equal(canonizarLocal("Tordera"), null);
    assert.equal(canonizarLocal("TORDERA"), null);
  });
  test("un texto que menciona dos locales tampoco", () => {
    assert.equal(canonizarLocal("La Tapeta - Blanes y La Tapeta - Lloret"), null);
  });
  test("lo vacío o lo desconocido devuelve null, no una cadena rara", () => {
    for (const v of ["", null, undefined, "   ", "Proveedor S.L.", "12345"]) {
      assert.equal(canonizarLocal(v), null, String(v));
    }
  });
  test("no se cuela una coincidencia parcial de una palabra dentro de otra", () => {
    // «Blanesa» no es «Blanes».
    assert.equal(canonizarLocal("Distribuciones Blanesa S.L."), null);
  });
});

describe("local canónico — comprobar y agrupar", () => {
  test("esLocalCanonico distingue el nombre bueno del parecido", () => {
    assert.equal(esLocalCanonico("La Tapeta - Blanes"), true);
    assert.equal(esLocalCanonico("Blanes"), false);
    assert.equal(esLocalCanonico(""), false);
  });

  test("agrupa lo que está mal guardado y dice a qué se parece", () => {
    const g = agruparNoCanonicos([
      { local: "La Tapeta - Lloret", n: 120 },   // este está bien: no sale
      { local: "Lloret", n: 8 },
      { local: "BLANES", n: 3 },
      { local: "Tordera", n: 2 },
      { local: null, n: 1 },
    ]);
    assert.equal(g.length, 4, "solo los que están mal");
    assert.equal(g[0].valor, "Lloret");
    assert.equal(g[0].sugerido, "La Tapeta - Lloret");
    assert.equal(g.find((x) => x.valor === "Tordera").sugerido, null, "el ambiguo no propone nada");
    assert.equal(g.find((x) => x.valor === "").sugerido, null);
  });

  test("ordena por cuántas facturas arrastra cada valor", () => {
    const g = agruparNoCanonicos([{ local: "x", n: 2 }, { local: "y", n: 30 }]);
    assert.equal(g[0].valor, "y");
  });
});
