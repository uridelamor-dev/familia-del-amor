// Dashboard ejecutivo — motor de inteligencia: razonamiento de Sara (puro) + ensamblado.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ayerNarrativa, buildConcerns, buildAgenda, getDashboard } from "../../src/modules/dashboard/dashboard.service.js";

const HOY = "2026-08-05";

describe("ayerNarrativa", () => {
  test("con histórico compara con un día normal", () => {
    const r = ayerNarrativa({ dow: 2, ayerTot: { n: 30, personas: 90 }, base: { total: 160, dias: 8 }, ayerLocal: [] }, null);
    assert.equal(r.disponible, true);
    assert.match(r.texto, /30 reservas/);
    assert.match(r.texto, /%/); // incluye comparación
  });
  test("sin histórico suficiente lo dice honestamente", () => {
    const r = ayerNarrativa({ dow: 2, ayerTot: { n: 10, personas: 20 }, base: { total: 2, dias: 1 }, ayerLocal: [] }, null);
    assert.match(r.texto, /sin histórico suficiente/);
  });
  test("sin datos de ayer", () => {
    assert.equal(ayerNarrativa({ ayerTot: null }, null).disponible, false);
  });
});

describe("buildConcerns — Sara razona y termina en decisión", () => {
  test("vacío cuando no hay señales", () => {
    assert.deepEqual(buildConcerns({ hoy: HOY }, { whatsappConnected: true }), []);
  });
  test("WhatsApp caído ⇒ crítico y primero", () => {
    const c = buildConcerns({ hoy: HOY, recur: [{ local: "X", titulo: "T", c: 4 }] }, { whatsappConnected: false });
    assert.equal(c[0].tipo, "whatsapp"); assert.equal(c[0].sev, "crit");
    assert.ok(c.every((x) => x.decision && x.decision.length > 10)); // toda preocupación tiene decisión
  });
  test("recurrencia de mantenimiento ⇒ decisión de sustituir", () => {
    const c = buildConcerns({ hoy: HOY, recur: [{ local: "Can Mateu", titulo: "Cámara", c: 4 }] }, { whatsappConnected: true });
    const m = c.find((x) => x.tipo === "mantenimiento");
    assert.equal(m.sev, "crit");
    assert.match(m.decision, /sustitu/i);
    assert.match(m.narrativa, /4 veces/);
  });
  test("reseña baja correlacionada con incidencia del día", () => {
    const c = buildConcerns({ hoy: HOY, lowCorr: { review: { rating: 2, text: "lento", location_name: "Girona" }, dia: "2026-08-03", reservasDia: 8, incidenciasDia: 1 } }, { whatsappConnected: true });
    const r = c.find((x) => x.tipo === "resenas");
    assert.match(r.narrativa, /incidencia/);
  });
  test("fuga de clientes ⇒ lista de a quién llamar", () => {
    const c = buildConcerns({ hoy: HOY, churn: [{ nombre: "Ana Ruiz" }, { nombre: "Toni Mas" }, { nombre: "Eva Sol" }, { nombre: "x" }, { nombre: "y" }] }, {});
    const cl = c.find((x) => x.tipo === "clientes");
    assert.match(cl.decision, /Ana/);
  });
  test("prioridad crit → imp → info", () => {
    const c = buildConcerns({ hoy: HOY, recur: [{ local: "A", titulo: "T", c: 4 }], cand: { n: 2, oldest: "2026-08-01" }, facPend: { n: 3 } }, { whatsappConnected: false });
    const sevs = c.map((x) => x.sev); const rank = { crit: 0, imp: 1, info: 2 };
    assert.deepEqual(sevs, [...sevs].sort((a, b) => rank[a] - rank[b]));
    assert.equal(sevs[0], "crit");
  });
  test("scope por local aparece en la narrativa de clientes", () => {
    const c = buildConcerns({ hoy: HOY, churn: [{ nombre: "Ana" }, { nombre: "B" }, { nombre: "C" }] }, { localName: "La Tapeta - Girona" });
    assert.match(c.find((x) => x.tipo === "clientes").titulo, /Girona/);
  });
});

