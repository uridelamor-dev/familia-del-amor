// Ágora — diagnóstico de API (construcción pura de peticiones candidatas).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { candidatosDiagnostico, variantesAuth, puntuarResultado, ordenarResultados } from "../../src/integrations/agora/diagnostico.js";

describe("variantesAuth", () => {
  const v = variantesAuth("P67g6eZP5k");
  test("cubre cabeceras y query (Api-Token, Bearer, apiToken…)", () => {
    assert.ok(v.some((x) => x.headers["Api-Token"] === "P67g6eZP5k"));
    assert.ok(v.some((x) => x.headers.Authorization === "Bearer P67g6eZP5k"));
    assert.ok(v.some((x) => x.headers.Authorization === "P67g6eZP5k"));
    assert.ok(v.some((x) => x.query === "apiToken=P67g6eZP5k"));
    assert.ok(v.length >= 6);
  });
});

describe("candidatosDiagnostico", () => {
  const cands = candidatosDiagnostico("http://host:8984/", { token: "P67g6eZP5k", localId: "3", desde: "2026-08-01", hasta: "2026-08-05" });
  test("prueba la raíz con TODAS las variantes de auth", () => {
    const roots = cands.filter((c) => c.label.startsWith("root · "));
    assert.ok(roots.length >= 6);
    assert.ok(roots.some((c) => c.headers["Api-Token"] === "P67g6eZP5k"));
    assert.ok(roots.some((c) => c.url.includes("apiToken=P67g6eZP5k")));
  });
  test("incluye estilo query-flag en la raíz (patrón /?orders-monitor del manual)", () => {
    assert.ok(cands.some((c) => c.url === "http://host:8984/?documents&from=2026-08-01&to=2026-08-05&local=3"));
    assert.ok(cands.some((c) => c.label === "/?cierrescaja"));
  });
  test("incluye bases tipo path con recursos de venta/cierre", () => {
    assert.ok(cands.some((c) => c.url.includes("/api/documents")));
    assert.ok(cands.some((c) => c.url.includes("/export/cierres")));
  });
  test("añade rango de fechas y local a los endpoints de datos", () => {
    const docs = cands.find((c) => c.label === "/api/documents");
    assert.match(docs.url, /from=2026-08-01/);
    assert.match(docs.url, /to=2026-08-05/);
    assert.match(docs.url, /local=3/);
  });
  test("incluye sondeos POST con cuerpo", () => {
    const post = cands.filter((c) => c.method === "POST");
    assert.ok(post.length >= 1);
    assert.ok(post.some((c) => c.body && typeof c.body === "object"));
  });
  test("sin token/fechas no rompe (query-flag sin params)", () => {
    const c = candidatosDiagnostico("http://h:8984", {});
    assert.ok(Array.isArray(c) && c.length > 10);
    assert.ok(c.some((x) => x.url === "http://h:8984/?ventas"));
  });
});

describe("puntuarResultado / ordenarResultados", () => {
  test("JSON/XML 2xx puntúa más que 404", () => {
    assert.ok(puntuarResultado({ ok: true, esJson: true }) > puntuarResultado({ ok: false, status: 404 }));
    assert.ok(puntuarResultado({ ok: true, esXml: true }) > puntuarResultado({ ok: false, status: 404 }));
  });
  test("respuesta con estado (401) puntúa más que error de red", () => {
    assert.ok(puntuarResultado({ ok: false, status: 401 }) > puntuarResultado({ ok: false }));
  });
  test("cuerpo con palabras de venta/cierre sube la puntuación", () => {
    assert.ok(puntuarResultado({ ok: true, esXml: true, bodySample: "<cierreCaja importe='100'>" }) > puntuarResultado({ ok: true, esXml: true, bodySample: "<html>" }));
  });
  test("ordena de más a menos prometedor", () => {
    const r = ordenarResultados([
      { label: "a", ok: false, status: 404 },
      { label: "b", ok: true, esJson: true, bodySample: "importe total" },
      { label: "c", ok: false, status: 401 },
    ]);
    assert.equal(r[0].label, "b");
    assert.equal(r[2].label, "a");
  });
});
