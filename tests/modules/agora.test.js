// Integración Ágora — lógica pura: config por local, mapeo de ventas y catch-up de sincronización.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadAgoraConfigs, configsFromRows, normalizeConfigs, publicConfig } from "../../src/integrations/agora/registry.js";
import { agregarVentasPorDia, parseAgoraVersion, extraerPosGroupIds } from "../../src/integrations/agora/mappers.js";
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

describe("mappers.agregarVentasPorDia (GetGlobalSalesReport → ventas_diarias)", () => {
  // Muestra real: NetAmount=total con IVA, GrossAmount=base; tickets = (Serie,Number) distintos.
  const sales = [
    { BusinessDay: "2026-08-05T00:00:00+02:00", NetAmount: 2.0, GrossAmount: 1.82, Serie: "T", Number: 1 },
    { BusinessDay: "2026-08-05T00:00:00+02:00", NetAmount: 8.0, GrossAmount: 7.27, Serie: "T", Number: 1 }, // mismo ticket
    { BusinessDay: "2026-08-05T00:00:00+02:00", NetAmount: 10.0, GrossAmount: 9.09, Serie: "T", Number: 2 },
    { BusinessDay: "2026-08-04T00:00:00+02:00", NetAmount: 5.0, GrossAmount: 4.55, Serie: "T", Number: 9 },
  ];
  test("agrega por día: ventas=ΣNet, base=ΣGross, cuota=Net-Gross, tickets distintos", () => {
    const r = agregarVentasPorDia(sales);
    const d5 = r.find((x) => x.dia === "2026-08-05");
    assert.equal(d5.ventas, 20);            // 2+8+10
    assert.equal(d5.base_imponible, 18.18); // 1.82+7.27+9.09
    assert.equal(d5.cuota_iva, 1.82);       // 20 - 18.18
    assert.equal(d5.tickets, 2);            // (T,1) y (T,2)
    assert.equal(d5.ticket_medio, 10);      // 20 / 2
  });
  test("ordena por día y descarta fechas inválidas/vacías", () => {
    const r = agregarVentasPorDia([...sales, { BusinessDay: "", NetAmount: 99 }, { NetAmount: 1 }]);
    assert.deepEqual(r.map((x) => x.dia), ["2026-08-04", "2026-08-05"]);
  });
  test("entrada vacía ⇒ []", () => { assert.deepEqual(agregarVentasPorDia(null), []); });
});

describe("mappers.parseAgoraVersion / extraerPosGroupIds", () => {
  test("lee la versión del recurso /version/", () => {
    assert.equal(parseAgoraVersion("var AGORA_VERSION = '8.7.4'; var X=1;"), "8.7.4");
    assert.equal(parseAgoraVersion("sin version", "9.0"), "9.0");
  });
  test("extrae los IDs de grupos de TPV de GetAllPosGroupsResponse", () => {
    assert.deepEqual(extraerPosGroupIds({ Message: { All: [{ Id: 1, Name: "A" }, { Id: 2 }, { Id: 3 }] } }), [1, 2, 3]);
    assert.deepEqual(extraerPosGroupIds({}), []);
  });
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
  const cfg = { local: "La Tapeta - Blanes", host: "http://x:8984", usuario: "u", password: "p" };
  test("servidor caído ⇒ reachable:false, 0 insertados", async () => {
    const client = { ping: async () => false, getVentasRango: async () => { throw new Error("no debería llamarse"); } };
    const x = { all: async () => [], run: async () => {} };
    const r = await syncVentasLocal(x, client, cfg, { hoy: "2026-08-10", maxDias: 3 });
    assert.equal(r.reachable, false); assert.equal(r.insertados, 0);
  });
  test("servidor vivo ⇒ pide el rango que falta y hace upsert SOLO de los días cerrados que faltan", async () => {
    const inserts = []; let rangoPedido = null;
    const client = {
      ping: async () => true,
      getVentasRango: async (desde, hasta) => { rangoPedido = [desde, hasta]; return [
        { dia: "2026-08-07", ventas: 100, tickets: 5, comensales: 0, ticket_medio: 20, base_imponible: 90, cuota_iva: 10 },
        { dia: "2026-08-08", ventas: 200, tickets: 8, comensales: 0, ticket_medio: 25, base_imponible: 180, cuota_iva: 20 }, // ya existe → no se cuenta
        { dia: "2026-08-09", ventas: 300, tickets: 9, comensales: 0, ticket_medio: 33, base_imponible: 270, cuota_iva: 30 },
      ]; },
    };
    const x = { all: async () => [{ dia: "2026-08-08" }], run: async (_sql, p) => { inserts.push(p[1]); } };
    const r = await syncVentasLocal(x, client, cfg, { hoy: "2026-08-10", maxDias: 3 });
    assert.equal(r.reachable, true);
    assert.deepEqual(rangoPedido, ["2026-08-07", "2026-08-10"]); // [primerFalta, últimoFalta+1)
    assert.deepEqual(inserts.sort(), ["2026-08-07", "2026-08-09"]); // 08 ya estaba
    assert.equal(r.insertados, 2);
  });
  test("todo al día ⇒ no llama al informe, 0 insertados", async () => {
    let llamado = false;
    const client = { ping: async () => true, getVentasRango: async () => { llamado = true; return []; } };
    const x = { all: async () => [{ dia: "2026-08-08" }, { dia: "2026-08-09" }], run: async () => {} };
    const r = await syncVentasLocal(x, client, cfg, { hoy: "2026-08-10", maxDias: 2 });
    assert.equal(llamado, false); assert.equal(r.insertados, 0);
  });
  test("error en el informe ⇒ se registra y no rompe", async () => {
    const client = { ping: async () => true, getVentasRango: async () => { throw new Error("bus_500"); } };
    const x = { all: async () => [], run: async () => {} };
    const r = await syncVentasLocal(x, client, cfg, { hoy: "2026-08-10", maxDias: 3 });
    assert.equal(r.reachable, true); assert.equal(r.insertados, 0); assert.match(r.error, /bus_500/);
  });
});
