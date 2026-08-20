import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// «Sin atención al público» significa que no se reserva mesa y que no hay ventas de TPV. NO
// significa que no trabaje nadie: en la Oficina hay gente, y esa gente tiene turnos y ficha.
// Horarios y Fichajes estaban bloqueados para ella, que es como decir que quien trabaja allí
// no trabaja. Inventarios SÍ sigue vetado, pero por otro motivo y decidido a mano: allí no se
// cuenta material.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("un centro sin público tiene equipo, y el equipo trabaja", () => {
  const bloqueadas = [...panel.matchAll(/if \(sinPublico\([^)]*\)\) \{ view\.innerHTML = avisoSinPublico\("([^"]+)"/g)].map((m) => m[1]);

  test("solo se bloquean las tres que no aplican a un centro sin público", () => {
    assert.deepEqual([...bloqueadas].sort(), ["Analítica de ventas", "Inventarios", "Reservas"],
      "una pantalla de más aquí deja a la gente de la Oficina sin poder trabajar");
  });

  for (const p of ["Horarios", "Fichajes"]) {
    test(`${p} NO se bloquea`, () => assert.ok(!bloqueadas.includes(p), `${p} volvió a bloquearse`));
  }

  test("y el selector sigue ofreciendo la Oficina salvo en esas dos", () => {
    assert.match(panel, /const MODULOS_SOLO_PUBLICO = new Set\(\["reservas", "analitica"\]\)/);
  });

  test("el aviso ya no promete de menos", () => {
    // Decía «recibe facturas, incidencias y personal», sin mencionar los horarios ni los
    // fichajes. Un texto que se queda corto hace dudar de si la pantalla está rota.
    const i = panel.indexOf("function avisoSinPublico(");
    const fn = panel.slice(i, i + 1200);
    for (const q of ["horarios", "fichajes", "personal"]) assert.match(fn, new RegExp(q, "i"), q);
  });

  test("y en el servidor lo único vetado sigue siendo reservar mesa", () => {
    assert.equal((server.match(/esLocalSinPublico\(/g) || []).length, 1);
    const i = server.indexOf("esLocalSinPublico(local)");
    assert.match(server.slice(Math.max(0, i - 900), i), /reserva/i, "el único veto tiene que ser el de reservas");
  });
});
