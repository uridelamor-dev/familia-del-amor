// Resolver un participante: UNA sola función para la ruta de Ágora y para «Buscar socio».
//
// EL FALLO QUE ORIGINA ESTO, visto en la prueba real con el TPV de Lloret: había dos caminos.
// La ruta de Ágora consultaba `WHERE token = ?` y nada más, así que el código de OCHO DÍGITOS —el
// que va impreso junto al QR y teclea el camarero cuando el papel viene arrugado— no encontraba a
// nadie y Ágora recibía un 404 con «No existe ningún miembro». El kiosco de la barra sí resolvía
// los dos desde el principio.
//
// `pro_qr` tiene DOS identificadores de la misma fila, los dos UNIQUE:
//   · token   — 32 bytes en base64url (43 caracteres). Es lo que va DENTRO del QR.
//   · codigo  — 8 dígitos como TEXTO. Es el respaldo impreso.
//
// Y el identificador se trata SIEMPRE como texto: `Number("00042318")` es `42318`, y un carné con
// ceros delante dejaría de encontrarse. Pasaría en uno de cada diez.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolverMiembro, respuestaMiembro, carnetUtilizable } from "../src/modules/fidelizacion/agora.js";
import { normalizarEntrada } from "../src/modules/promos/promos.js";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const AHORA = "2026-09-10T12:00:00+02:00";

/** Identificadores sintéticos. El token tiene la forma real; los códigos, ocho dígitos. */
const TOKEN_CARNET = "Aa1-Bb2_Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3N";
const TOKEN_CUPON  = "Zz9_Yy8-Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8Nn7M";
const TOKEN_ANUL   = "Mm3-Nn4_Oo5Pp6Qq7Rr8Ss9Tt0Uu1Vv2Ww3Xx4Yy5Z";
const TOKEN_CAD    = "Bb2-Cc3_Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4O";

const FILAS = [
  { id: 1, clase: "carnet", nombre: "Nombre Prueba", token: TOKEN_CARNET, codigo: "00042318", anulado_en: null, caduca_en: null },
  { id: 2, clase: "cupon",  nombre: "",              token: TOKEN_CUPON,  codigo: "77778888", anulado_en: null, caduca_en: null },
  { id: 3, clase: "carnet", nombre: "Anulado",       token: TOKEN_ANUL,   codigo: "00000001", anulado_en: AHORA, caduca_en: null },
  { id: 4, clase: "carnet", nombre: "Caducado",      token: TOKEN_CAD,    codigo: "90000009", anulado_en: null, caduca_en: "2020-01-01" },
];

/** Base de mentira que entiende la única consulta de `resolverMiembro`. */
const bd = (filas = FILAS) => ({
  get: async (q, p) => {
    const m = /FROM pro_qr WHERE (\w+) = \?/.exec(q.replace(/\s+/g, " "));
    assert.ok(m, "la consulta no es la esperada: " + q);
    assert.ok(["token", "codigo"].includes(m[1]), `columna inesperada: ${m[1]}`);
    // El valor SIEMPRE llega como texto: si llegara un número, los ceros ya se habrían perdido.
    assert.equal(typeof p[0], "string", `el identificador llega como ${typeof p[0]}`);
    return filas.find((f) => String(f[m[1]]) === p[0]) || null;
  },
});

const resolver = (entrada, filas) =>
  resolverMiembro(bd(filas), entrada, { normalizar: normalizarEntrada, ahora: AHORA });

describe("las tres formas de entrada encuentran el MISMO carné", () => {
  test("por el token desnudo", async () => {
    const r = await resolver(TOKEN_CARNET);
    assert.equal(r.ok, true);
    assert.equal(r.qr.id, 1);
    assert.equal(r.entradaTipo, "token");
  });

  test("por la URL completa del QR, que es lo que lleva dentro", async () => {
    for (const u of [`https://familiadelamor.org/tarjeta.html?t=${TOKEN_CARNET}`,
                     `https://familiadelamor.org/cupon.html?t=${TOKEN_CARNET}`,
                     `http://localhost:5000/tarjeta.html?t=${TOKEN_CARNET}&otra=1`]) {
      const r = await resolver(u);
      assert.equal(r.ok, true, u);
      assert.equal(r.qr.id, 1);
    }
  });

  test("por el código de OCHO DÍGITOS — el caso que fallaba", async () => {
    const r = await resolver("00042318");
    assert.equal(r.ok, true);
    assert.equal(r.qr.id, 1);
    assert.equal(r.entradaTipo, "codigo");
  });

  test("los tres devuelven la misma fila, sin excepción", async () => {
    const ids = await Promise.all([TOKEN_CARNET, `https://x/tarjeta.html?t=${TOKEN_CARNET}`, "00042318"]
      .map(async (e) => (await resolver(e)).qr.id));
    assert.deepEqual(ids, [1, 1, 1]);
  });
});

