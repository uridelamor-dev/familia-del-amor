import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";
import { comprimir, debeComprimir, aceptaGzip, tipoComprimible, UMBRAL } from "../../src/http/comprimir.js";

describe("aceptaGzip: qué dice el navegador", () => {
  test("lo normal", () => {
    assert.equal(aceptaGzip("gzip, deflate, br"), true);
    assert.equal(aceptaGzip("gzip;q=0.8, identity;q=0.5"), true);
    assert.equal(aceptaGzip("*"), true);
  });
  test("un NO es un NO", () => {
    assert.equal(aceptaGzip("gzip;q=0"), false);
    assert.equal(aceptaGzip("deflate, br"), false);
    assert.equal(aceptaGzip(""), false);
    assert.equal(aceptaGzip(undefined), false);
  });
  test("no cuela «xgzip» ni «gzipx» por parecerse", () => {
    assert.equal(aceptaGzip("xgzip"), false);
    assert.equal(aceptaGzip("gzipx"), false);
  });
});

describe("tipoComprimible: solo lo que es texto", () => {
  test("sí", () => {
    for (const t of ["text/html; charset=utf-8", "text/css", "application/javascript", "application/json",
      "image/svg+xml", "application/manifest+json", "application/ld+json"]) {
      assert.equal(tipoComprimible(t), true, t);
    }
  });
  test("no: lo que ya está comprimido pesa MÁS si se vuelve a comprimir", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/zip",
      "video/mp4", "font/woff2", "application/octet-stream", "", null]) {
      assert.equal(tipoComprimible(t), false, String(t));
    }
  });
});

describe("debeComprimir: la decisión completa", () => {
  const base = { metodo: "GET", aceptaEncoding: "gzip", contentType: "application/json", bytes: 50000, codigo: 200 };
  test("el caso de siempre: JSON grande a un navegador moderno", () => {
    assert.equal(debeComprimir(base), true);
  });
  test("por debajo del umbral no compensa", () => {
    assert.equal(debeComprimir({ ...base, bytes: UMBRAL - 1 }), false);
    assert.equal(debeComprimir({ ...base, bytes: UMBRAL }), true);
  });
  test("un 304 y un 204 no tienen cuerpo", () => {
    assert.equal(debeComprimir({ ...base, codigo: 304 }), false);
    assert.equal(debeComprimir({ ...base, codigo: 204 }), false);
  });
  test("HEAD tampoco", () => {
    assert.equal(debeComprimir({ ...base, metodo: "HEAD" }), false);
  });
  test("lo que ya viene con Content-Encoding no se toca", () => {
    assert.equal(debeComprimir({ ...base, contentEncoding: "gzip" }), false);
  });
  test("no-transform es una orden de no tocar el cuerpo", () => {
    assert.equal(debeComprimir({ ...base, cacheControl: "public, no-transform" }), false);
  });
  test("una foto no", () => {
    assert.equal(debeComprimir({ ...base, contentType: "image/jpeg" }), false);
  });
});

// ── El middleware de verdad, contra un servidor HTTP real ───────────────────
function servidor(handler) {
  const mw = comprimir();
  return http.createServer((req, res) => {
    // Mínimo imprescindible de Express que usa el middleware.
    res.getHeader = res.getHeader.bind(res);
    mw(req, res, () => handler(req, res));
  });
}

function pedir(srv, { path = "/", headers = {}, metodo = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port: srv.address().port, path, method: metodo, headers }, (res) => {
      const t = [];
      res.on("data", (d) => t.push(d));
      res.on("end", () => resolve({ res, cuerpo: Buffer.concat(t) }));
    });
    req.on("error", reject);
    req.end();
  });
}

const arrancar = (handler) => new Promise((r) => { const s = servidor(handler); s.listen(0, () => r(s)); });

