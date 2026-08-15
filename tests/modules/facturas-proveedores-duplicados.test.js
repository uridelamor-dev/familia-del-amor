import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gruposDuplicados, parecidoNombre, nifUtil, MINIMO_NOMBRE }
  from "../../src/modules/facturas/proveedores-duplicados.js";

const P = (proveedor, extra = {}) => ({ proveedor, nif: null, facturas: 1, gasto: 100, ...extra });

describe("el NIF manda: dos nombres con el mismo NIF son la misma empresa", () => {
  test("«GRAU» y «Vins i Licors Grau, S.A.» se juntan si comparten NIF", () => {
    // Como texto no se parecen en NADA. Sin el NIF, esto no se puede resolver solo.
    const g = gruposDuplicados([
      P("GRAU", { nif: "B17972860", facturas: 3, gasto: 900 }),
      P("Vins i Licors Grau, S.A.", { nif: "B17972860", facturas: 40, gasto: 12000 }),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].sugerido.proveedor, "Vins i Licors Grau, S.A.", "se queda el que más facturas tiene");
    assert.equal(g[0].otros[0].proveedor, "GRAU");
    assert.match(g[0].motivo, /mismo NIF B17972860/);
    assert.equal(g[0].facturas, 43);
  });

  test("dos NIF DISTINTOS no se juntan aunque se llamen casi igual", () => {
    // Una matriz y su filial se llaman parecido y son dos empresas con dos contabilidades.
    const g = gruposDuplicados([
      P("Distribucions Girona SL", { nif: "B17972860" }),
      P("Distribucions Girona Sud SL", { nif: "B17972899" }),
    ]);
    assert.deepEqual(g, []);
  });

  test("un NIF que no tiene pinta de NIF no se usa para unir nada", () => {
    assert.equal(nifUtil("B17972860"), "B17972860");
    assert.equal(nifUtil("b-17.972.860"), "B17972860");
    assert.equal(nifUtil("123"), null);
    assert.equal(nifUtil(""), null);
    assert.deepEqual(gruposDuplicados([P("Uno", { nif: "1" }), P("Dos", { nif: "1" })]), []);
  });
});

describe("y por nombre, solo cuando de verdad se parecen", () => {
  test("una letra bailada es un error de lectura, no otra empresa", () => {
    assert.ok(parecidoNombre("INDUSTRIAS LINDAMER, S.L.", "INDUSTRIAS LINDAMAR, S.L.") >= MINIMO_NOMBRE);
    const g = gruposDuplicados([P("INDUSTRIAS LINDAMER, S.L."), P("Industrias Lindamar SL")]);
    assert.equal(g.length, 1);
  });

  test("la forma jurídica no distingue a nadie: «S.L.» y «SL» son el mismo", () => {
    assert.equal(parecidoNombre("Conservas Josimar, S.L.", "CONSERVAS JOSIMAR SL"), 100);
  });

  test("compartir una palabra genérica NO basta", () => {
    // «Distribuciones Martínez» y «Distribuciones Gómez» son dos empresas.
    assert.ok(parecidoNombre("Distribuciones Martinez", "Distribuciones Gomez") < MINIMO_NOMBRE);
    assert.deepEqual(gruposDuplicados([P("Distribuciones Martinez"), P("Distribuciones Gomez")]), []);
  });

  test("dos proveedores que no tienen nada que ver se quedan quietos", () => {
    assert.deepEqual(gruposDuplicados([P("Pescados del Maresme"), P("Jamones Cerezo")]), []);
  });
});

