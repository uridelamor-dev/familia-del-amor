// Los puntos DENTRO de la transacción: conceder, consumir, caducar y no hacerlo dos veces.
//
// LO QUE SE PRUEBA AQUÍ no es la aritmética —de eso va `modules/fidelizacion-puntos.test.js`— sino
// lo que pasa cuando dos cajas cierran a la vez, cuando Ágora reenvía la misma factura y cuando la
// transacción se cae a mitad. Son los tres momentos en los que se puede regalar dinero sin que
// nadie se entere.
//
// LA BASE ES DE MENTIRA, pero aplica de verdad los dos índices únicos que sostienen todo esto:
// `fid_facturas.clave_factura` y `fid_movimientos.clave_idem`. Un `ON CONFLICT DO NOTHING` que no
// estuviera se caza aquí.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { procesarFactura, extraerFactura, FacturaRechazada, CERROJO_PUNTOS }
  from "../src/modules/fidelizacion/agora.js";
import { caducaEn } from "../src/modules/fidelizacion/puntos.js";

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const sha = (t) => "h:" + hash(t).slice(0, 16);
const hashMember = (t) => hash(t).slice(0, 16);
const AHORA = "2026-09-14T12:00:00.000Z";
const LLORET = "La Tapeta - Lloret";
const TORDERA = "La Tapa Ibérica - Tordera";

const REGLA = Object.freeze({ id: 1, version: 1, ambito: "global", local: null, activa: true,
  puntos_por_euro: 1, redondeo: "floor", puntos_necesarios: 100, descuento_euros: 5,
  consumo_minimo: 30, caducidad_meses: 6, max_rewards_factura: 1,
  vigente_desde: "2026-01-01T00:00:00Z", vigente_hasta: null, reward_id: "fid:REWARDDELLORET1" });

const TODO = { sombra: true, conceder: true, ofrecer: true, consumir: true };
const integracion = (local = LLORET) => ({ id: 7, local, activo: true, revocado_en: null,
  caduca_en: "2099-01-01T00:00:00Z", workplace_confirmado_en: AHORA });

const carnet = (id, token) => ({ id, clase: "carnet", nombre: "Marta", token, codigo: null,
  anulado_en: null, caduca_en: null });

/** El JSON tal como llega: el importe cobrado en `Payments[].Amount`, el socio en las líneas. */
const doc = (globalId, amount, { tokens = ["TOK-A"], reward = null } = {}) => ({
  GlobalId: globalId, DocumentType: "StandardInvoice",
  Payments: [{ Amount: amount, PaidAmount: amount, ChangeAmount: 0 }],
  InvoiceItems: [{ GlobalId: globalId, Lines: tokens.map((t, i) => ({
    Index: i + 1, TotalAmount: amount / tokens.length,
    LoyaltyProgram: { MemberId: t, Rewards: reward && i === 0 ? [reward] : [] } })) }],
});

const programa = (extra = {}) => ({ regla: REGLA, interruptores: TODO, hash, idemV: "fid:v1", ...extra });

