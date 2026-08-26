import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Al enlazar los operadores del TPV con las fichas, un encargado veía solo los de su local —no
// puede elegir otro— pero DIRECCIÓN veía los de los ocho establecimientos mezclados en una sola
// lista, sin saber cuál era de dónde. Y el desplegable de «a quién enlazo esto» ofrecía la
// plantilla entera: se podía enlazar por error a alguien de otro sitio, y eso son las ventas de
// una persona atribuidas a otra — un error que después no se ve por ninguna parte.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const ep = server.slice(server.indexOf('app.get("/api/rrhh/agora/operadores"'),
                        server.indexOf('app.post("/api/rrhh/agora/enlazar"'));
const fn = app.slice(app.indexOf("async function rrImportarOperadores()"), app.indexOf("function rrEditarDatos("));

describe("los operadores que se ofrecen son los del local de la barra", () => {
  test("el panel manda el local que hay puesto arriba", () => {
    assert.match(fn, /const localBarra = localActualFE\(\) \|\| ""/);
    assert.match(fn, /"\/api\/rrhh\/agora\/operadores" \+ \(localBarra \? "\?local=" \+ encodeURIComponent\(localBarra\) : ""\)/);
  });

  test("y el servidor lo usa, comprobando antes que puede", () => {
    // Un local en la URL no da acceso a él: se pregunta igual. Y el encargado no puede elegir,
    // así que su propio local manda sobre lo que venga escrito.
    assert.match(ep, /const local = scope \|\| \(pedido && rrhhPuedeLocal\(req, pedido\) \? pedido : null\)/);
    assert.match(ep, /runInformeAgora\("empleado", \{ local, from, to \}\)/);
  });

  test("con «todos» puesto se sigue viendo todo", () => {
    // No se manda `?local`, y sin él no se filtra: cuando no se ha elegido establecimiento, la
    // respuesta correcta es enseñarlos todos.
    assert.match(ep, /\$\{local \? " AND local = ANY\(\?\)" : ""\}/);
  });
});

describe("y las fichas a las que se puede enlazar, también", () => {
  test("el servidor filtra los perfiles por ESE local, no solo por el del encargado", () => {
    // Antes filtraba con `scope`, que para dirección es null: los operadores salían de un local
    // y las fichas de los ocho.
    assert.match(ep, /local \? \[personasDe\(local\)\] : \[\]/);
    assert.ok(!/scope \? \[personasDe\(scope\)\] : \[\]/.test(ep), "vuelve a filtrar solo para el encargado");
  });

  test("las dos barras de un centro cuentan como un solo equipo", () => {
    assert.match(ep, /personasDe\(local\)/);
    assert.match(fn, /centroFE\(w\.local, "personal"\) === centroFE\(localBarra, "personal"\)/);
  });

  test("y el desplegable del panel enseña solo a esa gente", () => {
    assert.match(fn, /RRSEG\.workers \|\| \[\]\)\.filter\(\(w\) => !localBarra/);
  });

  test("sin repetir el local en cada línea cuando ya es uno solo", () => {
    assert.match(fn, /unSoloLocal \? "" : " · " \+ esc\(w\.local \|\| ""\)/);
  });

  test("y se dice de qué establecimiento son", () => {
    // Una lista que enseña menos que antes sin decir por qué se lee como que falta gente.
    assert.match(fn, /Enlazar operadores de Ágora\$\{localBarra \? " · " \+ nombreCortoLocal\(localBarra\) : ""\}/);
    assert.match(fn, /operador\(es\) detectados\$\{localBarra \? " en <b>"/);
  });
});
