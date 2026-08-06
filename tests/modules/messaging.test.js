import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatTelefonoES, aplicarVariables, contactoEnviableWA,
  filtrarEnviablesWA, dividirPorTope, delayConJitter,
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

describe("messaging.delayConJitter", () => {
  test("cae dentro del rango [min,max]", () => {
    assert.equal(delayConJitter(6000, 15000, () => 0), 6000);
    assert.equal(delayConJitter(6000, 15000, () => 1), 15000);
    assert.equal(delayConJitter(6000, 15000, () => 0.5), 10500);
  });
});