/** Una base de mentira que aplica los índices únicos de verdad y guarda las columnas de puntos. */
function bd({ carnes = [], movimientos = [], reglas = [REGLA] } = {}) {
  const t = { fid_facturas: [], fid_movimientos: movimientos.map((m) => ({ ...m })),
              pro_qr: carnes.map((c) => ({ ...c })), fid_reglas: reglas.map((r) => ({ ...r })) };
  let seq = { fid_facturas: 0, fid_movimientos: movimientos.reduce((a, m) => Math.max(a, m.id || 0), 0) };
  const cerrojos = [];
  const x = {
    cerrojos,
    get: async (q, p = []) => {
      if (/FROM fid_facturas WHERE clave_factura/.test(q)) return t.fid_facturas.find((f) => f.clave_factura === p[0]) || null;
      if (/FROM pro_qr WHERE token/.test(q)) return t.pro_qr.find((c) => c.token === p[0]) || null;
      // La versión EXACTA del Reward, buscada por su identificador inmutable.
      if (/FROM fid_reglas WHERE reward_id/.test(q)) return t.fid_reglas.find((r) => r.reward_id === p[0]) || null;
      throw new Error("consulta no reconocida: " + q);
    },
    all: async (q, p = []) => {
      if (/FROM fid_movimientos WHERE qr_id = \? AND concepto = 'puntos'/.test(q)) {
        return t.fid_movimientos.filter((m) => m.qr_id === p[0] && m.concepto === "puntos")
          .sort((a, b) => a.id - b.id);
      }
      return [];
    },
    run: async (q, p = []) => {
      const n = q.replace(/\s+/g, " ").trim();
      if (n.startsWith("SELECT pg_advisory_xact_lock")) { cerrojos.push(p); return undefined; }
      if (n.startsWith("INSERT INTO fid_facturas")) {
        if (t.fid_facturas.some((f) => f.clave_factura === p[4])) return undefined;
        const fila = { id: ++seq.fid_facturas, local: p[1], global_id: p[2], clave_factura: p[4],
                       cuerpo_hash: p[6], estado: p[15] };
        t.fid_facturas.push(fila);
        return { id: fila.id };
      }
      if (n.startsWith("INSERT INTO fid_movimientos") && /punto_tipo/.test(n)) {
        assert.match(n, /ON CONFLICT \(clave_idem\) DO NOTHING/, "los puntos deben ser idempotentes");
        if (t.fid_movimientos.some((m) => m.clave_idem === p[5])) return undefined;
        const fila = { id: ++seq.fid_movimientos, qr_id: p[0], member_hash: p[1], local: p[2],
          concepto: "puntos", punto_tipo: p[3], unidades: p[4], clave_idem: p[5], factura_id: p[6],
          lote_id: p[7], caduca_en: p[8], regla_id: p[9], regla_version: p[10],
          importe_centimos: p[11], nota: p[12], autor: p[13], creado_en: p[14] };
        t.fid_movimientos.push(fila);
        return { id: fila.id };
      }
      if (n.startsWith("INSERT INTO fid_movimientos")) {
        if (t.fid_movimientos.some((m) => m.clave_idem === p[6])) return undefined;
        const fila = { id: ++seq.fid_movimientos, qr_id: p[0], member_hash: p[1], local: p[2],
          concepto: p[3], unidades: p[4], importe: p[5], clave_idem: p[6], factura_id: p[7],
          autor: p[10], creado_en: p[11] };
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

const lote = (id, qrId, u, caduca) => ({ id, qr_id: qrId, concepto: "puntos", punto_tipo: "ganados",
  unidades: u, caduca_en: caduca, lote_id: null, clave_idem: `viejo:${id}`, local: LLORET, creado_en: "2026-06-01" });

const guardar = (x, json, extra = {}) => procesarFactura(x, {
  extracto: extraerFactura(json, sha, { local: extra.local || LLORET }),
  integracion: integracion(extra.local), ahora: AHORA, cuerpoBytes: 100, hashMember,
  programa: programa({ json, ...extra.programa }), ...extra.resto });

/** Solo lo que ha escrito ESTA ejecución: los lotes sembrados también son de tipo «ganados», y
 *  contarlos haría pasar por bueno un cálculo que no se ha hecho. Se distinguen por la clave. */
/** El Reward de la regla base: su identificador es el que se guardó al publicarla. */
const REWARD_G = { Id: REGLA.reward_id, Type: "CashDiscount", Value: 5 };

const puntosDe = (t, tipo) => t.fid_movimientos.filter((m) => m.punto_tipo === tipo && String(m.clave_idem).startsWith("fid:v1"));

describe("conceder puntos", () => {
  test("32,30 € escriben UN lote de 32 puntos con su caducidad", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")] });
    const r = await guardar(x, doc("G-1", 32.30));
    const ganados = puntosDe(t, "ganados");
    assert.equal(ganados.length, 1);
    assert.equal(ganados[0].unidades, 32);
    assert.equal(ganados[0].caduca_en, caducaEn(AHORA, 6));
    assert.equal(ganados[0].regla_version, 1, "no se guarda con qué versión se calculó");
    assert.equal(ganados[0].importe_centimos, 3230);
    assert.equal(r.puntos.accion, "aceptar");
  });

  test("la VISITA se apunta igual con una factura de 0 €", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(x, doc("G-0", 0));
    assert.equal(t.fid_movimientos.filter((m) => m.concepto === "visita").length, 1);
    assert.equal(puntosDe(t, "ganados").length, 0, "0 € ha dado puntos");
  });

  test("con «conceder» apagado no se escribe ni un punto", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(x, doc("G-1", 50), { programa: { interruptores: { ...TODO, conceder: false } } });
    assert.equal(puntosDe(t, "ganados").length, 0);
    assert.equal(t.fid_movimientos.filter((m) => m.concepto === "visita").length, 1, "la visita también se ha perdido");
  });

  test("sin programa no se toca nada de puntos: el flujo de antes sigue igual", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")] });
    const r = await procesarFactura(x, { extracto: extraerFactura(doc("G-1", 50), sha, { local: LLORET }),
      integracion: integracion(), ahora: AHORA, cuerpoBytes: 100, hashMember });
    assert.equal(r.puntos, null);
    assert.equal(t.fid_movimientos.filter((m) => m.concepto === "puntos").length, 0);
    assert.equal(x.cerrojos.length, 0, "se ha bloqueado una cuenta sin haber programa");
  });
});

