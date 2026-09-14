// El programa de puntos: la aritmética, los lotes y la decisión sobre una factura.
//
// TODO LO QUE SE PRUEBA AQUÍ ES DINERO. Un punto de más o de menos por factura, multiplicado por
// los clientes de un año, es una cuenta que nadie va a cuadrar después. Y los dos casos de la
// evidencia real —32,30 € y 56,20 €— están tal cual llegaron del TPV.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  centimos, aEuros, importePagado, puntosDe, reglaVigente, idReward, rewardDe,
  lotesVivos, saldo, planConsumo, planCaducidad, caducaEn, evaluarFactura, rewardsAplicados,
  clasificarDevolucion, claveMov, rewardVigente, textoGracia,
  PUNTO_TIPOS, MOTIVOS, INTERRUPTORES, GRACIA_DEFECTO, GRACIA_MAX,
} from "../../src/modules/fidelizacion/puntos.js";

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const AHORA = "2026-09-14T12:00:00.000Z";
const LLORET = "La Tapeta - Lloret";
const TORDERA = "La Tapa Ibérica - Tordera";

/** La regla acordada: 1 punto/€, 100 puntos = 5 €, mínimo 30 €, 6 meses, un reward por factura. */
const REGLA = Object.freeze({
  id: 1, version: 1, ambito: "global", local: null, activa: true,
  puntos_por_euro: 1, redondeo: "floor", puntos_necesarios: 100, descuento_euros: 5,
  consumo_minimo: 30, caducidad_meses: 6, max_rewards_factura: 1,
  vigente_desde: "2026-01-01T00:00:00Z", vigente_hasta: null,
  // Generado al PUBLICAR y nunca recalculado. Es lo que permite que una factura que vuelve
  // encuentre SU versión, aunque entretanto se haya publicado otra.
  reward_id: "fid:AAAABBBBCCCCDDDD", gracia_minutos: 180,
});

const TODO = { sombra: true, conceder: true, ofrecer: true, consumir: true };
const APAGADO = { sombra: true, conceder: false, ofrecer: false, consumir: false };

/** Una factura con la forma real: el importe cobrado vive en `Payments[].Amount`. */
const factura = (amount, { reward = null, socios = 1, tip = 0, cambio = 0 } = {}) => ({
  DocumentType: "StandardInvoice",
  Payments: [{ Amount: amount, PaidAmount: amount + cambio, ChangeAmount: cambio, Tip: tip }],
  InvoiceItems: [{ Lines: Array.from({ length: socios }, (_, i) => ({
    Index: i + 1, TotalAmount: amount,
    LoyaltyProgram: { MemberId: `TOK-${i}`, Rewards: reward && i === 0 ? [reward] : [] } })) }],
});

const extracto = (n = 1) => ({ globalId: "G-1", miembros: Array.from({ length: n }, (_, i) => ({ member: `TOK-${i}` })) });

describe("el importe pagado sale de Payments[].Amount", () => {
  test("los dos casos reales, al céntimo", () => {
    assert.equal(importePagado(factura(32.30)).amount, 3230);
    assert.equal(importePagado(factura(56.20)).amount, 5620);
  });

  test("NO se resta ChangeAmount: Amount ya es lo cobrado", () => {
    // Restarlo otra vez quitaría el cambio dos veces en cuanto alguien pague con un billete.
    const f = { Payments: [{ Amount: 30, PaidAmount: 50, ChangeAmount: 20 }] };
    assert.equal(importePagado(f).amount, 3000);
    assert.equal(importePagado(f).cambio, 2000, "el cambio se registra, pero no se resta");
  });

  test("NO se suma Tip: se registra para mirarlo, y nada más", () => {
    const f = factura(30, { tip: 3 });
    assert.equal(importePagado(f).amount, 3000, "la propina ha dado puntos");
    assert.equal(importePagado(f).propina, 300, "la propina ni se registra");
  });

  test("varios pagos se suman", () => {
    const f = { Payments: [{ Amount: 10 }, { Amount: 20.5 }, { Amount: 1.75 }] };
    assert.equal(importePagado(f).amount, 3225);
  });

  test("sin pagos, cero; y lo que no es un número tampoco cuenta", () => {
    assert.equal(importePagado({}).amount, 0);
    assert.equal(importePagado({ Payments: "no soy un array" }).amount, 0);
    assert.equal(importePagado({ Payments: [{ Amount: {} }, { Amount: null }, { Amount: "x" }] }).amount, 0);
  });

  test("los céntimos no arrastran errores de coma flotante", () => {
    // `0.1 + 0.2` no es `0.3`, y aquí un céntimo es un punto que se da o no se da.
    assert.equal(centimos(0.1) + centimos(0.2), centimos(0.3));
    assert.equal(importePagado({ Payments: [{ Amount: 0.1 }, { Amount: 0.2 }] }).amount, 30);
    assert.equal(aEuros(5620), 56.2);
  });
});