describe("los CEROS INICIALES se conservan", () => {
  test("«00042318» no se convierte en 42318", async () => {
    // `Number("00042318")` es `42318`. Si el identificador se tratara como número, este carné
    // dejaría de encontrarse — y le pasaría a uno de cada diez.
    assert.equal(Number("00042318"), 42318);
    const r = await resolver("00042318");
    assert.equal(r.ok, true, "se han perdido los ceros por el camino");
    assert.equal(r.qr.codigo, "00042318");
  });

  test("«42318» (sin los ceros) NO encuentra ese carné", async () => {
    // Es la otra cara: si alguien teclea el número sin los ceros, no es ese código. Y como no
    // llega a ocho dígitos, `normalizarEntrada` ni lo acepta.
    const r = await resolver("42318");
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "formato_no_reconocido");
  });

  test("un código de ocho ceros y uno funciona igual", async () => {
    const r = await resolver("00000001");
    assert.equal(r.ok, false, "ese es el anulado");
    assert.equal(r.motivo, "anulado");
  });

  test("con espacios y guiones tecleados por el camarero, también", async () => {
    for (const e of ["0004 2318", "0004-2318", " 00042318 ", "0004.2318"]) {
      const r = await resolver(e);
      assert.equal(r.ok, true, e);
      assert.equal(r.qr.id, 1);
    }
  });
});

describe("solo un carné vivo identifica a alguien", () => {
  test("un CUPÓN no, ni por token ni por código", async () => {
    // Un cupón o un vale impreso es un papel al portador. Si identificara, cualquiera con un
    // flyer sería socio.
    for (const e of [TOKEN_CUPON, "77778888"]) {
      const r = await resolver(e);
      assert.equal(r.ok, false, e);
      assert.equal(r.motivo, "no_es_carnet");
      assert.equal(r.qr, null, "no puede devolver la fila de un cupón");
    }
  });

  test("un carné ANULADO no", async () => {
    for (const e of [TOKEN_ANUL, "00000001"]) {
      assert.equal((await resolver(e)).motivo, "anulado", e);
    }
  });

  test("un carné CADUCADO no", async () => {
    for (const e of [TOKEN_CAD, "90000009"]) {
      assert.equal((await resolver(e)).motivo, "caducado", e);
    }
  });

  test("un identificador INEXISTENTE no", async () => {
    for (const e of ["12345678", "Qq1-Rr2_Ss3Tt4Uu5Vv6Ww7Xx8Yy9Zz0Aa1Bb2Cc3D"]) {
      assert.equal((await resolver(e)).motivo, "no_existe", e);
    }
  });

  test("y una entrada que no es nada tampoco", async () => {
    for (const e of ["", "   ", "hola", "mailto:x@y.z", "WIFI:S:red;", "123", "x".repeat(200)]) {
      const r = await resolver(e);
      assert.equal(r.ok, false, JSON.stringify(e));
      assert.equal(r.qr, null);
    }
  });
});

describe("el MemberId que devolvemos es SIEMPRE el token", () => {
  test("aunque se haya entrado por el código de ocho dígitos", async () => {
    // Es lo que hace que la factura después cuadre: Ágora guarda lo que le devolvemos, y le
    // devolvemos el identificador canónico, no el que tecleó el camarero.
    const porCodigo = await resolver("00042318");
    const r = respuestaMiembro(porCodigo.qr, { visitas: 3 });
    assert.equal(r.MemberId, TOKEN_CARNET);
    assert.notEqual(r.MemberId, "00042318");
  });

  test("y Rewards sigue siendo exactamente []", async () => {
    const r = respuestaMiembro((await resolver("00042318")).qr, { visitas: 3 });
    assert.deepEqual(r.Rewards, []);
    assert.equal(r.Rewards.length, 0);
  });

  test("el DisplayText no lleva el código ni el token", async () => {
    const r = respuestaMiembro((await resolver("00042318")).qr, { visitas: 3 });
    assert.ok(!r.DisplayText.includes("00042318"), r.DisplayText);
    assert.ok(!r.DisplayText.includes(TOKEN_CARNET), r.DisplayText);
  });
});

