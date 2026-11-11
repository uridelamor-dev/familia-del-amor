// Guardas de contrato de Sara/WhatsApp: protegen las herramientas y la API pública
// de whatsapp.js frente a regresiones accidentales en futuros refactors.
// NO abre sockets ni sesión: comprueba el módulo (fuente + exports).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const fuente = await readFile(join(raiz, "whatsapp.js"), "utf8");

describe("Sara · contrato de herramientas (fuente)", () => {
  test("existe la herramienta registrar_reserva con 'zona' requerida", () => {
    assert.match(fuente, /name:\s*"registrar_reserva"/);
    // La sección de required de registrar_reserva incluye 'zona'
    assert.match(fuente, /required:\s*\[[^\]]*"zona"[^\]]*\]/);
  });
  test("existe la herramienta modificar_reserva (modificación ≠ cancelación)", () => {
    assert.match(fuente, /name:\s*"modificar_reserva"/);
  });
  test("existe la herramienta cancelar_reserva", () => {
    assert.match(fuente, /name:\s*"cancelar_reserva"/);
  });
  test("el prompt distingue modificación de cancelación", () => {
    assert.match(fuente, /Modificaciones/i);
  });
});

describe("Sara · API pública del módulo (exports)", () => {
  test("whatsapp.js se importa sin efectos de arranque y expone la API esperada", async () => {
    const mod = await import(join(raiz, "whatsapp.js"));
    for (const fn of [
      "initWhatsApp", "isReady",
      "setOnReserva", "setOnCancelarReserva", "setOnModificarReserva",
      "sendNotificacionGrupo", "sendModificacionGrupo", "sendCancelacionGrupo",
    ]) {
      assert.equal(typeof mod[fn], "function", `debe exportar ${fn}`);
    }
  });
});
