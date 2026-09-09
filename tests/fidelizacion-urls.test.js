// Las URL que se pegan en el TPV: siempre HTTPS y siempre un dominio nuestro.
//
// EL FALLO QUE ORIGINA ESTO: la primera versión componía la URL con
// `${req.protocol}://${req.get("host")}` y generó `http://familiadelamor.org/…`. Dos causas, y
// las dos son la misma lección — **lo que trae la petición no es una fuente de verdad**:
//
//  1. `app.set("trust proxy")` NO está configurado, así que detrás del proxy TLS de Replit
//     `req.protocol` devuelve siempre «http», aunque llegue `X-Forwarded-Proto: https`.
//  2. `req.get("host")` lo escribe quien llama.
//
// Y esa URL se pega en un TPV, donde nadie va a volver a mirarla.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import http from "node:http";
import { basePublica, aHttps, urlsDeIntegracion, DOMINIO_CANONICO, estadoIntegracion, LOCAL_PILOTO }
  from "../src/modules/fidelizacion/agora.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");

describe("en producción, SIEMPRE https", () => {
  test("sin PUBLIC_URL se usa el dominio canónico", () => {
    const r = basePublica({ prod: true });
    assert.equal(r.ok, true);
    assert.equal(r.base, "https://familiadelamor.org");
    assert.match(r.base, /^https:/);
  });

  test("PUBLIC_URL con http se NORMALIZA a https", () => {
    const r = basePublica({ prod: true, publicUrl: "http://familiadelamor.org" });
    assert.equal(r.base, "https://familiadelamor.org");
    assert.equal(r.forzada, true, "debe quedar constancia de que se ha forzado");
  });

  test("PUBLIC_URL con https se respeta tal cual", () => {
    assert.equal(basePublica({ prod: true, publicUrl: "https://familiadelamor.org" }).base, "https://familiadelamor.org");
    assert.equal(basePublica({ prod: true, publicUrl: "https://otro.familiadelamor.org/" }).base, "https://otro.familiadelamor.org");
  });

  test("PUBLIC_URL mal escrita se RECHAZA, no se adivina", () => {
    // Caer al canónico apuntaría el TPV a un sitio que nadie ha pedido, y sin que se note.
    for (const mala of ["no es una url", "http://", "://roto"]) {
      const r = basePublica({ prod: true, publicUrl: mala });
      assert.equal(r.ok, false, mala);
      assert.match(r.motivo, /PUBLIC_URL/);
    }
  });

  test("NINGUNA combinación de producción produce una URL http", () => {
    const entradas = [
      {}, { publicUrl: "http://familiadelamor.org" }, { publicUrl: "familiadelamor.org" },
      { host: "familiadelamor.org", protocolo: "http" },
      { host: "familiadelamor.org", protocolo: "http", publicUrl: "http://x.familiadelamor.org" },
    ];
    for (const e of entradas) {
      const r = basePublica({ ...e, prod: true });
      if (!r.ok) continue;
      assert.match(r.base, /^https:\/\//, JSON.stringify(e));
      const u = urlsDeIntegracion(r.base, "TOK");
      assert.match(u.validacion, /^https:\/\//);
      assert.match(u.facturas, /^https:\/\//);
    }
  });
});

describe("una cabecera manipulada no cambia nada", () => {
  test("un X-Forwarded-Proto falso NO degrada a http", () => {
    // `protocolo` es lo que Express deduce de esa cabecera. En producción no se mira.
    for (const p of ["http", "HTTP", "ftp", "gopher", ""]) {
      const r = basePublica({ prod: true, protocolo: p, host: "familiadelamor.org" });
      assert.match(r.base, /^https:\/\//, `protocolo ${p}`);
    }
  });

  test("un Host manipulado NO cambia el dominio", () => {
    // Es lo que convertiría esto en un problema de verdad: una URL que se pega en un TPV y apunta
    // a un servidor de otro.
    for (const h of ["malicioso.example", "familiadelamor.org.evil.com", "localhost:1337", "", "evil.com:443"]) {
      const r = basePublica({ prod: true, host: h, protocolo: "https" });
      assert.equal(r.base, DOMINIO_CANONICO, `host ${h}`);
      assert.ok(!r.base.includes("evil"), r.base);
      assert.ok(!r.base.includes("malicioso"), r.base);
    }
  });

  test("y tampoco con PUBLIC_URL puesta", () => {
    const r = basePublica({ prod: true, publicUrl: "https://familiadelamor.org", host: "evil.com", protocolo: "http" });
    assert.equal(r.base, "https://familiadelamor.org");
  });
});

describe("en desarrollo sí vale http", () => {
  test("se usa lo que trae la petición, que es lo que hace falta en local", () => {
    const r = basePublica({ prod: false, host: "localhost:5000", protocolo: "http" });
    assert.equal(r.base, "http://localhost:5000");
    assert.equal(r.fuente, "peticion");
  });

  test("y PUBLIC_URL manda también en desarrollo", () => {
    assert.equal(basePublica({ prod: false, publicUrl: "http://192.168.1.50:5000", host: "x" }).base, "http://192.168.1.50:5000");
  });
});

describe("`aHttps`", () => {
  test("fuerza el protocolo y quita la barra final", () => {
    assert.equal(aHttps("http://a.example/"), "https://a.example");
    assert.equal(aHttps("a.example"), "https://a.example");
    assert.equal(aHttps("https://a.example/base/"), "https://a.example/base");
  });
  test("lo que no es una URL da null", () => {
    for (const m of ["", "   ", "no vale", "://"]) assert.equal(aHttps(m), null, JSON.stringify(m));
  });
});

describe("server.js está cableado a la base canónica", () => {
  const codigo = server.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const generar = server.slice(server.indexOf('app.post("/api/fidelizacion/integracion"'),
                               server.indexOf('app.get("/api/fidelizacion/integracion"'));

  test("ya no se compone la URL con el protocolo y el host de la petición", () => {
    assert.ok(!/fidUrls\(`\$\{req\.protocol\}/.test(codigo), "vuelve a componerse a mano");
    assert.match(generar, /fidBasePublica\(\{ publicUrl: process\.env\.PUBLIC_URL, host: req\.get\("host"\),\s*\n?\s*protocolo: req\.protocol, prod: PROD \}\)/);
    assert.match(generar, /fidUrls\(pub\.base, token\)/);
  });

  test("si la base no se puede componer, se dice y no se genera una URL a medias", () => {
    assert.match(generar, /if \(!pub\.ok\) return res\.status\(500\)/);
    const iErr = generar.indexOf("if (!pub.ok)");
    const iIns = generar.indexOf("INSERT INTO fid_integraciones");
    assert.ok(iErr > 0 && iIns > iErr, "se inserta la integración antes de saber si hay URL válida");
  });

  test("`trust proxy` sigue sin configurarse, a propósito", () => {
    // Ponerlo arreglaría `req.protocol` en todo el servidor, pero `trust proxy: true` es confiar
    // ciegamente en una cabecera que escribe quien llama, y cambiaría cómo se resuelve la IP en
    // los limitadores. Se deja como está y esta ruta no depende de ello.
    assert.ok(!/trust proxy/.test(codigo));
  });
});

describe("la integración nace DESACTIVADA", () => {
  const generar = server.slice(server.indexOf('app.post("/api/fidelizacion/integracion"'),
                               server.indexOf('app.get("/api/fidelizacion/integracion"'));

  test("el INSERT la crea inactiva", () => {
    // Generar una credencial no es armarla. Entre generarla y pegarla en Ágora no hay ningún
    // motivo para que responda.
    assert.match(generar, /VALUES \(\?,\?,\?,FALSE,\?,\?,\?\)/);
    assert.ok(!/VALUES \(\?,\?,\?,TRUE,/.test(generar), "vuelve a nacer activada");
    assert.match(generar, /activo: false/);
  });

  test("y desactivada NO resuelve: 404", () => {
    assert.equal(estadoIntegracion({ id: 1, local: LOCAL_PILOTO, activo: false, revocado_en: null }).motivo, "desactivada");
  });

  test("el panel dice el orden: copiar, pegar en Ágora, Activar", () => {
    const f = panel.slice(panel.indexOf("function renderFidPiloto()"), panel.indexOf("async function fidActivo("));
    assert.match(f, /nace <b>desactivada<\/b>/);
    assert.match(f, /pulsa <b>Activar<\/b>/);
    assert.match(panel, /DESACTIVADO\. Copia las URLs, pégalas en Ágora y pulsa Activar/);
  });
});

describe("un token revocado no vuelve nunca", () => {
  test("revocada gana sobre todo lo demás", () => {
    const base = { id: 1, local: LOCAL_PILOTO, activo: true, caduca_en: "2099-01-01T00:00:00Z" };
    assert.equal(estadoIntegracion({ ...base, revocado_en: "2026-09-10T10:00:00Z" }).motivo, "revocada");
    // Ni reactivándola: el estado se mira antes que el interruptor.
    assert.equal(estadoIntegracion({ ...base, revocado_en: "2026-09-10T10:00:00Z", activo: true }).ok, false);
  });

  test("el índice único solo cuenta las NO revocadas: se puede generar otra", () => {
    const esquema = readFileSync(new URL("../src/modules/fidelizacion/schema.js", import.meta.url), "utf8");
    assert.match(esquema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_fid_integracion_local\s*\n?\s*ON fid_integraciones \(local\) WHERE revocado_en IS NULL/);
  });

  test("generar una nueva revoca la anterior antes de insertar", () => {
    const generar = server.slice(server.indexOf('app.post("/api/fidelizacion/integracion"'),
                                 server.indexOf('app.get("/api/fidelizacion/integracion"'));
    const iRev = generar.indexOf("UPDATE fid_integraciones SET revocado_en");
    const iIns = generar.indexOf("INSERT INTO fid_integraciones");
    assert.ok(iRev > 0 && iIns > iRev, "se inserta la nueva antes de revocar la vieja");
  });
});

describe("el token no aparece en ningún log", () => {
  test("ni al generarlo, ni al auditarlo", () => {
    const generar = server.slice(server.indexOf('app.post("/api/fidelizacion/integracion"'),
                                 server.indexOf('app.get("/api/fidelizacion/integracion"'));
    // En la auditoría solo la PISTA (cuatro caracteres) y la base de la URL.
    assert.match(generar, /detalle: \{ pista: fidPistaToken\(token\), base: pub\.base, fuente: pub\.fuente \}/);
    assert.ok(!/console\.[a-z]+\([^;]*\btoken\b(?!_|Hash|Pista)/.test(generar), "se imprime el token");
    // Lo que no puede haber es el token COMO VALOR de un campo. `pista: fidPistaToken(token)` es
    // correcto —el token entra en una función que devuelve cuatro caracteres—; `algo: token` no.
    assert.ok(!/:\s*token\s*[,}]/.test(generar), "el token entero entra como valor de un campo");
    assert.ok(!/\btoken\b\s*[,}]/.test(generar.slice(generar.indexOf("detalle:"), generar.indexOf("res.json"))),
      "el token suelto aparece en la auditoría");
  });

  test("en la base solo su hash y la pista", () => {
    const generar = server.slice(server.indexOf('app.post("/api/fidelizacion/integracion"'),
                                 server.indexOf('app.get("/api/fidelizacion/integracion"'));
    assert.match(generar, /fidHash\(token\), fidPistaToken\(token\)/);
  });

  test("y el panel no lo guarda en el navegador", () => {
    const f = panel.slice(panel.indexOf("async function fidGenerar()"), panel.indexOf("async function fidActivo("));
    assert.ok(!/localStorage|sessionStorage/.test(f));
  });
});

describe("de extremo a extremo, con Express de verdad", () => {
  test("aunque llegue X-Forwarded-Proto: http y otro Host, la URL sale https y a nuestro dominio", async () => {
    const app = express();
    app.post("/generar", (req, res) => {
      const pub = basePublica({ publicUrl: process.env.NO_EXISTE_PUBLIC_URL, host: req.get("host"),
                                protocolo: req.protocol, prod: true });
      res.json(pub.ok ? { urls: urlsDeIntegracion(pub.base, "TOK-de-prueba") } : { error: pub.motivo });
    });
    const srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, r));
    const j = await new Promise((resolve) => {
      const req = http.request({ host: "127.0.0.1", port: srv.address().port, method: "POST", path: "/generar",
        headers: { Host: "evil.example", "X-Forwarded-Proto": "http", "Content-Length": 0 } },
        (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve(JSON.parse(b))); });
      req.end();
    });
    assert.match(j.urls.validacion, /^https:\/\/familiadelamor\.org\//, j.urls.validacion);
    assert.match(j.urls.facturas, /^https:\/\/familiadelamor\.org\//);
    assert.ok(!j.urls.validacion.includes("evil"), j.urls.validacion);
    await new Promise((r) => srv.close(r));
  });
});
