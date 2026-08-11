import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGO_MODULOS, modulosDeRol } from "../src/modules/usuarios/permisos.js";

// «Qué compramos» era la cuarta pestaña de Compras y ahora es el módulo «Productos», justo
// debajo. No es un cambio de nombre: es que no responde a la misma pregunta. Compras es «qué
// papeles hay» y Productos es «qué entra por la puerta y a cómo nos lo cobran»; escondido en
// una pestaña de otro módulo casi nadie llegaba.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("Productos es un módulo, no una pestaña", () => {
  test("está en el catálogo del servidor y varía por establecimiento", () => {
    const m = CATALOGO_MODULOS.find((x) => x.id === "productos");
    assert.ok(m, "falta «productos» en CATALOGO_MODULOS");
    assert.deepEqual(m.roles, ["direccion", "contabilidad"]);
    assert.equal(m.porLocal, true);
  });

  test("y en el menú del panel, JUSTO debajo de Compras", () => {
    const nav = panel.slice(panel.indexOf("const NAV = ["), panel.indexOf("const TITLES"));
    const iFac = nav.indexOf('["facturas", "Compras"');
    const iProd = nav.indexOf('["productos", "Productos"');
    assert.ok(iFac > -1 && iProd > -1, "faltan las entradas de menú");
    assert.ok(iProd > iFac, "Productos tiene que ir DESPUÉS de Compras");
    // Entre las dos entradas solo puede haber comentarios: ninguna otra opción de menú.
    const enMedio = nav.slice(iFac, iProd).split("\n").slice(1)
      .filter((l) => /^\s*\[/.test(l));
    assert.deepEqual(enMedio, [], "no puede haber otra entrada de menú entre Compras y Productos");
  });

  test("tiene su vista y su cabecera propia", () => {
    assert.match(panel, /productos: loadProductos/);
    assert.match(panel, /async function loadProductos\(/);
    assert.match(panel, /function productosHeader\(/);
    assert.match(panel, /<h1>Productos<\/h1>/);
  });

  test("Compras se queda con sus pestañas y sin «Qué compramos»", () => {
    const i = panel.indexOf("function facHeader()");
    const fn = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.doesNotMatch(fn, /"Qué compramos"/);
    assert.match(fn, /\["facturas", "Facturas"\], \["pagos", "Pagos"\], \["conciliar", "Conciliaciones"\], \["config", "Configuración"\]/);
    assert.doesNotMatch(fn, /qué se compra/, "el subtítulo ya no promete lo que se ha llevado a otra pantalla");
  });

  test("y ya no se enruta como pestaña", () => {
    assert.doesNotMatch(panel, /FACTAB === "compras"/);
  });

  test("ir a la configuración desde Productos CAMBIA de pantalla, no solo de pestaña", () => {
    // Si solo cambiara la pestaña, se pintaría Compras con el menú marcando Productos.
    assert.match(panel, /facTab\("config", true\)/);
    assert.match(panel, /function facTab\(tab, ir = false\)/);
  });
});

describe("«Subir factura» es del encargado y de nadie más", () => {
  test("solo el encargado lo tiene", () => {
    assert.deepEqual(CATALOGO_MODULOS.find((m) => m.id === "subirfactura").roles, ["encargado"]);
    assert.ok(modulosDeRol("encargado").includes("subirfactura"));
    for (const rol of ["direccion", "contabilidad"]) {
      assert.ok(!modulosDeRol(rol).includes("subirfactura"), rol);
    }
  });

  test("pero dirección y contabilidad siguen pudiendo subir desde Compras", () => {
    // Quitarles el módulo no puede quitarles la acción: sería perder una forma de trabajar.
    assert.match(panel, /data-act="fac-subir"/);
    const i = server.indexOf('app.post("/api/facturas/subir"');
    assert.match(server.slice(i, i + 200), /requireAuth\(\["direccion", "contabilidad", "encargado"\]\)/);
  });
});

describe("quien tenía los módulos recortados no pierde la pantalla", () => {
  test("a quien tenga «facturas» en su lista se le añade «productos», una sola vez", () => {
    // Su lista guardada dice «facturas»; sin esto, la pantalla que ya usaba desaparecería
    // sin que nadie lo hubiera pedido. Y una sola vez: si mañana se la quitan a propósito,
    // no puede volver a aparecer sola.
    const i = server.indexOf("modulos_productos_v1");
    assert.notEqual(i, -1, "falta la migración de módulos");
    const bloque = server.slice(i - 900, i + 900);
    assert.match(bloque, /REPLACE\(modulos, '"facturas"', '"facturas","productos"'\)/);
    assert.match(bloque, /modulos NOT LIKE '%"productos"%'/);
    assert.match(bloque, /SELECT value FROM config WHERE key = 'modulos_productos_v1'/);
  });
});
