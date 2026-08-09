import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES } from "../../src/modules/facturas/local-canonico.js";

// La lista de establecimientos está escrita a mano en CUATRO sitios (auth.js para el
// navegador, server.js dos veces, y el módulo canónico). Si alguien abre un local nuevo y
// solo lo añade en uno, pasa lo que ya pasó: las facturas de ese local se rechazan o quedan
// sin vincular, y nadie se entera hasta que falta un mes de gasto. Este test es la costura.
const leer = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

/** Saca el array literal que sigue a `marca` y devuelve sus cadenas en orden. */
function listaTras(texto, marca) {
  const i = texto.indexOf(marca);
  assert.notEqual(i, -1, `no se encuentra «${marca}»: ¿lo han renombrado?`);
  const abre = texto.indexOf("[", i);
  const cierra = texto.indexOf("]", abre);
  assert.ok(abre !== -1 && cierra > abre, `array mal formado tras «${marca}»`);
  return [...texto.slice(abre, cierra).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
}

describe("los establecimientos son los mismos en todas las copias", () => {
  test("son ocho y no están vacíos", () => {
    assert.equal(LOCALES.length, 8);
    assert.ok(LOCALES.every((l) => typeof l === "string" && l.trim()));
    assert.equal(new Set(LOCALES).size, 8, "hay uno repetido");
  });

  test("public/auth.js (el que ve el navegador) coincide", () => {
    assert.deepEqual(listaTras(leer("public/auth.js"), "const LOCALES = ["), LOCALES);
  });

  test("INV_LOCALES de server.js coincide", () => {
    assert.deepEqual(listaTras(leer("server.js"), "const INV_LOCALES = ["), LOCALES);
  });

  test("CATALOGO_CANONICO de la reconciliación coincide", () => {
    assert.deepEqual(listaTras(leer("src/db/reconciliation.js"), "CATALOGO_CANONICO = ["), LOCALES);
  });

  test("SARA_LOCALES es el mismo menos Oficina, donde no se reserva mesa", () => {
    // Sara atiende reservas; Oficina no tiene comedor. Cualquier OTRA diferencia sí es un error.
    assert.deepEqual(listaTras(leer("server.js"), "const SARA_LOCALES = ["), LOCALES.filter((l) => l !== "Oficina"));
  });
});

describe("las tres puertas de entrada de facturas canonizan el local", () => {
  const srv = leer("server.js");
  for (const [ruta, tabla] of [
    ['app.post("/api/facturas/grupos"', "facturas_grupos"],
    ['app.post("/api/facturas/email-reglas"', "facturas_email_reglas"],
    ['app.post("/api/facturas/drive-carpetas"', "facturas_drive_carpetas"],
  ]) {
    test(`${tabla}: no se guarda un local sin pasar por canonizarLocal`, () => {
      const i = srv.indexOf(ruta);
      assert.notEqual(i, -1, `falta la ruta ${ruta}`);
      const bloque = srv.slice(i, i + 1400);
      assert.match(bloque, /canonizarLocal\(local\)/, "el canal marca el local de todo lo que entra por él");
      assert.match(bloque, /localCanon/, "hay que guardar el canónico, no el original");
    });
  }
});
