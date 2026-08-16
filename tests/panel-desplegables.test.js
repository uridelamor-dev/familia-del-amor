import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Un desplegable que viene abierto decide por quien mira: le ocupa la pantalla con algo que no
// ha pedido ver y esconde lo que hay debajo. Se abren cuando se pulsan, y no antes.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("los desplegables empiezan cerrados", () => {
  test("ninguno se pinta con `open` de casa", () => {
    // Ojo con las formas condicionales: `${x ? "open" : ""}` es exactamente lo mismo, y era
    // lo que tenían la mitad de ellos.
    const abiertos = [...panel.matchAll(/<details[^>]*\bopen\b[^>]*>/g)].map((m) => m[0]);
    // La única excepción legítima: conservar lo que el usuario YA había abierto al repintar.
    const salvo = abiertos.filter((d) => !/\$\{estaba \? "open" : ""\}/.test(d));
    assert.deepEqual(salvo, [], "hay desplegables que se abren solos");
  });

  test("y nadie los abre después por JavaScript", () => {
    assert.doesNotMatch(panel, /setAttribute\("open"/);
    assert.doesNotMatch(panel, /\.open\s*=\s*true/);
  });

  test("lo que sí se conserva es lo que TÚ abriste, al repintar", () => {
    // No es abrirse solo: es no cerrarse en las narices de quien lo está mirando cuando el
    // bloque se vuelve a pintar tras una acción.
    assert.match(panel, /const estaba = caja\.querySelector\("details"\)\?\.open/);
    assert.match(panel, /\$\{estaba \? "open" : ""\}/);
  });
});

describe("una respuesta a medias no puede tumbar una pantalla", () => {
  test("Productos aguanta que falten campos y dice por qué", () => {
    // Sin esto, un `j.lineas.length` con `lineas` sin llegar dejaba «Cargando…» para siempre:
    // ni el dato ni el motivo. Pasa si se piden varios establecimientos y fallan todos.
    const fn = panel.slice(panel.indexOf("async function refrescarCompras"), panel.indexOf("async function refrescarCompras") + 1600);
    assert.match(fn, /!Array\.isArray\(j\.grupos\)/);
    assert.match(fn, /errorCard\("No se han podido cargar los productos/);
  });
});