describe("un reenvío NO da puntos dos veces", () => {
  test("la segunda vez no escribe ni un movimiento", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(x, doc("G-DUP", 40));
    const antes = t.fid_movimientos.length;
    const r2 = await guardar(x, doc("G-DUP", 40));
    assert.equal(r2.repetida, true);
    assert.equal(t.fid_movimientos.length, antes, "el reenvío ha vuelto a escribir");
    assert.equal(puntosDe(t, "ganados").length, 1);
  });

  test("y la clave de idempotencia es la que lo impide, no una comprobación previa", async () => {
    // Dos reenvíos simultáneos se cruzan en el índice único de la base, no en un `if` que uno de
    // los dos podría adelantar.
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(x, doc("G-X", 40));
    const clave = puntosDe(t, "ganados")[0].clave_idem;
    assert.match(clave, /^fid:v1:la-tapeta-lloret:gana:G-X:1$/);
  });
});

describe("consumir el descuento", () => {
  const REWARD = { Id: REGLA.reward_id, Type: "CashDiscount", Value: 5 };

  test("100 puntos se consumen en FIFO y se conceden los nuevos", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")],
      movimientos: [lote(1, 11, 60, "2027-03-01"), lote(2, 11, 60, "2027-01-01")] });
    await guardar(x, doc("G-R", 25, { reward: REWARD }));

    const consumidos = puntosDe(t, "consumidos");
    assert.deepEqual(consumidos.map((m) => [m.lote_id, m.unidades]), [[2, -60], [1, -40]],
      "no se ha gastado primero el lote que antes caduca");
    // Y se conceden los 25 nuevos: los puntos de esta factura no pagan su propio descuento.
    assert.equal(puntosDe(t, "ganados")[0].unidades, 25);
  });

  test("el ORDEN es consumir y luego conceder", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 100, "2027-01-01")] });
    await guardar(x, doc("G-R", 25, { reward: REWARD }));
    // Solo los de esta factura: el lote sembrado también es «ganados» y está antes que todo.
    const ids = t.fid_movimientos
      .filter((m) => m.concepto === "puntos" && String(m.clave_idem).startsWith("fid:v1"))
      .map((m) => m.punto_tipo);
    assert.deepEqual(ids, ["consumidos", "ganados"], "los puntos nuevos pagan su propio descuento");
  });

  test("SE BLOQUEA LA CUENTA antes de mirar el saldo", async () => {
    // Sin el cerrojo, dos cajas cerrando a la vez para el mismo socio leen los mismos 100 puntos y
    // los dos descuentos se dan con un solo canje.
    const { x } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 100, "2027-01-01")] });
    await guardar(x, doc("G-R", 25, { reward: REWARD }));
    assert.deepEqual(x.cerrojos, [[CERROJO_PUNTOS, 11]]);
  });

  test("el cerrojo es POR CUENTA, no por tabla: dos socios no se esperan", async () => {
    const a = bd({ carnes: [carnet(11, "TOK-A")] });
    const b = bd({ carnes: [carnet(22, "TOK-B")] });
    await guardar(a.x, doc("G-1", 10));
    await guardar(b.x, doc("G-2", 10, { tokens: ["TOK-B"] }));
    assert.deepEqual(a.x.cerrojos, [[CERROJO_PUNTOS, 11]]);
    assert.deepEqual(b.x.cerrojos, [[CERROJO_PUNTOS, 22]]);
  });

  test("DOBLE CIERRE con 100 puntos: solo uno consume", async () => {
    // Las dos transacciones comparten la misma tabla. La segunda ve ya escritos los consumos de la
    // primera, se queda sin saldo y se rechaza: nunca se dan dos descuentos con 100 puntos.
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 100, "2027-01-01")] });
    await guardar(x, doc("G-A", 25, { reward: REWARD }));
    await assert.rejects(() => guardar(x, doc("G-B", 25, { reward: REWARD })),
      (e) => e instanceof FacturaRechazada && e.motivo === "saldo_insuficiente");

    // Y del segundo intento no ha quedado nada: un solo consumo de 100.
    assert.equal(puntosDe(t, "consumidos").reduce((a, m) => a + m.unidades, 0), -100);
  });

  test("sin saldo suficiente se RECHAZA, y no se consume a medias", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 99, "2027-01-01")] });
    await assert.rejects(() => guardar(x, doc("G-R", 25, { reward: REWARD })),
      (e) => e instanceof FacturaRechazada && e.motivo === "saldo_insuficiente");
    assert.equal(puntosDe(t, "consumidos").length, 0);
  });

  test("por debajo del mínimo se RECHAZA", async () => {
    const { x } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 500, "2027-01-01")] });
    await assert.rejects(() => guardar(x, doc("G-R", 24.99, { reward: REWARD })),
      (e) => e instanceof FacturaRechazada && e.motivo === "minimo_no_alcanzado");
  });

  test("un Reward de la regla de OTRO LOCAL se rechaza", async () => {
    // El identificador es nuestro y existe, pero su versión es de un ámbito que no es este local.
    const deTordera = { ...REGLA, ambito: "local", local: TORDERA };
    const { x } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 500, "2027-01-01")],
                       reglas: [deTordera] });
    await assert.rejects(() => guardar(x, doc("G-R", 40, { reward: REWARD_G })),
      (e) => e instanceof FacturaRechazada && e.motivo === "reward_de_otro_local");
  });

  test("una VERSIÓN NUEVA publicada con el ticket abierto no rompe el descuento ofrecido", async () => {
    // El cliente vio «100 puntos = 5 €». Mientras tenía el ticket abierto se publicó la v2, más
    // cara. Su descuento sigue costándole lo que se le dijo, porque se busca SU versión.
    const v2 = { ...REGLA, id: 2, version: 2, puntos_necesarios: 300, descuento_euros: 3,
                 reward_id: "fid:OTROREWARDNUEVO" };
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 150, "2027-01-01")],
                          reglas: [REGLA, v2] });
    await guardar(x, doc("G-R", 25, { reward: REWARD_G }), { programa: { regla: v2 } });
    assert.equal(puntosDe(t, "consumidos").reduce((a, m) => a + m.unidades, 0), -100,
      "le han cobrado los puntos de la versión nueva");
    assert.equal(puntosDe(t, "consumidos")[0].regla_version, 1, "el consumo no guarda la versión ofrecida");
    // Y los puntos NUEVOS sí van con la regla vigente hoy: son de esta compra.
    assert.equal(puntosDe(t, "ganados")[0].regla_version, 2);
  });

  test("un ticket abierto se cierra DENTRO de la gracia con las condiciones antiguas", async () => {
    // Se ofreció el descuento, se publicó la v2 a las 11:40 y el ticket se cierra a las 12:00.
    // Dentro de las 3 horas: se cierra, y con lo que se le dijo al cliente.
    const v1 = { ...REGLA, vigente_hasta: "2026-09-14T11:40:00.000Z", gracia_minutos: 180 };
    const v2 = { ...REGLA, id: 2, version: 2, puntos_necesarios: 300, descuento_euros: 3,
                 vigente_desde: "2026-09-14T11:40:00.000Z", reward_id: "fid:V2" };
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 150, "2027-01-01")],
                          reglas: [v1, v2] });
    await guardar(x, doc("G-R", 25, { reward: REWARD_G }), { programa: { regla: v2 } });
    assert.equal(puntosDe(t, "consumidos").reduce((a, m) => a + m.unidades, 0), -100);
    assert.equal(puntosDe(t, "consumidos")[0].importe_centimos, 500, "no usa el descuento antiguo");
  });

  test("y FUERA de la gracia ya no", async () => {
    const v1 = { ...REGLA, vigente_hasta: "2026-09-14T08:00:00.000Z", gracia_minutos: 180 };
    const { x } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 500, "2027-01-01")],
                       reglas: [v1] });
    await assert.rejects(() => guardar(x, doc("G-R", 40, { reward: REWARD_G })),
      (e) => e instanceof FacturaRechazada && e.motivo === "reward_no_reconocido");
  });

  test("con gracia 0, una versión sustituida no cierra nada", async () => {
    const v1 = { ...REGLA, vigente_hasta: "2026-09-14T11:59:59.000Z", gracia_minutos: 0 };
    const { x } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 500, "2027-01-01")],
                       reglas: [v1] });
    await assert.rejects(() => guardar(x, doc("G-R", 40, { reward: REWARD_G })),
      (e) => e instanceof FacturaRechazada && e.motivo === "reward_no_reconocido");
  });

  test("el SALDO y el MÍNIMO se vuelven a comprobar al cerrar, también en gracia", async () => {
    const v1 = { ...REGLA, vigente_hasta: "2026-09-14T11:40:00.000Z", gracia_minutos: 180 };
    // Saldo insuficiente: se gastó entre que se ofreció y se cerró.
    const a = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 99, "2027-01-01")], reglas: [v1] });
    await assert.rejects(() => guardar(a.x, doc("G-A", 25, { reward: REWARD_G })),
      (e) => e instanceof FacturaRechazada && e.motivo === "saldo_insuficiente");
    // Y por debajo del mínimo tampoco, aunque el Reward siga vigo por la gracia.
    const b = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 500, "2027-01-01")], reglas: [v1] });
    await assert.rejects(() => guardar(b.x, doc("G-B", 24.99, { reward: REWARD_G })),
      (e) => e instanceof FacturaRechazada && e.motivo === "minimo_no_alcanzado");
  });

  test("un reward_id que no existe se rechaza", async () => {
    const { x } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 500, "2027-01-01")] });
    await assert.rejects(() => guardar(x, doc("G-R", 40, { reward: { Id: "fid:INVENTADO", Type: "CashDiscount", Value: 5 } })),
      (e) => e instanceof FacturaRechazada && e.motivo === "reward_no_reconocido");
  });

  test("un Type manipulado se rechaza", async () => {
    const { x } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 500, "2027-01-01")] });
    await assert.rejects(() => guardar(x, doc("G-R", 40, { reward: { ...REWARD_G, Type: "DiscountRate" } })),
      (e) => e instanceof FacturaRechazada && e.motivo === "reward_tipo_distinto");
  });

  test("un Value manipulado se IGNORA", async () => {
    // Si el importe saliera de la factura, `Value: 500` descontaría 500 €.
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 150, "2027-01-01")] });
    await guardar(x, doc("G-R", 25, { reward: { ...REWARD_G, Value: 500, Name: "Gratis" } }));
    assert.equal(puntosDe(t, "consumidos")[0].importe_centimos, 500, "ha usado el Value recibido");
  });

  test("una versión REVOCADA a mano corta al momento", async () => {
    const { x } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 500, "2027-01-01")],
                       reglas: [{ ...REGLA, activa: false }] });
    await assert.rejects(() => guardar(x, doc("G-R", 40, { reward: REWARD_G })),
      (e) => e instanceof FacturaRechazada && e.motivo === "reward_no_reconocido");
  });
});

