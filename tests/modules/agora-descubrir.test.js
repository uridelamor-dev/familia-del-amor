// Ágora — descubrimiento de rutas desde la web de administración (extracción pura).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolverUrl, extraerScripts, extraerRutasApi, clasificarRutas } from "../../src/integrations/agora/descubrir.js";

describe("resolverUrl", () => {
  test("absolutas se respetan; relativas se cuelgan de la base", () => {
    assert.equal(resolverUrl("http://h:8984/", "http://x/a.js"), "http://x/a.js");
    assert.equal(resolverUrl("http://h:8984/", "/js/app.js"), "http://h:8984/js/app.js");
    assert.equal(resolverUrl("http://h:8984", "js/app.js"), "http://h:8984/js/app.js");
    assert.equal(resolverUrl("http://h:8984", "./main.js"), "http://h:8984/main.js");
  });
});

describe("extraerScripts", () => {
  test("saca src de <script> y href .js de <link>, absolutos y únicos", () => {
    const html = `<html><head>
      <script src="/js/vendor.js"></script>
      <script src="main.abc123.js" defer></script>
      <link rel="modulepreload" href="/js/chunk.js">
      <script src="/js/vendor.js"></script>
    </head></html>`;
    const s = extraerScripts(html, "http://h:8984");
    assert.deepEqual(s, ["http://h:8984/js/vendor.js", "http://h:8984/main.abc123.js", "http://h:8984/js/chunk.js"]);
  });
});

describe("extraerRutasApi", () => {
  test("extrae rutas de JS y descarta assets/urls absolutas", () => {
    const js = `fetch("/api/v2/ventas/resumen");var a='/informes/cierrecaja';let b="./img/logo.png";x("https://n/x");call('/rest/documentos')`;
    const r = extraerRutasApi(js);
    assert.ok(r.includes("/api/v2/ventas/resumen"));
    assert.ok(r.includes("/informes/cierrecaja"));
    assert.ok(r.includes("/rest/documentos"));
    assert.ok(!r.some((p) => p.includes("logo.png")));
    assert.ok(!r.some((p) => p.startsWith("http")));
  });
});

describe("clasificarRutas", () => {
  test("separa prometedoras (venta/cierre/api…) del resto", () => {
    const { api, otras } = clasificarRutas(["/api/ventas", "/assets/x", "/informes/cierre", "/home/menu", "/api/ventas"]);
    assert.ok(api.includes("/api/ventas"));
    assert.ok(api.includes("/informes/cierre"));
    assert.ok(otras.includes("/home/menu"));
    assert.equal(api.filter((x) => x === "/api/ventas").length, 1); // dedupe
  });
});
