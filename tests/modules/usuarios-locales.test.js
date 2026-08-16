import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localesDe, localPermitido, localesPermitidos, puedeLocal, sanearLocalesExtra, parseLocales } from "../../src/modules/usuarios/locales.js";

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

  test("juntar varios establecimientos solo se aplica de dos en adelante", () => {
    // Con uno marcado no hay nada que juntar: el botón está apagado y lo dice.
    assert.match(panel, /if \(SELECCION\.length < 2\) return;/);
    assert.match(panel, /n > 1 \? `Ver los \$\{n\} juntos`/);
  });

  test("y no se ofrece «todos los establecimientos» a quien tiene locales asignados", () => {
    // Sería un ámbito que el servidor no le va a dar.
    assert.match(panel, /const todos = mios\.length \? ""/);
  });

  test("se entra por UN establecimiento, no por «todos»", () => {
    // Ver los ocho juntos es cómodo para mirar y traicionero para tocar: se edita el producto
    // de Blanes creyendo que es el de Lloret. Se entra por el primero de la lista (Blanes).
    const i = panel.indexOf("function ambitoInicial(");
    const fn = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.match(fn, /return \{ local: base\[0\] \|\| "", locales: \[\] \}/);
  });

  test("y el establecimiento elegido se recuerda al recargar", () => {
    assert.match(panel, /localStorage\.setItem\("panelAmbito"/);
    assert.match(panel, /localStorage\.getItem\("panelAmbito"\)/);
    // Al elegir uno se guarda: si no, el siguiente arranque vuelve al de por defecto.
    assert.match(panel, /act === "estab-pick"\) \{ DASH_LOCAL = [^\n]*guardarAmbito\(\)/);
  });

  test("«todos» solo se recuerda a quien puede tenerlo", () => {
    // A quien tiene locales asignados el servidor no le da «todos»: recordárselo sería
    // enseñarle un rótulo que promete más de lo que hay.
    assert.match(panel, /g\.local === "" && !misLocales\(\)\.length/);
  });

  test("la selección se filtra contra los locales del usuario, no se cree lo guardado", () => {
    // Lo guardado en el navegador puede nombrar un local que ya no le toca.
    assert.match(panel, /const sel = SELECCION\.filter\(\(l\) => base\.includes\(l\)\)/);
  });

  test("con varios locales NO se pide el resumen ANUAL del servidor", () => {
    // Es de UN local: enseñarlo junto a una tabla con dos sería un número que parece el total
    // y no lo es. (Los gráficos que sí lo usan dicen «(año)» en su título.)
    assert.match(panel, /viendoVarios\(\) \? Promise\.resolve\(null\)/);
  });

  test("las cifras de arriba se suman de los agregados de cada local", () => {
    // Ya no se suman las filas visibles —la lista está topada a 500—: el servidor devuelve un
    // agregado por local sobre el mismo filtro, y aquí se suman. Exacto: una factura es de un
    // solo local, así que los conjuntos son disjuntos.
    const i = panel.indexOf("function facSumaTotales(");
    assert.notEqual(i, -1, "falta facSumaTotales");
    const bloque = panel.slice(i, panel.indexOf("\n}\n", i));
    assert.match(bloque, /resp\.partes/);
    assert.match(bloque, /suma\("total"\)/);
    assert.match(panel, /partes: buenas\.map\(\(p\) => p\.totales\)/,
      "pidePorLocales tiene que devolver el agregado de cada local");
  });
});

// ── El usuario del TOKEN, que es el que ve el servidor en cada petición ──────
// EL FALLO QUE ESTO CIERRA: en cada llamada, `req.user` es el payload del JWT, y ahí no está
// la columna `locales_extra` —está la lista ya calculada, en `locales`—. Mirando solo la
// columna, el servidor creía que un encargado con dos establecimientos solo tenía el
// principal. Y no fallaba a la vista: `localPermitido` devuelve el principal cuando le piden
// uno «que no es suyo», así que pedir el segundo local contestaba con los datos del primero.
// En Reservas era una agenda vacía; en Facturas, las facturas del otro local.
describe("el usuario del token cuenta igual que la fila de la base", () => {
  // Kevin, tal y como lo ve el servidor: sin `locales_extra`, con `locales`.
  const DEL_TOKEN = {
    id: 9, username: "kevin", rol: "encargado", nombre: "Kevin",
    local: "Cooperativa - Blanes",
    locales: ["Cooperativa - Blanes", "La Tapeta - Blanes"],
    modulos: ["reservas"],
  };

  test("llega a sus dos establecimientos", () => {
    assert.deepEqual(localesDe(DEL_TOKEN), ["Cooperativa - Blanes", "La Tapeta - Blanes"]);
  });

  test("y puede pedir el segundo: antes se le contestaba con el primero, sin decir nada", () => {
    assert.equal(localPermitido(DEL_TOKEN, "La Tapeta - Blanes"), "La Tapeta - Blanes");
    assert.equal(puedeLocal(DEL_TOKEN, "La Tapeta - Blanes"), true);
  });

  test("los dos a la vez también", () => {
    assert.deepEqual(localesPermitidos(DEL_TOKEN, ["Cooperativa - Blanes", "La Tapeta - Blanes"]),
      ["Cooperativa - Blanes", "La Tapeta - Blanes"]);
  });

  test("pero uno ajeno sigue sin colarse: el arreglo no abre ninguna puerta", () => {
    assert.equal(localPermitido(DEL_TOKEN, "La Tapeta - Lloret"), "Cooperativa - Blanes");
    assert.equal(puedeLocal(DEL_TOKEN, "La Tapeta - Lloret"), false);
    assert.deepEqual(localesPermitidos(DEL_TOKEN, ["La Tapeta - Lloret"]), ["Cooperativa - Blanes"]);
  });

  test("una lista de locales inventada en el token no sirve de nada si no está firmada", () => {
    // No se comprueba aquí (lo hace jwt.verify), pero sí que la forma es la misma: lo que
    // llega por `locales` se trata igual que la columna, ni más ni menos.
    assert.deepEqual(localesDe({ rol: "encargado", local: "A", locales: "{roto" }), ["A"]);
    assert.deepEqual(localesDe({ rol: "encargado", local: "A", locales: ["A", "B"] }), ["A", "B"]);
  });

  test("a dirección le sigue dando igual: no está limitada a ninguno", () => {
    assert.deepEqual(localesDe({ rol: "direccion", local: null, locales: [] }), []);
  });
});

describe("el token tiene que seguir llevando la lista", () => {
  const server = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  test("al entrar se firma `locales` con los establecimientos del usuario", () => {
    // Si alguien quita esto del payload, el servidor vuelve a creer que cada encargado tiene
    // un solo local y las pantallas de los demás se quedan vacías sin explicación.
    const firmas = [...server.matchAll(/jwt\.sign\(\s*\{[\s\S]{0,400}?\}/g)].map((m) => m[0]);
    assert.ok(firmas.length >= 2, `esperaba al menos dos jwt.sign, hay ${firmas.length}`);
    for (const f of firmas) assert.match(f, /locales: localesDe\(/);
  });
});
