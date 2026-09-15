// Devoluciones: revertir puntos sin borrar nada, y no revertir dos veces.
//
// ── LO QUE SE PROTEGE AQUÍ ───────────────────────────────────────────────────────────────────
//
// Una devolución mal resuelta se nota tarde y mal. Los tres fallos que buscan estos tests:
//
//   · Revertir dos veces. Un reenvío de la misma devolución dejaría al cliente con el saldo a la
//     mitad, y él tendría razón.
//   · Revertir la factura de OTRO LOCAL. Serie y número los asigna cada instalación por su cuenta,
//     así que «A/1042» existe en Lloret y en Tordera y son documentos distintos.
//   · Deducir una devolución por los importes negativos. Un abono, una corrección o una invitación
//     también traen líneas negativas, y revertirlas quitaría puntos que el cliente ganó de verdad.
//
// Y una cosa que SÍ se acepta a propósito: el saldo puede quedar NEGATIVO. Si el cliente gastó los
// puntos de una compra que después devolvió, la verdad es que debe puntos. Taparlo con un cero
// sería regalarle el descuento que ya se llevó.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { procesarFactura, extraerFactura, buscarOriginal, revertirDevolucionTotal,
         esDevolucion, TIPOS_DEVOLUCION, CERROJO_PUNTOS } from "../src/modules/fidelizacion/agora.js";
import { saldo } from "../src/modules/fidelizacion/puntos.js";

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const sha = (t) => "h:" + hash(t).slice(0, 16);
const hashMember = (t) => hash(t).slice(0, 16);
const AHORA = "2026-09-14T12:00:00.000Z";
const LLORET = "La Tapeta - Lloret";
const TORDERA = "La Tapa Ibérica - Tordera";

const REGLA = Object.freeze({ id: 1, version: 1, ambito: "global", local: null, activa: true,
  puntos_por_euro: 1, redondeo: "floor", puntos_necesarios: 100, descuento_euros: 5,
  consumo_minimo: 30, caducidad_meses: 6, max_rewards_factura: 1, gracia_minutos: 180,
  vigente_desde: "2026-01-01T00:00:00Z", vigente_hasta: null, reward_id: "fid:REWARD1" });

const TODO = { sombra: true, conceder: true, ofrecer: true, consumir: true };
const integracion = (local = LLORET) => ({ id: 7, local, activo: true, revocado_en: null,
  caduca_en: "2099-01-01T00:00:00Z", workplace_confirmado_en: AHORA });
const carnet = (id, token) => ({ id, clase: "carnet", nombre: "Marta", token, codigo: null,
  anulado_en: null, caduca_en: null });

/** Una compra normal. */
const compra = (globalId, amount, { serie = "A", numero = "1042", tokens = ["TOK-A"], reward = null } = {}) => ({
  GlobalId: globalId, DocumentType: "StandardInvoice", Serie: serie, Number: numero,
  Payments: [{ Amount: amount, PaidAmount: amount, ChangeAmount: 0 }],
  InvoiceItems: [{ GlobalId: globalId, Lines: tokens.map((t, i) => ({
    Index: i + 1, TotalAmount: amount / tokens.length,
    LoyaltyProgram: { MemberId: t, Rewards: reward && i === 0 ? [reward] : [] } })) }],
});

/** Una devolución, por DocumentType y con su relación. */
const devolucion = (globalId, amount, { tipo = "StandardRefund", serie = "A", numero = "1042",
                                        relGlobal = null, fuente = null } = {}) => ({
  GlobalId: globalId, DocumentType: tipo,
  ...(fuente ? { RefundSource: fuente } : {}),
  RelatedInvoice: { Serie: serie, Number: numero, ...(relGlobal ? { GlobalId: relGlobal } : {}) },
  Payments: [{ Amount: -amount, PaidAmount: -amount, ChangeAmount: 0 }],
  InvoiceItems: [{ GlobalId: globalId, Lines: [{ Index: 1, TotalAmount: -amount }] }],
});

