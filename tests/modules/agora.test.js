// Integración Ágora — lógica pura: config por local, mapeo de ventas y catch-up de sincronización.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadAgoraConfigs, configsFromRows, normalizeConfigs, publicConfig } from "../../src/integrations/agora/registry.js";
import { mapVentasDia, mapVentasDesdeDocumentos } from "../../src/integrations/agora/mappers.js";
import { diasFaltantes, syncVentasLocal } from "../../src/integrations/agora/sync.js";

describe("registry.loadAgoraConfigs", () => {
  test("parsea el JSON, normaliza host y filtra inválidos/inactivos", () => {
    const env = { AGORA_LOCALES: JSON.stringify([
      { local: "La Tapeta - Blanes", host: "blanes.chickenkiller.com:8984", token: "T1" },
      { local: "La Tapeta - Lloret", host: "http://lloret:8984/", token: "T2", localId: "3" },
      { local: "Sin token", host: "x:8984" },
      { local: "Inactivo", host: "y:8984", token: "T3", activo: false },
    ]) };
    const c = loadAgoraConfigs(env);
    assert.equal(c.length, 2);
    assert.equal(c[0].host, "http://blanes.chickenkiller.com:8984");
    assert.equal(c[1].host, "http://lloret:8984");
    assert.equal(c[1].localId, "3");
  });
  test("sin variable o JSON inválido ⇒ []", () => {
    assert.deepEqual(loadAgoraConfigs({}), []);
    assert.deepEqual(loadAgoraConfigs({ AGORA_LOCALES: "no-json" }), []);
  });
  test("configsFromRows: filas de BD → configs (local_id y activo=0 filtrado)", () => {
    const rows = [
      { local: "La Tapeta - Blanes", host: "latapetablanes.chickenkiller.com:8984", token: "tok1", local_id: "", activo: 1 },
      { local: "La Tapeta - Lloret", host: "http://x:8984/", token: "tok2", local_id: "L2", activo: 0 }, // inactivo → fuera
      { local: "Sin token", host: "y:8984", token: "", activo: 1 }, // sin token → fuera
    ];
    const c = configsFromRows(rows);
    assert.equal(c.length, 1);
    assert.equal(c[0].local, "La Tapeta - Blanes");
    assert.equal(c[0].host, "http://latapetablanes.chickenkiller.com:8984");
    assert.equal(c[0].localId, null); // "" → null
  });

  test("configsFromRows: activo booleano y localId explícito", () => {
    const c = configsFromRows([{ local: "A", host: "a:8984", token: "t", localId: "9", activo: true }]);
    assert.equal(c.length, 1);
    assert.equal(c[0].localId, "9");
  });

  test("configsFromRows: entrada vacía ⇒ []", () => {
    assert.deepEqual(configsFromRows(null), []);
    assert.deepEqual(configsFromRows([]), []);
  });

  test("normalizeConfigs equivale a loadAgoraConfigs sobre el array parseado", () => {
    const arr = [{ local: "A", host: "a:8984", token: "t", localId: "1", activo: true }];
    assert.deepEqual(normalizeConfigs(arr), loadAgoraConfigs({ AGORA_LOCALES: JSON.stringify(arr) }));
  });

  test("publicConfig nunca incluye el token", () => {
    const p = publicConfig({ local: "X", host: "http://x:8984", token: "SECRETO", localId: null });
    assert.equal(p.token, undefined);
    assert.equal(p.host, "http://x:8984");
  });
});

