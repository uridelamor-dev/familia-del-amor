// Guardián anti-regresión: evita "X is not defined" por usar en server.js una función
// exportada por reviews.service.js sin haberla importado (lo que node --check NO detecta,
// porque el uso está dentro de un handler y solo falla en tiempo de ejecución).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as reviewsSvc from "../../src/modules/reviews/reviews.service.js";

const serverSrc = readFileSync(fileURLToPath(new URL("../../server.js", import.meta.url)), "utf8");

// Nombres importados desde reviews.service.js en server.js.
function importadosDeReviewsService(src) {
  const m = src.match(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*reviews\/reviews\.service\.js["']/);
  return new Set((m ? m[1] : "").split(",").map((s) => s.trim()).filter(Boolean));
}

test("toda función de reviews.service usada en server.js está importada (no ReferenceError)", () => {
  const importados = importadosDeReviewsService(serverSrc);
  const faltan = [];
  for (const name of Object.keys(reviewsSvc)) {
    if (typeof reviewsSvc[name] !== "function") continue;
    const usadaComoLlamada = new RegExp(`\\b${name}\\s*\\(`).test(serverSrc);
    if (usadaComoLlamada && !importados.has(name)) faltan.push(name);
  }
  assert.deepEqual(faltan, [], "Funciones de reviews.service usadas en server.js SIN importar: " + faltan.join(", "));
});

test("buildManageQuery está importada en server.js (regresión concreta corregida)", () => {
  assert.ok(importadosDeReviewsService(serverSrc).has("buildManageQuery"));
});
