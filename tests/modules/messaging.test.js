import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatTelefonoES, aplicarVariables, contactoEnviableWA,
  filtrarEnviablesWA, dividirPorTope, delayConJitter,
  clave9, esTelefonoInterno,
} from "../../src/modules/messaging/queue.js";

describe("messaging.formatTelefonoES", () => {
  test("prefija 34 a móviles españoles de 9 dígitos", () => {
    assert.equal(formatTelefonoES("612345678"), "34612345678");
    assert.equal(formatTelefonoES("+34 612 345 678"), "34612345678");
    assert.equal(formatTelefonoES("0034612345678"), "34612345678");
  });
  test("respeta lo ya prefijado y vacíos", () => {
    assert.equal(formatTelefonoES("34612345678"), "34612345678");
    assert.equal(formatTelefonoES(""), "");
    assert.equal(formatTelefonoES(null), "");
  });
});

describe("messaging.aplicarVariables", () => {
  test("sustituye variables y colapsa espacios", () => {
    const c = { nombre: "Ana", apellidos: "Pérez", local: "La Tapeta - Blanes" };
    assert.equal(aplicarVariables("Hola {nombre} {apellidos}", c), "Hola Ana Pérez");
    assert.equal(aplicarVariables("{nombre_completo} en {local}", c), "Ana Pérez en La Tapeta - Blanes");
  });
  test("variable sin valor ⇒ vacío sin dobles espacios", () => {
    assert.equal(aplicarVariables("Hola {nombre} {apellidos}!", { nombre: "Ana" }), "Hola Ana!");
    assert.equal(aplicarVariables(null, {}), "");
  });

  test("UNA VARIABLE VACÍA AL PRINCIPIO NO DEJA LA COMA COLGANDO", () => {
    // Hay fichas sin nombre (las que entran por una reserva telefónica, por ejemplo), y
    // «{nombre}, hace tiempo que no te vemos» se les enviaba como «, hace tiempo que…».
    assert.equal(
      aplicarVariables("{nombre}, hace tiempo que no te vemos", { nombre: "" }),
      "Hace tiempo que no te vemos");
    assert.equal(
      aplicarVariables("{nombre}, hace tiempo que no te vemos", { nombre: "Ana" }),
      "Ana, hace tiempo que no te vemos");
  });

  test("y con signo de apertura tampoco queda raro", () => {
    assert.equal(aplicarVariables("¡Hola {nombre}! Te esperamos", { nombre: "" }), "¡Hola! Te esperamos");
    assert.equal(aplicarVariables("¡Felicidades, {nombre}! 🎂", { nombre: "" }), "¡Felicidades! 🎂");
  });

  test("no se toca un mensaje que ya empezaba bien", () => {
    assert.equal(aplicarVariables("Hola {nombre}, ¿todo bien?", { nombre: "Ana" }), "Hola Ana, ¿todo bien?");
    assert.equal(aplicarVariables("¿Vienes, {nombre}?", { nombre: "Ana" }), "¿Vienes, Ana?");
  });
});

describe("messaging.contactoEnviableWA", () => {
  test("exige teléfono y excluye bajas SIEMPRE", () => {
    assert.equal(contactoEnviableWA({ telefono: "612345678" }).ok, true);
    assert.equal(contactoEnviableWA({}).motivo, "sin_telefono");
    assert.equal(contactoEnviableWA({ telefono: "612345678", baja: 1 }).motivo, "baja");
  });
  test("soloOptIn restringe a consentimiento explícito", () => {
    assert.equal(contactoEnviableWA({ telefono: "612345678" }, { soloOptIn: true }).motivo, "sin_optin");
    assert.equal(contactoEnviableWA({ telefono: "612345678", opt_in_wa: 1 }, { soloOptIn: true }).ok, true);
  });
});

describe("messaging.filtrarEnviablesWA", () => {
  test("separa aptos y cuenta omitidos por motivo", () => {
    const cs = [
      { telefono: "612345678" },
      { telefono: "", nombre: "X" },
      { telefono: "699999999", baja: 1 },
      { telefono: "677777777" },
    ];
    const { aptos, omitidos } = filtrarEnviablesWA(cs);
    assert.equal(aptos.length, 2);
    assert.equal(omitidos.sin_telefono, 1);
    assert.equal(omitidos.baja, 1);
  });
});

describe("messaging.dividirPorTope", () => {
  test("sin tope ⇒ todo a enviar", () => {
    const r = dividirPorTope([1, 2, 3], { maxDiario: 0 });
    assert.deepEqual(r.aEnviar, [1, 2, 3]);
    assert.deepEqual(r.pospuestos, []);
  });
  test("respeta el cupo restante del día", () => {
    const r = dividirPorTope([1, 2, 3, 4, 5], { maxDiario: 4, yaEnviadosHoy: 2 });
    assert.deepEqual(r.aEnviar, [1, 2]);
    assert.deepEqual(r.pospuestos, [3, 4, 5]);
  });
  test("cupo agotado ⇒ nada hoy", () => {
    const r = dividirPorTope([1, 2], { maxDiario: 3, yaEnviadosHoy: 3 });
    assert.deepEqual(r.aEnviar, []);
    assert.deepEqual(r.pospuestos, [1, 2]);
  });
});

describe("messaging.esTelefonoInterno", () => {
  // Set tal como lo construye el servidor: claves ya normalizadas de 9 dígitos.
  const internos = new Set([clave9("600112233"), clave9("+34 655 44 33 22")]);

  test("reconoce a los de la casa escriban como escriban el número", () => {
    for (const t of ["600112233", "600 11 22 33", "+34600112233", "34600112233", "0034600112233"]) {
      assert.equal(esTelefonoInterno(t, internos), true, t);
    }
  });
  test("un cliente cualquiera no es interno", () => {
    assert.equal(esTelefonoInterno("699001122", internos), false);
  });
  test("sin teléfono no excluye a nadie", () => {
    assert.equal(esTelefonoInterno("", internos), false);
    assert.equal(esTelefonoInterno(null, internos), false);
  });
  test("números demasiado cortos no producen falsos positivos", () => {
    // "112233" no llega a 9 dígitos: no debe colarse por coincidir con el final de otro.
    assert.equal(esTelefonoInterno("112233", internos), false);
  });
  test("ante la duda NO excluye: sin lista, Sara sigue respondiendo", () => {
    assert.equal(esTelefonoInterno("600112233", new Set()), false);
    assert.equal(esTelefonoInterno("600112233", null), false);
  });
});

describe("messaging.delayConJitter", () => {
  test("cae dentro del rango [min,max]", () => {
    assert.equal(delayConJitter(6000, 15000, () => 0), 6000);
    assert.equal(delayConJitter(6000, 15000, () => 1), 15000);
    assert.equal(delayConJitter(6000, 15000, () => 0.5), 10500);
  });
});
