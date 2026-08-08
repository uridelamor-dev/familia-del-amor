// El tope diario y la recuperación del despacho, probados sobre la lógica pura que usan.
// No arrancan servidor ni BD: se ejercita `dividirPorTope` tal y como la llama el pulso.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dividirPorTope } from "../../src/modules/messaging/queue.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const server = fs.readFileSync(path.join(RAIZ, "server.js"), "utf8");

const equipo = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, telefono: "6000000" + String(i).padStart(2, "0") }));

describe("pulso — tope diario de WhatsApp", () => {
  test("42 invitaciones con tope 40 salen en dos días, no de golpe", () => {
    const dia1 = dividirPorTope(equipo(42), { maxDiario: 40, yaEnviadosHoy: 0 });
    assert.equal(dia1.aEnviar.length, 40);
    assert.equal(dia1.pospuestos.length, 2);
    const dia2 = dividirPorTope(dia1.pospuestos, { maxDiario: 40, yaEnviadosHoy: 0 });
    assert.equal(dia2.aEnviar.length, 2);
    assert.equal(dia2.pospuestos.length, 0);
  });

  test("una campaña de marketing consume cupo del mismo día", () => {
    // 35 mensajes de campaña ya enviados hoy: al pulso solo le quedan 5.
    const r = dividirPorTope(equipo(42), { maxDiario: 40, yaEnviadosHoy: 35 });
    assert.equal(r.aEnviar.length, 5);
    assert.equal(r.pospuestos.length, 37);
  });

  test("con el cupo agotado no sale ni uno", () => {
    const r = dividirPorTope(equipo(10), { maxDiario: 40, yaEnviadosHoy: 40 });
    assert.deepEqual(r.aEnviar, []);
    assert.equal(r.pospuestos.length, 10);
  });
});

describe("pulso — cableado del envío (lectura del código)", () => {
  test("el tope se aplica de verdad: dividirPorTope se invoca, no solo se importa", () => {
    // Durante meses estuvo importada y testeada pero sin llamarse desde ningún sitio:
    // el tope diario existía en el papel y no en la realidad.
    const sinImports = server.split("\n").filter((l) => !/^\s*import\b/.test(l)).join("\n");
    const llamadas = (sinImports.match(/dividirPorTope\(/g) || []).length;
    assert.ok(llamadas >= 1, `dividirPorTope no se llama desde ningún sitio (${llamadas} llamadas)`);
  });

  test("los DOS caminos de envío cuentan para el tope", () => {
    // Si solo contara el pulso, una campaña de 300 mensajes no movería el contador y el
    // tope sería decorativo.
    const enLote = /async function enviarLoteWA[\s\S]*?\n}/.exec(server);
    assert.ok(enLote && enLote[0].includes("contarEnvioWA"),
      "enviarLoteWA (campañas) debe contar sus envíos");
    const enPulso = /async function enviarPulsoLote[\s\S]*?\n}/.exec(server);
    assert.ok(enPulso && enPulso[0].includes("contarEnvioWA"),
      "enviarPulsoLote debe contar sus envíos");
  });

  test("la idempotencia marca la GENERACIÓN, no el envío", () => {
    // Es lo que permite recuperarse de un redespliegue de Replit con WhatsApp caído:
    // las invitaciones se crean una vez, y el envío se reintenta en cada tick.
    const bloque = /pulso_last_gen[\s\S]{0,400}/.exec(server);
    assert.ok(bloque, "no encuentro el flag de generación");
    assert.ok(/asegurarInvitacionesPulso/.test(bloque[0]),
      "pulso_last_gen debe marcar la generación de invitaciones");
    // Y el despacho NO debe estar detrás de ese flag
    const scheduler = /setInterval\(async \(\) => \{[\s\S]*?pulso_last_gen[\s\S]*?\}, 5 \* 60 \* 1000\)/.exec(server);
    assert.ok(scheduler && /despacharPulsoPendientes\(\)/.test(scheduler[0]),
      "el despacho debe correr en cada tick, fuera del flag de generación");
  });

  test("no se mezcla el pulso con las campañas de marketing", () => {
    const enPulso = /async function enviarPulsoLote[\s\S]*?\n}/.exec(server);
    assert.ok(enPulso, "no encuentro enviarPulsoLote");
    assert.equal(/campana_envios|campanas_wa/.test(enPulso[0]), false,
      "los teléfonos del equipo no pueden acabar en las tablas de marketing");
  });
});
