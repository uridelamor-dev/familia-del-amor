import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// El síntoma fue: «veo las facturas en la página principal de Drive pero no las carpetas en
// Mi unidad». La causa: al buscar la carpeta raíz no se limitaba a Mi unidad, así que podía
// resolver a una carpeta compartida o huérfana. De ahí colgaba TODA la estructura, y los
// archivos existían pero no había forma de llegar a ellos navegando.
const facturas = readFileSync(new URL("../facturas.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("la carpeta raíz de facturas vive en Mi unidad", () => {
  const fn = (() => {
    const i = facturas.indexOf("async function findOrCreateFolder(");
    assert.notEqual(i, -1, "falta findOrCreateFolder");
    return facturas.slice(i, facturas.indexOf("\n}\n", i));
  })();

  test("la búsqueda SIEMPRE lleva padre, también la de la raíz", () => {
    // `q` sin `in parents` busca por toda la cuenta, incluido «Compartido conmigo».
    assert.match(fn, /const padre = parentId \|\| "root"/);
    assert.match(fn, /and '\$\{padre\}' in parents/);
    assert.ok(!/\(parentId \? ` and '\$\{parentId\}' in parents` : ""\)/.test(fn),
      "el parámetro de padre no puede volver a ser opcional");
  });

  test("y al crearla se ancla al mismo sitio donde se buscó", () => {
    assert.match(fn, /driveCrearCarpeta\(token, nombre, padre\)/);
    assert.ok(!/driveCrearCarpeta\(token, nombre, parentId\)/.test(fn),
      "crear con parentId null la deja suelta");
  });
});

describe("el diagnóstico dice si la raíz está donde se puede encontrar", () => {
  const bloque = (() => {
    const i = server.indexOf('app.get("/api/facturas/drive-diagnostico"');
    assert.notEqual(i, -1);
    return server.slice(i, i + 5000);
  })();

  test("comprueba si cuelga de Mi unidad", () => {
    assert.match(bloque, /enMiUnidad/);
    assert.match(bloque, /files\/root\?fields=id/, "hay que preguntar cuál es el id de Mi unidad");
  });

  test("detecta la carpeta huérfana, que es el caso que se dio", () => {
    assert.match(bloque, /hu[ée]rfana/i);
  });

  test("y detecta que la raíz sea de otra cuenta", () => {
    assert.match(bloque, /ownedByMe === false/);
  });
});

describe("colocar la raíz en Mi unidad no toca los archivos", () => {
  const bloque = (() => {
    const i = server.indexOf('app.post("/api/facturas/drive-colocar-raiz"');
    assert.notEqual(i, -1, "falta el arreglo");
    return server.slice(i, i + 2500);
  })();

  test("mueve la CARPETA cambiándole el padre, no los archivos uno a uno", () => {
    assert.match(bloque, /addParents=/);
    assert.ok(!/facturas\b.*SELECT|drive_url/.test(bloque), "no toca la tabla de facturas");
  });

  test("no intenta mover una carpeta que no es de la cuenta", () => {
    assert.match(bloque, /ownedByMe === false/);
  });

  test("si ya estaba en Mi unidad lo dice y no hace nada", () => {
    assert.match(bloque, /yaEstaba/);
  });

  test("solo dirección puede hacerlo", () => {
    assert.match(bloque, /requireAuth\(\["direccion"\]\)/);
  });

  test("el botón está en el panel, donde se ve el problema", () => {
    assert.match(panel, /data-act="fac-colocar-raiz"/);
    assert.match(panel, /function facColocarRaiz\(\)/);
  });
});
