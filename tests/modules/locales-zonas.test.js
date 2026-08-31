import test from "node:test";
import assert from "node:assert/strict";
import { zonaDe, zonas, localesDeZona, esZona } from "../../src/modules/locales/zonas.js";

// Los ocho de verdad, tal como están en INV_LOCALES.
const LOCALES = [
  "La Tapeta - Blanes", "La Tapeta - Lloret", "La Tapeta - Girona",
  "Can Mateu - Tordera", "La Tapa Ibérica - Tordera", "Botiga d'en Mateu - Tordera",
  "Cooperativa - Blanes", "Oficina",
];

test("el pueblo sale del propio nombre, sin lista que mantener", () => {
  assert.equal(zonaDe("Can Mateu - Tordera"), "Tordera");
  assert.equal(zonaDe("La Tapeta - Blanes"), "Blanes");
  assert.equal(zonaDe("Oficina"), null);
  assert.equal(zonaDe(""), null);
  assert.equal(zonaDe(null), null);
});

test("«los de Tordera» son los tres, con su nombre exacto", () => {
  // Es lo que se pidió para escribir a quien cenó durante la fiesta mayor.
  const t = localesDeZona("Tordera", LOCALES);
  assert.deepEqual(t, ["Can Mateu - Tordera", "La Tapa Ibérica - Tordera", "Botiga d'en Mateu - Tordera"]);
});

test("solo se ofrecen las zonas con más de un establecimiento", () => {
  // «Girona» como zona no añade nada sobre elegir el local: llena el desplegable de opciones
  // que no distinguen.
  const z = zonas(LOCALES).map((x) => x.zona);
  assert.deepEqual(z, ["Blanes", "Tordera"]);
  assert.equal(esZona("Girona", LOCALES), false);
  assert.equal(esZona("Tordera", LOCALES), true);
});

test("no distingue mayúsculas", () => {
  assert.equal(localesDeZona("tordera", LOCALES).length, 3);
  assert.equal(localesDeZona("TORDERA", LOCALES).length, 3);
});

test("una zona que no existe da lista vacía, no todos", () => {
  // Devolver todos ante un nombre desconocido convertiría una errata en una campaña masiva.
  assert.deepEqual(localesDeZona("Barcelona", LOCALES), []);
  assert.deepEqual(localesDeZona("", LOCALES), []);
});

test("la Oficina no forma zona: no tiene clientes", () => {
  assert.equal(zonas(LOCALES).find((z) => z.locales.includes("Oficina")), undefined);
});
