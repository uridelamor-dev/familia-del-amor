import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idiomaDeContacto, IDIOMA_BASE } from "../src/modules/messaging/i18n.js";

// EL FALLO: una campaña filtrada por «español» salía con CERO destinatarios, siempre, y sin
// decir por qué. La causa: `marketing_prefs.idioma` SOLO se rellena cuando se detecta un idioma
// distinto del base —quien habla castellano tiene la columna vacía—, así que `mp.idioma = 'es'`
// no casaba con nadie. El resto del sistema ya lo sabía (`idiomaDeContacto` devuelve el base
// cuando no hay nada guardado); la consulta del segmento era la única que no.
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

describe("filtrar por el idioma de la casa incluye a quien no tiene idioma guardado", () => {
  test("sin idioma guardado, un contacto habla el idioma base", () => {
    // Esta es la regla que la consulta tenía que respetar.
    assert.equal(idiomaDeContacto({}), IDIOMA_BASE);
    assert.equal(idiomaDeContacto({ idioma: null }), IDIOMA_BASE);
    assert.equal(idiomaDeContacto({ idioma: "ca" }), "ca");
  });

  test("y la consulta del segmento hace lo mismo", () => {
    const i = server.indexOf("if (idioma) {");
    const b = server.slice(i, i + 420);
    assert.match(b, /idioma === IDIOMA_BASE/, "el base necesita su rama: nadie lo tiene guardado");
    assert.match(b, /mp\.idioma IS NULL OR mp\.idioma = ''/);
  });

  test("los demás idiomas siguen siendo un filtro exacto", () => {
    // Pedir «los ingleses» no puede colar a quien no tiene idioma: ese habla castellano.
    const i = server.indexOf("if (idioma) {");
    const b = server.slice(i, i + 420);
    assert.match(b, /else sql \+= ` AND mp\.idioma = \?`/);
  });
});

describe("la IA no puede confundir «en su idioma» con «solo los que hablan X»", () => {
  const tool = server.slice(server.indexOf("const CAMPANA_TOOL"), server.indexOf("app.post(\"/api/campanas/redactar\""));

  test("el campo idioma avisa de que EXCLUYE", () => {
    // «Que les llegue en su idioma» es lo contrario de un filtro: el envío ya traduce solo a
    // quien tenga otro idioma. Ponerlo dejaba fuera justo a los que se quería alcanzar.
    const i = tool.indexOf("idioma: { type: \"string\"");
    const campo = tool.slice(i, i + 420);
    assert.match(campo, /SOLO si piden/);
    assert.match(campo, /NO uses este campo/);
    assert.match(campo, /traduce/);
  });

  test("y el campo origen también, que es el otro que recorta sin que se note", () => {
    const i = tool.indexOf("origen: { type: \"string\"");
    const campo = tool.slice(i, i + 420);
    assert.match(campo, /reservo_from/, "«todos los que han reservado» son las fechas, no el origen");
  });
});
