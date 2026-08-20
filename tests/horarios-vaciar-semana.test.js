import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Vaciar la semana borra turnos de golpe: es la acción más destructiva del cuadrante y por eso
// tiene tres frenos, no uno.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
const ep = server.slice(server.indexOf('app.post("/api/horarios/semana/:id/vaciar"'),
                        server.indexOf("// Contexto para detectar conflictos"));

describe("vaciar una semana", () => {
  test("solo sobre un BORRADOR, y lo decide el servidor", () => {
    // Vaciar un horario que el equipo ya está leyendo no es editar: es dejarles sin turnos
    // sin avisar. `horSemanaEditable` corta si está publicada, igual que el resto de la edición.
    assert.match(ep, /const chk = await horSemanaEditable\(req, req\.params\.id\)/);
    assert.match(ep, /if \(chk\.error\) return res\.status\(chk\.error\)/);
  });

  test("NO borra vacaciones, libranzas ni bajas", () => {
    // No son planificación: son dónde está cada uno. Borrarlas obligaría a volver a ponerlas
    // una a una, y así es como se acaba citando a alguien un día que no está.
    assert.match(ep, /DELETE FROM hor_asignaciones WHERE semana_id = \? AND COALESCE\(tipo,'turno'\) = 'turno'/);
    assert.ok(!/DELETE FROM hor_asignaciones WHERE semana_id = \?`/.test(ep), "borraría todo, no solo los turnos");
  });

  test("dice cuántos ha quitado, y se cuentan ANTES de borrar", () => {
    // `dbRun` devuelve la fila del RETURNING, no el número de filas tocadas: contar después
    // daría siempre cero.
    const iCount = ep.indexOf("SELECT COUNT(*)::int AS n");
    const iDelete = ep.indexOf("DELETE FROM hor_asignaciones");
    assert.ok(iCount !== -1 && iCount < iDelete, "el recuento tiene que ir antes del borrado");
    assert.match(ep, /quitados/);
  });

  test("y exige los roles de horarios", () => {
    assert.match(server, /app\.post\("\/api\/horarios\/semana\/:id\/vaciar", requireAuth\(HORARIOS_ROLES\)/);
  });
});

describe("el botón avisa antes de que sea tarde", () => {
  const fn = panel.slice(panel.indexOf("async function horVaciar()"), panel.indexOf("// ── Repetir un turno"));

  test("solo aparece si hay turnos que quitar", () => {
    // Un botón de vaciar sobre una semana vacía no hace nada y encima da miedo pulsarlo.
    assert.match(panel, /\$\{turnos \? '<button class="btn danger" data-act="hor-vaciar"/);
    assert.match(panel, /const turnos = \(HOR\.asignaciones \|\| \[\]\)\.filter\(\(a\) => \(a\.tipo \|\| "turno"\) === "turno"\)\.length/);
  });

  test("pide confirmación diciendo el número y que no se deshace", () => {
    assert.match(fn, /confirmModal\(/);
    assert.match(fn, /Se quitan \$\{num\(turnos\)\}/);
    assert.match(fn, /no se puede deshacer/i);
    assert.match(fn, /danger: true/);
  });

  test("y dice qué se queda, que es la mitad de la tranquilidad", () => {
    assert.match(fn, /se quedan/);
    assert.match(fn, /vacaciones/i);
  });
});
