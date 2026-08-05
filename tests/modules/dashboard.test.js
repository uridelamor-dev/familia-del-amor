// Dashboard ejecutivo — motor de inteligencia: razonamiento de Sara (puro) + ensamblado.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ayerNarrativa, hoyNarrativa, buildConcerns, buildAgenda, getDashboard } from "../../src/modules/dashboard/dashboard.service.js";

const HOY = "2026-08-05";

describe("ayerNarrativa", () => {
  test("con histórico compara con un día normal", () => {
    const r = ayerNarrativa({ dow: 2, ayerTot: { n: 30, personas: 90 }, base: { total: 160, dias: 8 }, ayerLocal: [] }, null);
    assert.equal(r.disponible, true);
    assert.match(r.texto, /30 reservas/);
    assert.match(r.texto, /%/);
  });
  test("sin histórico suficiente lo dice honestamente", () => {
    const r = ayerNarrativa({ dow: 2, ayerTot: { n: 10, personas: 20 }, base: { total: 2, dias: 1 }, ayerLocal: [] }, null);
    assert.match(r.texto, /sin histórico suficiente/);
  });
  test("sin datos de ayer", () => {
    assert.equal(ayerNarrativa({ ayerTot: null }, null).disponible, false);
  });
});

describe("hoyNarrativa — qué viene por delante", () => {
  test("resume ocupación de hoy y de los próximos días", () => {
    const r = hoyNarrativa({ hoyTot: { n: 12, personas: 41 }, hoyLocal: [{ local: "La Tapeta - Blanes", n: 7, personas: 25 }], prox7: { n: 40, personas: 130 } }, null);
    assert.equal(r.disponible, true);
    assert.match(r.texto, /12 reservas/);
    assert.match(r.texto, /próximos 7 días/);
    assert.equal(r.alerta, false);
  });
  test("sin reservas ni hoy ni próximos ⇒ alerta (revisar Sara)", () => {
    const r = hoyNarrativa({ hoyTot: { n: 0, personas: 0 }, hoyLocal: [], prox7: { n: 0, personas: 0 } }, "La Tapeta - Girona");
    assert.equal(r.alerta, true);
    assert.match(r.texto, /Sara/);
  });
});

describe("buildConcerns — Sara razona y termina en decisión", () => {
  test("vacío cuando no hay señales", () => {
    assert.deepEqual(buildConcerns({ hoy: HOY }, { whatsappConnected: true }), []);
  });
  test("WhatsApp caído ⇒ crítico y primero; toda preocupación lleva decisión", () => {
    const c = buildConcerns({ hoy: HOY, recur: [{ local: "X", titulo: "T", c: 4 }] }, { whatsappConnected: false });
    assert.equal(c[0].tipo, "whatsapp"); assert.equal(c[0].sev, "crit");
    assert.ok(c.every((x) => x.decision && x.decision.length > 10));
  });
  test("recurrencia de mantenimiento ⇒ decisión de sustituir", () => {
    const c = buildConcerns({ hoy: HOY, recur: [{ local: "Can Mateu", titulo: "Cámara", c: 4 }] }, { whatsappConnected: true });
    const m = c.find((x) => x.tipo === "mantenimiento");
    assert.equal(m.sev, "crit");
    assert.match(m.decision, /sustitu/i);
    assert.match(m.narrativa, /4 veces/);
  });
  test("factura antigua sin pagar ⇒ preocupación de dinero con días", () => {
    const c = buildConcerns({ hoy: HOY, masAntigua: { proveedor: "Maresme", total: 1200, fecha: "2026-05-01" }, porPagar: { total: 5400, n: 9 } }, { whatsappConnected: true });
    const f = c.find((x) => x.tipo === "facturas");
    assert.ok(f); assert.match(f.titulo, /sin pagar desde hace/);
    assert.match(f.narrativa, /días/);
  });
  test("factura reciente sin pagar NO genera preocupación", () => {
    const c = buildConcerns({ hoy: HOY, masAntigua: { proveedor: "X", total: 100, fecha: "2026-08-01" } }, { whatsappConnected: true });
    assert.equal(c.find((x) => x.tipo === "facturas" && /sin pagar/.test(x.titulo)), undefined);
  });
  test("gasto de un local disparado ⇒ decisión de investigar coste", () => {
    const c = buildConcerns({ hoy: HOY, gastoLocal: [{ local: "Lloret", actual: 8000, prev: 5000, delta: 60 }] }, { whatsappConnected: true });
    const g = c.find((x) => /disparado/.test(x.titulo));
    assert.ok(g); assert.match(g.narrativa, /60/);
  });
  test("reputación de un local baja ⇒ preocupación", () => {
    const c = buildConcerns({ hoy: HOY, repLocal: [{ location_name: "Girona", media: 3.1, n: 20 }] }, { whatsappConnected: true });
    const r = c.find((x) => x.tipo === "resenas" && /reputación/i.test(x.titulo));
    assert.ok(r); assert.equal(r.sev, "crit");
  });
  test("trabajador con incidencias acumuladas ⇒ decisión de RR.HH.", () => {
    const c = buildConcerns({ hoy: HOY, incWorkers: [{ nombre: "Marc Puig", local: "Blanes", c: 3 }] }, { whatsappConnected: true });
    const w = c.find((x) => x.tipo === "rrhh" && /acumula/.test(x.titulo));
    assert.ok(w); assert.match(w.titulo, /Marc/);
  });
  test("check-ins pendientes avanzado el mes ⇒ info", () => {
    const c = buildConcerns({ hoy: "2026-08-22", plantilla: { n: 20 }, checkinsMes: { n: 5 } }, { whatsappConnected: true });
    const ck = c.find((x) => /check-ins/.test(x.titulo));
    assert.ok(ck); assert.equal(ck.sev, "info");
  });
  test("fuga de clientes ⇒ lista de a quién llamar", () => {
    const c = buildConcerns({ hoy: HOY, churn: [{ nombre: "Ana Ruiz" }, { nombre: "Toni Mas" }, { nombre: "Eva Sol" }, { nombre: "x" }, { nombre: "y" }] }, {});
    const cl = c.find((x) => x.tipo === "clientes");
    assert.match(cl.decision, /Ana/);
  });
  test("prioridad crit → imp → info y máximo 7", () => {
    const c = buildConcerns({ hoy: HOY, recur: [{ local: "A", titulo: "T", c: 4 }], masAntigua: { proveedor: "P", total: 900, fecha: "2026-04-01" }, gastoLocal: [{ local: "L", actual: 9000, prev: 5000, delta: 80 }], churn: [{ nombre: "A" }, { nombre: "B" }, { nombre: "C" }, { nombre: "D" }, { nombre: "E" }], cand: { n: 2, oldest: "2026-08-01" }, facPend: { n: 3 } }, { whatsappConnected: false });
    const rank = { crit: 0, imp: 1, info: 2 }; const sevs = c.map((x) => x.sev);
    assert.deepEqual(sevs, [...sevs].sort((a, b) => rank[a] - rank[b]));
    assert.ok(c.length <= 7);
    assert.equal(sevs[0], "crit");
  });
});

