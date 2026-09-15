// La búsqueda de poblaciones del formulario público.
//
// ── POR QUÉ ESTO ES UN MÓDULO PURO Y NO UNA LLAMADA A UN SERVICIO ────────────────────────────
//
// Lo que teclea alguien en «Població» es un dato suyo. Mandar cada pulsación a un servicio de fuera
// sería enviar a un tercero lo que está escribiendo una persona que solo quiere un desayuno —y
// además dejaría un rastro por letra en algún registro ajeno—. El catálogo viaja con la página y la
// búsqueda ocurre en su móvil: cero peticiones y nada que guardar.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizar, buscar, fechaNacimientoValida, aDdMmAaaa, deDdMmAaaa }
  from "../../src/modules/captacion/municipios.js";

const RUTA = new URL("../../public/data/municipios.json", import.meta.url);
const CAT = JSON.parse(readFileSync(RUTA, "utf8"));
const nombres = (r) => r.map((x) => x.nombre);

describe("el catálogo que se publica", () => {
  test("va versionado y con fecha: hay que saber con qué lista se rellenó cada ficha", () => {
    assert.equal(typeof CAT.version, "number");
    assert.match(String(CAT.actualizado), /^\d{4}-\d{2}-\d{2}$/);
  });

  test("es pequeño de verdad: viaja con la página en cada visita", () => {
    const bytes = readFileSync(RUTA).length;
    assert.ok(bytes < 60 * 1024, `el catálogo pesa ${bytes} bytes`);
  });

  test("cada entrada es [nombre, provincia, esCataluña] y no hay huecos ni repetidos", () => {
    assert.ok(CAT.m.length > 150, "el catálogo se ha quedado corto");
    const vistos = new Set();
    for (const e of CAT.m) {
      assert.equal(e.length, 3);
      assert.ok(e[0] && typeof e[0] === "string", JSON.stringify(e));
      assert.ok(e[1] && typeof e[1] === "string", JSON.stringify(e));
      assert.equal(typeof e[2], "number", JSON.stringify(e));
      const k = normalizar(e[0]) + "|" + e[1];
      assert.ok(!vistos.has(k), `municipio repetido: ${e[0]} (${e[1]})`);
      vistos.add(k);
    }
  });

  test("Cataluña pesa la mayoría: es donde están los locales", () => {
    const cat = CAT.m.filter((e) => e[2]).length;
    assert.ok(cat > CAT.m.length / 2, `solo ${cat} de ${CAT.m.length} son de Cataluña`);
  });

  test("y no lleva ningún byte de control: se sirve como JSON a un navegador", () => {
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(readFileSync(RUTA, "utf8")));
  });
});

describe("normalizar", () => {
  test("los acentos y las mayúsculas no cuentan", () => {
    assert.equal(normalizar("Arbúcies"), normalizar("arbucies"));
    assert.equal(normalizar("SANT FELIU"), "sant feliu");
    assert.equal(normalizar("  L'Hospitalet  "), "l'hospitalet");
  });

  test("aguanta lo que no es texto sin romperse", () => {
    for (const x of [null, undefined, 0, {}, []]) assert.equal(typeof normalizar(x), "string");
  });
});

