import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// `users.local` guarda la barra CONCRETA en la que se dio de alta cada persona, y el cableado
// de centros traduce lo que se PIDE, no lo que hay en cada ficha. Por eso toda consulta de
// personas tiene que mirar las dos barras del centro (`personasDe`).
//
// ESTE TEST EXISTE PORQUE SE ESCAPARON CUATRO. Al juntar Blanes cambié catorce consultas; otras
// cuatro —el generador de horarios entre ellas— estaban partidas en dos líneas, no casaron con
// la búsqueda y siguieron filtrando por una sola barra. Efecto: quien está dado de alta en la
// Cooperativa desaparecía de la propuesta del cuadrante, de las necesidades, del seguimiento y
// del emparejado del TPV. Nadie echa de menos a quien no ve.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("ninguna consulta de personas se queda en una sola barra", () => {
  test("no queda ni un `local = ?` sobre users", () => {
    // Se analiza la CONSULTA ENTERA, no dos líneas sueltas: mirando solo la línea anterior,
    // un `hor_areas WHERE local = ?` escrito justo debajo de otra consulta sobre `users` daba
    // un falso positivo. Aquí se trocea por plantillas SQL (lo que va entre acentos graves).
    const malas = [];
    for (const m of server.matchAll(/`([^`]*\b(?:FROM|JOIN)\s+users\b[^`]*)`/g)) {
      const sql = m[1];
      // Solo cuenta el `local` DE LA TABLA users. En la misma consulta puede haber un
      // `a.local = ?` de las áreas o un `c.local = ?` de las correcciones, y esos SÍ van por
      // una barra: lo que se escribe bajo el centro no necesita ampliarse al leer.
      const alias = [...sql.matchAll(/\b(?:FROM|JOIN)\s+users\s+(?:AS\s+)?(\w+)/gi)]
        .map((x) => x[1]).filter((a) => !/^(on|where|order|group|left|inner|join)$/i.test(a));
      const sinAlias = /\bFROM\s+users\b(?!\s+\w)/i.test(sql);
      const suyo = alias.some((a) => new RegExp(`\\b${a}\\.local = \\?`).test(sql))
        || (sinAlias && /(?<![.\w])local = \?/.test(sql));
      if (!suyo) continue;
      const linea = server.slice(0, m.index).split("\n").length;
      malas.push(`${linea}: ${sql.replace(/\s+/g, " ").trim().slice(0, 110)}`);
    }
    assert.deepEqual(malas, [], "consultas de personas filtradas por UNA barra en vez de por el centro");
  });

  test("y las que hay usan el helper, no una lista escrita a mano", () => {
    const n = (server.match(/personasDe\(/g) || []).length;
    assert.ok(n >= 15, `solo ${n} usos de personasDe; deberían ser todas las consultas de personas`);
    assert.match(server, /const personasDe = \(local\) => barrasDelCentro\(local, "personal"\)/);
  });

  test("el generador de horarios cuenta con la gente de las dos barras", () => {
    // Es la peor de las cuatro: repartía los turnos entre menos personas de las que hay.
    const i = server.indexOf('app.get("/api/horarios/plantilla"');
    assert.notEqual(i, -1);
    const fn = server.slice(i, i + 2200);
    assert.match(fn, /FROM users WHERE local = ANY\(\?\)/);
    assert.match(fn, /personasDe\(local\)/);
  });
});
