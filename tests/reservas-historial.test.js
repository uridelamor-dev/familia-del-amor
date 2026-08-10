import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Las reservas que YA PASARON, de más reciente a más antigua. Antes la lista solo miraba hacia
// delante (de hoy a +30 días), así que «¿cuándo vino esta gente?» no se podía contestar.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("el historial mira hacia atrás", () => {
  const fn = (() => {
    const i = panel.indexOf("function resRango()");
    return panel.slice(i, panel.indexOf("\n}", i));
  })();

  test("va desde hace N días hasta AYER", () => {
    // Hasta hoy no: lo de hoy todavía no ha pasado y se ve en la agenda del día.
    assert.match(fn, /addDaysStr\(todayStr\(\), -Number\(RESH\.periodo\)\)/);
    assert.match(fn, /addDaysStr\(todayStr\(\), -1\)/);
  });

  test("pide al servidor orden descendente y con tope", () => {
    const i = panel.indexOf('if (RESF.vista === "historial") { qs.set("orden", "desc")');
    assert.notEqual(i, -1, "el historial tiene que pedir desc");
    assert.match(panel.slice(i, i + 120), /limit/);
  });

  test("el servidor entiende las dos cosas y acota el tope", () => {
    const i = server.indexOf('app.get("/api/reservas"');
    const bloque = server.slice(i, i + 1800);
    assert.match(bloque, /req\.query\.orden/);
    assert.match(bloque, /Math\.min\(Math\.max\(Number\(req\.query\.limit\) \|\| 0, 0\), 3000\)/,
      "un límite sin acotar lo pone quien llame, y podría ser cualquier cosa");
    assert.match(bloque, /LIMIT \$\{limite \+ 1\}/, "se pide una de más para saber si hay más");
    assert.match(bloque, /hayMas/);
  });

  test("sin `limit` la consulta se queda como estaba: no cambia el resto de vistas", () => {
    const i = server.indexOf('app.get("/api/reservas"');
    assert.match(server.slice(i, i + 1800), /\(limite \? ` LIMIT/);
  });
});

describe("lo que el historial NO hace", () => {
  const fn = (() => {
    const i = panel.indexOf("function renderResHistorial(");
    return panel.slice(i, panel.indexOf("\n}\n", i));
  })();

  test("no ofrece cancelar: una reserva de hace dos meses no se cancela", () => {
    assert.ok(!/data-act="cancel"/.test(fn), "ofrecerlo sería una trampa");
  });

  test("la ficha del cliente solo a quien tiene ese módulo", () => {
    // A un encargado el 403 de /api/contactos le sacaría del panel.
    assert.match(fn, /puedeVer\("clientes"\)/);
  });

  test("buscar no vuelve a preguntar al servidor", () => {
    const i = panel.indexOf("function resHistBuscar(");
    const b = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.ok(!/apiRaw|loadReservas/.test(b), "el periodo ya está en memoria");
  });

  test("y repinta solo la tabla, no el buscador", () => {
    // Repintar el buscador mientras se escribe pierde el foco a media palabra.
    const i = panel.indexOf("function resHistBuscar(");
    assert.match(panel.slice(i, i + 500), /reshBody/);
  });
});
