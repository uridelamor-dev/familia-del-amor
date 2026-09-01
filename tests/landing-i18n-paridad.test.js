// Los textos de la web pública, en los tres idiomas y sin huecos.
//
// El fallo que esto caza es siempre el mismo: se añade una frase nueva, se traduce al catalán
// y al inglés se olvida. No revienta nada —`t2.loquesea` es undefined y se pinta «undefined»
// en medio de la pantalla, o no se pinta nada— así que se descubre semanas después y por un
// cliente. Por eso es un test y no una nota.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

// El objeto `i18n` entero, acotado antes de nada: buscar el cierre de cada bloque suelto
// se pasaba de largo en el último idioma y acababa leyendo las opciones de un `fetch`.
const I18N = (() => {
  const i = app.indexOf("const i18n = {");
  assert.ok(i > 0, "no se encuentra el objeto i18n");
  const j = app.indexOf("\n};", i);
  assert.ok(j > i, "no se encuentra el final del objeto i18n");
  return app.slice(i, j);
})();

/** Las claves de un bloque de idioma, leídas del fichero como texto. */
function clavesDe(lang) {
  const i = I18N.indexOf(`\n  ${lang}: {`);
  assert.ok(i > 0, `no se encuentra el bloque «${lang}» del i18n`);
  // Hasta el siguiente idioma, o hasta el final del objeto si es el último.
  const sig = /\n  [a-z]{2}: \{/g;
  sig.lastIndex = i + 1;
  const m = sig.exec(I18N);
  const cuerpo = I18N.slice(i, m ? m.index : I18N.length);
  return [...cuerpo.matchAll(/^\s{4}([a-z0-9_]+)\s*:/gm)].map((m2) => m2[1]);
}

describe("i18n de la landing", () => {
  const es = clavesDe("es"), ca = clavesDe("ca"), en = clavesDe("en");

  test("hay claves de sobra en los tres bloques (por si el lector falla)", () => {
    for (const [lang, k] of [["es", es], ["ca", ca], ["en", en]]) {
      assert.ok(k.length > 40, `«${lang}» solo tiene ${k.length} claves: el lector no está leyendo bien`);
    }
  });

  test("catalán e inglés tienen exactamente las mismas claves que el castellano", () => {
    const falta = (base, otro) => base.filter((k) => !otro.includes(k));
    assert.deepEqual(falta(es, ca), [], "faltan en catalán");
    assert.deepEqual(falta(es, en), [], "faltan en inglés");
    assert.deepEqual(falta(ca, es), [], "sobran en catalán (no están en castellano)");
    assert.deepEqual(falta(en, es), [], "sobran en inglés (no están en castellano)");
  });

  test("ninguna clave está repetida dentro de su idioma", () => {
    // Una clave repetida no da error: gana la última, y la primera se queda muerta sin que
    // nadie se entere.
    for (const [lang, k] of [["es", es], ["ca", ca], ["en", en]]) {
      const vistas = new Set(), repes = [];
      for (const x of k) { if (vistas.has(x)) repes.push(x); vistas.add(x); }
      assert.deepEqual(repes, [], `repetidas en «${lang}»`);
    }
  });

  test("los textos del cupón de bienvenida están en los tres", () => {
    for (const clave of ["lead_qr_listo", "lead_codigo", "lead_ya_emitido", "lead_ya_usado"]) {
      assert.ok(es.includes(clave), `${clave} falta en castellano`);
      assert.ok(ca.includes(clave), `${clave} falta en catalán`);
      assert.ok(en.includes(clave), `${clave} falta en inglés`);
    }
  });

  test("todas las claves que usa el código existen en castellano", () => {
    // `t.clave` y `t2.clave`: si alguien escribe una que no existe, aquí salta. Se descartan
    // las llamadas (`t.split(...)`), que son métodos de una variable llamada `t`, no textos.
    const usadas = [...app.matchAll(/\bt2?\.([a-z0-9_]+)\b(?!\s*\()/g)].map((m) => m[1]);
    const huerfanas = [...new Set(usadas)].filter((k) => !es.includes(k));
    assert.deepEqual(huerfanas, [], "el código pide textos que no existen");
  });
});