describe("los puntos: floor por factura", () => {
  test("32,30 € → 32 puntos", () => assert.equal(puntosDe(3230, REGLA), 32));
  test("56,20 € → 56 puntos", () => assert.equal(puntosDe(5620, REGLA), 56));
  test("25,00 € → 25 puntos", () => assert.equal(puntosDe(2500, REGLA), 25));
  test("0,99 € → 0 puntos", () => assert.equal(puntosDe(99, REGLA), 0));
  test("0 € → 0 puntos, pero la factura sigue siendo una visita", () => assert.equal(puntosDe(0, REGLA), 0));

  test("el ratio sale de la REGLA, no del código", () => {
    assert.equal(puntosDe(3230, { ...REGLA, puntos_por_euro: 2 }), 64);
    assert.equal(puntosDe(3230, { ...REGLA, puntos_por_euro: 0.5 }), 16);
  });

  test("un redondeo que no esté acordado no da puntos, no los inventa", () => {
    // Dejar puesto `ceil` o `round` sin haberlo decidido cambiaría lo que gana cada cliente.
    for (const r of ["ceil", "round", "banker", null, ""]) {
      assert.equal(puntosDe(3230, { ...REGLA, redondeo: r }), 0, String(r));
    }
  });

  test("una regla rota no concede nada", () => {
    for (const p of [0, -1, null, "x", undefined]) {
      assert.equal(puntosDe(3230, { ...REGLA, puntos_por_euro: p }), 0, String(p));
    }
  });
});

describe("qué regla manda", () => {
  const global1 = { ...REGLA, id: 1, ambito: "global", local: null, version: 1 };
  const global2 = { ...REGLA, id: 2, ambito: "global", local: null, version: 2, puntos_por_euro: 2 };
  const lloret = { ...REGLA, id: 3, ambito: "local", local: LLORET, version: 1, puntos_por_euro: 3 };

  test("la del LOCAL gana a la global", () => {
    assert.equal(reglaVigente([global1, global2, lloret], { local: LLORET, ahora: AHORA }).id, 3);
  });

  test("un local sin regla propia usa la global más nueva", () => {
    assert.equal(reglaVigente([global1, global2, lloret], { local: TORDERA, ahora: AHORA }).id, 2);
  });

  test("la regla de otro local NO se aplica aquí", () => {
    assert.equal(reglaVigente([lloret], { local: TORDERA, ahora: AHORA }), null);
  });

  test("desactivada o fuera de vigencia no manda", () => {
    assert.equal(reglaVigente([{ ...global1, activa: false }], { local: LLORET, ahora: AHORA }), null);
    assert.equal(reglaVigente([{ ...global1, vigente_desde: "2099-01-01" }], { local: LLORET, ahora: AHORA }), null);
    assert.equal(reglaVigente([{ ...global1, vigente_hasta: "2020-01-01" }], { local: LLORET, ahora: AHORA }), null);
  });

  test("sin ninguna regla, no hay programa", () => {
    assert.equal(reglaVigente([], { local: LLORET, ahora: AHORA }), null);
    assert.equal(reglaVigente(null, { local: LLORET, ahora: AHORA }), null);
  });
});

