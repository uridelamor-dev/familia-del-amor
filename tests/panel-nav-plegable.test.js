import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// El menú se pliega por departamentos. Dos reglas que, si se rompen, dejan a alguien sin poder
// llegar a sus módulos, que es el peor fallo posible en una barra de navegación.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/panel/index.html", import.meta.url), "utf8");

describe("el menú plegable no puede esconder nada de forma irrecuperable", () => {
  const fn = (() => {
    const i = panel.indexOf("function navGrupoAbierto(");
    assert.notEqual(i, -1, "falta navGrupoAbierto");
    return panel.slice(i, panel.indexOf("\n}", i));
  })();

  test("el grupo de la pantalla actual se abre siempre", () => {
    // Un menú que no enseña dónde estás no es un menú.
    assert.match(fn, /items\.some\(\(\[id\]\) => id === active\)\) return true/);
  });

  test("en modo icono se abren todos: ahí no hay rótulo que pulsar", () => {
    assert.match(fn, /if \(COLLAPSED\) return true/);
    // Y el CSS lo respalda, por si el estado se quedara en `off`.
    assert.match(css, /\.app\.collapsed \.ngrp \.nitems\{display:block\}/);
  });

  test("dirección arranca plegado y el resto de roles, abierto", () => {
    const i = panel.indexOf("function navEstado()");
    assert.notEqual(i, -1);
    const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.match(bloque, /USER\.rol === "direccion" \? \[\] : NAV\.map/);
  });

  test("un localStorage corrupto no deja el menú en blanco", () => {
    const i = panel.indexOf("function navEstado()");
    const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.match(bloque, /catch/, "el JSON.parse tiene que ir protegido");
    assert.match(bloque, /Array\.isArray\(g\)/, "un valor que no sea lista se descarta");
  });

  test("plegar un grupo no repinta la vista: se perderían sus listeners", () => {
    const i = panel.indexOf("function navToggleGrupo(");
    const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.ok(!/innerHTML = shell\(|\bgo\(/.test(bloque), "solo se toca el grupo, no la pantalla");
  });

  test("cambiar a modo icono tampoco repinta", () => {
    const i = panel.indexOf('if (act === "mtoggle")');
    assert.notEqual(i, -1);
    assert.ok(!/innerHTML = shell\(/.test(panel.slice(i, i + 400)));
  });

  test("todo grupo del menú es plegable: ninguno se queda sin su botón", () => {
    const i = panel.indexOf("const nav = NAV.map((grp)");
    assert.notEqual(i, -1);
    const bloque = panel.slice(i, panel.indexOf("\n  }).join(\"\");", i));
    assert.match(bloque, /data-act="nav-grupo"/);
    assert.match(bloque, /class="ngrp/);
  });
});
