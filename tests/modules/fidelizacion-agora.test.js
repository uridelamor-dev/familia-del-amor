// Fidelización con Ágora, Fase 1. Piloto de Lloret, sin premios.
//
// LO QUE HAY QUE TENER PRESENTE LEYENDO ESTO: nuestra API está en el camino de la caja. Según la
// Guía del Integrador, un 4xx, un 5xx o no contestar IMPIDEN CERRAR LA FACTURA. Así que casi todos
// los tests de este fichero comprueban lo mismo desde ángulos distintos: que pase lo que pase
// —socio que ya no existe, reenvío, mismo identificador con otro contenido— la factura se acepta
// y el problema se anota, en vez de devolver un error que deje a un camarero atascado.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  LOCAL_PILOTO, REWARDS_FASE_1, IDEM_V, ESTADOS,
  nuevoToken, pistaToken, estadoIntegracion, caducidadDesde,
  textoParaCamarero, respuestaMiembro, carnetUtilizable,
  extraerFactura, movimientosDe, procesarFactura, respuestaFactura,
  esquemaDe, cabecerasSeguras, urlsDeIntegracion, buscaProfunda, claveDeFactura, localSlug, ALGO_DEBIL,
} from "../../src/modules/fidelizacion/agora.js";

const sha = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const hashMember = (t) => sha(t).slice(0, 16);
const AHORA = "2026-09-10T12:00:00+02:00";

/** Un carné de mentira. El token tiene la forma real: base64url de 32 bytes. */
const carnet = (over = {}) => ({ id: 1, token: "Aa1_-".padEnd(43, "x"), clase: "carnet",
  nombre: "Marta Puig", anulado_en: null, caduca_en: null, ...over });

const integracion = { id: 7, local: LOCAL_PILOTO, activo: true, revocado_en: null, caduca_en: "2099-01-01T00:00:00Z" };

// ── Una base de mentira que entiende EXACTAMENTE las consultas de `procesarFactura`.
function bd({ carnes = [], facturas = [] } = {}) {
  const t = { fid_facturas: facturas.map((f) => ({ ...f })), fid_movimientos: [], pro_qr: carnes.map((c) => ({ ...c })) };
  let seq = { fid_facturas: t.fid_facturas.length, fid_movimientos: 0 };
  const x = {
    get: async (q, p = []) => {
      if (/FROM fid_facturas WHERE clave_factura/.test(q)) return t.fid_facturas.find((f) => f.clave_factura === p[0]) || null;
      if (/FROM pro_qr WHERE token/.test(q)) return t.pro_qr.find((c) => c.token === p[0]) || null;
      throw new Error("consulta no reconocida: " + q);
    },
    all: async () => [],
    run: async (q, p = []) => {
      const n = q.replace(/\s+/g, " ");
      if (n.startsWith("INSERT INTO fid_facturas")) {
        assert.match(n, /ON CONFLICT \(clave_factura\) DO NOTHING/, "la factura debe ser idempotente por clave_factura");
        if (t.fid_facturas.some((f) => f.clave_factura === p[4])) return undefined;   // el índice único
        const fila = { id: ++seq.fid_facturas, integracion_id: p[0], local: p[1], global_id: p[2],
          global_id_tipo: p[3], clave_factura: p[4], clave_debil: p[5], cuerpo_hash: p[6], cuerpo_bytes: p[7],
          cuerpo_enc: p[8], esquema: p[9], agora_version: p[10], items_n: p[11], miembros_n: p[12],
          importe_total: p[13], devolucion: p[14], estado: p[15], recibido_en: p[16] };
        t.fid_facturas.push(fila);
        return { id: fila.id };
      }
      if (n.startsWith("INSERT INTO fid_movimientos")) {
        assert.match(n, /ON CONFLICT \(clave_idem\) DO NOTHING/, "el libro debe ser idempotente por clave_idem");
        if (t.fid_movimientos.some((m) => m.clave_idem === p[6])) return undefined;   // el índice único
        const fila = { id: ++seq.fid_movimientos, qr_id: p[0], member_hash: p[1], local: p[2], concepto: p[3],
          unidades: p[4], importe: p[5], clave_idem: p[6], factura_id: p[7], autor: p[10], creado_en: p[11] };
        t.fid_movimientos.push(fila);
        return { id: fila.id };
      }
      if (n.startsWith("UPDATE fid_facturas SET estado")) {
        const f = t.fid_facturas.find((z) => z.id === p[1]); if (f) f.estado = p[0];
        return undefined;
      }
      throw new Error("consulta no reconocida: " + n);
    },
  };
  return { x, t };
}