describe("middleware contra un servidor real", () => {
  const grande = "x".repeat(60000) + JSON.stringify({ hola: "mundo" });

  test("un JSON grande llega comprimido y se descomprime igual que salió", async () => {
    const srv = await arrancar((req, res) => { res.setHeader("Content-Type", "application/json"); res.end(grande); });
    const { res, cuerpo } = await pedir(srv, { headers: { "accept-encoding": "gzip" } });
    assert.equal(res.headers["content-encoding"], "gzip");
    assert.match(res.headers.vary || "", /Accept-Encoding/);
    assert.equal(zlib.gunzipSync(cuerpo).toString(), grande, "el contenido tiene que ser idéntico");
    assert.ok(cuerpo.length < grande.length / 5, `debería bajar mucho: ${cuerpo.length} vs ${grande.length}`);
    assert.equal(Number(res.headers["content-length"]), cuerpo.length, "Content-Length debe ser el del cuerpo comprimido");
    srv.close();
  });

  test("si el navegador no acepta gzip, recibe el texto tal cual", async () => {
    const srv = await arrancar((req, res) => { res.setHeader("Content-Type", "application/json"); res.end(grande); });
    const { res, cuerpo } = await pedir(srv, { headers: { "accept-encoding": "identity" } });
    assert.equal(res.headers["content-encoding"], undefined);
    assert.equal(cuerpo.toString(), grande);
    srv.close();
  });

  test("una imagen pasa de largo, byte por byte", async () => {
    const png = Buffer.from(Array.from({ length: 40000 }, (_, i) => i % 256));
    const srv = await arrancar((req, res) => { res.setHeader("Content-Type", "image/png"); res.end(png); });
    const { res, cuerpo } = await pedir(srv, { headers: { "accept-encoding": "gzip" } });
    assert.equal(res.headers["content-encoding"], undefined);
    assert.ok(cuerpo.equals(png), "la imagen no puede salir alterada");
    srv.close();
  });

  test("una respuesta corta se queda sin comprimir (comprimirla la haría más grande)", async () => {
    const srv = await arrancar((req, res) => { res.setHeader("Content-Type", "application/json"); res.end('{"ok":true}'); });
    const { res, cuerpo } = await pedir(srv, { headers: { "accept-encoding": "gzip" } });
    assert.equal(res.headers["content-encoding"], undefined);
    assert.equal(cuerpo.toString(), '{"ok":true}');
    srv.close();
  });

  test("varios write() seguidos se juntan en el orden correcto", async () => {
    const partes = ["<html>", "a".repeat(3000), "<b>ñ á ç</b>", "</html>"];
    const srv = await arrancar((req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      for (const p of partes) res.write(p);
      res.end();
    });
    const { res, cuerpo } = await pedir(srv, { headers: { "accept-encoding": "gzip" } });
    assert.equal(res.headers["content-encoding"], "gzip");
    assert.equal(zlib.gunzipSync(cuerpo).toString(), partes.join(""), "los acentos y el orden deben sobrevivir");
    srv.close();
  });

  test("un 204 sin cuerpo sigue sin cuerpo", async () => {
    const srv = await arrancar((req, res) => { res.statusCode = 204; res.end(); });
    const { res, cuerpo } = await pedir(srv, { headers: { "accept-encoding": "gzip" } });
    assert.equal(res.statusCode, 204);
    assert.equal(cuerpo.length, 0);
    srv.close();
  });

  test("un cuerpo por encima del tope se suelta sin comprimir en vez de tragarse la RAM", async () => {
    const mw = comprimir({ maxBuffer: 5000 });
    const srv = http.createServer((req, res) => mw(req, res, () => {
      res.setHeader("Content-Type", "text/plain");
      res.write("y".repeat(4000)); res.write("z".repeat(4000)); res.end();
    }));
    await new Promise((r) => srv.listen(0, r));
    const { res, cuerpo } = await pedir(srv, { headers: { "accept-encoding": "gzip" } });
    assert.equal(res.headers["content-encoding"], undefined);
    assert.equal(cuerpo.toString(), "y".repeat(4000) + "z".repeat(4000), "no se puede perder ni un trozo");
    srv.close();
  });

  test("se llama al callback de end(), o Express se queda colgado", async () => {
    let llamado = false;
    const srv = await arrancar((req, res) => {
      res.setHeader("Content-Type", "text/plain");
      res.end("t".repeat(5000), () => { llamado = true; });
    });
    await pedir(srv, { headers: { "accept-encoding": "gzip" } });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(llamado, true);
    srv.close();
  });
});