describe("el identificador del Reward es INMUTABLE, no se recalcula", () => {
  test("se lee de la versión, y nada más", () => {
    // Derivarlo de las condiciones tenía un fallo que solo se ve en barra: si entre ofrecer el
    // descuento y cerrar la factura se publica otra versión, el identificador dejaría de cuadrar y
    // rechazaríamos en caja un descuento que acabábamos de ofrecer.
    assert.equal(idReward(REGLA), "fid:AAAABBBBCCCCDDDD");
    assert.equal(idReward({ ...REGLA, descuento_euros: 99, version: 7, local: TORDERA }),
      "fid:AAAABBBBCCCCDDDD", "cambiar las condiciones cambia el identificador");
  });

  test("una versión sin reward_id no puede ofrecer nada", () => {
    assert.equal(idReward({ ...REGLA, reward_id: null }), null);
    assert.equal(rewardDe({ ...REGLA, reward_id: null }, LLORET), null);
    assert.equal(idReward(null), null);
  });

  test("el Reward que ve el camarero dice el mínimo", () => {
    const r = rewardDe(REGLA, LLORET);
    assert.equal(r.Type, "CashDiscount");
    assert.equal(r.Value, 5);
    assert.match(r.Description, /30 € o más antes del descuento/);
    assert.match(r.Description, /100 puntos/);
    assert.equal(r.Id, REGLA.reward_id);
  });
});

describe("la gracia NO ofrece nada nuevo: solo deja terminar lo ofrecido", () => {
  test("publicada una versión, la validación de un cliente nuevo ya no ve la anterior", () => {
    // `reglaVigente` descarta lo que tenga `vigente_hasta` pasado, con gracia o sin ella. La
    // gracia vive en `rewardVigente`, que es otra pregunta y solo se hace al CERRAR una factura.
    const A = "2026-09-14T12:00:00.000Z";
    const vieja = { ...REGLA, id: 1, version: 1, vigente_hasta: "2026-09-14T11:40:00.000Z", gracia_minutos: 180 };
    const nueva = { ...REGLA, id: 2, version: 2, vigente_desde: "2026-09-14T11:40:00.000Z",
                    vigente_hasta: null, puntos_necesarios: 300, reward_id: "fid:NUEVA" };
    const r = reglaVigente([vieja, nueva], { local: LLORET, ahora: A });
    assert.equal(r.id, 2, "se sigue ofreciendo la versión sustituida");
    assert.equal(r.reward_id, "fid:NUEVA");
    // Y la vieja SÍ sigue valiendo para cerrar un ticket ya abierto.
    assert.equal(rewardVigente(vieja, { ahora: A }).ok, true);
  });

  test("sin ninguna versión vigente no se ofrece nada, aunque haya gracia", () => {
    const A = "2026-09-14T12:00:00.000Z";
    const vieja = { ...REGLA, vigente_hasta: "2026-09-14T11:40:00.000Z", gracia_minutos: 180 };
    assert.equal(reglaVigente([vieja], { local: LLORET, ahora: A }), null);
    assert.equal(rewardVigente(vieja, { ahora: A }).ok, true, "y aun así se puede cerrar lo ofrecido");
  });
});

