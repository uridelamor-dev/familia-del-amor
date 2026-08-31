import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// El kiosco de fichar enseña las reservas del día ANTES del PIN: la tablet está en la zona de
// trabajo y eso es lo que se mira al entrar a currar. Pero esa pantalla es la única del sistema
// que contesta SIN SESIÓN —se entra con el token de la tablet, que va en la URL—, así que hay
// que dar por hecho que lo que sale ahí puede verse desde fuera del local. De ahí estos candados.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const kiosco = readFileSync(new URL("../public/fichar.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/fichar.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/fichar.css", import.meta.url), "utf8");

// El endpoint público entero, desde su firma hasta el del PIN.
const endpoint = server.slice(
  server.indexOf('app.get("/api/fichar/:token"'),
  server.indexOf('app.post("/api/fichar/:token/pin"'));

describe("las reservas del día en la pantalla previa al PIN", () => {
  test("el endpoint público las trae", () => {
    assert.ok(endpoint.length > 0, "no se ha encontrado GET /api/fichar/:token");
    assert.match(endpoint, /FROM reservas WHERE local = ANY\(\?\) AND dia = \?/);
    assert.match(endpoint, /resumenDelDia\(/);
  });

  test("EL TELÉFONO NO SALE — ni en el SELECT ni en la respuesta", () => {
    // El invariante de esta pantalla. `reservas` guarda el teléfono como NOT NULL, así que un
    // `SELECT *` lo mandaría entero a una URL que no pide contraseña.
    assert.doesNotMatch(endpoint, /telefono/,
      "GET /api/fichar/:token no puede tocar el teléfono de nadie: se ve sin sesión");
    assert.doesNotMatch(endpoint, /SELECT \*\s+FROM reservas/,
      "nada de SELECT * sobre reservas aquí: hay que nombrar las columnas que salen");
  });

  test("se miran las barras del centro con el ámbito de reservas", () => {
    // En Blanes las dos barras llevan una sola agenda. Con el ámbito equivocado, media sala
    // no aparecería en la tablet.
    assert.match(endpoint, /barrasDelCentro\(disp\.local, "reservas"\)/);
  });

  test("si la consulta falla, el kiosco sigue dejando fichar", () => {
    // Fichar es obligatorio por ley; ver la agenda es una comodidad. Lo segundo no puede
    // tumbar lo primero.
    assert.match(endpoint, /let reservas = \[\];\s*\n\s*try \{/);
  });
});

describe("la pantalla", () => {
  test("el bloque va dentro del paso «¿Quién eres?», no después del PIN", () => {
    const paso = html.slice(html.indexOf('id="ficPasoQuien"'), html.indexOf('id="ficPasoPin"'));
    assert.match(paso, /id="ficDia"/);
    assert.match(paso, /id="ficDiaTurnos"/);
  });

  test("ocupa poco: va DESPUÉS de los botones de fichar, nunca antes", () => {
    // Es una chuleta al lado de los botones, no la pantalla de reservas. Si se colara por
    // encima de la rejilla de personas, empujaría fuera lo único que la tablet debe hacer bien.
    const paso = html.slice(html.indexOf('id="ficPasoQuien"'), html.indexOf('id="ficPasoPin"'));
    assert.ok(paso.indexOf('id="ficEquipo"') < paso.indexOf('id="ficDia"'),
      "el bloque del día tiene que ir debajo de la rejilla del equipo");
    // Y las mesas se reparten en columnas: veinte apiladas empujan la pantalla hacia abajo.
    assert.match(css, /#ficDiaTurnos \{[^}]*grid-template-columns: repeat\(auto-fill/);
  });

  test("solo se pinta lo que queda por llegar, y hay tope", () => {
    const fn = kiosco.slice(kiosco.indexOf("function pintarDia("), kiosco.indexOf("var CLAVE_PLANTILLA"));
    assert.match(fn, /\(resumen\.lista \|\| \[\]\)\.forEach/);
    assert.match(fn, /resumen\.mas/, "lo que no cabe se cuenta, no se esconde");
  });

  test("nace plegado y se pinta al cargar el equipo", () => {
    assert.match(html, /class="fic-dia hidden" id="ficDia"/);
    assert.match(kiosco, /pintarEquipo\(\);\s*\n\s*pintarDia\(r\.datos\.reservas\);/);
  });

  test("el nombre del cliente se escribe con textContent, nunca con innerHTML", () => {
    // Lo teclea quien coge el teléfono y acaba en una pantalla pública.
    const fn = kiosco.slice(kiosco.indexOf("function pintarDia("), kiosco.indexOf("var CLAVE_PLANTILLA"));
    assert.match(fn, /nom\.textContent = r\.nombre/);
    // Lo único que se permite hacer con innerHTML aquí es VACIAR. Construir HTML con el
    // nombre de un cliente en una pantalla que se sirve sin sesión es la forma de que un
    // «<img onerror=…>» apuntado en una reserva se ejecute en la tablet de la barra.
    const asignaciones = fn.match(/innerHTML\s*\+?=[^;]*/g) || [];
    for (const a of asignaciones) {
      assert.match(a, /^innerHTML = ""$/, `innerHTML solo puede vaciarse, y aquí hace: ${a}`);
    }
  });

  test("sin línea no se enseña una agenda de ayer", () => {
    // La plantilla de nombres sí se guarda (cambia cada meses); las reservas no, por lo mismo
    // que no se guardan los estados: una agenda vieja no se distingue mirándola.
    assert.match(kiosco, /pintarDia\(null\)/);
    assert.doesNotMatch(kiosco, /guardarPlantilla\(\{[^}]*reservas/s);
  });
});
