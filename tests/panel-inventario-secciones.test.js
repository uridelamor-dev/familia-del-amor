// Las tres secciones de Inventarios, fijas en todas sus pantallas.
//
// Antes «Historial» y «Pedidos» eran dos botones sueltos en la barra de la pantalla de
// proveedores: en cuanto entrabas a configurar o a contar desaparecían, y para ver un pedido
// había que salir primero. Lo que se rompe solo con el tiempo es que una pantalla nueva se
// olvide de pasar su sección y aparezca marcada la que no es.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/panel/index.html", import.meta.url), "utf8");
// Las llamadas a invHeader de las pantallas, sin contar la declaración de la función.
const llamadas = [...app.matchAll(/invHeader\((?!titulo)[^\n]*/g)].map((m) => m[0]);

describe("las secciones de Inventarios están siempre", () => {
  test("son tres, y cada una sabe a dónde va", () => {
    const m = app.match(/const INV_SECCIONES = (\[[\s\S]*?\]);\n/);
    assert.ok(m, "sigue existiendo la lista de secciones");
    assert.equal((m[1].match(/\["/g) || []).length, 3, "Proveedores, Pedidos e Historial");
    for (const act of ["inv-volver-prov", "inv-pedidos", "inv-historial"]) {
      assert.ok(m[1].includes(act), `la sección ${act} tiene su acción`);
      assert.ok(app.includes(`act === "${act}"`), `y esa acción está enganchada`);
    }
  });

  test("todas las pantallas pasan por invHeader, así que todas las llevan", () => {
    assert.ok(llamadas.length >= 8, `hay ${llamadas.length} pantallas de inventario`);
    assert.match(app, /\$\{seccion \? invTabs\(seccion\) : ""\}/,
      "las pestañas salen del propio invHeader, no de cada pantalla");
  });

  test("las pantallas de Pedidos marcan la pestaña de Pedidos", () => {
    // Si no la pasan, se marca «Proveedores» y la barra dice que estás donde no estás.
    const dePedidos = llamadas.filter((l) => /invHeader\("Pedido/.test(l));
    assert.ok(dePedidos.length >= 2, "la lista y el detalle de un pedido");
    for (const l of dePedidos) assert.match(l, /"pedidos"/, l.slice(0, 70));
  });

  test("las de Historial marcan la de Historial", () => {
    const deHist = llamadas.filter((l) => /invHeader\("Historial/.test(l));
    assert.ok(deHist.length >= 2);
    for (const l of deHist) assert.match(l, /"historial"/, l.slice(0, 70));
  });

  test("sin establecimiento elegido NO hay pestañas", () => {
    // Sin local, las tres secciones piden `?local=` vacío y contestan 403. Enseñar un botón que
    // solo puede fallar es peor que no enseñarlo.
    const l = llamadas.find((x) => x.includes("Elige un establecimiento"));
    assert.ok(l, "sigue existiendo esa pantalla");
    assert.match(l, /null, null\)/);
  });

  test("Historial y Pedidos ya no son botones de la barra de proveedores", () => {
    // Estaban duplicados con las pestañas, y en el sitio en el que menos falta hacían.
    const i = app.indexOf("function renderInvProveedores(");
    const barra = app.slice(i, app.indexOf("const cards =", i));
    assert.ok(!barra.includes('data-act="inv-historial"') && !barra.includes('data-act="inv-pedidos"'));
    assert.ok(barra.includes('data-act="inv-nuevo-prov"'), "pero «+ Proveedor» sigue ahí");
  });

  test("en un móvil estrecho se deslizan antes que partirse en dos filas", () => {
    // Una barra de pestañas rota en dos líneas empuja el contenido y deja de leerse como una
    // sola cosa. Es el fallo que más se repite en este panel.
    assert.match(css, /\.invsecs\{[^}]*overflow-x:auto/);
    assert.match(css, /\.invsecs button\{white-space:nowrap\}/);
  });
});
