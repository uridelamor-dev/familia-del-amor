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
    // Ahora acepta un local forzado (para ver varios locales juntos), pero los filtros
    // siguen saliendo de FAC_FILTROS y no de una copia escrita a mano.
    const i = panel.indexOf("function facQS(");
    assert.notEqual(i, -1);
    assert.match(panel.slice(i, i + 500), /FAC_FILTROS\.forEach\(\(k\) => \{ if \(FACF\[k\]\) qs\.set/);
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

// Mismo cierre para «Qué compramos»: lo que se puede elegir tiene que llegar al servidor.
describe("los filtros de «Qué compramos» llegan al servidor", () => {
  const lista = (() => {
    const m = panel.match(/const COMP_FILTROS = \[([^\]]*)\]/);
    assert.ok(m, "falta COMP_FILTROS");
    return [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]);
  })();

  test("todo lo que el panel de compras deja elegir se manda", () => {
    const i = panel.indexOf("async function compAbrirFiltros(");
    assert.notEqual(i, -1);
    const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
    for (const k of [...new Set([...bloque.matchAll(/COMP\.(\w+)\s*=/g)].map((m) => m[1]))]) {
      assert.ok(lista.includes(k), `se puede filtrar por «${k}» pero no se manda`);
    }
  });

  test("la consulta se arma desde la lista, no a mano", () => {
    assert.match(panel, /COMP_FILTROS\.forEach\(\(k\) => \{ if \(COMP\[k\]\) qs\.set/);
  });

  test("el servidor entiende proveedor y categoría", () => {
    const i = server.indexOf("async function comprasDeLocal(");
    assert.notEqual(i, -1);
    const bloque = server.slice(i, i + 3500);
    assert.match(bloque, /req\.query\.proveedor/);
    assert.match(bloque, /req\.query\.categoria/);
  });

  test("filtrar por una categoría que nadie tiene devuelve nada, no todo", () => {
    // Una condición que no filtra habría devuelto la lista entera como si sí lo hubiera hecho.
    const i = server.indexOf("const provsCat = await proveedoresDeCategorias");
    assert.notEqual(i, -1);
    assert.match(server.slice(i, i + 500), /provsCat\.length \? provsCat : \[/);
  });

  test("la clave del proveedor NO está reescrita en SQL: una sola versión, la de JS", () => {
    assert.ok(!/regexp_replace\([^)]*sociedad limitada/.test(server),
      "duplicar la normalización en SQL la deja desincronizada el día que se toque una");
  });
});
