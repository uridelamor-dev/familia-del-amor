import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAMPOS, sanearSegmento } from "../src/modules/marketing/segmento.js";
import { CLAVES_SEGMENTO, CLAVES_SEGMENTO_BOOL, construirSegmento, describirAudiencia } from "../src/modules/campaigns/campaigns.service.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

// EL FALLO GRANDE: la propuesta de la IA traía «los que reservaron entre el 20 y el 25» y, al
// pasar por el formulario del panel, ese filtro DESAPARECÍA —la lista de claves del panel se
// había quedado corta— y la campaña salía a todos los del local. Sin error, sin aviso y sin
// vuelta atrás. Estos candados existen para que no se repita con el siguiente filtro nuevo.
describe("ni un filtro se pierde por el camino", () => {
  test("el panel conoce TODOS los filtros que el servidor sabe aplicar", () => {
    const todas = new Set([...CLAVES_SEGMENTO, ...CLAVES_SEGMENTO_BOOL, "cumple_mes"]);
    const faltan = Object.keys(CAMPOS).filter((k) => !todas.has(k));
    assert.deepEqual(faltan, [], "hay filtros que el servidor aplica y el segmento del panel tira");
  });

  test("y no inventa ninguno que el servidor no sepa aplicar", () => {
    const sobran = [...CLAVES_SEGMENTO, ...CLAVES_SEGMENTO_BOOL].filter((k) => !CAMPOS[k]);
    assert.deepEqual(sobran, [], "filtros que el panel manda y el servidor ignoraría en silencio");
  });

  test("construirSegmento conserva las fechas de reserva — el caso que lo destapó", () => {
    const seg = construirSegmento({ local: "Can Mateu - Tordera", reservo_from: "2026-08-20", reservo_to: "2026-08-25" });
    assert.equal(seg.reservo_from, "2026-08-20");
    assert.equal(seg.reservo_to, "2026-08-25");
  });

  test("y la edad, los cumpleaños y lo que sabemos de la gente", () => {
    const seg = construirSegmento({ edad_min: 35, edad_max: 60, cumple_en_dias: 7, hecho_etiqueta: "dieta", hecho_valor: "celiaco", sin_email: true });
    for (const k of ["edad_min", "edad_max", "cumple_en_dias", "hecho_etiqueta", "hecho_valor", "sin_email"]) {
      assert.ok(seg[k] != null, `se perdió ${k}`);
    }
  });

  test("el espejo del panel dice lo mismo que el servicio", () => {
    const i = panel.indexOf("const CLAVES_SEGMENTO = [");
    const bloque = panel.slice(i, panel.indexOf("function construirSegmento", i));
    for (const k of [...CLAVES_SEGMENTO, ...CLAVES_SEGMENTO_BOOL]) {
      assert.ok(bloque.includes(`"${k}"`), `al panel le falta ${k}`);
    }
  });

  test("el formulario NO reconstruye desde cero: parte de lo heredado", () => {
    const i = panel.indexOf("const filtros = () => {");
    const fn = panel.slice(i, i + 900);
    assert.match(fn, /\.\.\.heredados/, "sin esto se pierden los filtros que el formulario no edita");
    assert.match(panel, /const HEREDABLES = \[/);
  });

  test("y se VEN, con su equis para quitarlos", () => {
    // Un filtro que viaja sin verse es tan peligroso como uno que se pierde.
    assert.match(panel, /id="campHeredados"/);
    assert.match(panel, /data-quitar=/);
    assert.match(panel, /function etiquetaFiltro\(/, "un chip que ponga «reservo_from» no es un aviso");
  });
});

describe("una audiencia guardada no puede mentir sobre lo que filtra", () => {
  test("describe las fechas de reserva, la edad y los hechos", () => {
    const t = describirAudiencia({ reservo_from: "2026-08-20", reservo_to: "2026-08-25", edad_min: 35, hecho_etiqueta: "dieta" });
    assert.match(t, /Reservó/);
    assert.match(t, /Edad/);
    assert.match(t, /dieta/);
    assert.notEqual(t, "Todos los contactos");
  });

  test("y el panel usa el mismo texto", () => {
    const i = panel.indexOf("function describirAudiencia(");
    const fn = panel.slice(i, i + 1600);
    for (const q of ["Reservó", "Edad", "Cumplen", "Sabemos"]) assert.ok(fn.includes(q), `al panel le falta «${q}»`);
  });
});

describe("nadie escribe a quien se dio de baja", () => {
  test("el endpoint viejo que lo hacía ya no existe", () => {
    // No comprobaba bajas ni consentimiento, no traducía y no registraba los envíos.
    assert.ok(!/app\.post\("\/api\/campanas\/enviar"/.test(server), "ha vuelto el endpoint sin comprobaciones");
  });

  test("y todos los caminos de envío pasan por el filtro legal", () => {
    for (const fn of ["dispatchCampana", "/api/contactos/mensaje-masivo"]) {
      const i = server.indexOf(fn);
      assert.match(server.slice(i, i + 1400), /filtrarEnviablesWA/, `${fn} no filtra enviables`);
    }
  });
});

describe("la IA propone, no adivina", () => {
  test("puede pedir la traducción, que era lo que le faltaba", () => {
    const tool = server.slice(server.indexOf("const CAMPANA_TOOL"), server.indexOf('app.post("/api/campanas/redactar"'));
    assert.match(tool, /traducir: \{ type: "boolean"/);
    assert.match(server, /if \(uso\.input\?\.traducir\) segmento\.traducir = true/);
  });

  test("con temperatura 0: la misma frase no puede dar dos filtros distintos", () => {
    const i = server.indexOf('app.post("/api/campanas/redactar"');
    const fn = server.slice(i, i + 3000);
    assert.match(fn, /temperature: 0/);
    assert.match(fn, /model: "claude-sonnet-5"/, "de esta llamada depende a cuánta gente se escribe");
  });

  test("y el prompt le enseña los tres casos que se confunden", () => {
    const i = server.indexOf('app.post("/api/campanas/redactar"');
    const fn = server.slice(i, i + 3000);
    assert.match(fn, /en su idioma.*traducir: true/is);
    assert.match(fn, /NO pongas "origen"/);
    assert.match(fn, /CADA FILTRO QUE PONES DEJA GENTE FUERA/);
  });

  test("el saneado sigue descartando lo que no existe, y diciéndolo", () => {
    const { segmento, descartados } = sanearSegmento({ nacionalidad: "española", genero: "mujer" }, { locales: [] });
    assert.equal(segmento.genero, "mujer");
    assert.equal(descartados.length, 1);
    assert.match(descartados[0].motivo, /no existe/);
  });
});

describe("el establecimiento se lee por centro", () => {
  test("las reservas de las dos barras de Blanes cuentan", () => {
    const i = server.indexOf("let localFilter = local");
    const fn = server.slice(i, i + 500);
    assert.match(fn, /rl\.local = ANY\(\?\)/);
    assert.match(server.slice(i, i + 700), /barrasDelCentro\(local, "reservas"\)/);
  });
});

describe("el cumpleaños felicita en el idioma de cada uno", () => {
  test("usa el mismo traductor que las campañas", () => {
    // Se busca el ENVÍO, no el nombre de la campaña: el emoji aparece en los dos y el primero
    // es el nombre, 700 caracteres antes de donde está la traducción.
    const i = server.indexOf("Cumpleaños: enviando felicitación");
    assert.notEqual(i, -1);
    assert.match(server.slice(Math.max(0, i - 700), i), /construirResolverIdioma\(plantilla, dest\)/);
    assert.match(server.slice(Math.max(0, i - 700), i), /resolverMensaje: resolverCumple/);
  });
});