describe("una versión sustituida entre la validación y el cierre", () => {
  const A = "2026-09-14T12:00:00.000Z";
  const vigente = { ...REGLA, vigente_hasta: null };
  const sustituida = (min) => ({ ...REGLA, vigente_hasta: "2026-09-14T11:40:00.000Z", gracia_minutos: min });

  test("mientras su versión está vigente, vale", () => {
    assert.deepEqual(rewardVigente(vigente, { ahora: A }), { ok: true, motivo: null });
  });

  test("sin gracia configurada se usan los 180 minutos propuestos", () => {
    // `null` es «no se configuró», no «cero». Por eso se distingue: un `||` los confundiría y una
    // versión antigua sin el campo dejaría de tener margen sin que nadie lo decidiera.
    assert.equal(GRACIA_DEFECTO, 180);
    const r = rewardVigente(sustituida(null), { ahora: A });
    assert.equal(r.ok, true);
    assert.equal(r.motivo, "en_gracia");
    assert.equal(rewardVigente(sustituida(undefined), { ahora: A }).ok, true);
  });

  test("GRACIA 0 es estricto: al instante deja de valer", () => {
    assert.equal(rewardVigente(sustituida(0), { ahora: A }).ok, false);
    assert.equal(rewardVigente(sustituida(0), { ahora: A }).motivo, "reward_caducado");
  });

  test("sustituida y DENTRO de la gracia: vale, y se sabe que fue por la gracia", () => {
    // Sustituida a las 11:40, son las 12:00: han pasado 20 minutos.
    const r = rewardVigente(sustituida(30), { ahora: A });
    assert.equal(r.ok, true);
    assert.equal(r.motivo, "en_gracia");
    assert.equal(r.limite, "2026-09-14T12:10:00.000Z");
  });

  test("sustituida y FUERA de la gracia: no vale", () => {
    assert.equal(rewardVigente(sustituida(15), { ahora: A }).ok, false);
  });

  test("EL SEGUNDO ANTERIOR a los 180 minutos vale; el instante exacto NO", () => {
    // Sustituida a las 12:00 en punto, con 180 minutos: el límite son las 15:00.
    const sust = { ...REGLA, vigente_hasta: "2026-09-14T12:00:00.000Z", gracia_minutos: 180 };
    assert.equal(rewardVigente(sust, { ahora: "2026-09-14T14:59:59.999Z" }).ok, true, "el último instante no vale");
    assert.equal(rewardVigente(sust, { ahora: "2026-09-14T15:00:00.000Z" }).ok, false, "el minuto exacto sigue valiendo");
    assert.equal(rewardVigente(sust, { ahora: "2026-09-14T15:00:00.001Z" }).ok, false);
  });

  test("los límites del rango: 0 y 720", () => {
    assert.equal(GRACIA_MAX, 720);
    const sust = (m) => ({ ...REGLA, vigente_hasta: "2026-09-14T12:00:00.000Z", gracia_minutos: m });
    // Con 720 (doce horas), a las 23:59 todavía vale y a las 00:00 ya no.
    assert.equal(rewardVigente(sust(720), { ahora: "2026-09-14T23:59:59.999Z" }).ok, true);
    assert.equal(rewardVigente(sust(720), { ahora: "2026-09-15T00:00:00.000Z" }).ok, false);
  });

  test("la frase que se le enseña a quien publica", () => {
    assert.equal(textoGracia(180), "Los descuentos ya mostrados en tickets abiertos podrán utilizarse durante 3 horas.");
    assert.equal(textoGracia(60), "Los descuentos ya mostrados en tickets abiertos podrán utilizarse durante 1 hora.");
    assert.equal(textoGracia(90), "Los descuentos ya mostrados en tickets abiertos podrán utilizarse durante 1 h 30 min.");
    assert.equal(textoGracia(45), "Los descuentos ya mostrados en tickets abiertos podrán utilizarse durante 45 minutos.");
    assert.match(textoGracia(0), /dejarán de poder utilizarse al instante/);
  });

  test("DESACTIVAR una regla corta al momento, sin gracia ninguna", () => {
    // Desactivar es el gesto de emergencia: si se descubre que un descuento está mal, no puede
    // seguir aplicándose media hora más.
    const r = rewardVigente({ ...REGLA, activa: false, gracia_minutos: 600 }, { ahora: A });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "reward_revocado");
  });

  test("una versión que todavía no ha empezado no vale", () => {
    assert.equal(rewardVigente({ ...REGLA, vigente_desde: "2099-01-01" }, { ahora: A }).ok, false);
  });

  test("y un reward_id que no existe tampoco", () => {
    assert.equal(rewardVigente(null, { ahora: A }).ok, false);
    assert.equal(rewardVigente(null, { ahora: A }).motivo, "reward_no_reconocido");
  });
});

