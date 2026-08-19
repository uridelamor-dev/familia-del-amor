import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// EL FALLO: marcar «juntar» en varios establecimientos no servía de nada. El botón se quedaba
// en «Marca dos o más para juntarlos», deshabilitado, por muchas casillas que se marcaran, así
// que ver dos locales sumados era IMPOSIBLE y la casilla parecía no hacer nada.
//
// La causa: el conjunto de marcados se calculaba solo desde el ámbito YA APLICADO —el local
// actual— e ignoraba `SELECCION`, que es justo lo que se está construyendo al marcar. El
// contador nunca pasaba de 1.
//
// Efecto secundario del mismo error: tampoco se podía QUITAR el local actual del conjunto, así
// que «ver Lloret y Girona juntos» estando en Blanes arrastraba Blanes sin remedio.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

const bloque = (desde, hasta) => {
  const i = panel.indexOf(desde);
  assert.notEqual(i, -1, `no está: ${desde}`);
  const j = panel.indexOf(hasta, i + desde.length);
  return panel.slice(i, j === -1 ? i + 2000 : j);
};

describe("juntar dos establecimientos para verlos sumados", () => {
  test("lo que se pinta cuenta lo que hay marcado, no solo el ámbito aplicado", () => {
    const b = bloque("const marcados = new Set(", "const fila = (l)");
    assert.match(b, /SELECCION\.length \? SELECCION/, "sin esto el contador se queda clavado en 1");
  });

  test("y al marcar se parte de lo mismo, o se perdería lo ya elegido", () => {
    const b = bloque('else if (act === "estab-marca")', 'else if (act === "estab-varios")');
    assert.match(b, /SELECCION\.length \? SELECCION/);
    assert.match(b, /if \(t\.checked\) actuales\.add\(l\); else actuales\.delete\(l\)/,
      "desmarcar tiene que quitar de verdad: si no, el local actual no se puede sacar del conjunto");
  });

  test("el botón se habilita con dos o más y dice cuántos", () => {
    const b = bloque('data-act="estab-varios"', "</button>");
    assert.match(b, /n > 1 \? "" : "disabled"/);
    assert.match(b, /Ver los \$\{n\} juntos/);
  });

  test("y aplicarlo pone el ámbito en «varios» sin cambiar de pantalla", () => {
    const b = bloque('else if (act === "estab-varios")', 'else if (act === "ag-metodos")');
    assert.match(b, /if \(SELECCION\.length < 2\) return;/);
    assert.match(b, /DASH_LOCAL = VARIOS/);
    assert.match(b, /go\(CURRENT/, "juntar establecimientos no debe sacarte de donde estabas");
  });
});
