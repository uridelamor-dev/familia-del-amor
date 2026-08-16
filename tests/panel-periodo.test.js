// El periodo de la barra de arriba: de quién es y a quién obedece.
//
// El fallo que motivó esto: en Productos se podía poner «6 may – 15 may» en la barra y seguir
// viendo las compras de julio. El control estaba, se movía, y solo lo miraba el Dashboard —que
// es peor que no tenerlo, porque el número que sale parece el del periodo elegido.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("el periodo de la barra", () => {
  test("solo se pinta en las pantallas que lo obedecen", () => {
    // En Reservas o en Usuarios era un control vivo que no hacía nada.
    assert.match(panel, /const seg = !grupo \? ""/);
    assert.match(panel, /\$\{seg \? `<div class="seg hidesm">\$\{seg\}<\/div>` : ""\}/);
  });

  test("y al pulsarlo recarga la pantalla en la que estás, no solo el Dashboard", () => {
    const i = panel.indexOf("function recargarPorPeriodo(");
    const fn = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.match(fn, /CURRENT === "productos"/);
    assert.match(fn, /CURRENT === "facturas"/);
    assert.match(fn, /CURRENT === "dashboard"/);
  });

  test("es de CADA pantalla: «esta semana» en el Dashboard no acota las compras", () => {
    // Son dos preguntas distintas. Compartir un solo periodo obligaba a que una mintiera.
    assert.match(panel, /const GRUPO_PERIODO = \{ dashboard: "dashboard", facturas: "compras", productos: "compras" \}/);
    assert.match(panel, /let PERIODO_VISTA = \{ facturas: "todo", productos: "todo" \}/);
  });

  test("en Compras y Productos se entra por «Todo», sin filtro de fechas", () => {
    // Un rango por defecto escondía la mitad del gasto sin decirlo.
    assert.match(panel, /\[\["todo", "Todo"\], \["semana", "Semana"\], \["mes", "Mes"\]\]/);
    assert.match(panel, /p === "todo" \? \{ from: "", to: "", label: "Desde siempre" \}/);
  });

  test("el botón encendido sale del rango de verdad, no de lo último que se pulsó", () => {
    // Las fechas también se ponen desde el panel de «Filtros»; si la barra no lo mirara,
    // diría «Todo» con un rango puesto.
    assert.match(panel, /const p = \(!f\.from && !f\.to\) \? "todo" : \(guardado === "todo" \? "custom" : guardado\)/);
  });

  test("«Todo» no se ofrece en el Dashboard, que siempre compara dos periodos", () => {
    assert.match(panel, /grupo === "compras" \? \[\["todo", "Todo"\]\] : \[\]/);
  });
});

describe("el calendario de rango", () => {
  test("las clases de los días no se llaman como la rejilla de tarjetas", () => {
    // `c7` es `grid-column: span 7` en el panel: el domingo se comía la fila entera.
    const i = panel.indexOf("function openPeriodoCustom(");
    const fn = panel.slice(i, i + 7000);
    assert.doesNotMatch(fn, /\? "c1" :/);
    assert.doesNotMatch(fn, /\? "c7" :/);
    assert.match(fn, /rnglft/);
    assert.match(fn, /rngrgt/);
  });

  test("no se pueden pedir facturas de mañana", () => {
    assert.match(panel, /iso > hoy \? " disabled" : ""/);
  });

  test("un solo día es un rango de un día, no medio rango", () => {
    assert.match(panel, /if \(a && !b\) b = a;/);
  });

  test("y si el segundo clic es anterior al primero, se entiende como cambio de idea", () => {
    // Un rango al revés no devuelve nada y parecería que no hay compras.
    assert.match(panel, /if \(!a \|\| b \|\| iso < a\) \{ a = iso; b = ""; \}/);
  });
});
