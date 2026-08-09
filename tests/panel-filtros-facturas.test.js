import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Un filtro que se ve en pantalla pero no viaja al servidor es peor que no tenerlo: el chip
// dice «Grau» y la lista sigue trayendo todo, así que se lee un total equivocado creyendo que
// está filtrado. Pasó con `proveedor`. Esto lo cierra por los dos lados.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

/** Claves que el panel de filtros escribe en FACF: `FACF.<algo> = ` dentro de facAbrirFiltros. */
function clavesQueEscribeElPanel() {
  const i = panel.indexOf("async function facAbrirFiltros(");
  assert.notEqual(i, -1, "¿han renombrado facAbrirFiltros?");
  const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
  return [...new Set([...bloque.matchAll(/FACF\.(\w+)\s*=/g)].map((m) => m[1]))];
}

function listaFacFiltros() {
  const m = panel.match(/const FAC_FILTROS = \[([^\]]*)\]/);
  assert.ok(m, "falta la lista FAC_FILTROS");
  return [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]);
}

describe("los filtros de facturas llegan de verdad al servidor", () => {
  const enviadas = listaFacFiltros();

  test("todo lo que el panel deja elegir se manda en la consulta", () => {
    for (const k of clavesQueEscribeElPanel()) {
      assert.ok(enviadas.includes(k), `el panel deja filtrar por «${k}» pero facQS() no lo manda`);
    }
  });

  test("facQS usa la lista y no una copia suelta", () => {
    assert.match(panel, /function facQS\(\)\s*\{[^}]*FAC_FILTROS\.forEach/);
  });

  test("y el servidor sabe qué hacer con cada una", () => {
    const i = server.indexOf("function facturasWhere");
    assert.notEqual(i, -1);
    const bloque = server.slice(i, i + 2500);
    // `q` es la búsqueda de texto y `local` el ámbito; el resto son filtros con nombre propio.
    for (const k of enviadas.filter((x) => !["q", "local"].includes(x))) {
      assert.ok(bloque.includes(k), `facturasWhere no contempla «${k}»`);
    }
  });

  test("los chips no enseñan un filtro que no se manda", () => {
    const i = panel.indexOf("function facFiltrosActivos(");
    assert.notEqual(i, -1);
    const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
    for (const k of [...new Set([...bloque.matchAll(/FACF\.(\w+)/g)].map((m) => m[1]))]) {
      assert.ok(enviadas.includes(k), `se pinta un chip de «${k}» que facQS() no manda`);
    }
  });

  test("proveedor está, que es el que se quedó fuera", () => {
    assert.ok(enviadas.includes("proveedor"));
  });
});