describe("buildAgenda", () => {
  test("toma las decisiones no-info, máximo 4", () => {
    const concerns = [{ sev: "crit", titulo: "A", decision: "d1", go: "whatsapp" }, { sev: "imp", titulo: "B", decision: "d2", go: "mantenimiento" }, { sev: "info", titulo: "C", decision: "d3", go: "rrhh" }, { sev: "imp", titulo: "D", decision: "d4", go: "clientes" }];
    const a = buildAgenda(concerns);
    assert.ok(a.length <= 4);
    assert.ok(!a.some((x) => x.t === "C"));
  });
});

// Fake que despacha filas canónicas según consulta+parámetros (sin BD real).
function fakeX(hoy) {
  const ayer = "2026-08-04";
  const one = (sql, p = []) => {
    if (/SUM\(personas\).*FROM reservas WHERE dia = \?/.test(sql)) return p[0] === hoy ? { n: 12, personas: 41 } : { n: 24, personas: 70 };
    if (/EXTRACT\(DOW FROM dia::date\)/.test(sql)) return { total: 40, dias: 8 };
    if (/dia::date > \?::date AND dia::date <= \?/.test(sql)) return { n: 40, personas: 130 };
    if (/SELECT COUNT\(\*\)::int n FROM maintenance_issues WHERE estado NOT IN/.test(sql) && !/GROUP BY/.test(sql)) return { n: 5 };
    if (/AVG\(rating\)/.test(sql)) return { media: 4.4, total: 120 };
    if (/COUNT\(\*\)::int n, COALESCE\(SUM\(total\),0\)::float total FROM facturas WHERE COALESCE\(pagado,0\) = 0/.test(sql)) return { n: 9, total: 5400 };
    if (/pagado,0\) = 0 AND fecha IS NOT NULL.*ORDER BY fecha::date ASC/.test(sql)) return { proveedor: "Maresme Fruites", total: 1200, fecha: "2026-05-10" };
    if (/FROM users WHERE rol IN/.test(sql)) return { n: 18 };
    if (/hr_llamadas_mes WHERE mes = \?/.test(sql)) return { n: 6 };
    if (/hr_applications WHERE estado = 'nuevo'/.test(sql)) return { n: 3, oldest: "2026-08-01" };
    if (/facturas_pendientes/.test(sql)) return { n: 2 };
    if (/FROM reservas WHERE dia = \?/.test(sql)) return { n: 20 }; // lowCorr reservasDia
    if (/creado_en::date = \?::date/.test(sql)) return { n: 1 };  // lowCorr incidenciasDia
    return null;
  };
  const many = (sql, p = []) => {
    if (/FROM reservas WHERE dia = \? GROUP BY local/.test(sql)) return p[0] === hoy
      ? [{ local: "La Tapeta - Blanes", n: 7, personas: 25 }, { local: "La Tapeta - Lloret", n: 5, personas: 16 }]
      : [{ local: "La Tapeta - Blanes", n: 8, personas: 30 }, { local: "La Tapeta - Girona", n: 3, personas: 9 }];
    if (/GROUP BY local, titulo HAVING/.test(sql)) return [{ local: "Can Mateu - Tordera", titulo: "Cámara frigorífica", c: 4 }];
    if (/estado NOT IN.*creado_en::date <= \?::date/.test(sql)) return [{ id: 1, local: "La Tapeta - Girona", titulo: "Datáfono", creado_en: "2026-07-25" }];
    if (/maintenance_issues WHERE estado NOT IN.*GROUP BY local/.test(sql)) return [{ local: "Can Mateu - Tordera", n: 3 }, { local: "La Tapeta - Girona", n: 1 }];
    if (/rating <= 2/.test(sql)) return [{ author: "X", rating: 2, text: "lento", fecha: "2026-08-03", location_name: "Girona" }];
    if (/GROUP BY location_name/.test(sql)) return [{ location_name: "La Tapeta Girona", media: 3.4, n: 22 }, { location_name: "La Tapeta Blanes", media: 4.5, n: 40 }];
    if (/pagado,0\) = 0 AND proveedor.*GROUP BY proveedor/.test(sql)) return [{ proveedor: "Maresme Fruites", t: 2200, n: 4 }];
    if (/TO_CHAR\(fecha::date,'YYYY-MM'\) = \? GROUP BY local/.test(sql)) return p[0] === hoy.slice(0, 7)
      ? [{ local: "La Tapeta - Lloret", t: 8000 }, { local: "La Tapeta - Blanes", t: 4000 }]
      : [{ local: "La Tapeta - Lloret", t: 5000 }, { local: "La Tapeta - Blanes", t: 4200 }];
    if (/fecha::date >= \?::date AND fecha::date < \?::date/.test(sql)) return [{ proveedor: "Maresme Fruites", t: 4000 }];
    if (/fecha::date >= \?::date/.test(sql) && /GROUP BY proveedor/.test(sql)) return [{ proveedor: "Maresme Fruites", t: 5200 }];
    if (/hr_worker_notes n JOIN users/.test(sql)) return [{ worker_id: 3, nombre: "Marc Puig", local: "La Tapeta - Blanes", c: 3, ult: "2026-08-01" }];
    if (/HAVING COUNT\(\*\) >= 3 AND MAX\(dia\)::date </.test(sql)) return [{ telefono: "600111222", nombre: "Ana Ruiz", visitas: 6, ultima: "2026-06-10", local: "La Tapeta - Blanes" }];
    if (/HAVING COUNT\(\*\) >= 4 AND MAX\(dia\)::date >=/.test(sql)) return [{ telefono: "600999888", nombre: "Jordi Vic", visitas: 9, ultima: "2026-07-30", local: "La Tapeta - Blanes" }];
    return [];
  };
  return { get: async (sql, p) => one(sql, p), all: async (sql, p) => many(sql, p) };
}