describe("cómo se presenta el grupo", () => {
  test("si A va con B por NIF y B con C por nombre, los tres son un solo grupo", () => {
    // Tres claves distintas: «GRAU» se une a «Vins i Licors Grau» por el NIF, y esa se une a
    // «Vins i Licors Grao» porque es la misma con una letra bailada.
    const g = gruposDuplicados([
      P("GRAU", { nif: "B17972860", facturas: 2 }),
      P("Vins i Licors Grau SA", { nif: "B17972860", facturas: 30 }),
      P("Vins i Licors Grao SA", { nif: null, facturas: 5 }),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].otros.length, 2, "los tres en un grupo, no dos grupos de dos");
    assert.equal(g[0].facturas, 37);
  });

  test("y las que solo cambian en la puntuación ya venían juntas de antes", () => {
    // «Vins i Licors Grau SA» y «Vins i Licors Grau, S.A.» tienen la MISMA clave: no son un
    // duplicado que decidir, son la misma fila.
    const g = gruposDuplicados([
      P("GRAU", { nif: "B17972860", facturas: 2 }),
      P("Vins i Licors Grau SA", { nif: "B17972860", facturas: 30 }),
      P("Vins i Licors Grau, S.A.", { nif: null, facturas: 5 }),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].otros.length, 1);
    assert.equal(g[0].facturas, 37, "pero su gasto y sus facturas sí cuentan");
  });

  test("las variantes de escritura del MISMO nombre no se preguntan: ya están juntas", () => {
    // «GRAU, S.L.» y «Grau SL» tienen la misma clave; enseñarlas como duplicados sería pedir
    // que se decida algo que ya está decidido.
    assert.deepEqual(gruposDuplicados([P("GRAU, S.L."), P("Grau SL")]), []);
  });

  test("se queda el nombre completo, no la abreviatura, a igualdad de facturas", () => {
    const g = gruposDuplicados([
      P("GRAU", { nif: "B17972860", facturas: 5 }),
      P("Vins i Licors Grau, S.A.", { nif: "B17972860", facturas: 5 }),
    ]);
    assert.equal(g[0].sugerido.proveedor, "Vins i Licors Grau, S.A.");
  });

  test("y los grupos salen ordenados por el dinero que mueven", () => {
    const g = gruposDuplicados([
      P("A uno", { nif: "B17972860", gasto: 10 }), P("A dos", { nif: "B17972860", gasto: 10 }),
      P("B uno", { nif: "B17972899", gasto: 5000 }), P("B dos", { nif: "B17972899", gasto: 5000 }),
    ]);
    assert.deepEqual(g.map((x) => x.gasto), [10000, 20]);
  });

  test("sin datos no se inventa ningún grupo", () => {
    assert.deepEqual(gruposDuplicados([]), []);
    assert.deepEqual(gruposDuplicados([P("Uno solo")]), []);
    assert.deepEqual(gruposDuplicados(null), []);
  });
});

describe("cableado", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("el NIF que se compara es el MÁS REPETIDO de ese nombre, no uno cualquiera", () => {
    // Una factura con el NIF mal leído no puede decidir con quién se une un proveedor entero.
    const fn = server.slice(server.indexOf('app.get("/api/facturas/proveedores-duplicados"'), server.indexOf("// Corregir el nombre de un proveedor"));
    assert.match(fn, /GROUP BY n\.nif ORDER BY count\(\*\) DESC LIMIT 1/);
    assert.match(fn, /COALESCE\(f\.dup_estado,''\) <> 'duda'/, "las apartadas por dudosas no cuentan");
  });

  test("unir REUTILIZA el renombrado que ya existe, no una vía nueva", () => {
    // Ese endpoint ya reescribe todas las facturas y aprende el alias para las próximas.
    // Hacer otra cosa sería tener dos maneras de renombrar y que una se quedara atrás.
    const fn = panel.slice(panel.indexOf("async function facProvUnir"), panel.indexOf("async function facProvUnir") + 900);
    assert.match(fn, /apiSend\("PUT", "\/api\/facturas\/proveedor"/);
  });

  test("y se dice cuántas facturas se mueven ANTES de moverlas", () => {
    assert.match(panel, /factura\(s\) pasan a ese nombre/);
  });

  test("se puede elegir con qué nombre quedarse, no solo aceptar el propuesto", () => {
    assert.match(panel, /data-provdup="otro"/);
    assert.match(panel, /¿Con qué nombre se queda\?/);
  });
});