describe("la caducidad se anota antes de consumir", () => {
  test("un lote vencido deja su movimiento y no se puede gastar", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")],
      movimientos: [lote(1, 11, 100, "2026-01-01"), lote(2, 11, 100, "2027-01-01")] });
    const REWARD = { Id: REGLA.reward_id, Type: "CashDiscount", Value: 5 };
    await guardar(x, doc("G-R", 25, { reward: REWARD }));

    const caducados = puntosDe(t, "caducados");
    assert.deepEqual(caducados.map((m) => [m.lote_id, m.unidades]), [[1, -100]]);
    // Y el consumo salió del lote vivo, no del caducado.
    assert.deepEqual(puntosDe(t, "consumidos").map((m) => m.lote_id), [2]);
  });

  test("anotar la caducidad es idempotente", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")], movimientos: [lote(1, 11, 50, "2026-01-01")] });
    await guardar(x, doc("G-1", 10));
    await guardar(x, doc("G-2", 10));
    assert.equal(puntosDe(t, "caducados").length, 1, "se ha anotado dos veces la misma caducidad");
  });
});

describe("varios socios", () => {
  test("SIN descuento: se acepta, dos visitas y CERO puntos", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A"), carnet(22, "TOK-B")] });
    const r = await guardar(x, doc("G-2S", 50, { tokens: ["TOK-A", "TOK-B"] }));
    assert.equal(r.puntos.accion, "revisar");
    assert.equal(r.puntos.motivo, "varios_socios");
    assert.equal(t.fid_movimientos.filter((m) => m.concepto === "visita").length, 2);
    assert.equal(t.fid_movimientos.filter((m) => m.concepto === "puntos").length, 0);
    assert.equal(x.cerrojos.length, 0, "se ha bloqueado una cuenta con varios socios");
  });

  test("CON descuento: se RECHAZA, que es lo único que no regala 5 €", async () => {
    const REWARD = { Id: REGLA.reward_id, Type: "CashDiscount", Value: 5 };
    const { x } = bd({ carnes: [carnet(11, "TOK-A"), carnet(22, "TOK-B")] });
    await assert.rejects(() => guardar(x, doc("G-2R", 45, { tokens: ["TOK-A", "TOK-B"], reward: REWARD })),
      (e) => e instanceof FacturaRechazada && e.motivo === "varios_socios_con_reward");
  });
});