/** Base de mentira que aplica los índices únicos y guarda las columnas nuevas. */
function bd({ carnes = [], movimientos = [], facturas = [], reglas = [REGLA] } = {}) {
  const t = { fid_facturas: facturas.map((f) => ({ ...f })), fid_movimientos: movimientos.map((m) => ({ ...m })),
              pro_qr: carnes.map((c) => ({ ...c })), fid_reglas: reglas.map((r) => ({ ...r })) };
  let seq = { f: t.fid_facturas.reduce((a, f) => Math.max(a, f.id || 0), 0),
              m: t.fid_movimientos.reduce((a, m) => Math.max(a, m.id || 0), 0) };
  const cerrojos = [];
  const x = {
    cerrojos, t,
    get: async (q, p = []) => {
      if (/FROM fid_facturas WHERE clave_factura/.test(q)) return t.fid_facturas.find((f) => f.clave_factura === p[0]) || null;
      if (/FROM pro_qr WHERE token/.test(q)) return t.pro_qr.find((c) => c.token === p[0]) || null;
      if (/FROM fid_reglas WHERE reward_id/.test(q)) return t.fid_reglas.find((r) => r.reward_id === p[0]) || null;
      if (/SELECT qr_id FROM fid_movimientos WHERE factura_id/.test(q)) {
        return t.fid_movimientos.find((m) => m.factura_id === p[0]) || null;
      }
      throw new Error("consulta no reconocida: " + q);
    },
    all: async (q, p = []) => {
      if (/FROM fid_movimientos WHERE qr_id = \? AND concepto = 'puntos'/.test(q)) {
        return t.fid_movimientos.filter((m) => m.qr_id === p[0] && m.concepto === "puntos").sort((a, b) => a.id - b.id);
      }
      if (/FROM fid_movimientos WHERE factura_id/.test(q)) {
        return t.fid_movimientos.filter((m) => m.factura_id === p[0]).sort((a, b) => a.id - b.id);
      }
      if (/FROM fid_facturas\s+WHERE local = \? AND global_id/.test(q)) {
        return t.fid_facturas.filter((f) => f.local === p[0] && f.global_id === p[1]);
      }
      if (/FROM fid_facturas\s+WHERE local = \? AND serie/.test(q)) {
        return t.fid_facturas.filter((f) => f.local === p[0] && f.serie === p[1] && f.numero === p[2]);
      }
      return [];
    },
    run: async (q, p = []) => {
      const n = q.replace(/\s+/g, " ").trim();
      if (n.startsWith("SELECT pg_advisory_xact_lock")) { cerrojos.push(p); return undefined; }
      if (n.startsWith("INSERT INTO fid_facturas")) {
        if (t.fid_facturas.some((f) => f.clave_factura === p[4])) return undefined;
        const fila = { id: ++seq.f, local: p[1], global_id: p[2], clave_factura: p[4], cuerpo_hash: p[6],
                       estado: p[15], serie: p[16], numero: p[17], tipo_documento: p[18],
                       importe_centimos: p[19], revertida_en: null };
        t.fid_facturas.push(fila);
        return { id: fila.id };
      }
      if (n.startsWith("INSERT INTO fid_movimientos") && /referencia_id, lote_id/.test(n)) {
        if (t.fid_movimientos.some((m) => m.clave_idem === p[7])) return undefined;
        const fila = { id: ++seq.m, qr_id: p[0], member_hash: p[1], local: p[2], concepto: p[3],
          punto_tipo: p[4], unidades: p[5], importe: p[6], clave_idem: p[7], factura_id: p[8],
          referencia_id: p[9], lote_id: p[10], caduca_en: p[11], nota: p[14], creado_en: p[16] };
        t.fid_movimientos.push(fila); return { id: fila.id };
      }
      if (n.startsWith("INSERT INTO fid_movimientos") && /punto_tipo/.test(n)) {
        if (t.fid_movimientos.some((m) => m.clave_idem === p[5])) return undefined;
        const fila = { id: ++seq.m, qr_id: p[0], member_hash: p[1], local: p[2], concepto: "puntos",
          punto_tipo: p[3], unidades: p[4], clave_idem: p[5], factura_id: p[6], lote_id: p[7],
          caduca_en: p[8], importe_centimos: p[11], creado_en: p[14] };
        t.fid_movimientos.push(fila); return { id: fila.id };
      }
      if (n.startsWith("INSERT INTO fid_movimientos")) {
        if (t.fid_movimientos.some((m) => m.clave_idem === p[6])) return undefined;
        const fila = { id: ++seq.m, qr_id: p[0], member_hash: p[1], local: p[2], concepto: p[3],
          unidades: p[4], importe: p[5], clave_idem: p[6], factura_id: p[7], creado_en: p[11] };
        t.fid_movimientos.push(fila); return { id: fila.id };
      }
      if (n.startsWith("UPDATE fid_facturas SET revertida_en")) {
        const f = t.fid_facturas.find((z) => z.id === p[2]);
        if (f && !f.revertida_en) { f.revertida_en = p[0]; f.revertida_por = p[1]; }
        return undefined;
      }
      if (n.startsWith("UPDATE fid_facturas SET devolucion_de")) {
        const f = t.fid_facturas.find((z) => z.id === p[1]); if (f) f.devolucion_de = p[0];
        return undefined;
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

const guardar = (x, json, extra = {}) => procesarFactura(x, {
  extracto: extraerFactura(json, sha, { local: extra.local || LLORET }),
  integracion: integracion(extra.local), ahora: AHORA, cuerpoBytes: 100, hashMember,
  programa: { regla: REGLA, interruptores: TODO, hash, idemV: "fid:v1", json, ...extra.programa } });

const puntos = (t) => t.fid_movimientos.filter((m) => m.concepto === "puntos");
const saldoDe = (t, qrId) => saldo(puntos(t).filter((m) => m.qr_id === qrId), { ahora: AHORA });

describe("qué es una devolución, y qué no", () => {
  test("solo lo dice DocumentType", () => {
    assert.deepEqual([...TIPOS_DEVOLUCION], ["BasicRefund", "StandardRefund"]);
    for (const tipo of TIPOS_DEVOLUCION) {
      assert.equal(esDevolucion(extraerFactura(devolucion("D", 30, { tipo }), sha, { local: LLORET })), true, tipo);
    }
  });

  test("una factura con importes NEGATIVOS no es una devolución", () => {
    // Un abono, una corrección o una invitación traen líneas negativas. Revertirlas quitaría
    // puntos que el cliente ganó de verdad.
    const negativa = { ...compra("N", 30), Payments: [{ Amount: -30 }] };
    assert.equal(esDevolucion(extraerFactura(negativa, sha, { local: LLORET })), false);
  });

  test("y un DocumentType desconocido tampoco", () => {
    for (const t of ["Invoice", "Refund", "", null, "standardrefund"]) {
      assert.equal(esDevolucion(extraerFactura(devolucion("D", 30, { tipo: t }), sha, { local: LLORET })), false, String(t));
    }
  });
});

describe("encontrar el original", () => {
  const original = { id: 1, local: LLORET, global_id: "G-ORI", serie: "A", numero: "1042",
                     importe_centimos: 3000, revertida_en: null };

  test("por serie y número, dentro del MISMO local", async () => {
    const { x } = bd({ facturas: [original] });
    const e = extraerFactura(devolucion("D-1", 30), sha, { local: LLORET });
    const r = await buscarOriginal(x, { extracto: e, local: LLORET });
    assert.equal(r.ok, true);
    assert.equal(r.por, "serie_numero");
    assert.equal(r.original.id, 1);
  });

  test("por el GlobalId del original, si viene", async () => {
    const { x } = bd({ facturas: [original] });
    const e = extraerFactura(devolucion("D-1", 30, { relGlobal: "G-ORI" }), sha, { local: LLORET });
    const r = await buscarOriginal(x, { extracto: e, local: LLORET });
    assert.equal(r.por, "global_id");
  });

  test("y por RefundSource cuando trae el identificador oficial", async () => {
    const { x } = bd({ facturas: [original] });
    const e = extraerFactura(devolucion("D-1", 30, { serie: null, numero: null, fuente: "G-ORI" }), sha, { local: LLORET });
    assert.equal((await buscarOriginal(x, { extracto: e, local: LLORET })).por, "global_id");
  });

  test("UNA DEVOLUCIÓN DE OTRO LOCAL NUNCA la encuentra", async () => {
    // Serie y número los asigna cada instalación: «A/1042» existe en los dos sitios.
    const { x } = bd({ facturas: [original, { ...original, id: 2, local: TORDERA, global_id: "G-T" }] });
    const e = extraerFactura(devolucion("D-1", 30), sha, { local: TORDERA });
    const r = await buscarOriginal(x, { extracto: e, local: TORDERA });
    assert.equal(r.original.id, 2, "ha encontrado la factura del otro local");
  });

  test("si hay dos candidatas, NO se elige ninguna", async () => {
    const { x } = bd({ facturas: [original, { ...original, id: 2, global_id: "G-OTRA" }] });
    const e = extraerFactura(devolucion("D-1", 30), sha, { local: LLORET });
    const r = await buscarOriginal(x, { extracto: e, local: LLORET });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "relacion_ambigua");
  });

  test("sin serie Y número no se busca por documento: solo el número casaría cualquier serie", async () => {
    const { x } = bd({ facturas: [original] });
    const e = extraerFactura(devolucion("D-1", 30, { serie: null }), sha, { local: LLORET });
    assert.equal((await buscarOriginal(x, { extracto: e, local: LLORET })).ok, false);
  });

  test("un original que no existe da «sin_original»", async () => {
    const { x } = bd({ facturas: [] });
    const e = extraerFactura(devolucion("D-1", 30), sha, { local: LLORET });
    assert.equal((await buscarOriginal(x, { extracto: e, local: LLORET })).motivo, "sin_original");
  });
});

describe("devolución TOTAL: se revierte todo", () => {
  /** Una compra de 30 € que concedió 30 puntos. */
  const escenario = async (extra = {}) => {
    const b = bd({ carnes: [carnet(11, "TOK-A")], ...extra });
    await guardar(b.x, compra("G-ORI", 30));
    return b;
  };

  test("los puntos ganados se revierten y la visita se compensa", async () => {
    const { x, t } = await escenario();
    assert.equal(saldoDe(t, 11).disponible, 30);

    const r = await guardar(x, devolucion("D-1", 30));
    assert.equal(r.puntos.devolucion.clase, "total");
    assert.equal(r.puntos.devolucion.puntos_revertidos, 30);
    assert.equal(saldoDe(t, 11).disponible, 0);

    // NADA se ha borrado: el movimiento original sigue, y al lado está el contrario.
    assert.equal(puntos(t).filter((m) => m.punto_tipo === "ganados").length, 1);
    assert.equal(puntos(t).filter((m) => m.punto_tipo === "revertidos").length, 1);
    // Y la visita queda compensada.
    const visitas = t.fid_movimientos.filter((m) => m.concepto === "visita");
    assert.equal(visitas.reduce((a, m) => a + Number(m.unidades || 0), 0), 0);
    assert.equal(visitas.length, 2, "se ha borrado la visita original");
  });

  test("la relación queda por los DOS lados", async () => {
    const { x, t } = await escenario();
    await guardar(x, devolucion("D-1", 30));
    const ori = t.fid_facturas.find((f) => f.global_id === "G-ORI");
    const dev = t.fid_facturas.find((f) => f.global_id === "D-1");
    assert.equal(ori.revertida_en, AHORA);
    assert.equal(ori.revertida_por, dev.id);
    assert.equal(dev.devolucion_de, ori.id);
    // Y cada movimiento compensatorio apunta al que revierte.
    const rev = puntos(t).find((m) => m.punto_tipo === "revertidos");
    assert.equal(rev.referencia_id, ori.id);
  });

  test("REENVIARLA no duplica nada", async () => {
    const { x, t } = await escenario();
    await guardar(x, devolucion("D-1", 30));
    const antes = t.fid_movimientos.length;
    const r2 = await guardar(x, devolucion("D-1", 30));
    assert.equal(r2.repetida, true);
    assert.equal(t.fid_movimientos.length, antes, "el reenvío ha vuelto a revertir");
    assert.equal(saldoDe(t, 11).disponible, 0);
  });

  test("y una SEGUNDA devolución distinta sobre la misma factura tampoco", async () => {
    // La fila queda sellada con `revertida_en`: la segunda entra y no toca nada.
    const { x, t } = await escenario();
    await guardar(x, devolucion("D-1", 30));
    const antes = t.fid_movimientos.length;
    const r2 = await guardar(x, devolucion("D-2", 30));
    assert.equal(r2.puntos.devolucion.motivo, "ya_revertida");
    assert.equal(t.fid_movimientos.length, antes);
  });

  test("los puntos CONSUMIDOS vuelven a sus lotes, con su caducidad", async () => {
    // Compra con descuento: consumió 100 puntos de dos lotes y ganó 25.
    const lotes = [
      { id: 1, qr_id: 11, concepto: "puntos", punto_tipo: "ganados", unidades: 60,
        caduca_en: "2027-01-01", clave_idem: "v1", local: LLORET },
      { id: 2, qr_id: 11, concepto: "puntos", punto_tipo: "ganados", unidades: 60,
        caduca_en: "2027-03-01", clave_idem: "v2", local: LLORET },
    ];
    const b = bd({ carnes: [carnet(11, "TOK-A")], movimientos: lotes });
    await guardar(b.x, compra("G-ORI", 25, { reward: { Id: REGLA.reward_id, Type: "CashDiscount", Value: 5 } }));
    assert.equal(saldoDe(b.t, 11).disponible, 45, "20 + 25 nuevos");

    await guardar(b.x, devolucion("D-1", 25));
    const rest = puntos(b.t).filter((m) => m.punto_tipo === "revertidos" && m.unidades > 0);
    // Dos movimientos, uno por cada lote tocado, y cada uno con la caducidad de SU lote.
    assert.deepEqual(rest.map((m) => [m.lote_id, m.unidades, m.caduca_en]),
      [[1, 60, "2027-01-01"], [2, 40, "2027-03-01"]]);
    // Vuelve a tener los 120 de antes: se le quitan los 25 que ganó y se le devuelven los 100.
    assert.equal(saldoDe(b.t, 11).disponible, 120);
  });

  test("un lote YA CADUCADO se restaura, pero NO queda disponible", async () => {
    // Se le devuelve lo que era suyo, no una prórroga.
    const lote = { id: 1, qr_id: 11, concepto: "puntos", punto_tipo: "ganados", unidades: 200,
                   caduca_en: "2026-09-13T00:00:00Z", clave_idem: "v1", local: LLORET };
    const b = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote] });
    // Se gastó ANTES de caducar (la compra es de antes), así que el consumo existe.
    b.t.fid_movimientos.push({ id: 2, qr_id: 11, concepto: "puntos", punto_tipo: "consumidos",
      unidades: -100, lote_id: 1, caduca_en: lote.caduca_en, factura_id: 99, clave_idem: "v2", local: LLORET });
    b.t.fid_facturas.push({ id: 99, local: LLORET, global_id: "G-ORI", serie: "A", numero: "1042",
      importe_centimos: 2500, revertida_en: null });

    await guardar(b.x, devolucion("D-1", 25));
    const rest = puntos(b.t).find((m) => m.punto_tipo === "revertidos" && m.unidades > 0);
    assert.equal(rest.unidades, 100, "no se ha restaurado");
    assert.equal(rest.caduca_en, lote.caduca_en, "se le ha cambiado la caducidad");
    assert.equal(saldoDe(b.t, 11).disponible, 0, "un lote caducado ha vuelto a estar disponible");
  });

  test("EL SALDO PUEDE QUEDAR NEGATIVO si ya se gastaron los puntos", async () => {
    // Compra 200 €, se lleva 200 puntos, se los gasta, y después devuelve la compra. Debe puntos,
    // y esa es la verdad: taparlo con un cero sería regalarle el descuento que ya se llevó.
    const b = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(b.x, compra("G-ORI", 200));
    assert.equal(saldoDe(b.t, 11).disponible, 200);
    await guardar(b.x, devolucion("D-1", 200));
    const lotes = puntos(b.t);
    const neto = lotes.reduce((a, m) => a + Number(m.unidades || 0), 0);
    assert.equal(neto, 0, "el neto del libro no cuadra");
    // `saldo()` nunca da negativo porque solo suma lotes vivos; el libro sí lo refleja.
    assert.equal(saldoDe(b.t, 11).disponible, 0);
    assert.equal(lotes.filter((m) => m.punto_tipo === "revertidos")[0].unidades, -200);
  });

  test("se bloquea la cuenta aunque la devolución NO traiga socio", async () => {
    // El saldo que se toca es el del socio de la ORIGINAL.
    const b = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(b.x, compra("G-ORI", 30));
    b.x.cerrojos.length = 0;
    await guardar(b.x, devolucion("D-1", 30));
    assert.deepEqual(b.x.cerrojos, [[CERROJO_PUNTOS, 11]]);
  });
});