describe("getDashboard — ensamblado del periódico completo", () => {
  test("compone portada, preocupaciones, radar, dinero, equipo y clientes", async () => {
    const d = await getDashboard(fakeX(HOY), { now: HOY + "T09:00:00Z", whatsappConnected: true });
    assert.equal(d.fecha, HOY);
    assert.equal(d.ayer.disponible, true);
    assert.equal(d.hoy.disponible, true);
    assert.ok(d.preocupaciones.length >= 3);
    assert.equal(d.preocupaciones[0].sev, "crit");
    assert.ok(d.agenda.length >= 1);
    // radar por local (vista de grupo)
    assert.ok(d.radarLocales.length >= 1);
    assert.ok(d.radarLocales[0].local);
    // dinero real
    assert.equal(d.dinero.porPagar.n, 9);
    assert.ok(d.dinero.masAntigua && d.dinero.masAntigua.dias > 45);
    assert.ok(d.dinero.gastoLocal.length >= 1);
    assert.equal(d.dinero.sinFuente.disponible, false); // honesto: sin ventas
    // equipo real
    assert.equal(d.equipo.checkins.plantilla, 18);
    assert.ok(d.equipo.incidencias.length >= 1);
    assert.equal(d.equipo.sinFuente.disponible, false); // honesto: sin fichajes
    // clientes: fuga + mejores
    assert.ok(d.clientes.enfriando.length >= 1);
    assert.ok(d.clientes.mejores.length >= 1);
    // reputación por local
    assert.ok(d.reputacionLocales.length >= 1);
  });
  test("scope por local: radar vacío y scope propagado", async () => {
    const d = await getDashboard(fakeX(HOY), { now: HOY + "T09:00:00Z", whatsappConnected: true, local: "La Tapeta - Girona" });
    assert.equal(d.scope.local, "La Tapeta - Girona");
    assert.deepEqual(d.radarLocales, []);
  });
});