describe("si algo se cae, no entra nada", () => {
  test("un fallo escribiendo los puntos propaga y deshace la factura entera", async () => {
    // El `throw` sale de `procesarFactura`, así que la transacción hace ROLLBACK: ni factura, ni
    // visita, ni puntos. Un `accepted` con los puntos a medias sería peor, porque nadie se enteraría.
    const { x } = bd({ carnes: [carnet(11, "TOK-A")] });
    const run = x.run;
    x.run = async (q, p) => {
      if (/punto_tipo/.test(q) && /'ganados'/.test(String(p?.[3] ?? "")) === false && p?.[3] === "ganados") {
        throw Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
      }
      return run(q, p);
    };
    await assert.rejects(() => guardar(x, doc("G-CAE", 40)), /ECONNREFUSED/);
  });

  test("un rechazo NO es un fallo técnico: lleva su motivo y su razón", async () => {
    const REWARD = { Id: "inventado", Type: "CashDiscount", Value: 5 };
    const { x } = bd({ carnes: [carnet(11, "TOK-A")] });
    await assert.rejects(() => guardar(x, doc("G-R", 40, { reward: REWARD })), (e) => {
      assert.ok(e instanceof FacturaRechazada);
      assert.equal(e.motivo, "reward_no_reconocido");
      assert.match(e.razon, /Quítalo y vuelve a intentarlo/);
      return true;
    });
  });
});

