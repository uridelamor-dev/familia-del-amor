import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enSilencio, horaMadrid, puedeEnviar } from "../src/modules/messaging/horario-silencio.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const wa = readFileSync(new URL("../whatsapp.js", import.meta.url), "utf8");
// Noviembre: Madrid = UTC+1.
const madrid = (hhmm) => new Date(`2026-11-13T${hhmm}:00+01:00`);

// 12–13/11/2026: la campaña de las coques salía entre las 00:00 y las 04:00, al renovarse el cupo.
describe("horario de silencio de WhatsApp (22:00–9:00, hora de Madrid)", () => {
  test("los bordes", () => {
    assert.equal(horaMadrid(madrid("21:59")), 21);
    assert.equal(enSilencio(madrid("21:59")), false);
    assert.equal(enSilencio(madrid("22:00")), true);
    assert.equal(enSilencio(madrid("00:05")), true);
    assert.equal(enSilencio(madrid("08:59")), true);
    assert.equal(enSilencio(madrid("09:00")), false);
  });

  test("también en verano (UTC+2)", () => {
    assert.equal(enSilencio(new Date("2026-07-01T22:30:00+02:00")), true);
    assert.equal(enSilencio(new Date("2026-07-01T09:10:00+02:00")), false);
  });

  test("de noche solo sale lo interno, lo que pidió el cliente o una respuesta", () => {
    const ahora = madrid("23:30");
    assert.equal(puedeEnviar({ ahora }), false);
    assert.equal(puedeEnviar({ ahora, interno: true }), true);
    assert.equal(puedeEnviar({ ahora, transaccional: true }), true);
    assert.equal(puedeEnviar({ ahora, clienteEscribio: true }), true);
    assert.equal(puedeEnviar({ ahora: madrid("12:00") }), true);
  });

  test("todos los envíos sueltos pasan por el guardián", () => {
    for (const f of ["sendMensajeLibre", "sendDocumentoLibre", "sendMediaLibre"]) {
      const i = wa.indexOf(`export async function ${f}(`);
      assert.ok(i > 0, f);
      assert.match(wa.slice(i, i + 400), /await comprobarHorario\(jid, meta\)/, `${f} sin horario`);
    }
  });

  test("lo automático espera en vez de fallar", () => {
    const lote = server.slice(server.indexOf("async function enviarLoteWAInterno("), server.indexOf("function segmentoDelBody("));
    assert.match(lote, /if \(enSilencioWA\(\)\) \{ cortadoPorTope = true; break; \}/, "campañas");
    assert.match(server, /if \(isReady\(\) && !enSilencioWA\(\)\) \{/, "reloj de campañas");
    assert.match(server, /if \(!isReady\(\) \|\| enSilencioWA\(\)\) return;/, "«¿qué tal fue?»");
    assert.match(server, /if \(!esAlta && enSilencioWA\(\)\) continue;/, "cola de captación y cumpleaños");
  });

  test("«nos ha escrito» se mira por los 9 últimos dígitos", () => {
    assert.match(server, /setClienteEscribioReciente\(async \(jid\) => \{/);
    assert.match(server, /tipo = 'intercambio' AND COALESCE\(historico, 0\) = 0/);
  });
});
