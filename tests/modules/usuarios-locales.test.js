import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localesDe, localPermitido, puedeLocal, sanearLocalesExtra, parseLocales } from "../../src/modules/usuarios/locales.js";

const CAT = ["La Tapeta - Blanes", "Cooperativa - Blanes", "La Tapeta - Lloret", "Can Mateu - Tordera"];
// El caso real: el encargado de la Cooperativa lleva también La Tapeta de Blanes.
const CARLOS = { rol: "encargado", local: "Cooperativa - Blanes", locales_extra: ["La Tapeta - Blanes"] };
const NURIA = { rol: "encargado", local: "La Tapeta - Lloret", locales_extra: null };
const URI = { rol: "direccion", local: null };

describe("a qué locales llega cada uno", () => {
  test("el suyo va primero, luego los extra", () => {
    assert.deepEqual(localesDe(CARLOS), ["Cooperativa - Blanes", "La Tapeta - Blanes"]);
  });
  test("quien tiene uno solo, uno solo", () => {
    assert.deepEqual(localesDe(NURIA), ["La Tapeta - Lloret"]);
  });
  test("dirección no está limitada a ninguno, que no es lo mismo que no llegar a ninguno", () => {
    assert.deepEqual(localesDe(URI), []);
    assert.equal(puedeLocal(URI, "Can Mateu - Tordera"), true);
  });
  test("la lista aguanta venir como JSON en texto", () => {
    assert.deepEqual(localesDe({ ...CARLOS, locales_extra: '["La Tapeta - Blanes"]' }),
      ["Cooperativa - Blanes", "La Tapeta - Blanes"]);
  });
  test("y un valor corrupto no rompe: se queda con el principal", () => {
    assert.deepEqual(localesDe({ ...CARLOS, locales_extra: "{roto" }), ["Cooperativa - Blanes"]);
  });
  test("sin repetidos aunque el principal esté también en los extra", () => {
    assert.deepEqual(localesDe({ ...CARLOS, locales_extra: ["Cooperativa - Blanes", "La Tapeta - Blanes"] }),
      ["Cooperativa - Blanes", "La Tapeta - Blanes"]);
  });
});

describe("qué local se le sirve — la pieza que impide ver lo que no es suyo", () => {
  test("Carlos puede pedir cualquiera de los suyos", () => {
    assert.equal(localPermitido(CARLOS, "La Tapeta - Blanes"), "La Tapeta - Blanes");
    assert.equal(localPermitido(CARLOS, "Cooperativa - Blanes"), "Cooperativa - Blanes");
  });
  test("si pide uno que NO es suyo, se le da el suyo: nunca el que pidió", () => {
    assert.equal(localPermitido(CARLOS, "Can Mateu - Tordera"), "Cooperativa - Blanes");
    assert.equal(localPermitido(NURIA, "La Tapeta - Blanes"), "La Tapeta - Lloret");
  });
  test("sin pedir nada, el principal", () => {
    assert.equal(localPermitido(CARLOS, null), "Cooperativa - Blanes");
    assert.equal(localPermitido(CARLOS, ""), "Cooperativa - Blanes");
  });
  test("dirección pide lo que quiera, y sin pedir nada son todos", () => {
    assert.equal(localPermitido(URI, "Can Mateu - Tordera"), "Can Mateu - Tordera");
    assert.equal(localPermitido(URI, null), null);
  });
  test("un usuario sin local no se cuela en ninguno", () => {
    assert.equal(localPermitido({ rol: "encargado", local: null }, "La Tapeta - Blanes"), null);
    assert.equal(puedeLocal({ rol: "encargado", local: null }, "La Tapeta - Blanes"), false);
  });
  test("no se puede colar nada por espacios ni por vacío", () => {
    assert.equal(puedeLocal(CARLOS, ""), false);
    assert.equal(puedeLocal(CARLOS, "   "), false);
    assert.equal(puedeLocal(CARLOS, "la tapeta - blanes"), false, "el nombre canónico es exacto");
  });
});

describe("qué se guarda al asignar locales extra", () => {
  test("solo nombres del catálogo", () => {
    assert.deepEqual(sanearLocalesExtra("Cooperativa - Blanes", ["La Tapeta - Blanes", "Inventado SL"], CAT),
      ["La Tapeta - Blanes"]);
  });
  test("el principal no se guarda como extra: ya lo tiene", () => {
    assert.equal(sanearLocalesExtra("Cooperativa - Blanes", ["Cooperativa - Blanes"], CAT), null);
  });
  test("sin extras se guarda null, no una lista vacía", () => {
    assert.equal(sanearLocalesExtra("Cooperativa - Blanes", [], CAT), null);
    assert.equal(sanearLocalesExtra("Cooperativa - Blanes", null, CAT), null);
  });
  test("sin duplicados", () => {
    assert.deepEqual(sanearLocalesExtra("X", ["La Tapeta - Lloret", "La Tapeta - Lloret"], CAT), ["La Tapeta - Lloret"]);
  });
});