describe("aislamiento entre locales", () => {
  test("los movimientos de puntos llevan el local del TOKEN", async () => {
    const { x, t } = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(x, doc("G-1", 40), { local: TORDERA });
    assert.equal(puntosDe(t, "ganados")[0].local, TORDERA);
    assert.match(puntosDe(t, "ganados")[0].clave_idem, /la-tapa-iberica-tordera/);
  });

  test("la misma factura en dos locales no colisiona", async () => {
    const a = bd({ carnes: [carnet(11, "TOK-A")] });
    const b = bd({ carnes: [carnet(11, "TOK-A")] });
    await guardar(a.x, doc("MISMO", 40), { local: LLORET });
    await guardar(b.x, doc("MISMO", 40), { local: TORDERA });
    assert.notEqual(puntosDe(a.t, "ganados")[0].clave_idem, puntosDe(b.t, "ganados")[0].clave_idem);
  });
});

describe("el cableado en server.js", () => {
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

  test("los interruptores nacen con solo la sombra encendida", () => {
    assert.match(server, /FID_SW_DEFECTO = Object\.freeze\(\{ sombra: true, conceder: false, ofrecer: false, consumir: false \}\)/);
  });

  test("ofrecer o consumir sin conceder se apagan en el SERVIDOR", () => {
    // Una comprobación en la pantalla se salta con una llamada a la API. Y consumir sin conceder
    // dejaría gastar puntos que nadie está dando.
    assert.match(server, /if \(!out\.conceder\) \{ out\.ofrecer = false; out\.consumir = false; \}/);
  });

  test("no se ofrece Reward con la integración sin confirmar", () => {
    const val = server.slice(server.indexOf("¿SE LE OFRECE EL DESCUENTO?"), server.indexOf('await apunta(integ.fila.id, integ.fila.local, rewards ? "ok:reward" : "ok")'));
    assert.match(val, /const esperaConfirmacion = !integ\.fila\.workplace_confirmado_en/);
    assert.match(val, /if \(sw\.ofrecer && !esperaConfirmacion\)/);
  });

  test("el rechazo se contesta 200 rejected y se audita", () => {
    assert.match(server, /if \(e instanceof FidFacturaRechazada\)/);
    assert.match(server, /Status: "rejected", RejectReason: e\.razon/);
    assert.match(server, /"factura_rechazada"/);
  });

  test("la sombra no guarda ni un JSON ni un dato del cliente", () => {
    const s = server.slice(server.indexOf("EL MODO SOMBRA"), server.indexOf("LO QUE HAY QUE MIRAR A MANO"));
    for (const malo of ["cuerpo", "MemberId", "telefono", "member_hash", "JSON.stringify(json"]) {
      assert.ok(!s.includes(malo), `la sombra guarda ${malo}`);
    }
    assert.match(s, /ON CONFLICT \(factura_id\) DO NOTHING/);
  });

  test("la regla se resuelve FUERA y viaja entera a la transacción", () => {
    // Resolverla dentro dejaría abierta la puerta a calcular con una versión y guardar con otra.
    assert.match(server, /programa: \{ regla: reglaHoy, interruptores: sw, hash: fidHash, json, idemV: FID_IDEM_V \}/);
  });
});