describe("los lotes, la caducidad y el FIFO", () => {
  const lote = (id, u, caduca) => ({ id, punto_tipo: "ganados", unidades: u, caduca_en: caduca,
                                     creado_en: caduca, local: LLORET, lote_id: null });
  const gasto = (id, u, loteId) => ({ id, punto_tipo: "consumidos", unidades: u, lote_id: loteId });

  test("caducan a los 6 meses EXACTOS", () => {
    assert.equal(caducaEn("2026-09-14T12:00:00.000Z", 6), "2027-03-14T12:00:00.000Z");
    assert.equal(caducaEn("2026-01-31T10:00:00.000Z", 6), "2026-07-31T10:00:00.000Z");
  });

  test("y el 31 de agosto no se adelanta tres días", () => {
    // 31 de agosto + 6 meses en aritmética ingenua da el 3 de marzo: el cliente perdería sus
    // puntos antes de tiempo. Se va al último día del mes destino.
    assert.equal(caducaEn("2026-08-31T12:00:00.000Z", 6), "2027-02-28T12:00:00.000Z");
  });

  test("el día exacto de caducidad YA no cuenta", () => {
    const movs = [lote(1, 100, "2026-09-14T12:00:00.000Z")];
    assert.equal(saldo(movs, { ahora: "2026-09-14T11:59:59.999Z" }).disponible, 100);
    assert.equal(saldo(movs, { ahora: AHORA }).disponible, 0, "sigue contando el día que caduca");
  });

  test("el saldo es la suma de lo que queda vivo", () => {
    const movs = [lote(1, 100, "2027-01-01"), lote(2, 50, "2027-02-01"), gasto(3, -30, 1)];
    assert.equal(saldo(movs, { ahora: AHORA }).disponible, 120);
  });

  test("lo caducado se enseña aparte, no desaparece", () => {
    const movs = [lote(1, 100, "2026-01-01"), lote(2, 50, "2027-02-01")];
    const s = saldo(movs, { ahora: AHORA });
    assert.equal(s.disponible, 50);
    assert.equal(s.caducado_sin_anotar, 100);
    assert.equal(s.proxima_caducidad, "2027-02-01");
  });

  test("FIFO: se gasta antes lo que antes caduca", () => {
    const movs = [lote(1, 60, "2027-03-01"), lote(2, 60, "2027-01-01"), lote(3, 60, "2027-02-01")];
    const plan = planConsumo(movs, 100, { ahora: AHORA });
    assert.ok(plan.ok);
    assert.deepEqual(plan.pasos.map((p) => p.lote_id), [2, 3], "no se ha gastado el que antes caduca");
    assert.deepEqual(plan.pasos.map((p) => p.unidades), [-60, -40]);
  });

  test("a igualdad de fecha, el lote más antiguo primero", () => {
    const movs = [lote(5, 60, "2027-01-01"), lote(2, 60, "2027-01-01")];
    assert.deepEqual(planConsumo(movs, 70, { ahora: AHORA }).pasos.map((p) => p.lote_id), [2, 5]);
  });

  test("NO se consume a medias: o llega, o no se toca nada", () => {
    // Un canje parcial dejaría al cliente sin puntos y sin descuento, la peor de las dos.
    const plan = planConsumo([lote(1, 99, "2027-01-01")], 100, { ahora: AHORA });
    assert.equal(plan.ok, false);
    assert.equal(plan.falta, 1);
    assert.deepEqual(plan.pasos, []);
  });

  test("un lote caducado no se puede gastar", () => {
    assert.equal(planConsumo([lote(1, 500, "2026-01-01")], 100, { ahora: AHORA }).ok, false);
  });

  test("lo caducado sin anotar sale en su propio plan", () => {
    const movs = [lote(1, 100, "2026-01-01"), lote(2, 30, "2026-02-01"), lote(3, 10, "2027-01-01")];
    const plan = planCaducidad(movs, { ahora: AHORA });
    assert.deepEqual(plan.map((p) => [p.lote_id, p.unidades]), [[1, -100], [2, -30]]);
  });

  test("una devolución puede dejar el saldo en negativo, y se ve", () => {
    // Está aceptado: si el cliente gastó puntos y luego se le devolvió la compra, los puntos que
    // ganó se revierten aunque ya no los tenga. El saldo negativo es la verdad, no un error.
    const movs = [lote(1, 100, "2027-01-01"), { id: 2, punto_tipo: "revertidos", unidades: -100, lote_id: 1 }];
    assert.equal(saldo(movs, { ahora: AHORA }).disponible, 0);
    assert.equal(lotesVivos(movs, { ahora: AHORA }).length, 0);
  });

  test("los cinco tipos de movimiento están declarados", () => {
    assert.deepEqual([...PUNTO_TIPOS], ["ganados", "consumidos", "caducados", "revertidos", "ajuste"]);
  });
});

