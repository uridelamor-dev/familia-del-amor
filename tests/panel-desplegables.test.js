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
    // Solo hay UN sitio que abra un desplegable desde el código, y solo para devolver a su
    // sitio lo que ya estaba abierto. Si aparece otro, este test lo caza.
    const aperturas = [...panel.matchAll(/\.open = true/g)].length;
    assert.equal(aperturas, 1, "alguien abre desplegables por su cuenta");
    assert.match(panel, /if \(x\.clave && abiertos\.has\(x\.clave\)\) x\.d\.open = true;/);
  });

  test("lo que sí se conserva es lo que TÚ abriste, al repintar", () => {
    // No es abrirse solo: es no cerrarse en las narices de quien lo está mirando cuando el
    // bloque se vuelve a pintar tras una acción —guardar la categoría de un proveedor, por
    // ejemplo—, que además es justo cuando se va a seguir con el siguiente.
    assert.match(panel, /function pintarConservandoPliegues\(caja, html\)/);
    assert.match(panel, /const estaba = caja\.querySelector\("details"\)\?\.open/);
  });

  test("los desplegables se reconocen por su TÍTULO, no por el texto entero", () => {
    // El texto del resumen lleva el contador —«12 sin etiquetar»— y ese contador cambia justo
    // al guardar, que es cuando hay que reconocerlos.
    assert.match(panel, /d\.querySelector\("summary h3"\)\?\.textContent/);
  });

  test("y los bloques que se repintan lo usan", () => {
    for (const sitio of ["facCategoriasHtml\\(\\)", "dicProductosHtml\\(\\)"]) {
      assert.match(panel, new RegExp(`pintarConservandoPliegues\\([^,]+, ${sitio}\\)`), sitio);
    }
    assert.match(panel, /pintarConservandoPliegues\(cont, `\$\{barra\}/);
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

describe("las llamadas a la API usan la función que toca", () => {
  test("`apiRaw` es solo GET: nadie le pasa método ni cuerpo", () => {
    // Se le pasó `{ method: "POST", body }` y los ignoró: la petición salió como GET, cayó en
    // la ruta `/api/campanas/:id` y lo que se vio en pantalla fue «invalid input syntax for
    // type integer: "redactar"». Para mandar algo está `apiSend(metodo, ruta, cuerpo)`.
    const malas = [...panel.matchAll(/apiRaw\([^)]*,\s*\{/g)].map((m) => m[0]);
    assert.deepEqual(malas, [], "apiRaw no acepta opciones; usa apiSend");
  });
});
