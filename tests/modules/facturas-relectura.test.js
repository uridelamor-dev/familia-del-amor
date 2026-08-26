import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tocaRepasar, esFalloPasajero, estadoTrasFallo, resumirRepaso,
  TANDA, CADA_HORAS, MAX_INTENTOS } from "../../src/modules/facturas/relectura.js";

// Durante nueve días, un fallo en el alta dejó cada factura guardada pero sin su desglose. Se
// recuperaban pulsando un botón — y un trabajo que depende de que alguien se acuerde no está
// hecho, está pendiente. Esto es lo que decide cuándo se repasa solo y sobre qué.

describe("cuándo toca repasar", () => {
  const AHORA = "2026-08-26T20:00:00.000Z";

  test("si no se ha hecho nunca, se hace", () => {
    assert.equal(tocaRepasar({ ultimo: null, ahora: AHORA }), true);
  });

  test("pasadas las horas, sí; antes, no", () => {
    assert.equal(tocaRepasar({ ultimo: "2026-08-26T13:00:00.000Z", ahora: AHORA }), true);   // 7 h
    assert.equal(tocaRepasar({ ultimo: "2026-08-26T17:00:00.000Z", ahora: AHORA }), false);  // 3 h
  });

  test("EL PUNTO ENTERO: sobrevive a que el proceso se reinicie", () => {
    // En Replit el proceso se reinicia a menudo. Un `setInterval` semanal no llega a dispararse
    // NUNCA porque la cuenta vuelve a cero en cada arranque. Preguntando contra una marca
    // guardada, da igual cuántas veces se reinicie: en cuanto pasan las horas, toca.
    const ultimo = "2026-08-20T09:00:00.000Z";   // hace seis días
    for (let i = 0; i < 50; i++) assert.equal(tocaRepasar({ ultimo, ahora: AHORA }), true);
  });

  test("una marca ilegible se trata como si no hubiera", () => {
    assert.equal(tocaRepasar({ ultimo: "vete a saber", ahora: AHORA }), true);
  });

  test("sin reloj no se decide nada", () => {
    assert.equal(tocaRepasar({ ultimo: null, ahora: null }), false);
    assert.equal(tocaRepasar(), false);
  });

  test("y el ritmo no es semanal, a propósito", () => {
    // Con un repaso semanal de veinte, vaciar trescientas facturas llevaría meses y habría que
    // pulsar el botón igualmente: entonces el automatismo no sirve de nada.
    assert.ok(CADA_HORAS <= 12, "demasiado espaciado para que sirva de red");
    assert.ok(TANDA >= 10 && TANDA <= 40, "la tanda tiene que avanzar sin dar un pico de gasto");
  });
});

describe("qué fallo es culpa del documento y cuál no", () => {
  test("la IA saturada, un timeout o un corte de red NO dicen nada del PDF", () => {
    for (const m of ["429 rate_limit_error", "Error 529 overloaded_error", "fetch failed",
                     "ETIMEDOUT", "socket hang up", "ECONNRESET", "502 Bad Gateway",
                     "No se pudo renovar token de Drive"]) {
      assert.equal(esFalloPasajero(m), true, `debería reintentarse: ${m}`);
    }
  });

  test("un PDF que ya no está, sí", () => {
    for (const m of ["File not found: 1a2b3c", "404 no encontrado", "el archivo está en la papelera",
                     "no se pudo descargar el archivo", "PDF corrupt", "encrypted document"]) {
      assert.equal(esFalloPasajero(m), false, `no tiene sentido reintentar: ${m}`);
    }
  });

  test("lo definitivo manda sobre lo pasajero cuando aparecen los dos", () => {
    // «404 not found» tiene un número de tres cifras que podría colar como error de servidor.
    assert.equal(esFalloPasajero("404 File not found (timeout al reintentar)"), false);
  });

  test("sin motivo no se afirma que sea pasajero", () => {
    for (const m of ["", null, undefined, "   "]) assert.equal(esFalloPasajero(m), false);
  });
});

describe("qué se hace con una que acaba de fallar", () => {
  test("un fallo pasajero la deja en la cola, con un intento más", () => {
    const r = estadoTrasFallo({ motivo: "529 overloaded", intentos: 0 });
    assert.equal(r.estado, null, "`null` es lo que la devuelve a la cola");
    assert.equal(r.intentos, 1);
    assert.equal(r.seReintenta, true);
  });

  test("pero no para siempre: a la tercera se rinde", () => {
    // No rendirse nunca deja la cola dando vueltas y gastando en cada vuelta.
    assert.equal(estadoTrasFallo({ motivo: "timeout", intentos: 1 }).seReintenta, true);
    const ultima = estadoTrasFallo({ motivo: "timeout", intentos: MAX_INTENTOS - 1 });
    assert.equal(ultima.seReintenta, false);
    assert.equal(ultima.estado, "no_leible");
  });

  test("un fallo del documento se marca a la primera", () => {
    // Reintentar un PDF que ya no existe es gastar tres veces para el mismo resultado.
    const r = estadoTrasFallo({ motivo: "File not found", intentos: 0 });
    assert.equal(r.estado, "no_leible");
    assert.equal(r.seReintenta, false);
  });

  test("el motivo se guarda recortado, para poder mirarlo luego", () => {
    const r = estadoTrasFallo({ motivo: "x".repeat(500), intentos: 0 });
    assert.equal(r.motivo.length, 300);
  });

  test("y esto NO es lo que hacía antes", () => {
    // Antes, cualquier fallo marcaba `no_leible` y esa factura se quedaba sin detalle el resto
    // de su vida, aunque la IA solo hubiera estado saturada dos minutos.
    assert.notEqual(estadoTrasFallo({ motivo: "429 rate limit", intentos: 0 }).estado, "no_leible");
  });
});

describe("lo que se cuenta en pantalla", () => {
  test("nunca repasado no es lo mismo que al día", () => {
    assert.equal(resumirRepaso({}).nivel, "warn");
    assert.match(resumirRepaso({}).texto, /Todavía no se ha repasado/);
  });

  test("con cosas pendientes avisa; sin nada, está al día", () => {
    assert.equal(resumirRepaso({ ultimo: "2026-08-26T20:00:00Z", leidas: 20, quedan: 140 }).nivel, "warn");
    const ok = resumirRepaso({ ultimo: "2026-08-26T20:00:00Z", leidas: 3, quedan: 0 });
    assert.equal(ok.nivel, "ok");
    assert.match(ok.texto, /no queda ninguna/);
  });

  test("las que no se pudieron leer se dicen, no desaparecen", () => {
    assert.match(resumirRepaso({ ultimo: "2026-08-26T20:00:00Z", quedan: 0, rendidas: 4 }).texto, /4 sin poder leer/);
  });
});