/** Una factura como la describe la guía: LoyaltyProgram dentro de los InvoiceItem. */
const factura = ({ globalId = "GID-0001", lineas = [["TOK-A", 12.5]], extra = {} } = {}) => ({
  GlobalId: globalId,
  SerialNumber: "L1", Number: 123, Date: "2026-09-10",
  InvoiceItems: lineas.map(([member, amount], i) => ({
    LineNumber: i + 1, Description: "Producto", Amount: amount,
    LoyaltyProgram: member ? { MemberId: member, Rewards: [] } : undefined,
  })),
  ...extra,
});

describe("la validación del socio", () => {
  test("200 con MemberId, DisplayText y Rewards — y Rewards es EXACTAMENTE []", () => {
    // Fase 1: cero premios. Devolver aquí cualquier cosa sería prometer un descuento que la barra
    // no puede aplicar, y el cliente se enteraría en la cuenta.
    const r = respuestaMiembro(carnet(), { visitas: 7 });
    assert.deepEqual(Object.keys(r).sort(), ["DisplayText", "MemberId", "Rewards"]);
    assert.equal(r.MemberId, carnet().token);
    assert.deepEqual(r.Rewards, []);
    assert.equal(Array.isArray(r.Rewards), true);
    assert.equal(r.Rewards.length, 0);
    assert.deepEqual(REWARDS_FASE_1, []);
  });

  test("el DisplayText ayuda al camarero y NO lleva teléfono ni correo", () => {
    const r = respuestaMiembro(carnet({ nombre: "Marta Puig" }), { visitas: 7 });
    assert.match(r.DisplayText, /Marta/);
    assert.match(r.DisplayText, /7 visitas/);
    assert.ok(!/Puig/.test(r.DisplayText), "sale el apellido, que no hace falta");
    assert.ok(!/@|\+34|\d{9}/.test(r.DisplayText), r.DisplayText);
  });

  test("sin nombre y sin visitas, sigue diciendo algo útil", () => {
    assert.equal(textoParaCamarero({ nombre: "" }, { visitas: 0 }), "Socio · primera visita");
    assert.equal(textoParaCamarero({ nombre: "Ana" }, { visitas: 1 }), "Ana · 1 visita");
  });

  test("404 para lo que no es un carné vivo", () => {
    assert.equal(carnetUtilizable(null).ok, false);
    assert.equal(carnetUtilizable(carnet({ clase: "cupon" })).motivo, "no_es_carnet");
    assert.equal(carnetUtilizable(carnet({ anulado_en: AHORA })).motivo, "anulado");
    assert.equal(carnetUtilizable(carnet({ caduca_en: "2020-01-01" }), { ahora: AHORA }).motivo, "caducado");
    assert.equal(carnetUtilizable(carnet(), { ahora: AHORA }).ok, true);
  });

  test("un VALE IMPRESO no identifica a nadie", () => {
    // `pro_qr` guarda carnés y vales anónimos en la misma tabla. Un vale es un papel al portador:
    // si sirviera de MemberId, cualquiera con un flyer sería socio.
    assert.equal(carnetUtilizable(carnet({ clase: "cupon", telefono: "" })).ok, false);
  });
});

