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

describe("un operador sin ficha se puede crear desde aquí", () => {
  test("hay botón, y está SIEMPRE — sobre todo si no hay nadie a quien enlazar", () => {
    // El caso en que más falta hace es justo cuando el desplegable está vacío.
    assert.match(fn, /const crear = `<button class="btn sm" data-rr-crear/);
    assert.ok(!/workers\.length\s*\n?\s*\? `<button class="btn sm" data-rr-crear/.test(fn),
      "el botón vuelve a depender de que ya haya gente");
  });

  test("abre el alta de siempre con el nombre del operador puesto", () => {
    // Y NO se crea sola: el rol, las horas y las áreas los decide una persona, que es justo lo
    // que el TPV no sabe. Un operador puede ser «CAJA1» o «BARRA», no una persona.
    assert.match(fn, /rrWorkerAdd\(\{ nombre: nom, agora: nom, alCerrar: \(\) => rrImportarOperadores\(\) \}\)/);
    const alta = app.slice(app.indexOf("function rrWorkerAdd(pre = {})"), app.indexOf("// ── Dar de baja"));
    assert.match(alta, /value="\$\{esc\(pre\.nombre \|\| ""\)\}"/);
  });

  test("y al crearla se enlaza sola, diciendo con qué", () => {
    const alta = app.slice(app.indexOf("function rrWorkerAdd(pre = {})"), app.indexOf("// ── Dar de baja"));
    assert.match(alta, /Al crearla se enlazará con el operador <b>\$\{esc\(pre\.agora\)\}<\/b>/);
    assert.match(alta, /apiSend\("POST", "\/api\/rrhh\/agora\/enlazar", \{ agora_username: pre\.agora, worker_id: r\.id \}\)/);
  });

  test("si el enlace falla, la ficha NO se pierde y se dice", () => {
    // Perder un alta entera por un fallo de enlace sería mucho peor que quedarse sin enlazar:
    // eso se arregla en dos clics desde esta misma pantalla.
    const alta = app.slice(app.indexOf("function rrWorkerAdd(pre = {})"), app.indexOf("// ── Dar de baja"));
    assert.match(alta, /catch \{ \/\* se dirá que ha quedado sin enlazar \*\/ \}/);
    assert.match(alta, /No se ha podido enlazar con \$\{esc\(pre\.agora\)\}/);
  });

  test("y se vuelve a la lista al CERRAR el aviso, no encima de él", () => {
    // Dos modales apilados no se entienden, y el de debajo se queda con datos viejos.
    const alta = app.slice(app.indexOf("function rrWorkerAdd(pre = {})"), app.indexOf("// ── Dar de baja"));
    assert.match(alta, /if \(typeof pre\.alCerrar === "function"\)/);
    assert.match(alta, /setTimeout\(pre\.alCerrar, 0\)/);
  });
});

describe("el nombre que viene puesto también pide su usuario", () => {
  test("rellenar el value por HTML no dispara ningún evento", () => {
    // Sin esto el campo de usuario se quedaba vacío y, como es obligatorio, el formulario no
    // llegaba a enviarse: el botón «Crear ficha» abría el alta y ahí se quedaba todo.
    const alta = app.slice(app.indexOf("function rrWorkerAdd(pre = {})"), app.indexOf("// ── Dar de baja"));
    assert.match(alta, /if \(pre\.nombre\) proponerUsuario\(\);/);
    assert.ok(alta.indexOf("const proponerUsuario = async") < alta.indexOf("if (pre.nombre) proponerUsuario();"),
      "se llama antes de definirla");
  });
});