describe("mappers.mapVentasDia", () => {
  test("objeto resumen: calcula ticket medio si no viene", () => {
    const v = mapVentasDia({ importe: 1000, tickets: 40, comensales: 92 }, { dia: "2026-08-05" });
    assert.equal(v.ventas, 1000); assert.equal(v.tickets, 40); assert.equal(v.comensales, 92);
    assert.equal(v.ticket_medio, 25);
    assert.equal(v.dia, "2026-08-05");
  });
  test("acepta nombres alternativos y ticketMedio explícito", () => {
    const v = mapVentasDia({ total: 500, numDocumentos: 20, ticketMedio: 30 }, { dia: "2026-08-05" });
    assert.equal(v.ventas, 500); assert.equal(v.tickets, 20); assert.equal(v.ticket_medio, 30);
  });
  test("array de documentos ⇒ agrega", () => {
    const v = mapVentasDesdeDocumentos([{ importe: 30, comensales: 2 }, { importe: 20, comensales: 1 }], { dia: "2026-08-05" });
    assert.equal(v.ventas, 50); assert.equal(v.tickets, 2); assert.equal(v.comensales, 3); assert.equal(v.ticket_medio, 25);
  });
  test("null ⇒ null", () => { assert.equal(mapVentasDia(null), null); });
});

describe("sync.diasFaltantes (catch-up)", () => {
  test("rellena huecos hasta ayer, respetando existentes", () => {
    const hoy = "2026-08-10";
    const existentes = new Set(["2026-08-08"]);
    const faltan = diasFaltantes(existentes, { hoy, maxDias: 5 });
    // ventana: 2026-08-05..2026-08-09 (ayer); falta todo menos 08-08
    assert.deepEqual(faltan, ["2026-08-05", "2026-08-06", "2026-08-07", "2026-08-09"]);
    assert.ok(!faltan.includes("2026-08-10")); // nunca incluye hoy
  });
  test("todo al día ⇒ vacío", () => {
    const hoy = "2026-08-10";
    const ex = new Set(["2026-08-08", "2026-08-09"]);
    assert.deepEqual(diasFaltantes(ex, { hoy, maxDias: 2 }), []);
  });
});

describe("sync.syncVentasLocal", () => {
  const cfg = { local: "La Tapeta - Blanes", host: "http://x:8984", token: "T" };
  test("servidor caído ⇒ reachable:false, 0 insertados", async () => {
    const client = { ping: async () => false, getVentasDia: async () => { throw new Error("no debería llamarse"); } };
    const x = { all: async () => [], run: async () => {} };
    const r = await syncVentasLocal(x, client, cfg, { hoy: "2026-08-10", maxDias: 3 });
    assert.equal(r.reachable, false); assert.equal(r.insertados, 0);
  });
  test("servidor vivo ⇒ trae solo los días que faltan y hace upsert", async () => {
    const inserts = [];
    const client = { ping: async () => true, getVentasDia: async (dia) => ({ dia, ventas: 100, tickets: 5, comensales: 12, ticket_medio: 20 }) };
    const x = {
      all: async () => [{ dia: "2026-08-08" }], // ya tenemos el 08
      run: async (_sql, params) => { inserts.push(params[1]); }, // params[1] = dia
    };
    const r = await syncVentasLocal(x, client, cfg, { hoy: "2026-08-10", maxDias: 3 });
    assert.equal(r.reachable, true);
    // ventana 08-07..08-09; falta 07 y 09 (08 ya está)
    assert.deepEqual(inserts.sort(), ["2026-08-07", "2026-08-09"]);
    assert.equal(r.insertados, 2);
  });
  test("un día que falla no detiene el resto", async () => {
    const inserts = [];
    const client = { ping: async () => true, getVentasDia: async (dia) => { if (dia === "2026-08-08") throw new Error("timeout"); return { dia, ventas: 1, tickets: 1, comensales: 1, ticket_medio: 1 }; } };
    const x = { all: async () => [], run: async (_s, p) => { inserts.push(p[1]); } };
    const r = await syncVentasLocal(x, client, cfg, { hoy: "2026-08-10", maxDias: 3 });
    assert.ok(!inserts.includes("2026-08-08")); // el que falla no se inserta
    assert.ok(inserts.includes("2026-08-07") && inserts.includes("2026-08-09")); // los demás sí
  });
});
