import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { instanteMadrid, sumaDias } from "../src/modules/horarios/tiempo.js";

// EL FALLO QUE ARREGLA ESTO: `new Date().toISOString().slice(0,10)` da la fecha en UTC. Entre
// medianoche y las dos de la mañana en verano, España va dos horas por delante, así que UTC
// todavía dice AYER. Un restaurante cierra a esa hora: la reserva apuntada a las 00:30, la
// factura subida al cerrar caja y el «hoy» del dashboard se archivaban con la fecha de ayer.
// Todas las noches de verano, sin que nadie lo viera.

const hoyISO = (ms) => instanteMadrid(new Date(ms)).fecha;
const enUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

describe("qué día es «hoy» a la hora de cerrar", () => {
  test("a las 00:30 de una noche de julio, UTC dice ayer y Madrid dice hoy", () => {
    // 15 de julio de 2026, 00:30 en Madrid = 14 de julio 22:30 UTC.
    const ms = Date.parse("2026-07-14T22:30:00Z");
    assert.equal(enUTC(ms), "2026-07-14", "esto es lo que se guardaba");
    assert.equal(hoyISO(ms), "2026-07-15", "y esto es el día que era de verdad");
  });

  test("en invierno el margen es de una hora, y también falla", () => {
    // 15 de enero, 00:30 en Madrid = 14 de enero 23:30 UTC.
    const ms = Date.parse("2026-01-14T23:30:00Z");
    assert.equal(enUTC(ms), "2026-01-14");
    assert.equal(hoyISO(ms), "2026-01-15");
  });

  test("a las tres de la tarde coinciden, que es cuando nadie lo notaba", () => {
    const ms = Date.parse("2026-07-15T13:00:00Z");
    assert.equal(enUTC(ms), hoyISO(ms));
  });

  test("y el cambio de año pasa a la hora correcta", () => {
    // Las campanadas: 31 de diciembre 23:00 UTC ya es 1 de enero en España.
    const ms = Date.parse("2026-12-31T23:00:00Z");
    assert.equal(enUTC(ms), "2026-12-31");
    assert.equal(hoyISO(ms), "2027-01-01");
  });

  test("«ayer» y «mañana» se cuentan desde el día de Madrid, no desde el de UTC", () => {
    const ms = Date.parse("2026-07-14T22:30:00Z");   // 15 de julio, 00:30 en Madrid
    assert.equal(sumaDias(hoyISO(ms), -1), "2026-07-14");
    assert.equal(sumaDias(hoyISO(ms), 1), "2026-07-16");
  });
});

describe("y el servidor ya no calcula «hoy» en UTC", () => {
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

  test("no queda ni un `new Date().toISOString().slice(0,10)`", () => {
    assert.doesNotMatch(server, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });

  test("ni un «ayer» calculado restando milisegundos a la hora actual", () => {
    // `Date.now() - 86400000` y luego cortar en UTC arrastra el mismo error.
    assert.doesNotMatch(server, /new Date\(Date\.now\(\)[^)]*\)\.toISOString\(\)\.slice\(0, 10\)/);
  });

  test("hay UN solo `hoyISO`, y es el de Madrid", () => {
    const definiciones = [...server.matchAll(/const hoyISO = /g)];
    assert.equal(definiciones.length, 1, "dos definiciones distintas de «hoy» es peor que ninguna");
    assert.match(server, /const hoyISO = \(\) => instanteMadrid\(new Date\(\)\)\.fecha/);
  });

  test("la aritmética sobre una fecha DADA se queda como está, que es correcta", () => {
    // `addDiasISO("2026-07-15", 3)` opera sobre un día ya decidido: ahí UTC no estorba, y
    // cambiarlo por hora local sí podría meter saltos con el cambio de hora.
    assert.match(server, /const addDiasISO = \(iso, n\)/);
  });
});
