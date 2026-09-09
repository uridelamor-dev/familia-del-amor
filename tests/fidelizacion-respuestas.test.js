// La MATRIZ DE RESPUESTAS del endpoint de facturas, blindada.
//
// EL FALLO QUE ORIGINA ESTE FICHERO: la primera versión contestaba `200 {Status:"rejected"}` ante
// una caída de PostgreSQL. `rejected` significa «lo he recibido y no lo quiero»: Ágora lo da por
// entregado y NO lo reenvía. Pero si la base se cayó no sabemos si la factura quedó guardada, y
// decir que sí convierte un fallo técnico en una pérdida silenciosa. Hoy, sin premios, se perdería
// una visita. Con puntos serán puntos que el cliente cree tener y no tiene.
//
// LA REGLA, y es la que comprueban casi todos los tests de aquí:
//
//   200 accepted  →  SOLO si la factura está guardada de forma duradera (COMMIT hecho) o ya lo
//                    estaba de antes con el MISMO contenido.
//   200 rejected  →  decisión de negocio, y estamos SEGUROS: el documento no se puede procesar.
//   4xx / 5xx     →  no sabemos si se guardó. Ágora conserva la posibilidad de reenviar.
//
// Un 500 impide cerrar la factura. Es el precio correcto: el camarero desasocia al participante y
// cobra sin fidelización — un paso manual, pero no se pierde nada.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import express from "express";
import crypto from "node:crypto";
import { extraerFactura, procesarFactura, claveDeFactura, localSlug, ALGO_DEBIL, LOCAL_PILOTO }
  from "../src/modules/fidelizacion/agora.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const factura = server.slice(server.indexOf('app.post("/api/fidelizacion/agora/:token/factura"'),
                             server.indexOf('app.post("/api/fidelizacion/integracion"'));
const sha = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const hashMember = (t) => sha(t).slice(0, 16);
const AHORA = "2026-09-10T12:00:00+02:00";
const integracion = { id: 7, local: LOCAL_PILOTO, activo: true, revocado_en: null, caduca_en: "2099-01-01T00:00:00Z" };
const docFactura = (globalId, importe = 10) => ({ GlobalId: globalId,
  InvoiceItems: [{ Amount: importe, LoyaltyProgram: { MemberId: "TOK-A", Rewards: [] } }] });

