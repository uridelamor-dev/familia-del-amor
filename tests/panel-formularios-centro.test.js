import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Al juntar Blanes con la Cooperativa quedaba una rendija: los FORMULARIOS del panel seguían
// ofreciendo las dos barras. Dar de alta a alguien en «Cooperativa - Blanes» lo dejaba fuera
// del centro —su cuadrante, sus fichajes y su ficha vivirían en una barra que el panel ya no
// enseña— y nadie entendería por qué había desaparecido.
//
// Importa sobre todo al empezar de cero: si los datos viejos se borran, todo lo que entre
// depende de lo que ofrezcan estos selectores.
//
// No hay excepciones: hay UN grupo de WhatsApp de reservas, UNO de facturas y UN solo TPV para
// las dos barras, así que dentro del panel Blanes es un establecimiento y nada más. Los dos
// locales de cara al cliente viven en la web pública y en las fichas de Google, que no se
// eligen con estas listas.
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("los formularios del panel no dejan crear nada en la barra suelta", () => {
  const usos = [...panel.matchAll(/^.*\bLOCALES\.map\(/gm)].map((m) => m[0].trim());

  test("NINGUNA lista del panel ofrece la barra suelta", () => {
    // Ni una excepción: hay un solo grupo de WhatsApp de reservas, uno de facturas y un solo
    // TPV para las dos barras, así que dentro del panel Blanes es un sitio y punto. Lo que
    // sigue siendo de cada barra —la web y la ficha de Google— no se elige con estas listas.
    assert.equal(usos.length, 0, `hay ${usos.length} listas con LOCALES crudo:\n` + usos.map((u) => "  " + u.slice(0, 110)).join("\n"));
  });

  test("el resto pasa por visiblesFE, que es lo que quita la barra secundaria", () => {
    assert.ok(panel.includes("function opcionesLocal("), "falta la función única de opciones");
    const n = (panel.match(/visiblesFE\(null, LOCALES\)/g) || []).length;
    assert.ok(n >= 12, `solo ${n} listas filtradas; se esperaban al menos 12`);
  });

  test("el alta de usuario y sus establecimientos extra también", () => {
    const i = panel.indexOf("function localesExtraHtml(");
    assert.match(panel.slice(i, i + 200), /visiblesFE\(null, LOCALES\)/);
    const j = panel.indexOf("function localOptionsHtml(");
    assert.match(panel.slice(j, j + 200), /opcionesLocal\(/);
  });
});

describe("el Dashboard no reabre la puerta por detrás", () => {
  const dash = readFileSync(new URL("../src/modules/dashboard/dashboard.service.js", import.meta.url), "utf8");

  test("agrupa por centro todos sus desgloses por local", () => {
    // Las ventas las manda el TPV de cada barra y una reserva está donde está: sin agrupar,
    // la Cooperativa reaparecía en el Dashboard como un establecimiento más.
    assert.match(dash, /import \{ agruparPorCentro \}/);
    for (const v of ["hoyLocalC", "ayerLocalC", "incPorLocalC", "gastoActC", "gastoPrevC", "ventasLocalC"]) {
      assert.match(dash, new RegExp(`const ${v} = porCentro\\(`), `falta agrupar ${v}`);
    }
  });

  test("y lo agrupado es lo que sale, no lo de antes", () => {
    const ret = dash.slice(dash.indexOf("  return {", dash.indexOf("const radar = buildRadar")));
    assert.match(ret, /hoyLocal: hoyLocalC/);
    assert.match(ret, /ventasLocal: ventasLocalC/);
    assert.match(dash, /buildRadar\(\{ hoyLocal: hoyLocalC/);
  });
});