describe("la decisión sobre una factura", () => {
  // `reglaReward` es la versión HISTÓRICA, la que se buscó por `reward_id`. Por defecto, la misma.
  const ev = (json, extra = {}) => evaluarFactura({
    json, extracto: extra.extracto || extracto(1), regla: "regla" in extra ? extra.regla : REGLA,
    reglaReward: "reglaReward" in extra ? extra.reglaReward : REGLA,
    local: LLORET, interruptores: extra.sw || TODO, saldoDisponible: extra.saldo ?? 0, ahora: AHORA });

  const REWARD = { Id: REGLA.reward_id, Type: "CashDiscount", Value: 5 };

  test("32,30 € sin descuento → aceptar, 32 puntos", () => {
    const d = ev(factura(32.30));
    assert.equal(d.accion, "aceptar");
    assert.equal(d.puntos, 32);
    assert.equal(d.consumo, null);
    assert.equal(d.visitas, 1);
  });

  test("30 € con el descuento de 5 € → mínimo válido, paga 25, gana 25", () => {
    // El caso que dio la regla: 30 − 5 = 25 pagados, y 25 + 5 = 30 cumple el mínimo.
    const d = ev(factura(25, { reward: REWARD }), { saldo: 100 });
    assert.equal(d.accion, "aceptar");
    assert.equal(d.importe_antes_reward, 3000);
    assert.equal(d.consumo.puntos, 100);
    assert.equal(d.puntos, 25, "no se conceden sobre el importe de antes del descuento");
  });

  test("29,99 € antes del descuento → RECHAZO", () => {
    const d = ev(factura(24.99, { reward: REWARD }), { saldo: 100 });
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "minimo_no_alcanzado");
    assert.equal(d.importe_antes_reward, 2999);
    assert.match(d.razon, /30 € o más/);
  });

  test("saldo 99 con el descuento aplicado → RECHAZO", () => {
    const d = ev(factura(25, { reward: REWARD }), { saldo: 99 });
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "saldo_insuficiente");
  });

  test("saldo 100 → se puede", () => {
    assert.equal(ev(factura(25, { reward: REWARD }), { saldo: 100 }).accion, "aceptar");
  });

  test("saldo 199 → un solo descuento, consume 100 y quedan 99", () => {
    const d = ev(factura(25, { reward: REWARD }), { saldo: 199 });
    assert.equal(d.consumo.puntos, 100);
  });

  test("DOS descuentos en la misma factura → RECHAZO", () => {
    const f = factura(25, { reward: REWARD });
    f.InvoiceItems[0].Lines[0].LoyaltyProgram.Rewards.push({ ...REWARD });
    const d = ev(f, { saldo: 500 });
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "varios_rewards");
  });

  test("un reward_id que no se encuentra → RECHAZO", () => {
    // La búsqueda la hace la base por `reward_id`. Si no aparece —inventado, o de una versión que
    // ya no vale— aquí llega `reglaReward: null`.
    const d = ev(factura(25, { reward: { ...REWARD, Id: "inventado" } }), { saldo: 500, reglaReward: null });
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "reward_no_reconocido");
  });

  test("un Reward de la regla de OTRO LOCAL → RECHAZO", () => {
    const deOtro = { ...REGLA, ambito: "local", local: TORDERA };
    const d = ev(factura(40, { reward: REWARD }), { saldo: 500, reglaReward: deOtro });
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "reward_de_otro_local");
  });

  test("un Type manipulado → RECHAZO", () => {
    for (const t of ["DiscountRate", "Offer", "NamedDiscount", "", null]) {
      const d = ev(factura(40, { reward: { ...REWARD, Type: t } }), { saldo: 500 });
      assert.equal(d.accion, "rechazar", String(t));
      assert.equal(d.motivo, "reward_tipo_distinto");
    }
  });

  test("un Value manipulado se IGNORA: el descuento sale de la versión guardada", () => {
    // Si el importe saliera de la factura, bastaría con mandar `Value: 500` para descontar 500 €.
    const d = ev(factura(25, { reward: { ...REWARD, Value: 500, Name: "Gratis total" } }), { saldo: 100 });
    assert.equal(d.accion, "aceptar");
    assert.equal(d.consumo.valor_centimos, 500, "el descuento ha salido del Value recibido");
    assert.equal(d.importe_antes_reward, 3000);
  });

  test("las condiciones salen de la VERSIÓN HISTÓRICA, no de la vigente hoy", () => {
    // El cliente vio «100 puntos = 5 €, mínimo 30 €». Mientras tenía el ticket abierto se publicó
    // una versión más cara. Su descuento tiene que seguir costándole lo que se le dijo.
    const vieja = { ...REGLA, id: 1, version: 1, puntos_necesarios: 100, descuento_euros: 5, consumo_minimo: 30 };
    const nueva = { ...REGLA, id: 2, version: 2, puntos_necesarios: 300, descuento_euros: 3, consumo_minimo: 50 };
    const d = ev(factura(25, { reward: REWARD }), { saldo: 150, regla: nueva, reglaReward: vieja });
    assert.equal(d.accion, "aceptar", "se ha rechazado un descuento que ofrecimos nosotros");
    assert.equal(d.consumo.puntos, 100, "le cobran los puntos de la versión nueva");
    assert.equal(d.consumo.valor_centimos, 500);
    assert.equal(d.consumo.regla_version, 1, "el consumo no guarda la versión con la que se ofreció");
    // Y los puntos NUEVOS sí se conceden con la regla vigente hoy: son de esta compra.
    assert.equal(d.regla_version, 2);
  });

  test("sin regla vigente y con descuento aplicado → RECHAZO", () => {
    const d = ev(factura(25, { reward: REWARD }), { saldo: 500, regla: null });
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "sin_regla_vigente");
  });

  test("una factura de 0 € con carné SIGUE siendo una visita", () => {
    const d = ev(factura(0));
    assert.equal(d.accion, "aceptar");
    assert.equal(d.puntos, 0);
    assert.equal(d.visitas, 1);
  });

  test("con «conceder» apagado se acepta y no se da ni un punto", () => {
    const d = ev(factura(32.30), { sw: { ...TODO, conceder: false } });
    assert.equal(d.accion, "aceptar");
    assert.equal(d.puntos, 0);
    assert.equal(d.motivo, MOTIVOS.APAGADO);
  });

  test("con «consumir» apagado, una factura con descuento se RECHAZA", () => {
    // Aceptarla regalaría los 5 €: el descuento ya está aplicado y no se consumirían puntos.
    const d = ev(factura(25, { reward: REWARD }), { saldo: 500, sw: APAGADO });
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "consumir_apagado");
  });

  test("sin regla y sin descuento se acepta, sin puntos", () => {
    const d = ev(factura(32.30), { regla: null });
    assert.equal(d.accion, "aceptar");
    assert.equal(d.puntos, 0);
    assert.equal(d.motivo, MOTIVOS.SIN_REGLA);
  });
});

