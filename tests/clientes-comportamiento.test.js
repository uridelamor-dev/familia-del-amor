import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAMPOS, sanearSegmento, describirSegmento } from "../src/modules/marketing/segmento.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const LOC = ["La Tapeta - Blanes", "Can Mateu - Tordera", "La Tapa Ibérica - Tordera", "Oficina"];

describe("se puede segmentar por lo que la gente HACE", () => {
  test("los filtros nuevos existen en la lista que manda", () => {
    for (const k of ["visitas_min", "visitas_max", "nunca_ha_venido", "es_nuevo",
                     "sin_venir_desde", "visito_desde", "valor_min", "locales"]) {
      assert.ok(CAMPOS[k], `falta ${k} en CAMPOS`);
    }
  });

  test("«no viene desde» es una FECHA, no «hace N días»", () => {
    // El segmento se guarda y se vuelve a ejecutar el día que la campaña sale. Un «hace 90
    // días» guardado significa cosas distintas al crearla y al enviarla; una fecha, no.
    assert.equal(CAMPOS.sin_venir_desde.tipo, "fecha");
    const { segmento, descartados } = sanearSegmento({ sin_venir_desde: "hace 3 meses" }, { locales: LOC });
    assert.equal(segmento.sin_venir_desde, undefined);
    assert.equal(descartados[0].campo, "sin_venir_desde");
  });

  test("y se describe en castellano, sin jerga", () => {
    const t = describirSegmento({ visitas_min: 3, sin_venir_desde: "2026-05-01" });
    assert.match(t, /3 visitas o más/);
    assert.match(t, /no vienen desde el 2026-05-01/);
  });
});

describe("«los de Tordera»: varios establecimientos a la vez", () => {
  test("se aceptan como lista y se validan uno a uno", () => {
    const { segmento } = sanearSegmento({ locales: ["Can Mateu - Tordera", "La Tapa Ibérica - Tordera"] }, { locales: LOC });
    assert.deepEqual(segmento.locales, ["Can Mateu - Tordera", "La Tapa Ibérica - Tordera"]);
  });

  test("si uno no existe se cae ESE y se dice, no la lista entera", () => {
    const { segmento, descartados } = sanearSegmento({ locales: ["Can Mateu - Tordera", "Chiringuito"] }, { locales: LOC });
    assert.deepEqual(segmento.locales, ["Can Mateu - Tordera"]);
    assert.equal(descartados.length, 1);
    assert.equal(descartados[0].valor, "Chiringuito");
  });

  test("el segmento guarda los NOMBRES, no la zona", () => {
    // Si guardara «Tordera», una campaña de hace un mes cambiaría de destinatarios el día que
    // abra otro local ahí, sin que nadie lo haya decidido.
    const { segmento } = sanearSegmento({ locales: ["Can Mateu - Tordera"] }, { locales: LOC });
    assert.ok(Array.isArray(segmento.locales));
    assert.ok(segmento.locales.every((l) => l.includes(" - ")));
  });

  test("y se describe diciendo cuáles son", () => {
    const t = describirSegmento({ locales: ["Can Mateu - Tordera", "La Tapa Ibérica - Tordera"] });
    assert.match(t, /Can Mateu - Tordera, La Tapa Ibérica - Tordera/);
    assert.notEqual(t, "Todos los contactos, sin ningún filtro");
  });
});

describe("cómo se aplican en la consulta", () => {
  const fn = server.slice(server.indexOf("function sqlContactosUnificados"), server.indexOf("function setMarketingPref"));

  test("«no viene desde» exige haber venido alguna vez", () => {
    // Si no, entrarían todos los leads que nunca han pisado el local, y a esos no se les puede
    // echar de menos.
    assert.match(fn, /cm\.ultima_visita IS NOT NULL AND cm\.ultima_visita < \?/);
  });

  test("el valor se filtra por la cota BAJA", () => {
    // Con la alta entraría gente que igual ha traído la mitad.
    assert.match(fn, /cm\.gasto_est_min >= \?/);
    assert.doesNotMatch(fn, /cm\.gasto_est_max >= \?/);
  });

  test("las métricas entran por LEFT JOIN: no pueden quitar a nadie", () => {
    // La propiedad que hace segura toda la pieza. Con la tabla vacía, los nueve endpoints
    // devuelven exactamente las mismas personas que antes.
    assert.match(fn, /LEFT JOIN cliente_metricas cm\s*\n\s*ON cm\.tel9 = RIGHT\(regexp_replace\(c\.telefono/);
    assert.doesNotMatch(fn, /JOIN cliente_metricas cm[^\n]*\n[^\n]*\n\s*WHERE cm\./);
  });

  test("«un local» sigue funcionando además de la lista", () => {
    // Hay campañas guardadas con `local` dentro de su segmento; romperlas las mandaría a otra
    // gente la próxima vez que se envíen.
    assert.match(fn, /Array\.isArray\(filtros\.locales\) && filtros\.locales\.length \? filtros\.locales : \[local\]/);
  });
});