describe("un fallo técnico NUNCA se contesta con 200", () => {
  test("el catch del manejador devuelve 500, y nada de 200", () => {
    // Sin las líneas de comentario: ahí dentro se explica a propósito por qué NO se contesta
    // `accepted` ni `rejected`, y una búsqueda a pelo confundiría la explicación con el fallo.
    const i = factura.indexOf("} catch (e) {");
    const bruto = factura.slice(i, factura.indexOf("return res.status(500)", i) + 60);
    const bloque = bruto.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    assert.match(bloque, /return res\.status\(500\)/);
    assert.ok(!/status\(200\)/.test(bloque), "el catch vuelve a contestar 200");
    assert.ok(!/accepted/.test(bloque), "el catch contesta accepted");
    assert.ok(!/rejected/.test(bloque), "el catch contesta rejected, y Ágora no reenviaría");
  });

  test("PostgreSQL caído: procesarFactura propaga, no se traga el error", async () => {
    // Si `procesarFactura` devolviera algo en vez de propagar, el manejador contestaría `accepted`
    // sobre una factura que no está en ningún sitio.
    const x = { get: async () => { const e = new Error("ECONNREFUSED"); e.code = "ECONNREFUSED"; throw e; },
                all: async () => [], run: async () => { const e = new Error("ECONNREFUSED"); e.code = "ECONNREFUSED"; throw e; } };
    await assert.rejects(() => procesarFactura(x, {
      extracto: extraerFactura(docFactura("G1"), sha, { local: LOCAL_PILOTO }),
      integracion, ahora: AHORA, cuerpoBytes: 10, hashMember }), /ECONNREFUSED/);
  });

  test("tiempo límite de PostgreSQL: también propaga", async () => {
    const x = { get: async () => null, all: async () => [],
                run: async () => { const e = new Error("canceling statement due to statement timeout"); e.code = "57014"; throw e; } };
    await assert.rejects(() => procesarFactura(x, {
      extracto: extraerFactura(docFactura("G2"), sha, { local: LOCAL_PILOTO }),
      integracion, ahora: AHORA, cuerpoBytes: 10, hashMember }), /statement timeout/);
  });

  test("una excepción inesperada a mitad tampoco se convierte en éxito", async () => {
    // La factura se inserta y el libro revienta: la transacción entera se deshace, y el manejador
    // tiene que contestar 500. Lo que no puede pasar es que devuelva `accepted` a medias.
    let n = 0;
    const x = {
      // El carné existe: así se llega de verdad al INSERT del libro, que es donde revienta.
      get: async (q) => (/FROM pro_qr/.test(q) ? { id: 11, clase: "carnet", anulado_en: null, caduca_en: null } : null),
      all: async () => [],
      run: async (q) => { if (/INSERT INTO fid_movimientos/.test(q)) throw new TypeError("algo raro");
                          return /RETURNING/.test(q) ? { id: ++n } : undefined; },
    };
    await assert.rejects(() => procesarFactura(x, {
      extracto: extraerFactura(docFactura("G3"), sha, { local: LOCAL_PILOTO }),
      integracion, ahora: AHORA, cuerpoBytes: 10, hashMember }), TypeError);
  });

  test("hay transacción con ROLLBACK detrás de esa propagación", () => {
    assert.match(server, /catch \(e\) \{\s*try \{ await client\.query\("ROLLBACK"\); \}/);
    assert.match(server, /SET LOCAL statement_timeout = 5000/);
  });
});

describe("un JSON malformado no se acepta", () => {
  test("se contesta rejected, nunca accepted, y sin filtrar detalles", () => {
    assert.match(factura, /Status: "rejected", RejectReason: "Formato no reconocido"/);
    const i = factura.indexOf("JSON.parse(bruto");
    const bloque = factura.slice(i, i + 400);
    assert.ok(!/accepted/.test(bloque));
    assert.ok(!/e\.message/.test(bloque), "se filtra el detalle del error de parseo");
  });

  test("un cuerpo demasiado grande, igual", () => {
    assert.match(factura, /bruto\.length > FID_MAX_CUERPO[\s\S]{0,160}Status: "rejected"/);
  });
});

describe("un conflicto de GlobalId no se confirma", () => {
  test("el manejador contesta rejected cuando hay conflicto", () => {
    // Un `accepted` diría que hemos aceptado ESTE documento, y lo guardado es otro.
    assert.match(factura, /if \(resultado\.conflicto\) \{[\s\S]{0,240}Status: "rejected"/);
    const i = factura.indexOf("if (resultado.conflicto)");
    assert.ok(factura.indexOf("fidRespuestaFactura({})") > i, "el accepted debe ir DESPUÉS del corte por conflicto");
  });

  test("el motivo no lleva nada del cuerpo", () => {
    assert.match(factura, /RejectReason: "Documento no coincide con el ya registrado"/);
    const i = factura.indexOf("Documento no coincide");
    const bloque = factura.slice(i - 200, i + 200);
    assert.ok(!/cuerpo_hash|extracto\.cuerpoHash|bruto/.test(bloque), "se filtra el cuerpo en el motivo");
  });
});

describe("un duplicado idéntico SÍ se acepta, y no duplica nada", () => {
  test("segunda vez: repetida, sin conflicto y sin movimientos nuevos", async () => {
    const t = { f: [], m: [] };
    let seq = 0;
    const x = {
      get: async (q, p) => (/clave_factura/.test(q) ? t.f.find((z) => z.clave_factura === p[0]) || null
                                                    : { id: 11, clase: "carnet", anulado_en: null, caduca_en: null }),
      all: async () => [],
      run: async (q, p) => {
        if (/INSERT INTO fid_facturas/.test(q)) {
          if (t.f.some((z) => z.clave_factura === p[4])) return undefined;
          const fila = { id: ++seq, clave_factura: p[4], cuerpo_hash: p[6] }; t.f.push(fila); return { id: fila.id };
        }
        if (/INSERT INTO fid_movimientos/.test(q)) {
          if (t.m.some((z) => z.clave_idem === p[6])) return undefined;
          t.m.push({ clave_idem: p[6], concepto: p[3] }); return { id: t.m.length };
        }
        return undefined;
      },
    };
    const e = extraerFactura(docFactura("G-DUP"), sha, { local: LOCAL_PILOTO });
    const a = await procesarFactura(x, { extracto: e, integracion, ahora: AHORA, cuerpoBytes: 10, hashMember });
    const b = await procesarFactura(x, { extracto: e, integracion, ahora: AHORA, cuerpoBytes: 10, hashMember });
    assert.equal(a.repetida, false);
    assert.equal(b.repetida, true);
    assert.equal(b.conflicto, false, "un reenvío idéntico NO es un conflicto");
    assert.equal(b.movimientos, 0);
    assert.equal(t.f.length, 1);
    assert.equal(t.m.length, 2);
  });
});

describe("accepted solo después del COMMIT", () => {
  test("la respuesta va detrás de la transacción, en este orden", () => {
    const iTx = factura.indexOf("await fidTransaccion(");
    const iCommit = server.indexOf('await client.query("COMMIT")');
    const iOk = factura.indexOf("fidRespuestaFactura({})");
    assert.ok(iTx > 0 && iOk > iTx, "se responde antes de abrir la transacción");
    assert.ok(iCommit > 0, "no hay COMMIT");
    // Y `fidTransaccion` solo devuelve después de confirmar.
    const f = server.slice(server.indexOf("async function fidTransaccion("), server.indexOf("async function fidVisitasDe("));
    const iR = f.indexOf("const r = await fn(x);");
    assert.ok(f.indexOf('await client.query("COMMIT")') > iR, "se confirma antes de ejecutar el trabajo");
    assert.ok(f.indexOf("return r;") > f.indexOf('await client.query("COMMIT")'), "se devuelve antes del COMMIT");
  });
});

describe("aislamiento del GlobalId entre locales", () => {
  test("el mismo GlobalId en dos locales son DOS facturas distintas", () => {
    // La guía no garantiza que el GlobalId sea universal. Si no lo fuera y la clave fuese solo el
    // GlobalId, la factura del segundo local se vería como un reenvío del primero: no apuntaría ni
    // una visita y no daría ningún error.
    const a = extraerFactura(docFactura("MISMO-1"), sha, { local: "La Tapeta - Lloret" });
    const b = extraerFactura(docFactura("MISMO-1"), sha, { local: "La Tapeta - Blanes" });
    assert.equal(a.globalId, b.globalId, "el identificador de Ágora sí es el mismo");
    assert.notEqual(a.claveFactura, b.claveFactura, "pero la clave de idempotencia NO puede serlo");
    assert.match(a.claveFactura, /^la-tapeta-lloret\|oficial\|MISMO-1$/);
  });

  test("las claves del libro también aíslan el local", async () => {
    const { movimientosDe } = await import("../src/modules/fidelizacion/agora.js");
    const e = extraerFactura(docFactura("MISMO-1"), sha, { local: "La Tapeta - Lloret" });
    const a = movimientosDe(e, { local: "La Tapeta - Lloret", ahora: AHORA, hashMember });
    const b = movimientosDe(e, { local: "La Tapeta - Blanes", ahora: AHORA, hashMember });
    assert.notEqual(a[0].clave_idem, b[0].clave_idem);
  });

  test("la clave dice SIEMPRE si es oficial o débil", () => {
    const oficial = extraerFactura(docFactura("G-1"), sha, { local: LOCAL_PILOTO });
    assert.equal(oficial.tipo, "oficial");
    assert.equal(oficial.claveDebil, false);

    const sinId = docFactura("X"); delete sinId.GlobalId;
    const debil = extraerFactura(sinId, sha, { local: LOCAL_PILOTO });
    assert.equal(debil.tipo, "debil");
    assert.equal(debil.claveDebil, true);
    // La clave débil lleva el local Y la versión del algoritmo dentro.
    assert.match(debil.globalId, new RegExp(`^debil:${ALGO_DEBIL}:${localSlug(LOCAL_PILOTO)}:`));
    assert.match(debil.claveFactura, /\|debil\|/);
  });

  test("una oficial y una débil nunca pueden chocar", () => {
    assert.notEqual(claveDeFactura(LOCAL_PILOTO, "oficial", "X"), claveDeFactura(LOCAL_PILOTO, "debil", "X"));
  });
});

describe("el member_id con - y _ llega intacto a través de Express", () => {
  // El token del carné es base64url: incluye `-` y `_`. Antes de proponer reemitir ningún QR hay
  // que comprobar que el problema existe, y aquí se comprueba que NO existe del lado de Express.
  const TOKENS = [
    "Aa1-Bb2_Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3N",
    "----____----____----____----____----____--",
    "_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-",
    "ZmFtaWxpYS1kZWwtYW1vcl9sbG9yZXQtMjAyNi1hYmM",
  ];

  const conServidor = (ruta) => new Promise((resolve) => {
    const app = express();
    let visto = null;
    app.get(ruta, (req, res) => { visto = { ...req.params }; res.json({ ok: true }); });
    const srv = http.createServer(app).listen(0, () => resolve({
      puerto: srv.address().port,
      pedir: (p) => new Promise((r) => http.get({ host: "127.0.0.1", port: srv.address().port, path: p },
        (res) => { res.resume(); res.on("end", () => r({ codigo: res.statusCode, params: visto })); })),
      cerrar: () => new Promise((r) => srv.close(r)),
    }));
  });

  test("Express conserva `-` y `_` en un parámetro de ruta, sin tocarlos", async () => {
    const s = await conServidor("/api/fidelizacion/agora/:token/member/:memberId");
    for (const t of TOKENS) {
      const r = await s.pedir(`/api/fidelizacion/agora/TOKINT/member/${t}`);
      assert.equal(r.codigo, 200, t);
      assert.equal(r.params.memberId, t, `Express ha cambiado el member_id: ${r.params.memberId}`);
      assert.equal(r.params.token, "TOKINT");
    }
    await s.cerrar();
  });

  test("y también si Ágora los envía porcentaje-codificados", async () => {
    const s = await conServidor("/api/fidelizacion/agora/:token/member/:memberId");
    for (const t of TOKENS) {
      const r = await s.pedir(`/api/fidelizacion/agora/TOKINT/member/${encodeURIComponent(t)}`);
      assert.equal(r.params.memberId, t, "la codificación ha alterado el token");
    }
    await s.cerrar();
  });

  test("encodeURIComponent/decodeURIComponent no tocan `-` ni `_`", () => {
    // Los dos son «unreserved» en la RFC 3986: seguros dentro de un segmento de URL.
    for (const t of TOKENS) {
      assert.equal(encodeURIComponent(t), t, "encodeURIComponent ha escapado algo");
      assert.equal(decodeURIComponent(encodeURIComponent(t)), t);
    }
  });

  test("el token de integración con `-` y `_` también sobrevive", async () => {
    const s = await conServidor("/api/fidelizacion/agora/:token/factura");
    const tok = "abc-DEF_ghi-JKL_mno-PQR_stu-VWX_yz0-123_456";
    const r = await s.pedir(`/api/fidelizacion/agora/${tok}/factura`);
    assert.equal(r.params.token, tok);
    await s.cerrar();
  });
});