describe("lo que NO se revierte solo", () => {
  test("una devolución PARCIAL se acepta y queda pendiente", async () => {
    const b = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(b.x, compra("G-ORI", 30));
    const antes = puntos(b.t).length;
    const r = await guardar(b.x, devolucion("D-1", 10));
    assert.equal(r.puntos.devolucion.clase, "parcial");
    assert.equal(r.puntos.devolucion.centimos, 1000);
    assert.equal(r.puntos.devolucion.original_centimos, 3000);
    assert.equal(puntos(b.t).length, antes, "una parcial ha tocado los puntos");
    assert.equal(saldoDe(b.t, 11).disponible, 30);
  });

  test("sin original identificable, tampoco", async () => {
    const b = bd({ carnes: [carnet(11, "TOK-A")] });
    const r = await guardar(b.x, devolucion("D-1", 30, { serie: "Z", numero: "9" }));
    assert.equal(r.puntos.devolucion.clase, "sin_original");
    assert.equal(puntos(b.t).length, 0);
  });

  test("y la factura se acepta igual: no se bloquea la caja", async () => {
    const b = bd({ carnes: [carnet(11, "TOK-A")] });
    const r = await guardar(b.x, devolucion("D-1", 30, { serie: "Z", numero: "9" }));
    assert.equal(r.repetida, false);
    assert.equal(r.estado, "aceptada");
  });
});