describe("varios socios en una factura", () => {
  const ev = (json, n, saldoD = 500) => evaluarFactura({
    json, extracto: extracto(n), regla: REGLA, reglaReward: REGLA, local: LLORET,
    interruptores: TODO, saldoDisponible: saldoD, ahora: AHORA });
  const REWARD = { Id: REGLA.reward_id, Type: "CashDiscount", Value: 5 };

  test("SIN descuento: se acepta, se cuentan las visitas y NO se dan puntos", () => {
    const d = ev(factura(50, { socios: 2 }), 2);
    assert.equal(d.accion, "revisar");
    assert.equal(d.motivo, MOTIVOS.VARIOS_SOCIOS);
    assert.equal(d.puntos, 0);
    assert.equal(d.consumo, null);
    assert.equal(d.visitas, 2);
  });

  test("CON descuento: se RECHAZA, que es lo único que no regala 5 €", () => {
    // Ágora ya aplicó el descuento. Aceptar sin consumir puntos lo regala, y no se puede consumir
    // porque no sabemos de cuál de los dos socios. El camarero quita el descuento o desasocia a
    // uno: dos gestos de un segundo, frente a 5 € perdidos en cada factura.
    const d = ev(factura(45, { socios: 2, reward: REWARD }), 2);
    assert.equal(d.accion, "rechazar");
    assert.equal(d.motivo, "varios_socios_con_reward");
    assert.match(d.razon, /solo puede haber un socio/);
  });
});