describe("buscar: lo que importa es el ORDEN, no cuántos salen", () => {
  test("con una sola letra no se sugiere nada: sobrarían cien pueblos", () => {
    assert.deepEqual(buscar(CAT.m, "b"), []);
    assert.deepEqual(buscar(CAT.m, ""), []);
  });

  test("quien escribe «bla» quiere Blanes EL PRIMERO", () => {
    assert.equal(nombres(buscar(CAT.m, "bla"))[0], "Blanes");
  });

  test("se busca también por palabra suelta: «guixols» encuentra Sant Feliu de Guíxols", () => {
    // Es como lo escribe la gente cuando no se acuerda del principio del nombre.
    assert.ok(nombres(buscar(CAT.m, "guixols")).includes("Sant Feliu de Guíxols"));
    assert.ok(nombres(buscar(CAT.m, "gui")).includes("Sant Feliu de Guíxols"));
  });

  test("CON ACENTO Y SIN ACENTO dan lo mismo", () => {
    // Nadie escribe la tilde en un móvil con prisa, y quedarse sin sugerencias por eso es lo que
    // hace que la gente acabe escribiendo el pueblo a mano y mal.
    assert.deepEqual(nombres(buscar(CAT.m, "arbucies")), nombres(buscar(CAT.m, "arbúcies")));
    assert.deepEqual(nombres(buscar(CAT.m, "girona")), nombres(buscar(CAT.m, "gírona")));
  });

  test("lo que EMPIEZA por lo escrito va antes que lo que solo lo contiene", () => {
    const lista = [["Vilanova de Sau", "Barcelona", 1], ["Sant Pere de Vilamajor", "Barcelona", 1],
                   ["Vila-seca", "Tarragona", 1]];
    assert.deepEqual(nombres(buscar(lista, "vila")),
      ["Vila-seca", "Vilanova de Sau", "Sant Pere de Vilamajor"]);
  });

  test("a igualdad, Cataluña primero", () => {
    const lista = [["Salamanca", "Salamanca", 0], ["Salou", "Tarragona", 1]];
    assert.deepEqual(nombres(buscar(lista, "sal")), ["Salou", "Salamanca"]);
  });

  test("el resto de España también está: «mad» da Madrid", () => {
    assert.equal(nombres(buscar(CAT.m, "mad"))[0], "Madrid");
  });

  test("el número de sugerencias está acotado, se pida lo que se pida", () => {
    // Una lista larga en un móvil tapa el formulario entero.
    assert.ok(buscar(CAT.m, "sant").length <= 8, "por defecto salen más de ocho");
    assert.ok(buscar(CAT.m, "sant", { limite: 999 }).length <= 20, "el tope duro no se respeta");
    assert.ok(buscar(CAT.m, "sant", { limite: 0 }).length <= 1);
  });

  test("lo que no existe no inventa nada", () => {
    assert.deepEqual(buscar(CAT.m, "zzzqqq"), []);
  });

  test("una lista rota no tumba la búsqueda", () => {
    assert.equal(buscar([null, {}, ["", "x", 1], ["Blanes", "Girona", 1]], "bla").length, 1);
    assert.deepEqual(buscar(null, "bla"), []);
  });
});

describe("la fecha de nacimiento", () => {
  const hoy = "2026-09-15";

  test("una fecha normal vale", () => {
    assert.deepEqual(fechaNacimientoValida("1990-05-12", { hoy }), { ok: true, motivo: null });
  });

  test("UNA FECHA FUTURA SE RECHAZA, y con su propio motivo", () => {
    // No es un error de dedo: es un dato imposible que ensucia para siempre cualquier segmentación
    // por edad. El motivo va aparte del de formato porque el mensaje que se enseña es distinto.
    assert.deepEqual(fechaNacimientoValida("2030-01-01", { hoy }), { ok: false, motivo: "futura" });
    assert.equal(fechaNacimientoValida("2026-09-16", { hoy }).motivo, "futura");
    // Hoy mismo sí vale: el límite es estricto.
    assert.equal(fechaNacimientoValida(hoy, { hoy }).ok, true);
  });

  test("un año imposible se rechaza aparte", () => {
    assert.equal(fechaNacimientoValida("1890-01-01", { hoy }).motivo, "demasiado_antigua");
  });

  test("un día que no existe no se convierte en otro mes sin avisar", () => {
    // `new Date("2026-02-31")` da el 3 de marzo. Guardarlo así sería guardar otra fecha.
    assert.equal(fechaNacimientoValida("2000-02-31", { hoy }).motivo, "formato");
    assert.equal(fechaNacimientoValida("2000-13-01", { hoy }).motivo, "formato");
  });

  test("lo que no es una fecha es «formato», nunca una excepción", () => {
    for (const x of ["", null, undefined, "12/05/1990", "hoy", 0, {}, "1990-5-1"]) {
      assert.equal(fechaNacimientoValida(x, { hoy }).motivo, "formato", String(x));
    }
  });
});

describe("dd/mm/aaaa: para enseñar, nunca para guardar", () => {
  test("ida y vuelta", () => {
    assert.equal(aDdMmAaaa("1990-05-12"), "12/05/1990");
    assert.equal(deDdMmAaaa("12/05/1990"), "1990-05-12");
    assert.equal(deDdMmAaaa("2/5/1990"), "1990-05-02", "no se rellena con cero");
  });

  test("lo que no cuadra devuelve vacío o null, sin reventar", () => {
    for (const x of ["", null, "hoy", "12/05/1990"]) assert.equal(aDdMmAaaa(x), "", String(x));
    for (const x of ["", null, "12/05/90", "32/13/1990x"]) assert.equal(deDdMmAaaa(x), null, String(x));
  });
});