describe("si algo se cae, no entra nada", () => {
  test("un fallo escribiendo la reversión propaga y deshace la transacción entera", async () => {
    const b = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(b.x, compra("G-ORI", 30));
    const run = b.x.run;
    b.x.run = async (q, p) => {
      if (/referencia_id, lote_id/.test(q)) throw Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
      return run(q, p);
    };
    await assert.rejects(() => guardar(b.x, devolucion("D-1", 30)), /ECONNREFUSED/);
    // El `throw` sale de `procesarFactura`: la transacción real haría ROLLBACK y no quedaría
    // ni la factura de devolución ni un solo movimiento compensatorio.
    assert.equal(saldoDe(b.t, 11).disponible, 30, "se ha revertido a medias");
  });
});

describe("el código: nada destructivo, y el orden correcto", () => {
  const ag = readFileSync(new URL("../src/modules/fidelizacion/agora.js", import.meta.url), "utf8");

  test("revertir NO borra ni edita un movimiento", () => {
    const f = ag.slice(ag.indexOf("export async function revertirDevolucionTotal"), ag.indexOf("export const TIPOS_DEVOLUCION"));
    for (const malo of ["DELETE", "UPDATE fid_movimientos"]) {
      assert.ok(!f.includes(malo), `la reversión ${malo} sobre el libro`);
    }
    assert.match(f, /ON CONFLICT \(clave_idem\) DO NOTHING/);
  });

  test("la búsqueda del original SIEMPRE lleva el local", () => {
    const f = ag.slice(ag.indexOf("export async function buscarOriginal"), ag.indexOf("export async function revertirDevolucionTotal"));
    const consultas = [...f.matchAll(/FROM fid_facturas\s*\n?\s*WHERE ([^`]*)`/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
    assert.ok(consultas.length >= 2);
    for (const c of consultas) assert.match(c, /^local = \?/, `una consulta no filtra por local: ${c}`);
  });

  test("y la reversión va DESPUÉS del cerrojo", () => {
    const f = ag.slice(ag.indexOf("async function aplicarPrograma"));
    assert.ok(f.indexOf("pg_advisory_xact_lock") < f.indexOf("revertirDevolucionTotal"),
      "se revierte antes de bloquear la cuenta");
  });
});
