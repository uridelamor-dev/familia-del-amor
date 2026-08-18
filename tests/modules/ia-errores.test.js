// Qué se le dice a una persona cuando la IA falla.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mensajeDeErrorIA, seCorto } from "../../src/modules/ia/errores.js";

describe("el error de la IA se traduce a algo accionable", () => {
  test("429: espera y reintenta", () => {
    assert.match(mensajeDeErrorIA({ status: 429 }), /Espera un minuto/);
  });
  test("401 y 403: es la clave, no lo que has pedido", () => {
    for (const st of [401, 403]) assert.match(mensajeDeErrorIA({ status: st }), /clave/i);
  });
  test("500 y 529: es de ellos, vuelve a intentarlo", () => {
    for (const st of [500, 529]) assert.match(mensajeDeErrorIA({ status: st }), /no responde/i);
  });
  test("sin status conocido, el mensaje de siempre y con lo que se estaba haciendo", () => {
    assert.equal(mensajeDeErrorIA(new Error("boom"), "el resumen"), "No se pudo preparar el resumen.");
  });
  test("nunca se filtra el mensaje técnico a la pantalla", () => {
    // Un error del SDK puede llevar dentro la petición entera, y con ella el prompt.
    const m = mensajeDeErrorIA({ status: 400, message: "invalid x-api-key sk-ant-1234" });
    assert.ok(!m.includes("sk-ant"), "la clave no puede acabar en pantalla");
  });
});

describe("una respuesta cortada no se da por buena", () => {
  test("se detecta el tope de tokens", () => {
    assert.equal(seCorto({ stop_reason: "max_tokens" }), true);
    assert.equal(seCorto({ stop_reason: "tool_use" }), false);
    assert.equal(seCorto(null), false);
  });
});
