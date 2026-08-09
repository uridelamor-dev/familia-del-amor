import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// «Cumpleaños este mes» en Clientes no sacaba a nadie en agosto. Eran DOS fallos encadenados:
//
//   1. El panel mandaba `cumple_mes=1`, que era la marca de «casilla activada», y el servidor
//      lo leía como el mes 01. O sea: el filtro buscaba siempre enero.
//   2. El servidor hacía `nacimiento::date`, y basta UN contacto con la fecha de nacimiento en
//      blanco para que Postgres tire la consulta entera con un error de sintaxis de fecha.
//      Comprobado contra Postgres 16: `''::date` → ERROR: invalid input syntax for type date.
//
// Los dos se cierran aquí leyendo el código como texto, que es lo único que puede fallar sin
// base de datos delante.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("el mes que viaja es un mes de verdad", () => {
  test("cliQS manda el mes actual, no un «1» de casilla marcada", () => {
    const i = panel.indexOf("function cliQS()");
    assert.notEqual(i, -1);
    const bloque = panel.slice(i, panel.indexOf("\n}", i));
    assert.match(bloque, /cumple_mes",\s*mesActualMM\(\)/);
    assert.ok(!/cumple_mes",\s*"1"/.test(bloque), "«1» significaría enero para siempre");
  });

  test("y el cuerpo que va a campañas manda lo mismo", () => {
    const i = panel.indexOf("function filtrosClienteBody()");
    assert.notEqual(i, -1);
    assert.match(panel.slice(i, panel.indexOf("\n}", i)), /cumple_mes = mesActualMM\(\)/);
  });

  test("mesActualMM da dos dígitos y hora de Madrid", () => {
    const m = panel.match(/const mesActualMM = [^;]+;/);
    assert.ok(m, "falta mesActualMM");
    assert.match(m[0], /Europe\/Madrid/, "el mes es el de aquí, no el del navegador del cliente");
    assert.match(m[0], /slice\(5,\s*7\)/, "«sv-SE» da YYYY-MM-DD: el mes son los caracteres 5 y 6");
  });
});

describe("la consulta no puede reventar por una fecha en blanco", () => {
  test("no queda ningún `nacimiento::date` en el servidor", () => {
    assert.ok(!/nacimiento\s*::\s*date/.test(server),
      "un solo contacto con nacimiento vacío tira la lista entera de clientes");
  });

  test("se compara el trozo del mes, no una fecha convertida", () => {
    const i = server.indexOf("const mm = String(cumple_mes");
    assert.notEqual(i, -1, "¿se ha quitado el filtro de cumpleaños?");
    const bloque = server.slice(i, i + 900);
    assert.match(bloque, /substring\(c\.nacimiento, 6, 2\)/, "formato 1980-08-15");
    assert.match(bloque, /substring\(c\.nacimiento, 4, 2\)/, "formato 15/08/1980");
  });

  test("un mes que no es un mes se ignora en vez de filtrar por cualquier cosa", () => {
    const i = server.indexOf("const mm = String(cumple_mes");
    const bloque = server.slice(i, i + 900);
    assert.match(bloque, /\^\(0\[1-9\]\|1\[0-2\]\)\$/, "solo 01..12");
  });

  test("la condición va entre paréntesis: sin ellos el OR se comería el resto de filtros", () => {
    const i = server.indexOf("const mm = String(cumple_mes");
    const bloque = server.slice(i, i + 900);
    // `AND ( a OR b )`. Sin los paréntesis, «población = X AND mes = 08 OR mes = 08» sacaría
    // a todo el que cumpla en agosto viva donde viva.
    assert.match(bloque, /AND \(\s*\(c\.nacimiento/);
  });
});