describe("buildAgenda", () => {
  test("toma las decisiones no-info, máximo 3", () => {
    const concerns = [{ sev: "crit", titulo: "A", decision: "d1", go: "whatsapp" }, { sev: "imp", titulo: "B", decision: "d2", go: "mantenimiento" }, { sev: "info", titulo: "C", decision: "d3", go: "rrhh" }, { sev: "imp", titulo: "D", decision: "d4", go: "clientes" }];
    const a = buildAgenda(concerns);
    assert.equal(a.length, 3);
    assert.ok(!a.some((x) => x.t === "C")); // info excluido
  });
});

// Fake que despacha filas canónicas según la consulta (sin BD real; safe() ignora lo no cubierto).
function fakeX() {
  const one = (sql) => {
    if (/FROM reservas WHERE EXTRACT\(DOW/.test(sql)) return { total: 40, dias: 8 };
    if (/FROM reservas WHERE dia = \?/.test(sql) && /personas/.test(sql)) return { n: 12, personas: 41 };
    if (/FROM reservas WHERE dia = \?/.test(sql)) return { n: 24 }; // correlación
    if (/FROM maintenance_issues WHERE estado NOT IN.*creado_en::date <=/.test(sql)) return null; // aging va por all()
    if (/FROM maintenance_issues WHERE estado NOT IN/.test(sql)) return { n: 5 };
    if (/creado_en::date = \?::date/.test(sql)) return { n: 1 };
    if (/AVG\(rating\)/.test(sql)) return { media: 4.4, total: 120 };
    if (/hr_applications WHERE estado = 'nuevo'/.test(sql)) return { n: 3, oldest: "2026-08-01" };
    if (/facturas_pendientes/.test(sql)) return { n: 2 };
    return null;
  };
  const many = (sql) => {
    if (/FROM reservas WHERE dia = \? GROUP BY local/.test(sql)) return [{ local: "La Tapeta - Blanes", n: 7, personas: 25 }, { local: "La Tapeta - Lloret", n: 5, personas: 16 }];
    if (/maintenance_issues.*GROUP BY local, titulo HAVING/.test(sql)) return [{ local: "Can Mateu - Tordera", titulo: "Cámara frigorífica", c: 4 }];
    if (/estado NOT IN.*creado_en::date <= \?::date/.test(sql)) return [{ id: 1, local: "La Tapeta - Girona", titulo: "Datáfono", creado_en: "2026-07-25" }];
    if (/rating <= 2/.test(sql)) return [{ author: "X", rating: 2, text: "lento", fecha: "2026-08-03", location_name: "Girona" }];
    if (/FROM reservas WHERE telefono/.test(sql)) return [{ telefono: "600111222", nombre: "Ana Ruiz", visitas: 6, ultima: "2026-06-10", local: "La Tapeta - Blanes" }];
    if (/FROM facturas.*fecha::date >= \?::date AND fecha::date < \?::date/.test(sql)) return [{ proveedor: "Maresme", t: 4000 }];
    if (/FROM facturas.*fecha::date >= \?::date/.test(sql)) return [{ proveedor: "Maresme", t: 5200 }];
    return [];
  };
  return { get: async (sql) => one(sql), all: async (sql) => many(sql) };
}

describe("getDashboard — ensamblado del periódico", () => {
  test("compone portada, preocupaciones, agenda, soporte y bloque honesto", async () => {
    const d = await getDashboard(fakeX(), { now: HOY + "T09:00:00Z", whatsappConnected: true });
    assert.equal(d.fecha, HOY);
    assert.equal(d.ayer.disponible, true);
    assert.ok(d.preocupaciones.length >= 3);
    assert.equal(d.preocupaciones[0].sev, "crit"); // recurrencia cámara
    assert.match(d.preocupaciones[0].decision, /sustitu/i);
    assert.ok(d.agenda.length >= 1);
    assert.ok(d.clientesRiesgo.length >= 1);
    assert.equal(d.proveedoresRiesgo[0].proveedor, "Maresme"); // +30% ≥ 15%
    assert.equal(d.pendienteFuentes.ventasMargen.disponible, false); // honesto, sin inventar
    assert.match(d.pendienteFuentes.personal.fuente, /Skello/);
  });
  test("scope por local se propaga", async () => {
    const d = await getDashboard(fakeX(), { now: HOY + "T09:00:00Z", whatsappConnected: true, local: "La Tapeta - Girona" });
    assert.equal(d.scope.local, "La Tapeta - Girona");
  });
});
