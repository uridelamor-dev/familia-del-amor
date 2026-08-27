import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tocaRefrescar, sirveGuardado, edadEnPalabras, claveRango, CADA_MIN }
  from "../../src/modules/agora/cache.js";

// Los importes de ventas por local tardaban en aparecer. La causa no era la consulta: la caché
// vivía EN MEMORIA y en Replit el proceso se reinicia tanto que estaba fría casi siempre, así
// que cada visita esperaba a que respondiera cada TPV, en serie y con veinte segundos por local.

describe("cuándo hay que volver a preguntarle al TPV", () => {
  const AHORA = "2026-08-27T14:00:00.000Z";

  test("si no se ha pedido nunca, sí", () => {
    assert.equal(tocaRefrescar({ guardadoEn: null, ahora: AHORA }), true);
  });

  test("pasado el cuarto de hora, sí; antes, no", () => {
    assert.equal(tocaRefrescar({ guardadoEn: "2026-08-27T13:40:00.000Z", ahora: AHORA }), true);
    assert.equal(tocaRefrescar({ guardadoEn: "2026-08-27T13:52:00.000Z", ahora: AHORA }), false);
  });

  test("y el botón «Actualizar» manda siempre", () => {
    // Ahí sí se espera: lo ha pedido alguien que está mirando.
    assert.equal(tocaRefrescar({ guardadoEn: AHORA, ahora: AHORA, forzar: true }), true);
  });

  test("SOBREVIVE A QUE SE REINICIE EL SERVIDOR", () => {
    // Es todo el punto: la marca está en la base, no en memoria. Da igual cuántas veces se
    // reinicie el proceso, la cuenta no vuelve a empezar.
    const guardadoEn = "2026-08-27T13:00:00.000Z";
    for (let i = 0; i < 30; i++) assert.equal(tocaRefrescar({ guardadoEn, ahora: AHORA }), true);
  });

  test("una marca ilegible se trata como si no hubiera", () => {
    assert.equal(tocaRefrescar({ guardadoEn: "vete a saber", ahora: AHORA }), true);
  });
});

describe("mientras se refresca, se sirve lo que hay", () => {
  const AHORA = "2026-08-27T14:00:00.000Z";

  test("un dato de hace media hora vale, con su hora al lado", () => {
    // Es infinitamente más útil que una pantalla girando: quien mira las ventas del día quiere
    // el orden de magnitud, y para el minuto exacto está el botón.
    assert.equal(sirveGuardado({ guardadoEn: "2026-08-27T13:30:00.000Z", ahora: AHORA }), true);
  });

  test("pero uno de anteayer NO", () => {
    // Un número viejo presentado como «las ventas» sí engaña.
    assert.equal(sirveGuardado({ guardadoEn: "2026-08-25T14:00:00.000Z", ahora: AHORA }), false);
  });

  test("y sin nada guardado, nada que servir", () => {
    assert.equal(sirveGuardado({ guardadoEn: null, ahora: AHORA }), false);
  });
});

describe("de cuándo es el dato, en palabras", () => {
  const AHORA = "2026-08-27T14:00:00.000Z";
  test("se dice claro", () => {
    assert.equal(edadEnPalabras({ guardadoEn: "2026-08-27T14:00:00.000Z", ahora: AHORA }), "ahora mismo");
    assert.equal(edadEnPalabras({ guardadoEn: "2026-08-27T13:59:00.000Z", ahora: AHORA }), "hace 1 minuto");
    assert.equal(edadEnPalabras({ guardadoEn: "2026-08-27T13:48:00.000Z", ahora: AHORA }), "hace 12 minutos");
    assert.equal(edadEnPalabras({ guardadoEn: "2026-08-27T12:00:00.000Z", ahora: AHORA }), "hace 2 horas");
  });
  test("y sin fecha no se inventa nada", () => {
    assert.equal(edadEnPalabras({ guardadoEn: null, ahora: AHORA }), null);
  });
});

describe("las claves", () => {
  test("una por local y rango, estable", () => {
    assert.equal(claveRango("La Tapeta - Blanes", "2026-08-01", "2026-08-27"), "ventas_rango|La Tapeta - Blanes|2026-08-01_2026-08-27");
    assert.equal(claveRango(null, "2026-08-01", "2026-08-27"), "ventas_rango|*|2026-08-01_2026-08-27");
  });
  test("y el cuarto de hora es el que se pidió", () => {
    assert.equal(CADA_MIN, 15);
  });
});