describe("devoluciones: por DocumentType, nunca por el signo", () => {
  test("una factura con importes negativos NO es una devolución", () => {
    // Un abono, una corrección o una invitación pueden traer líneas negativas. Tratarlas como
    // devolución revertiría puntos que el cliente ganó de verdad.
    const f = { DocumentType: "StandardInvoice", Payments: [{ Amount: -30 }] };
    assert.equal(clasificarDevolucion(f, { original: null }).es, false);
  });

  test("total cuando se devuelve exactamente lo pagado", () => {
    const f = { DocumentType: "StandardRefund", RelatedInvoice: { Serie: "A", Number: 10 },
                Payments: [{ Amount: -30 }] };
    const d = clasificarDevolucion(f, { original: { importe_centimos: 3000 } });
    assert.equal(d.clase, "total");
    assert.equal(d.centimos, 3000);
  });

  test("parcial cuando no coincide, y queda pendiente de mirar", () => {
    const f = { DocumentType: "BasicRefund", RelatedInvoice: { Serie: "A", Number: 10 },
                Payments: [{ Amount: -10 }] };
    const d = clasificarDevolucion(f, { original: { importe_centimos: 3000 } });
    assert.equal(d.clase, "parcial");
    assert.equal(d.motivo, MOTIVOS.DEVOLUCION_PARCIAL);
  });

  test("sin original identificable, tampoco se toca nada", () => {
    const sinRel = { DocumentType: "StandardRefund", Payments: [{ Amount: -30 }] };
    assert.equal(clasificarDevolucion(sinRel, { original: null }).clase, "sin_original");
    const conRel = { DocumentType: "StandardRefund", RelatedInvoice: { Serie: "A", Number: 10 },
                     Payments: [{ Amount: -30 }] };
    assert.equal(clasificarDevolucion(conRel, { original: null }).clase, "sin_original");
  });
});

describe("las claves de idempotencia", () => {
  test("llevan el local dentro: dos locales no se pisan", () => {
    assert.notEqual(claveMov("fid:v1", LLORET, "gana", "G-1", "1"),
                    claveMov("fid:v1", TORDERA, "gana", "G-1", "1"));
  });

  test("la misma factura produce la MISMA clave: un reenvío no da puntos dos veces", () => {
    assert.equal(claveMov("fid:v1", LLORET, "gana", "G-1", "1"),
                 claveMov("fid:v1", LLORET, "gana", "G-1", "1"));
  });

  test("ganar y consumir en la misma factura son claves distintas", () => {
    assert.notEqual(claveMov("fid:v1", LLORET, "gana", "G-1", "1"),
                    claveMov("fid:v1", LLORET, "consume", "G-1", "1"));
  });
});

describe("los cuatro interruptores", () => {
  test("son los acordados, y están congelados", () => {
    assert.deepEqual([...INTERRUPTORES], ["sombra", "conceder", "ofrecer", "consumir"]);
    assert.throws(() => { INTERRUPTORES.push("x"); }, TypeError);
  });
});

describe("de aquí no sale nada del cliente", () => {
  test("la decisión NO lleva MemberId, teléfono ni el cuerpo", () => {
    const f = factura(32.30);
    f.Customer = { Name: "Marta Puig", Phone: "600111222" };
    const d = evaluarFactura({ json: f, extracto: extracto(1), regla: REGLA, reglaReward: REGLA,
      local: LLORET, interruptores: TODO, saldoDisponible: 0, ahora: AHORA });
    const txt = JSON.stringify(d);
    for (const secreto of ["Marta", "600111222", "TOK-0", "Customer"]) {
      assert.ok(!txt.includes(secreto), `se ha filtrado «${secreto}»`);
    }
  });

  test("los Rewards se buscan donde la guía los pone, dentro de LoyaltyProgram", () => {
    assert.equal(rewardsAplicados(factura(25, { reward: { Id: "x" } })).length, 1);
    assert.equal(rewardsAplicados({ Rewards: [{ Id: "fuera" }] }).length, 0, "se leen Rewards de cualquier sitio");
  });
});