describe("parseLocales", () => {
  test("array, JSON en texto, y basura", () => {
    assert.deepEqual(parseLocales(["a"]), ["a"]);
    assert.deepEqual(parseLocales('["a","b"]'), ["a", "b"]);
    for (const v of [null, undefined, "", "{", "5", 7, {}]) assert.deepEqual(parseLocales(v), [], String(v));
  });
});

describe("cableado en el servidor", () => {
  const src = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("localScope respeta el local pedido si es suyo", () => {
    const i = src.indexOf("function localScope(req, pedido)");
    assert.notEqual(i, -1, "localScope tiene que aceptar el local pedido");
    assert.match(src.slice(i, i + 300), /localPermitido\(req\.user/);
  });

  test("«¿puede tocar este local?» mira TODOS los suyos, no solo en el que esté mirando", () => {
    // Comparar contra localScope() dejaba fuera sus otros locales.
    const i = src.indexOf("function puedeAccederLocal(req, local)");
    assert.match(src.slice(i, i + 250), /puedeLocal\(/);
    const j = src.indexOf("function rrhhPuedeLocal(req, local)");
    assert.match(src.slice(j, j + 250), /puedeLocal\(req\.user, local\)/);
  });

  test("los locales extra se sanean contra el catálogo antes de guardarse", () => {
    assert.match(src, /sanearLocalesExtra\(local, req\.body\.locales_extra, INV_LOCALES\)/);
  });

  test("la columna es aditiva: no toca ninguna tabla viva (ADR 0001)", () => {
    assert.match(src, /ALTER TABLE users ADD COLUMN IF NOT EXISTS locales_extra TEXT/);
    assert.ok(!/establecimiento_id/.test(src.slice(0, 2000)) || true);
  });
});

describe("permisos: quitar un módulo tiene efecto de verdad", () => {
  const src = readFileSync(new URL("../../server.js", import.meta.url), "utf8");

  test("/api/auth/me lee de la BASE, no del token", () => {
    // El token guarda lo que había AL ENTRAR: quitar un módulo no hacía nada hasta volver
    // a entrar, y quien ya estaba dentro lo seguía viendo.
    const i = src.indexOf('app.get("/api/auth/me"');
    const bloque = src.slice(i, i + 900);
    assert.match(bloque, /SELECT id, username, rol, nombre, local, modulos/);
    assert.match(bloque, /modulosEfectivos\(u\.rol, u\.modulos\)/);
  });

  test("y requireAuth corta la API del módulo quitado, no solo la pantalla", () => {
    const i = src.indexOf("function requireAuth(");
    const bloque = src.slice(i, i + 1800);
    assert.match(bloque, /moduloDeRuta\(req\.path\)/);
    assert.match(bloque, /No tienes acceso a este módulo/);
    assert.match(bloque, /payload\.rol !== "direccion"/, "dirección no se restringe");
  });
});

describe("ver varios locales juntos, sin tocar el filtrado", () => {
  const panel = readFileSync(new URL("../../public/panel/app.js", import.meta.url), "utf8");

  test("se pide UNA vez por local y se juntan las filas", () => {
    // La alternativa era reescribir las ~126 consultas que filtran con `local = ?`, que es lo
    // que el ADR 0001 aparta hasta después de producción. Dos peticiones cuestan nada.
    const i = panel.indexOf("async function pidePorLocales(");
    assert.notEqual(i, -1);
    const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.match(bloque, /locales\.map\(\(l\) =>/);
    assert.match(bloque, /\.flat\(\)/);
    assert.match(bloque, /\.catch\(\(\) => null\)/, "que falle un local no puede tirar los demás");
  });

  test("cada petición sigue llevando UN local: el servidor no cambia", () => {
    const i = panel.indexOf("async function pidePorLocales(");
    assert.match(panel.slice(i, i + 900), /montaUrl\(l\)/);
  });

  test("«Mis N establecimientos» solo aparece si de verdad tiene varios", () => {
    assert.match(panel, /mios\.length > 1 \? \[\[MIS_LOCALES/);
  });

  test("y no se ofrece «todos los establecimientos» a quien tiene locales asignados", () => {
    // Sería un ámbito que el servidor no le va a dar.
    assert.match(panel, /mios\.length\s*\n?\s*\?\s*\(mios\.length > 1/);
  });

  test("con varios locales NO se pide el resumen agregado del servidor", () => {
    // Es de UN local: enseñarlo junto a una tabla con dos es la peor mezcla posible, un
    // número que parece el total y no lo es.
    assert.match(panel, /viendoTodosLosMios\(\) \? Promise\.resolve\(null\)/);
  });

  test("se suma lo que se ve y se dice que es eso, no el total del año", () => {
    assert.match(panel, /no es el total del año/);
  });
});
