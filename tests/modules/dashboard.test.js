// Dashboard ejecutivo (agregado real) — lógica de "atención" + ensamblado del payload.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildAtencion, getDashboard } from "../../src/modules/dashboard/dashboard.service.js";

describe("buildAtencion — priorización", () => {
  test("vacío cuando no hay nada", () => {
    assert.deepEqual(buildAtencion({ whatsappConnected: true }), []);
  });
  test("WhatsApp desconectado ⇒ crítico y primero", () => {
    const a = buildAtencion({ whatsappConnected: false, candidaturas: 3 });
    assert.equal(a[0].tipo, "whatsapp");
    assert.equal(a[0].sev, "crit");
  });
  test("orden crit → imp → info", () => {
    const a = buildAtencion({ whatsappConnected: true, incAntiguas: 1, facturasPendientes: 2, candidaturas: 1, incAbiertas: 4, resenasBajas: 1 });
    const sevs = a.map((x) => x.sev);
    assert.deepEqual(sevs, [...sevs].sort((p, q) => ({ crit: 0, imp: 1, info: 2 }[p] - { crit: 0, imp: 1, info: 2 }[q])));
    assert.equal(a[0].sev, "crit");
    assert.ok(a.some((x) => x.tipo === "facturas"));
  });
  test("no incluye lo que es 0", () => {
    const a = buildAtencion({ whatsappConnected: true, candidaturas: 0, facturasPendientes: 0, incAbiertas: 0 });
    assert.equal(a.length, 0);
  });
});

// Fake que despacha valores canónicos según la consulta (sin BD real).
function fakeX(c) {
  const pick = (sql) => {
    if (/reservas WHERE dia = \? GROUP BY local/.test(sql)) return c.rHoyLocal;
    if (/reservas WHERE dia = \?/.test(sql)) return c.rHoy;
    if (/reservas WHERE dia > \?/.test(sql)) return c.rProx;
    if (/maintenance_issues WHERE estado NOT IN.*GROUP BY local/.test(sql)) return c.incLocal;
    if (/maintenance_issues WHERE estado NOT IN.*creado_en::date <=/.test(sql)) return c.incAntig;
    if (/AVG\(rating\)/.test(sql)) return c.resAgg;
    if (/ORDER BY creado_en DESC LIMIT 5/.test(sql)) return c.resUlt;
    if (/rating <= 2/.test(sql)) return c.resBajas;
    if (/google_reviews WHERE creado_en::date >=/.test(sql)) return c.resNuevas;
    if (/hr_applications WHERE estado = 'nuevo'/.test(sql)) return c.cand;
    if (/facturas_pendientes/.test(sql)) return c.facPend;
    throw new Error("fake: consulta no cubierta:\n" + sql);
  };
  return { get: async (sql) => pick(sql), all: async (sql) => pick(sql) };
}

const CANNED = {
  rHoy: { n: 12, personas: 41 },
  rHoyLocal: [{ local: "La Tapeta - Blanes", n: 7, personas: 25 }, { local: "La Tapeta - Lloret", n: 5, personas: 16 }],
  rProx: { n: 34 },
  incLocal: [{ local: "Can Mateu - Tordera", n: 2 }, { local: "La Tapeta - Girona", n: 1 }],
  incAntig: { n: 1 },
  resAgg: { media: 4.6, total: 128 },
  resUlt: [{ author: "Marta", rating: 5, text: "Genial", fecha: "2026-08-04", location_name: "Blanes" }],
  resNuevas: { n: 3 },
  resBajas: { n: 1 },
  cand: { n: 4 },
  facPend: { n: 2 },
};

describe("getDashboard — ensamblado del payload real", () => {
  test("compone la foto del día con recuentos reales", async () => {
    const d = await getDashboard(fakeX(CANNED), { now: "2026-08-05T09:00:00.000Z", whatsappConnected: true });
    assert.equal(d.fecha, "2026-08-05");
    assert.equal(d.ventasDisponible, false);
    assert.equal(d.reservas.hoy.n, 12);
    assert.equal(d.reservas.hoy.personas, 41);
    assert.equal(d.reservas.porLocal.length, 2);
    assert.equal(d.reservas.proximas7, 34);
    assert.equal(d.mantenimiento.abiertas, 3); // 2 + 1
    assert.equal(d.mantenimiento.antiguas, 1);
    assert.equal(d.resenas.media, 4.6);
    assert.equal(d.resenas.nuevas7, 3);
    assert.equal(d.candidaturas.nuevas, 4);
    assert.equal(d.facturas.pendientes, 2);
    assert.equal(d.whatsapp.connected, true);
  });
  test("incluye alertas de atención y respeta el orden", async () => {
    const d = await getDashboard(fakeX(CANNED), { now: "2026-08-05T09:00:00.000Z", whatsappConnected: false });
    assert.equal(d.atencion[0].tipo, "whatsapp"); // crítico primero
    assert.ok(d.atencion.some((a) => a.tipo === "facturas"));
    assert.ok(d.atencion.some((a) => a.tipo === "rrhh"));
  });
  test("robusto ante tablas vacías", async () => {
    const empty = { rHoy: { n: 0, personas: 0 }, rHoyLocal: [], rProx: { n: 0 }, incLocal: [], incAntig: { n: 0 }, resAgg: { media: 0, total: 0 }, resUlt: [], resNuevas: { n: 0 }, resBajas: { n: 0 }, cand: { n: 0 }, facPend: { n: 0 } };
    const d = await getDashboard(fakeX(empty), { now: "2026-08-05T09:00:00.000Z", whatsappConnected: true });
    assert.equal(d.mantenimiento.abiertas, 0);
    assert.deepEqual(d.atencion, []);
  });
});
