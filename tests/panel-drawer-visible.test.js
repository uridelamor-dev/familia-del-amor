import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// El panel lateral de filtros «se abría» —el elemento estaba en el DOM, con su ancho y su
// contenido— pero se quedaba FUERA de la pantalla: la clase `on` la pone drawer() en el fondo
// (.drw-ov) y el CSS solo movía el panel con `.drw.on`. Se veía la pantalla oscurecerse y nada
// más, así que parecía que el botón de filtros no hacía nada.
//
// Se me escapó porque al verificarlo comprobé que el panel existía y tenía contenido, no que
// estuviera DENTRO de la pantalla. Un elemento a 1300px del borde izquierdo en una ventana de
// 1300px tiene ancho, tiene texto y no se ve.
const css = readFileSync(new URL("../public/panel/index.html", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("el panel lateral entra en la pantalla al abrirse", () => {
  test("drawer() marca el FONDO, que es lo que el CSS tiene que mirar", () => {
    const i = panel.indexOf("function drawer(");
    const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.match(bloque, /ov\.classList\.add\("on"\)/);
    assert.ok(!/\.drw"\)\.classList\.add\("on"\)/.test(bloque));
  });

  test("y el CSS lo trae dentro desde esa clase", () => {
    assert.match(css, /\.drw-ov\.on \.drw[^{]*\{transform:none\}/,
      "sin esta regla el panel se queda en translateX(100%), fuera de la pantalla");
  });

  test("el panel parte fuera y vuelve con una transición: las dos reglas van juntas", () => {
    assert.match(css, /transform:translateX\(100%\)/);
    assert.match(css, /transition:transform/);
  });

  test("y queda por encima del contenido", () => {
    const m = css.match(/\.drw-ov\{[^}]*z-index:(\d+)/);
    assert.ok(m && Number(m[1]) >= 100, "el fondo tiene que tapar la página");
  });
});

describe("los dos botones que lo abren siguen conectados", () => {
  test("Facturas", () => {
    assert.match(panel, /data-act="fac-filtros"/);
    assert.match(panel, /act === "fac-filtros"\) facAbrirFiltros\(\)/);
  });
  test("Qué compramos", () => {
    assert.match(panel, /data-comp="filtros"/);
    assert.match(panel, /w === "filtros"\) return compAbrirFiltros\(\)/);
  });
  test("los dos usan el mismo drawer: un arreglo vale para ambos", () => {
    for (const f of ["facAbrirFiltros", "compAbrirFiltros"]) {
      const i = panel.indexOf(`async function ${f}(`);
      assert.notEqual(i, -1, f);
      assert.match(panel.slice(i, i + 4000), /drawer\(/, f);
    }
  });
});