describe("la integración: token, local y caducidad", () => {
  test("el token es largo y del alfabeto de una URL", () => {
    const t = nuevoToken((n) => crypto.randomBytes(n));
    assert.ok(t.length >= 60, `${t.length} caracteres`);
    assert.match(t, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(t, nuevoToken((n) => crypto.randomBytes(n)));
  });

  test("de la pista no se saca el token", () => {
    const t = nuevoToken((n) => crypto.randomBytes(n));
    const p = pistaToken(t);
    assert.equal(p, "••••" + t.slice(-4));
    assert.ok(p.length < 10);
  });

  test("revocada, desactivada o caducada: no vale", () => {
    assert.equal(estadoIntegracion(null).motivo, "token_desconocido");
    assert.equal(estadoIntegracion({ ...integracion, revocado_en: AHORA }).motivo, "revocada");
    assert.equal(estadoIntegracion({ ...integracion, activo: false }).motivo, "desactivada");
    assert.equal(estadoIntegracion({ ...integracion, caduca_en: "2020-01-01" }, { ahora: AHORA }).motivo, "caducada");
    assert.equal(estadoIntegracion(integracion, { ahora: AHORA }).ok, true);
  });

  test("AISLAMIENTO: cualquier local que no sea Lloret se rechaza", () => {
    // El piloto es de un local. Si el token de Lloret valiera en Blanes, las visitas de dos barras
    // se mezclarían y el piloto dejaría de medir lo que dice medir.
    for (const l of ["La Tapeta - Blanes", "La Tapeta - Girona", "Cooperativa - Blanes", ""]) {
      assert.equal(estadoIntegracion({ ...integracion, local: l }, { ahora: AHORA }).motivo, "local_no_permitido", l);
    }
    assert.equal(LOCAL_PILOTO, "La Tapeta - Lloret");
  });

  test("las URLs llevan el hueco que sustituye Ágora", () => {
    const u = urlsDeIntegracion("https://x.example/", "TOK");
    assert.equal(u.validacion, "https://x.example/api/fidelizacion/agora/TOK/member/{member_id}");
    assert.equal(u.facturas, "https://x.example/api/fidelizacion/agora/TOK/factura");
  });
});

describe("leer la factura sin inventarse el contrato", () => {
  test("saca los InvoiceItem con LoyaltyProgram, anide como anide", () => {
    // No se busca por el nombre del array: se recorre el árbol y se recoge todo lo que lleve un
    // `LoyaltyProgram`. Así una factura de varios albaranes sale bien sin adivinar nombres.
    const e = extraerFactura(factura({ lineas: [["TOK-A", 10], ["TOK-B", 5], ["TOK-A", 2.5]] }), sha, { local: LOCAL_PILOTO });
    assert.equal(e.globalId, "GID-0001");
    assert.equal(e.claveDebil, false);
    assert.equal(e.lineas, 3);
    assert.equal(e.miembros.length, 2, "dos socios distintos");
    assert.equal(e.miembros.find((m) => m.member === "TOK-A").importe, 12.5, "se suman sus dos líneas");
    assert.equal(e.importeTotal, 17.5);
  });

  test("VARIOS MemberId en una sola factura, como avisa la guía", () => {
    const e = extraerFactura(factura({ lineas: [["A", 1], ["B", 2], ["C", 3]] }), sha, { local: LOCAL_PILOTO });
    assert.deepEqual(e.miembros.map((m) => m.member).sort(), ["A", "B", "C"]);
  });

  test("líneas sin socio no cuentan", () => {
    const e = extraerFactura(factura({ lineas: [["TOK-A", 10], [null, 99]] }), sha, { local: LOCAL_PILOTO });
    assert.equal(e.miembros.length, 1);
    assert.equal(e.importeTotal, 10);
  });

  test("sin GlobalId se compone una clave y se marca DÉBIL, no se disfraza", () => {
    // Una idempotencia que no se sabe fuerte hay que poder mirarla luego. Por eso se marca.
    const sinId = factura(); delete sinId.GlobalId;
    const e = extraerFactura(sinId, sha, { local: LOCAL_PILOTO });
    assert.equal(e.claveDebil, true);
    assert.match(e.globalId, /^debil:/);
    assert.equal(extraerFactura(sinId, sha, { local: LOCAL_PILOTO }).globalId, e.globalId, "la clave débil debe ser estable");
  });

  test("encuentra el GlobalId aunque venga anidado", () => {
    assert.equal(buscaProfunda({ a: { b: { GlobalId: "X1" } } }, "GlobalId"), "X1");
    assert.equal(buscaProfunda({ a: 1 }, "GlobalId"), null);
  });

  test("detecta una devolución por los importes negativos", () => {
    const e = extraerFactura(factura({ lineas: [["TOK-A", -12.5]] }), sha, { local: LOCAL_PILOTO });
    assert.equal(e.devolucion, true);
  });

  test("el esquema del JSON no lleva ni un valor dentro", () => {
    const s = JSON.stringify(esquemaDe(factura({ lineas: [["SECRETO-TOK", 99.9]] })));
    assert.ok(!s.includes("SECRETO-TOK"), s);
    assert.ok(!s.includes("99.9"), s);
    assert.ok(s.includes("LoyaltyProgram"), "pero sí los nombres de campo, que es para lo que sirve");
  });
});

describe("el libro: una factura aceptada es UNA visita por socio", () => {
  test("visita y consumo, con sus claves de idempotencia", () => {
    const e = extraerFactura(factura({ lineas: [["TOK-A", 12.5]] }), sha, { local: LOCAL_PILOTO });
    const m = movimientosDe(e, { local: LOCAL_PILOTO, ahora: AHORA, facturaId: 3, hashMember });
    assert.equal(m.length, 2);
    assert.deepEqual(m.map((z) => z.concepto), ["visita", "consumo"]);
    assert.equal(m[0].unidades, 1);
    assert.equal(m[1].importe, 12.5);
    // La clave lleva el LOCAL dentro: si el GlobalId se repitiera entre locales, dos visitas
    // distintas compartirían clave y una de las dos no se apuntaría, sin dar ningún error.
    assert.ok(m[0].clave_idem.startsWith(`${IDEM_V}:${localSlug(LOCAL_PILOTO)}:visita:GID-0001:`), m[0].clave_idem);
  });

  test("EL MISMO socio en cinco líneas cuenta UNA visita", () => {
    // Es el caso que la guía avisa y el que más fácil sería contar mal: la clave es la misma las
    // cinco veces, y el índice único de `fid_movimientos` deja pasar solo la primera.
    const e = extraerFactura(factura({ lineas: [["A", 1], ["A", 2], ["A", 3], ["A", 4], ["A", 5]] }), sha, { local: LOCAL_PILOTO });
    const m = movimientosDe(e, { local: LOCAL_PILOTO, ahora: AHORA, hashMember });
    assert.equal(m.filter((z) => z.concepto === "visita").length, 1);
    assert.equal(m.find((z) => z.concepto === "consumo").importe, 15);
  });

  test("una devolución genera el movimiento CONTRARIO y ninguna visita", () => {
    const e = extraerFactura(factura({ globalId: "DEV-1", lineas: [["A", -12.5]] }), sha, { local: LOCAL_PILOTO });
    const m = movimientosDe(e, { local: LOCAL_PILOTO, ahora: AHORA, hashMember });
    assert.equal(m.length, 1);
    assert.equal(m[0].concepto, "devolucion");
    assert.equal(m[0].importe, -12.5);
    assert.ok(m.every((z) => z.concepto !== "visita"), "una devolución no es una visita");
  });
});

describe("idempotencia contra la base", () => {
  const guardar = (x, e, extra = {}) => procesarFactura(x, {
    extracto: e, integracion, ahora: AHORA, cuerpoBytes: 100, hashMember, ...extra });

  test("una factura nueva se guarda y apunta sus movimientos", async () => {
    const { x, t } = bd({ carnes: [carnet({ id: 11, token: "TOK-A" })] });
    const r = await guardar(x, extraerFactura(factura({ lineas: [["TOK-A", 12.5]] }), sha, { local: LOCAL_PILOTO }));
    assert.equal(r.repetida, false);
    assert.equal(r.movimientos, 2);
    assert.equal(t.fid_facturas.length, 1);
    assert.equal(t.fid_movimientos.filter((m) => m.concepto === "visita").length, 1);
  });

  test("DUPLICADO SECUENCIAL: el reenvío no vuelve a sumar nada", async () => {
    const { x, t } = bd({ carnes: [carnet({ id: 11, token: "TOK-A" })] });
    const e = extraerFactura(factura({ lineas: [["TOK-A", 12.5]] }), sha, { local: LOCAL_PILOTO });
    await guardar(x, e);
    const r2 = await guardar(x, e);
    assert.equal(r2.repetida, true);
    assert.equal(r2.conflicto, false);
    assert.equal(r2.movimientos, 0);
    assert.equal(t.fid_facturas.length, 1);
    assert.equal(t.fid_movimientos.length, 2, "se han duplicado los movimientos");
  });

  test("DUPLICADO CONCURRENTE: dos reenvíos a la vez dejan una sola factura", async () => {
    // Se cruzan en el índice único de la base, no en una comprobación previa que uno de los dos
    // podría adelantar. Aquí se interfoliean de verdad en los `await`.
    const { x, t } = bd({ carnes: [carnet({ id: 11, token: "TOK-A" })] });
    const e = extraerFactura(factura({ lineas: [["TOK-A", 12.5]] }), sha, { local: LOCAL_PILOTO });
    const [a, b] = await Promise.all([guardar(x, e), guardar(x, e)]);
    assert.equal(t.fid_facturas.length, 1);
    assert.equal(t.fid_movimientos.length, 2);
    assert.equal([a, b].filter((r) => r.repetida).length, 1, "una de las dos debe verse como reenvío");
  });

  test("MISMO GlobalId con OTRO cuerpo: se marca conflicto y se acepta igual", async () => {
    // No se procesa en silencio. Y no se devuelve un error: esa factura ya se aceptó una vez, y
    // fallar ahora bloquearía una caja por un problema que es nuestro.
    const { x, t } = bd({ carnes: [carnet({ id: 11, token: "TOK-A" })] });
    await guardar(x, extraerFactura(factura({ lineas: [["TOK-A", 12.5]] }), sha, { local: LOCAL_PILOTO }));
    const r = await guardar(x, extraerFactura(factura({ lineas: [["TOK-A", 99] ] }), sha, { local: LOCAL_PILOTO }));
    assert.equal(r.repetida, true);
    assert.equal(r.conflicto, true);
    assert.equal(r.estado, ESTADOS.CONFLICTO);
    assert.equal(t.fid_facturas[0].estado, ESTADOS.CONFLICTO);
    assert.equal(t.fid_movimientos.length, 2, "un conflicto NO apunta movimientos nuevos");
  });

  test("un socio que ya no existe: se acepta, no se apunta nada y no se crea a nadie", async () => {
    const { x, t } = bd({ carnes: [] });
    const r = await guardar(x, extraerFactura(factura({ lineas: [["FANTASMA", 10]] }), sha, { local: LOCAL_PILOTO }));
    assert.equal(r.repetida, false);
    assert.equal(r.movimientos, 0);
    assert.equal(r.sinMiembro.length, 1);
    assert.equal(r.estado, ESTADOS.SIN_MIEMBRO);
    assert.equal(t.fid_facturas.length, 1, "la factura se guarda igual");
    assert.equal(t.pro_qr.length, 0, "¡se ha creado un socio de la nada!");
  });

  test("un carné anulado tampoco resucita", async () => {
    const { x } = bd({ carnes: [carnet({ id: 11, token: "TOK-A", anulado_en: AHORA })] });
    const r = await guardar(x, extraerFactura(factura({ lineas: [["TOK-A", 10]] }), sha, { local: LOCAL_PILOTO }));
    assert.equal(r.movimientos, 0);
    assert.equal(r.sinMiembro[0].motivo, "anulado");
  });

  test("DEVOLUCIÓN y DOBLE DEVOLUCIÓN: la segunda no revierte otra vez", async () => {
    const { x, t } = bd({ carnes: [carnet({ id: 11, token: "TOK-A" })] });
    await guardar(x, extraerFactura(factura({ globalId: "V-1", lineas: [["TOK-A", 20]] }), sha, { local: LOCAL_PILOTO }));
    const dev = extraerFactura(factura({ globalId: "D-1", lineas: [["TOK-A", -20]] }), sha, { local: LOCAL_PILOTO });
    await guardar(x, dev);
    const otra = await guardar(x, dev);
    assert.equal(otra.repetida, true);
    const devs = t.fid_movimientos.filter((m) => m.concepto === "devolucion");
    assert.equal(devs.length, 1, "se ha revertido dos veces");
    assert.equal(devs[0].importe, -20);
    // Y el libro sigue siendo append-only: nada se ha borrado.
    assert.equal(t.fid_movimientos.filter((m) => m.concepto === "visita").length, 1);
    const saldo = t.fid_movimientos.reduce((s, m) => s + Number(m.importe), 0);
    assert.equal(saldo, 0, "20 consumidos y 20 devueltos");
  });

  test("varios socios en una factura: cada uno con lo suyo", async () => {
    const { x, t } = bd({ carnes: [carnet({ id: 11, token: "A" }), carnet({ id: 22, token: "B" })] });
    const r = await guardar(x, extraerFactura(factura({ lineas: [["A", 10], ["B", 5], ["A", 2]] }), sha, { local: LOCAL_PILOTO }));
    assert.equal(r.movimientos, 4, "dos socios × (visita + consumo)");
    const porQr = (id, c) => t.fid_movimientos.filter((m) => m.qr_id === id && m.concepto === c);
    assert.equal(porQr(11, "visita").length, 1);
    assert.equal(porQr(11, "consumo")[0].importe, 12);
    assert.equal(porQr(22, "consumo")[0].importe, 5);
  });
});

describe("en esta fase no se concede NADA", () => {
  test("ni premios, ni puntos, ni canjes", async () => {
    const { x, t } = bd({ carnes: [carnet({ id: 11, token: "TOK-A" })] });
    await procesarFactura(x, { extracto: extraerFactura(factura({ lineas: [["TOK-A", 12.5]] }), sha, { local: LOCAL_PILOTO }),
      integracion, ahora: AHORA, cuerpoBytes: 10, hashMember });
    assert.equal(t.fid_movimientos.filter((m) => m.concepto === "puntos").length, 0);
    assert.deepEqual(respuestaMiembro(carnet(), { visitas: 3 }).Rewards, []);
    // Y el módulo no sabe siquiera escribir en las tablas de promociones.
  });

  test("la respuesta de la factura es la de la guía, con PrinterText vacío", () => {
    // Escribir algo en el ticket sería prometer un premio que en esta fase no existe.
    assert.deepEqual(respuestaFactura({}), { Status: "accepted", PrinterText: "" });
  });
});

describe("nada sensible se guarda", () => {
  test("Authorization y las cookies no se guardan, Agora-Version sí", () => {
    const c = cabecerasSeguras({ authorization: "Bearer x", cookie: "a=b", "agora-version": "8.7.2",
      "content-type": "application/json", "x-api-key": "k" });
    assert.equal(c.authorization, undefined);
    assert.equal(c.cookie, undefined);
    assert.equal(c["x-api-key"], undefined);
    assert.equal(c["agora-version"], "8.7.2");
    assert.ok(!JSON.stringify(c).includes("Bearer"), JSON.stringify(c));
  });
});
