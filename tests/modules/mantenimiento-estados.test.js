// Los estados de una incidencia: traducción de los nombres viejos y máquina de estados.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ESTADOS, ABIERTOS, SIGUIENTE, ETIQUETA, PILL,
  normalizarEstado, esAbierta, siguienteEstado,
} from "../../src/modules/mantenimiento/estados.js";

describe("Estados · normalizar", () => {
  test("los tres buenos pasan tal cual", () => {
    for (const e of ESTADOS) assert.equal(normalizarEstado(e), e);
  });

  test("traduce los nombres de la página vieja", () => {
    assert.equal(normalizarEstado("en_proceso"), "en proceso");
    assert.equal(normalizarEstado("cerrada"), "resuelta");
  });

  test("tolera mayúsculas y espacios de más", () => {
    assert.equal(normalizarEstado("  EN   PROCESO "), "en proceso");
    assert.equal(normalizarEstado("Abierta"), "abierta");
  });

  test("lo que no se reconoce devuelve null, NO un valor por defecto", () => {
    // Guardar «abierta» porque no se entendió reabriría en silencio algo ya resuelto.
    for (const v of ["", "   ", "vaporizada", "1", "true", null, undefined, 3, {}, []]) {
      assert.equal(normalizarEstado(v), null, `«${String(v)}» no debería colar`);
    }
  });
});

describe("Estados · qué cuenta como abierto", () => {
  test("abierta y en proceso sí; resuelta no", () => {
    assert.ok(esAbierta("abierta"));
    assert.ok(esAbierta("en proceso"));
    assert.ok(!esAbierta("resuelta"));
  });

  test("una fila guardada con el nombre viejo se lee bien", () => {
    assert.ok(esAbierta("en_proceso"), "quedaría contada como resuelta sin querer");
    assert.ok(!esAbierta("cerrada"), "quedaría contada como abierta para siempre");
  });

  test("un estado ilegible NO cuenta como abierto", () => {
    assert.ok(!esAbierta("loquesea"));
  });

  test("ABIERTOS es exactamente ESTADOS menos resuelta", () => {
    assert.deepEqual(ABIERTOS, ESTADOS.filter((e) => e !== "resuelta"));
  });
});

describe("Estados · máquina de estados", () => {
  test("el ciclo es lineal y termina en resuelta", () => {
    assert.equal(siguienteEstado("abierta"), "en proceso");
    assert.equal(siguienteEstado("en proceso"), "resuelta");
    assert.equal(siguienteEstado("resuelta"), null, "resuelta es el final: no hay botón");
  });

  test("también avanza desde un nombre viejo", () => {
    assert.equal(siguienteEstado("en_proceso"), "resuelta");
  });

  test("desde un estado ilegible no se avanza a ninguna parte", () => {
    assert.equal(siguienteEstado("vaporizada"), null);
  });

  test("todo destino de SIGUIENTE es un estado válido", () => {
    for (const [de, a] of Object.entries(SIGUIENTE)) {
      assert.ok(ESTADOS.includes(de), `${de} no es un estado`);
      assert.ok(ESTADOS.includes(a), `${a} no es un estado`);
    }
  });
});

describe("Estados · las tablas de pantalla están completas", () => {
  // Sin esto, añadir un estado deja una píldora sin color o un nombre en crudo en la lista.
  test("cada estado tiene etiqueta y color", () => {
    for (const e of ESTADOS) {
      assert.ok(ETIQUETA[e], `falta la etiqueta de «${e}»`);
      assert.ok(PILL[e], `falta el color de «${e}»`);
    }
  });

  test("y no sobra ninguna", () => {
    assert.deepEqual(Object.keys(ETIQUETA).sort(), [...ESTADOS].sort());
    assert.deepEqual(Object.keys(PILL).sort(), [...ESTADOS].sort());
  });
});
