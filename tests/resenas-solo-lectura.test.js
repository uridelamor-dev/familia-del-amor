import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGO_MODULOS } from "../src/modules/usuarios/permisos.js";

// Responder una reseña es hablar en nombre de la casa, en público y para siempre. Lo hacen
// dirección y marketing. El encargado y contabilidad ENTRAN en Reseñas —les sirve para saber
// qué se dice de su local— pero no escriben.
//
// Antes era al revés de lo que hacía falta: el encargado PODÍA responder y publicar borradores,
// y marketing —que es de quien es la tarea— NO podía.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

const ESCRIBEN = ["direccion", "marketing"];

describe("en Reseñas solo escriben dirección y marketing", () => {
  const rutas = [["/api/reviews/:id/reply", "responder"], ["/api/reviews/draft", "redactar con IA"],
                 ["/api/reviews/draft-bulk", "redactar en lote"], ["/api/reviews/refresh", "traer de Google"]];

  for (const [ruta, que] of rutas) {
    test(`${que} (${ruta})`, () => {
      const i = server.indexOf(`app.post("${ruta}"`);
      assert.notEqual(i, -1, `no está ${ruta}`);
      const cab = server.slice(i, i + 200);
      const m = cab.match(/requireAuth\(\[([^\]]+)\]\)/);
      assert.ok(m, `${ruta} sin requireAuth`);
      const roles = m[1].split(",").map((r) => r.trim().replace(/"/g, ""));
      assert.deepEqual([...roles].sort(), [...ESCRIBEN].sort(), `${ruta} deja escribir a quien no debe`);
    });
  }

  test("vincular la ficha de Google sigue siendo solo de dirección", () => {
    // Cambiar a qué ficha apunta un establecimiento reordena TODAS sus reseñas.
    assert.match(server, /app\.post\("\/api\/reviews\/vincular-ficha", requireAuth\(\["direccion"\]\)/);
  });

  test("pero LEER sigue abierto a los cuatro roles del módulo", () => {
    // Quitar la lectura sería otra cosa distinta de lo que se pidió: el encargado tiene que
    // poder ver qué dicen de su local.
    const i = server.indexOf('app.get("/api/reviews/manage"');
    const roles = server.slice(i, i + 200).match(/requireAuth\(\[([^\]]+)\]\)/)[1]
      .split(",").map((r) => r.trim().replace(/"/g, ""));
    const delModulo = CATALOGO_MODULOS.find((m) => m.id === "reviews").roles;
    assert.deepEqual([...roles].sort(), [...delModulo].sort());
  });
});

describe("y el panel no ofrece lo que va a dar un 403", () => {
  test("hay una única función que lo decide, espejo de los roles del servidor", () => {
    assert.match(panel, /const revPuedeResponder = \(\) => \["direccion", "marketing"\]\.includes\(USER\.rol\)/);
  });

  test("se esconden el botón de responder, la selección y las acciones en lote", () => {
    for (const q of [/revPuedeResponder\(\) \? `<div style="margin-top:10px[^]*?rev-responder/,
                     /r\.respondida \|\| !revPuedeResponder\(\)/,
                     /REV_SEL\.size && revPuedeResponder\(\)/]) {
      assert.match(panel, q);
    }
  });

  test("y también «Actualizar desde Google» y «Vincular fichas»", () => {
    for (const a of ["rev-refresh", "rev-vincular"]) {
      const i = panel.indexOf(`data-act="${a}"`);
      assert.match(panel.slice(Math.max(0, i - 260), i), /revPuedeResponder\(\)/, `${a} se sigue ofreciendo`);
    }
  });

  test("el rótulo no promete responder a quien no puede", () => {
    assert.match(panel, /responder es cosa de dirección/);
  });
});