describe("una sola función, cableada en los tres sitios", () => {
  const codigo = server.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

  test("la ruta de Ágora la usa", () => {
    const val = server.slice(server.indexOf('app.get("/api/fidelizacion/agora/:token/member/:memberId"'),
                             server.indexOf('app.post("/api/fidelizacion/agora/:token/factura"'));
    assert.match(val, /fidResolverMiembro\(\{ get: dbGet \}, memberId, \{ normalizar: proNormalizar/);
    assert.ok(!/FROM pro_qr WHERE token = \?/.test(val), "vuelve a consultar solo por token");
  });

  test("«Buscar socio» la usa, y es la MISMA", () => {
    const b = server.slice(server.indexOf('app.get("/api/fidelizacion/miembro"'),
                           server.indexOf('app.get("/", (req, res)'));
    assert.match(b, /fidResolverMiembro\(\{ get: dbGet \}, entrada, \{ normalizar: proNormalizar/);
    assert.ok(!/FROM pro_qr WHERE token = \?/.test(b), "vuelve a consultar solo por token");
  });

  test("y la recepción de facturas también, por si Ágora devolviera el código", () => {
    assert.match(codigo, /normalizar: proNormalizar,/);
    const modulo = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    assert.match(modulo, /normalizar\s*\n?\s*\? await resolverMiembro\(x, m\.member/);
  });

  test("no queda ninguna consulta a pro_qr por su cuenta en fidelización", () => {
    const zona = server.slice(server.indexOf("// FIDELIZACIÓN CON ÁGORA · FASE 1"), server.indexOf('app.get("/", (req, res)'));
    assert.deepEqual([...zona.matchAll(/FROM pro_qr/g)].map((m) => m[0]), [],
      "hay una consulta a pro_qr fuera de la función común");
  });

  test("la normalización es la MISMA que usa el kiosco de la barra", () => {
    // Si divergieran, un QR que la tablet lee dejaría de valer en el TPV, o al revés.
    assert.match(codigo, /import \{ generarCodigo as proGenerarCodigo[\s\S]{0,200}normalizarEntrada as proNormalizar/);
  });

  test("y NO se busca por teléfono, correo, DNI ni nombre", () => {
    const modulo = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    const f = modulo.slice(modulo.indexOf("export async function resolverMiembro"), modulo.indexOf("export function carnetUtilizable"));
    for (const campo of ["telefono", "correo", "email", "dni", "nombre ="]) {
      assert.ok(!new RegExp(`WHERE[^\`]*${campo}`, "i").test(f), `busca por ${campo}`);
    }
  });
});

describe("no se guarda ningún identificador", () => {
  test("del socio solo su hash truncado", () => {
    const val = server.slice(server.indexOf('app.get("/api/fidelizacion/agora/:token/member/:memberId"'),
                             server.indexOf('app.post("/api/fidelizacion/agora/:token/factura"'));
    assert.match(val, /const mHash = fidHash\(memberId\)\.slice\(0, 16\)/);
    // Lo que se apunta en `fid_validaciones` es el hash y el motivo, nunca el valor.
    assert.match(val, /member_hash/);
    assert.ok(!/INSERT INTO fid_validaciones[\s\S]{0,400}memberId(?!\))/.test(val), "se guarda el member_id entero");
  });

  test("el motivo del 404 no lleva el identificador", () => {
    const val = server.slice(server.indexOf('app.get("/api/fidelizacion/agora/:token/member/:memberId"'),
                             server.indexOf('app.post("/api/fidelizacion/agora/:token/factura"'));
    assert.match(val, /"404:" \+ r\.motivo/);
    assert.match(val, /return res\.status\(404\)\.json\(\{\}\)/, "el 404 debe ir vacío");
  });

  test("y `resolverMiembro` no escribe en ningún log", () => {
    const modulo = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    const f = modulo.slice(modulo.indexOf("export async function resolverMiembro"), modulo.indexOf("export function carnetUtilizable"));
    assert.ok(!/console\./.test(f));
  });
});

describe("no se modifica ni un QR existente", () => {
  test("la resolución solo LEE", () => {
    const modulo = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");
    const f = modulo.slice(modulo.indexOf("export async function resolverMiembro"), modulo.indexOf("export function carnetUtilizable"));
    assert.match(f, /x\.get\(/);
    for (const w of ["x.run(", "INSERT", "UPDATE", "DELETE"]) assert.ok(!f.includes(w), `escribe: ${w}`);
  });

  test("y la fidelización entera sigue sin escribir en pro_qr", () => {
    assert.ok(!/(INSERT INTO|UPDATE|DELETE FROM) pro_qr/.test(server.slice(
      server.indexOf("// FIDELIZACIÓN CON ÁGORA · FASE 1"), server.indexOf('app.get("/", (req, res)'))));
  });
});

describe("el censo de carnés y cupones", () => {
  const panel = readFileSync(new URL("../public/panel/app.js", import.meta.url), "utf8");
  const resumen = server.slice(server.indexOf('app.get("/api/tarjeta/resumen"'),
                               server.indexOf('app.get("/api/tarjeta/:token"'));

  test("cuenta carnés totales, utilizables y cupones", () => {
    // Sin esto, la primera prueba del piloto dio 404 en todo y no había forma de saber si era un
    // fallo nuestro o que sencillamente no había socios.
    assert.match(resumen, /COUNT\(\*\) FILTER \(WHERE clase = 'carnet'\)::int AS carnets_total/);
    assert.match(resumen, /COUNT\(\*\) FILTER \(WHERE clase = 'cupon'\)::int AS cupones/);
    assert.match(resumen, /carnets_utiles/);
    assert.match(resumen, /censo: censo \|\| \{\}/);
  });

  test("«utilizable» significa lo mismo que en la resolución: ni anulado ni caducado", () => {
    // Si el contador dijera «3» y la resolución solo aceptara 1, el panel mentiría justo cuando
    // más falta hace que no lo haga.
    assert.match(resumen, /clase = 'carnet' AND anulado_en IS NULL\s*\n?\s*AND \(caduca_en IS NULL OR caduca_en >= \?\)/);
    assert.match(resumen, /\[hoyISO\(\)\]/);
  });

  test("SOLO números: ni tokens, ni códigos, ni nombres, ni teléfonos", () => {
    const sel = resumen.slice(resumen.indexOf("const censo"), resumen.indexOf("res.json"));
    for (const campo of ["token", "codigo", "nombre", "telefono"]) {
      assert.ok(!new RegExp(`\\b${campo}\\b`).test(sel), `el censo selecciona ${campo}`);
    }
    assert.match(sel, /COUNT\(\*\)/);
  });

  test("sigue siendo un endpoint de Dirección y no depende del interruptor de la tarjeta", () => {
    assert.match(resumen, /requireAuth\(PROMOS_ROLES\)/);
    assert.ok(!/tarjetaApagada\(res\)/.test(resumen), "se ha metido detrás del interruptor");
  });

  test("el panel lo enseña en la tarjeta del piloto, con aviso si no hay ninguno", () => {
    const f = panel.slice(panel.indexOf("function renderFidPiloto()"), panel.indexOf("async function loadFidPiloto()"));
    assert.match(f, /Carnés que puede identificar el piloto/);
    assert.match(f, /Cupones y vales/);
    assert.match(f, /No identifican a nadie/);
    assert.match(f, /No hay ningún carné utilizable/);
  });

  test("y si el censo falla, la tarjeta se pinta igual", () => {
    const f = panel.slice(panel.indexOf("async function loadFidPiloto()"), panel.indexOf("async function fidGenerar()"));
    assert.match(f, /try \{ FID\.censo = \(await apiRaw\("\/api\/tarjeta\/resumen"\)\)\.censo \|\| null; \} catch \{ FID\.censo = null; \}/);
  });

  test("no se toca TARJETA_ACTIVA", () => {
    // El censo no enciende nada: solo cuenta.
    const f = panel.slice(panel.indexOf("function renderFidPiloto()"), panel.indexOf("async function fidGenerar()"));
    assert.ok(!/tj-encender|tarjeta_activa/.test(f), "el piloto toca el interruptor de la tarjeta");
  });
});
