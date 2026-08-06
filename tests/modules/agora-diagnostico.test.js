// Ágora — diagnóstico de API (construcción pura de peticiones candidatas).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { candidatosDiagnostico, puntuarResultado, ordenarResultados } from "../../src/integrations/agora/diagnostico.js";

describe("candidatosDiagnostico", () => {
  const cands = candidatosDiagnostico("http://host:8984/", { token: "P67g6eZP5k", localId: "3", desde: "2026-08-01", hasta: "2026-08-05" });
  test("normaliza la base (sin barra final) y usa el token en Api-Token", () => {
    const root = cands.find((c) => c.label === "root · header Api-Token");
    assert.equal(root.url, "http://host:8984/");
    assert.equal(root.headers["Api-Token"], "P67g6eZP5k");
  });
  test("incluye variantes de auth (Bearer y query apiToken)", () => {
    assert.ok(cands.some((c) => c.headers.Authorization === "Bearer P67g6eZP5k"));
    assert.ok(cands.some((c) => c.url.includes("apiToken=P67g6eZP5k")));
  });
  test("añade rango de fechas y local a los endpoints de datos", () => {
    const docs = cands.find((c) => c.label === "documents (from/to)");
    assert.match(docs.url, /from=2026-08-01/);
    assert.match(docs.url, /to=2026-08-05/);
    assert.match(docs.url, /local=3/);
  });
  test("prueba endpoints de cierres (donde vive la venta diaria según Ágora)", () => {
    assert.ok(cands.some((c) => /cierres/i.test(c.url)));
  });
  test("incluye sondeos POST con cuerpo", () => {
    const post = cands.filter((c) => c.method === "POST");
    assert.ok(post.length >= 1);
    assert.ok(post.some((c) => c.body && typeof c.body === "object"));
  });
  test("sin token/fechas no rompe (query vacía)", () => {
    const c = candidatosDiagnostico("http://h:8984", {});
    assert.ok(Array.isArray(c) && c.length > 5);
    assert.equal(c.find((x) => x.label === "ventas (fecha)").url, "http://h:8984/api/ventas");
  });
});

describe("puntuarResultado / ordenarResultados", () => {
  test("JSON 2xx puntúa más que 404", () => {
    assert.ok(puntuarResultado({ ok: true, esJson: true }) > puntuarResultado({ ok: false, status: 404 }));
  });
  test("respuesta con estado (401) puntúa más que error de red", () => {
    assert.ok(puntuarResultado({ ok: false, status: 401 }) > puntuarResultado({ ok: false }));
  });
  test("ordena de más a menos prometedor", () => {
    const r = ordenarResultados([
      { label: "a", ok: false, status: 404 },
      { label: "b", ok: true, esJson: true, bodySample: "{...}" },
      { label: "c", ok: false, status: 401 },
    ]);
    assert.equal(r[0].label, "b");
    assert.equal(r[2].label, "a");
  });
});
