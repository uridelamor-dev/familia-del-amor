// Mensajería — i18n (detección, agrupación, preservación de variables, prompt de traducción).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizarIdioma, detectarIdioma, idiomaDeContacto, necesitaTraduccion, agruparPorIdioma, idiomasPresentes, placeholdersDe, placeholdersIntactos, construirTraduccionRequest, IDIOMA_BASE } from "../../src/modules/messaging/i18n.js";

describe("normalizarIdioma", () => {
  test("2 letras conocidas; desconocido → null", () => {
    assert.equal(normalizarIdioma("CA"), "ca");
    assert.equal(normalizarIdioma("es-ES"), "es");
    assert.equal(normalizarIdioma("xx"), null);
    assert.equal(normalizarIdioma(""), null);
  });
});

describe("detectarIdioma", () => {
  test("castellano", () => {
    assert.equal(detectarIdioma("Hola, quería reservar una mesa para mañana por la noche, gracias"), "es");
  });
  test("catalán (distingue de castellano)", () => {
    assert.equal(detectarIdioma("Hola, voldria reservar una taula per demà al vespre, gràcies"), "ca");
  });
  test("inglés", () => {
    assert.equal(detectarIdioma("Hello, I would like to book a table for tomorrow, thanks"), "en");
  });
  test("francés", () => {
    assert.equal(detectarIdioma("Bonjour, je voudrais une réservation pour demain, merci"), "fr");
  });
  test("texto pobre o sin señal → null", () => {
    assert.equal(detectarIdioma("ok 👍"), null);
    assert.equal(detectarIdioma(""), null);
  });
});

describe("idiomaDeContacto / necesitaTraduccion", () => {
  test("usa el idioma guardado o el base", () => {
    assert.equal(idiomaDeContacto({ idioma: "ca" }), "ca");
    assert.equal(idiomaDeContacto({ idioma: null }), IDIOMA_BASE);
    assert.equal(idiomaDeContacto({ idioma: "zz" }, "es"), "es");
  });
  test("necesitaTraduccion solo si conocido y distinto del base", () => {
    assert.equal(necesitaTraduccion("ca"), true);
    assert.equal(necesitaTraduccion("es"), false);
    assert.equal(necesitaTraduccion("zz"), false);
    assert.equal(necesitaTraduccion("en", "en"), false);
  });
});

describe("agruparPorIdioma / idiomasPresentes", () => {
  const cs = [{ idioma: "ca" }, { idioma: "ca" }, { idioma: null }, { idioma: "en" }];
  test("agrupa por idioma efectivo (null → base)", () => {
    const g = agruparPorIdioma(cs, "es");
    assert.equal(g.ca.length, 2);
    assert.equal(g.es.length, 1);
    assert.equal(g.en.length, 1);
  });
  test("idiomasPresentes únicos", () => {
    assert.deepEqual(idiomasPresentes(cs, "es").sort(), ["ca", "en", "es"]);
  });
});

describe("preservación de variables", () => {
  test("placeholdersDe extrae {..} en minúsculas", () => {
    assert.deepEqual(placeholdersDe("Hola {nombre}, en {local}"), ["{nombre}", "{local}"]);
  });
  test("placeholdersIntactos true si mismo multiconjunto", () => {
    assert.equal(placeholdersIntactos("Hi {nombre} at {local}", "Hola {nombre} a {local}"), true);
    assert.equal(placeholdersIntactos("Hi {nombre}", "Hola"), false);
    assert.equal(placeholdersIntactos("{nombre} {nombre}", "{nombre}"), false);
  });
});

describe("construirTraduccionRequest", () => {
  test("system menciona idioma destino y marcadores a preservar; user = texto", () => {
    const r = construirTraduccionRequest("Hola {nombre}, ven a {local}", "ca");
    assert.match(r.system, /catalán/);
    assert.match(r.system, /\{nombre\}/);
    assert.match(r.system, /\{local\}/);
    assert.equal(r.messages[0].role, "user");
    assert.equal(r.messages[0].content, "Hola {nombre}, ven a {local}");
  });
});
