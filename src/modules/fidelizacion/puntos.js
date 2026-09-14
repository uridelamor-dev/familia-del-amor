// El programa de puntos. PURO: sin BD, sin Express, sin red, sin reloj propio.
//
// AQUÍ VIVE TODO EL DINERO. Lo que se decide en este fichero es cuántos puntos gana un cliente,
// cuándo caducan y cuándo se le puede descontar 5 €. Por eso no hay ni un importe ni un porcentaje
// escrito en el código: TODO sale de una regla configurada desde el panel y versionada, y cada
// cálculo guarda con qué versión se hizo. Cambiar el programa mañana no puede reinterpretar lo que
// pasó ayer.
//
// ── EL IMPORTE PAGADO: `Σ Payments[].Amount`, y nada más ─────────────────────────────────────
//
// Sale de dos facturas reales, no de leer la guía:
//
//   normal      productos 32,30 · Amount 32,30 · PaidAmount 32,30 · ChangeAmount 0
//   con dto.    productos 61,20 · una línea 24×2 = 48 con CashDiscount 5 → TotalAmount 43
//               InvoiceItem.Discounts.CashDiscount 0 · Amount 56,20 · PaidAmount 56,20
//
// La segunda es la que lo demuestra: el descuento vivía en la LÍNEA, el agregado del comprobante
// venía a cero, y `Amount` ya traía los 56,20 cobrados. Por eso:
//
//   · NO se resta `ChangeAmount`. `Amount` ya es lo cobrado; restarlo otra vez quitaría el cambio
//     dos veces en cuanto alguien pague con un billete.
//   · NO se suma `Tip` aparte. No sabemos si está dentro de `Amount`, y sumarlo «por si acaso»
//     sería regalar puntos por una propina. Se REGISTRA la comparación para mirarla, y ya está.
//   · NO se usa el bruto de catálogo para el mínimo: llevaría dentro descuentos e invitaciones
//     que el cliente no ha pagado.
//
// ── EL MÍNIMO DE 30 € ────────────────────────────────────────────────────────────────────────
//
//   importe_antes_del_reward = importe_pagado + descuento_del_reward_aplicado
//
// Es la única forma de comprobarlo cuando el descuento YA está aplicado en la factura que llega:
// 30 € − 5 € = 25 € pagados, y 25 + 5 = 30, que cumple el mínimo. Mirar los 25 € lo rechazaría.
//
// ── CÉNTIMOS, NO EUROS ───────────────────────────────────────────────────────────────────────
//
// Todo se calcula en enteros. `0.1 + 0.2` no es `0.3`, y aquí un céntimo de más o de menos al
// redondear hacia abajo es un punto que se da o no se da.

/** La gracia propuesta: tres horas cubren una cena larga con sobremesa. Configurable por versión. */
export const GRACIA_DEFECTO = 180;
/** Doce horas. Más que eso, una versión seguiría aplicándose casi un día después de sustituirla. */
export const GRACIA_MAX = 720;

/** El único tipo de Reward que sabemos emitir y aplicar. Los otros tres de la guía —DiscountRate,
 *  NamedDiscount y Offer— no están implementados, y un Id nuestro con otro tipo se rechaza. */
export const TIPO_REWARD = "CashDiscount";

/** Los conceptos de punto. `concepto` sigue siendo 'puntos' en el libro; esto lo cualifica. */
export const PUNTO_TIPOS = Object.freeze(["ganados", "consumidos", "caducados", "revertidos", "ajuste"]);

/** Por qué una factura puede no dar puntos. Cada motivo se guarda; ninguno se inventa. */
export const MOTIVOS = Object.freeze({
  OK: null,
  SIN_PAGOS: "sin_pagos",
  SIN_REGLA: "sin_regla_vigente",
  VARIOS_SOCIOS: "varios_socios",
  DEVOLUCION_PARCIAL: "devolucion_parcial",
  DEVOLUCION_SIN_ORIGEN: "devolucion_sin_original",
  APAGADO: "conceder_apagado",
});

/** Los cuatro interruptores, por separado a propósito: se encienden de uno en uno. */
export const INTERRUPTORES = Object.freeze(["sombra", "conceder", "ofrecer", "consumir"]);

// ── Dinero ───────────────────────────────────────────────────────────────────────────────────

/** Euros → céntimos, como entero. Lo que no sea un número utilizable vale 0. */
export function centimos(v) {
  if (v === null || v === undefined || typeof v === "boolean") return 0;
  if (typeof v === "object") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export const aEuros = (c) => Math.round(Number(c) || 0) / 100;

/**
 * LO QUE SE HA PAGADO DE VERDAD, en céntimos: `Σ Payments[].Amount`.
 *
 * Devuelve además lo que hace falta para poder revisarlo luego sin volver a abrir el JSON: la
 * suma de `PaidAmount`, la de `ChangeAmount` y la de `Tip`, cada una por su lado. NO se usan para
 * calcular; están para que el día que sepamos qué es `Tip` se pueda mirar hacia atrás.
 */
export function importePagado(json) {
  const pagos = Array.isArray(json?.Payments) ? json.Payments : [];
  let amount = 0, paid = 0, cambio = 0, propina = 0;
  for (const p of pagos) {
    if (!p || typeof p !== "object") continue;
    amount += centimos(p.Amount);
    paid += centimos(p.PaidAmount);
    cambio += centimos(p.ChangeAmount);
    propina += centimos(p.Tip);
  }
  return { pagos: pagos.length, amount, paid, cambio, propina };
}

/**
 * Los puntos que da un importe. `floor` por factura, no por línea ni por euro suelto.
 *
 * 56,20 € con 1 punto/€ son 56 puntos, no 56,2 ni 57. El redondeo es un campo de la regla porque
 * algún día podría no ser `floor`, pero hoy solo se admite ese: inventar los otros sin haberlos
 * acordado sería dejar puesto un comportamiento que nadie ha decidido.
 */
export function puntosDe(centimosPagados, regla) {
  const c = Math.max(0, Math.round(Number(centimosPagados) || 0));
  const porEuro = Number(regla?.puntos_por_euro);
  if (!Number.isFinite(porEuro) || porEuro <= 0) return 0;
  if (regla?.redondeo !== "floor") return 0;
  return Math.floor((c * porEuro) / 100);
}

// ── Las reglas ───────────────────────────────────────────────────────────────────────────────

/**
 * Qué regla manda en este local y en este instante.
 *
 * LA DEL LOCAL GANA A LA GLOBAL, siempre. Y entre varias versiones del mismo ámbito gana la de
 * `version` más alta que esté vigente: las versiones son inmutables y se apilan, así que la más
 * nueva es la que se quiso poner.
 *
 * Una factura vieja NO se recalcula con esto: cada movimiento guarda la versión con la que se
 * hizo, y eso es lo que se mira después.
 */
export function reglaVigente(reglas, { local, ahora }) {
  const vale = (r) => {
    if (!r || !r.activa) return false;
    if (r.vigente_desde && String(r.vigente_desde) > String(ahora)) return false;
    if (r.vigente_hasta && String(r.vigente_hasta) <= String(ahora)) return false;
    if (r.ambito === "local") return String(r.local || "") === String(local || "");
    return r.ambito === "global";
  };
  const candidatas = (reglas || []).filter(vale);
  if (!candidatas.length) return null;
  const locales = candidatas.filter((r) => r.ambito === "local");
  const pila = locales.length ? locales : candidatas;
  return pila.slice().sort((a, b) => (b.version || 0) - (a.version || 0))[0];
}

/**
 * El identificador del Reward. SE LEE DE LA VERSIÓN; NO SE CALCULA.
 *
 * ── POR QUÉ NO SE DERIVA DE LAS CONDICIONES ─────────────────────────────────────────────────
 *
 * Antes se recalculaba a partir de la regla vigente y se comparaba. Tenía un fallo que solo se ve
 * en barra: entre que el camarero identifica al cliente y cierra la factura pueden pasar veinte
 * minutos, y en ese rato Dirección puede publicar otra versión. Al volver la factura, la regla
 * vigente ya sería otra, el identificador no cuadraría y RECHAZARÍAMOS EN CAJA UN DESCUENTO QUE
 * NOSOTROS MISMOS ACABÁBAMOS DE OFRECER, con el cliente delante.
 *
 * Guardándolo al publicar, la factura que vuelve encuentra SU versión —la que se le ofreció— con
 * SUS condiciones. Una versión nueva no reinterpreta un Reward anterior.
 */
export const idReward = (regla) => (regla && regla.reward_id ? String(regla.reward_id) : null);

/** Lo que ve el camarero. Dice el mínimo, porque es lo que le van a preguntar en la barra. */
export function rewardDe(regla, local) {
  if (!regla || !regla.reward_id) return null;
  const euros = Number(regla.descuento_euros);
  const minimo = Number(regla.consumo_minimo);
  return {
    Id: idReward(regla),
    Name: `${euros} € de descuento`,
    Description: `Canjea ${regla.puntos_necesarios} puntos por ${euros} € de descuento. `
      + `La factura debe ser de ${minimo} € o más antes del descuento.`,
    Type: TIPO_REWARD,
    Value: euros,
  };
}

// ── El libro de puntos ───────────────────────────────────────────────────────────────────────

/**
 * Lo que queda vivo de cada lote, en orden FIFO.
 *
 * UN LOTE ES UN MOVIMIENTO DE `ganados`, con su propia fecha de caducidad. Lo que se le ha ido
 * quitando —consumos, caducidad— y lo que se le ha devuelto son movimientos que apuntan a él por
 * `lote_id`. El restante es la suma, y por eso nunca hay un saldo que editar: se calcula.
 *
 * FIFO por `caduca_en` y, a igualdad, por `id`: se gasta antes lo que antes se pierde.
 */
export function lotesVivos(movimientos, { ahora }) {
  const lotes = new Map();
  for (const m of movimientos || []) {
    if (m.punto_tipo === "ganados") {
      lotes.set(m.id, { id: m.id, inicial: Number(m.unidades) || 0, restante: Number(m.unidades) || 0,
                        caduca_en: m.caduca_en || null, creado_en: m.creado_en, factura_id: m.factura_id ?? null,
                        local: m.local, regla_id: m.regla_id ?? null, regla_version: m.regla_version ?? null });
    }
  }
  for (const m of movimientos || []) {
    if (m.punto_tipo === "ganados") continue;
    if (m.lote_id == null) continue;
    const l = lotes.get(m.lote_id);
    if (l) l.restante += Number(m.unidades) || 0;
  }
  const vivos = [...lotes.values()].filter((l) => l.restante > 0);
  return vivos.sort((a, b) => {
    const ca = String(a.caduca_en || "9999"), cb = String(b.caduca_en || "9999");
    return ca === cb ? a.id - b.id : (ca < cb ? -1 : 1);
  });
}

/** Un lote está caducado cuando su fecha ya pasó. `<=` como en el resto de la casa. */
export const caducado = (lote, ahora) => !!lote.caduca_en && String(lote.caduca_en) <= String(ahora);

/**
 * El saldo, separado en lo que se puede gastar y lo que ya no.
 *
 * `disponible` es lo ÚNICO que cuenta para canjear: lotes vivos y no caducados. Lo caducado se
 * enseña aparte porque al cliente hay que poder decirle qué ha perdido y qué está a punto de
 * perder, no solo un número.
 */
export function saldo(movimientos, { ahora }) {
  const vivos = lotesVivos(movimientos, { ahora });
  const utiles = vivos.filter((l) => !caducado(l, ahora));
  const porCaducar = vivos.filter((l) => caducado(l, ahora));
  return {
    disponible: utiles.reduce((s, l) => s + l.restante, 0),
    caducado_sin_anotar: porCaducar.reduce((s, l) => s + l.restante, 0),
    lotes: utiles,
    lotes_caducados: porCaducar,
    proxima_caducidad: utiles.length ? utiles[0].caduca_en : null,
  };
}

/**
 * Qué lotes hay que tocar para gastar `cuantos` puntos, en FIFO.
 *
 * Devuelve `null` si no llega: NO se consume a medias. Un canje parcial dejaría al cliente sin
 * puntos y sin descuento, que es la peor de las dos posibilidades.
 */
export function planConsumo(movimientos, cuantos, { ahora }) {
  const n = Math.max(0, Math.round(Number(cuantos) || 0));
  if (!n) return { ok: true, pasos: [], total: 0 };
  const s = saldo(movimientos, { ahora });
  if (s.disponible < n) return { ok: false, falta: n - s.disponible, disponible: s.disponible, pasos: [] };

  const pasos = [];
  let queda = n;
  for (const l of s.lotes) {
    if (queda <= 0) break;
    const toma = Math.min(l.restante, queda);
    pasos.push({ lote_id: l.id, unidades: -toma, caduca_en: l.caduca_en });
    queda -= toma;
  }
  return { ok: true, pasos, total: n };
}

/** Los lotes que han caducado y todavía no se han anotado como tal. Se escriben al tocar la cuenta. */
export function planCaducidad(movimientos, { ahora }) {
  return lotesVivos(movimientos, { ahora })
    .filter((l) => caducado(l, ahora))
    .map((l) => ({ lote_id: l.id, unidades: -l.restante, caduca_en: l.caduca_en }));
}

/** Seis meses exactos desde la fecha de obtención. El día y la hora se conservan. */
export function caducaEn(iso, meses) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dia = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + (Number(meses) || 0));
  // 31 de agosto + 6 meses no es el 3 de marzo: si el mes destino no tiene ese día, se va al
  // último del mes. Sin esto, un cliente perdería sus puntos tres días antes de tiempo.
  if (d.getUTCDate() !== dia) d.setUTCDate(0);
  return d.toISOString();
}

// ── La decisión sobre una factura ────────────────────────────────────────────────────────────

/**
 * QUÉ HACER CON UNA FACTURA. La máquina de estados, en un solo sitio y pura.
 *
 * Devuelve una de tres acciones:
 *
 *   aceptar   → se puede cerrar. Puede llevar puntos, consumo de reward, o ninguna de las dos.
 *   rechazar  → Ágora NO cierra la factura. Se reserva para lo que el camarero puede arreglar
 *               ahí mismo: quitar el descuento o desasociar a un socio.
 *   revisar   → se acepta y se cierra, pero no se toca ni un punto y queda marcada en el panel.
 *
 * LA REGLA PARA ELEGIR ENTRE «rechazar» Y «revisar»: rechazar bloquea la caja en hora punta, así
 * que solo se hace cuando aceptar REGALARÍA dinero. Si no hay dinero de por medio, se acepta y se
 * revisa con calma.
 */
export function evaluarFactura({ json, extracto, regla, reglaReward = null, local,
                                 interruptores, saldoDisponible, ahora }) {
  const pago = importePagado(json);
  const sw = interruptores || {};
  const miembros = extracto?.miembros || [];

  const base = {
    importe_pagado: pago.amount,
    pagos: pago,
    regla_id: regla?.id ?? null,
    regla_version: regla?.version ?? null,
  };

  // Los Rewards que Ágora dice haber aplicado.
  const aplicados = rewardsAplicados(json);

  // ── Rechazos: solo lo que el camarero puede arreglar en la barra ───────────────────────────
  if (aplicados.length > 1) {
    return { ...base, accion: "rechazar", motivo: "varios_rewards",
      razon: "Solo se puede aplicar un descuento de fidelización por factura." };
  }

  // VARIOS SOCIOS CON DESCUENTO: la única salida que no regala 5 €.
  //
  // Ágora ya ha aplicado el descuento a la factura. Si aceptamos sin consumir puntos —y no podemos
  // consumirlos, porque no sabemos de cuál de los dos socios— el descuento sale gratis. Aceptar y
  // «revisarlo luego» no lo arregla: el dinero ya se fue. El camarero quita el descuento o
  // desasocia a uno de los dos, que son dos gestos de un segundo.
  if (miembros.length > 1 && aplicados.length) {
    return { ...base, accion: "rechazar", motivo: "varios_socios_con_reward",
      razon: "Con descuento de fidelización solo puede haber un socio en la factura." };
  }

  // Sin descuento de por medio no hay nada que regalar: se cierra y se revisa.
  if (miembros.length > 1) {
    return { ...base, accion: "revisar", motivo: MOTIVOS.VARIOS_SOCIOS, puntos: 0, consumo: null,
      visitas: miembros.length };
  }

  // ── El reward, si viene ─────────────────────────────────────────────────────────────────────
  let consumo = null;
  if (aplicados.length === 1) {
    const r = aplicados[0];
    if (!sw.consumir) {
      return { ...base, accion: "rechazar", motivo: "consumir_apagado",
        razon: "Los descuentos de fidelización no están activos." };
    }
    if (!regla) {
      return { ...base, accion: "rechazar", motivo: "sin_regla_vigente",
        razon: "No hay ningún programa de puntos vigente en este local." };
    }
    // ── LO ÚNICO QUE SE MIRA DEL REWARD QUE LLEGA ES `Id` Y `Type` ────────────────────────────
    //
    // `Value`, `Name`, `Description` y cualquier otro campo los escribe el TPV y se IGNORAN por
    // completo. Si el descuento saliera de `r.Value`, bastaría con que una versión de Ágora mandara
    // otra cifra —o con que alguien la tocara— para que descontáramos lo que dijera la factura.
    //
    // `reglaReward` es LA VERSIÓN HISTÓRICA, buscada por `reward_id` en la base. Todas las
    // condiciones —puntos, descuento y mínimo— salen de ella y no de la regla vigente hoy: entre
    // ofrecer el descuento y cerrar la factura puede haberse publicado otra versión.
    if (!reglaReward) {
      return { ...base, accion: "rechazar", motivo: "reward_no_reconocido",
        razon: "Ese descuento ya no es válido. Quítalo y vuelve a intentarlo." };
    }
    // El ámbito tiene que cuadrar: un Reward de la regla de otro local no vale aquí, aunque el
    // identificador sea nuestro.
    if (reglaReward.ambito === "local" && String(reglaReward.local || "") !== String(local || "")) {
      return { ...base, accion: "rechazar", motivo: "reward_de_otro_local",
        razon: "Ese descuento es de otro local. Quítalo y vuelve a intentarlo." };
    }
    // El tipo tiene que ser el que emitimos. Es el único de los cuatro que sabemos aplicar, y un
    // `DiscountRate` con nuestro Id sería un porcentaje donde esperábamos euros.
    if (String(r.Type || "") !== TIPO_REWARD) {
      return { ...base, accion: "rechazar", motivo: "reward_tipo_distinto",
        razon: "Ese descuento no es del tipo esperado. Quítalo y vuelve a intentarlo." };
    }
    // DE LA VERSIÓN GUARDADA, no de `r.Value`.
    const valor = centimos(reglaReward.descuento_euros);
    const antes = pago.amount + valor;
    if (antes < centimos(reglaReward.consumo_minimo)) {
      return { ...base, accion: "rechazar", motivo: "minimo_no_alcanzado", importe_antes_reward: antes,
        razon: `La factura debe ser de ${Number(reglaReward.consumo_minimo)} € o más antes del descuento.` };
    }
    if (saldoDisponible < reglaReward.puntos_necesarios) {
      return { ...base, accion: "rechazar", motivo: "saldo_insuficiente", importe_antes_reward: antes,
        razon: "El socio ya no tiene puntos suficientes. Quita el descuento." };
    }
    consumo = { puntos: reglaReward.puntos_necesarios, reward_id: String(r.Id), valor_centimos: valor,
                importe_antes_reward: antes, regla_id: reglaReward.id, regla_version: reglaReward.version };
  }

  // ── Puntos ──────────────────────────────────────────────────────────────────────────────────
  // Una factura con carné SIEMPRE cuenta como visita, aunque sea de 0 €.
  const visitas = miembros.length;

  if (!regla) return { ...base, accion: "aceptar", motivo: MOTIVOS.SIN_REGLA, puntos: 0, consumo, visitas };
  if (!sw.conceder) return { ...base, accion: "aceptar", motivo: MOTIVOS.APAGADO, puntos: 0, consumo, visitas };

  const puntos = puntosDe(pago.amount, regla);
  return {
    ...base, accion: "aceptar", motivo: MOTIVOS.OK, puntos, consumo, visitas,
    caduca_en: caducaEn(ahora, regla.caducidad_meses),
    importe_antes_reward: consumo ? consumo.importe_antes_reward : pago.amount,
  };
}

/**
 * ¿Sigue valiendo un Reward emitido con una versión que ya ha sido sustituida?
 *
 * EL CASO: se identifica al cliente a las 21:10 y se le ofrece el descuento. A las 21:25 Dirección
 * publica una versión nueva. El ticket se cierra a las 21:40, y llega con el Reward de la anterior.
 *
 * Sin gracia habría que RECHAZAR EN CAJA UN DESCUENTO QUE ACABÁBAMOS DE OFRECER, con el cliente
 * delante. La gracia cuenta desde que la versión dejó de estar vigente —es decir, desde que entró
 * la nueva—, porque ese es el instante en que se abre el desfase.
 *
 * DOS COSAS QUE LA GRACIA NO HACE:
 *
 *   · No ofrece nada nuevo. `reglaVigente` ya descarta una versión con `vigente_hasta` pasado, así
 *     que un cliente que llegue después solo ve la nueva. Esto únicamente deja TERMINAR lo ofrecido.
 *   · No salva una regla DESACTIVADA a mano. Desactivar es el gesto de emergencia —se descubre que
 *     un descuento está mal— y tiene que cortar al momento, no tres horas después.
 *
 * El minuto exacto del límite ya NO vale: la comparación es estricta, como la caducidad de un lote.
 */
export function rewardVigente(reglaReward, { ahora }) {
  if (!reglaReward) return { ok: false, motivo: "reward_no_reconocido" };
  if (!reglaReward.activa) return { ok: false, motivo: "reward_revocado" };
  if (reglaReward.vigente_desde && String(reglaReward.vigente_desde) > String(ahora)) {
    return { ok: false, motivo: "reward_no_reconocido" };
  }
  const hasta = reglaReward.vigente_hasta;
  if (!hasta || String(hasta) > String(ahora)) return { ok: true, motivo: null };

  // `0` es estricto y se distingue de «sin configurar»: por eso `?? GRACIA_DEFECTO` y no `||`.
  const bruto = reglaReward.gracia_minutos;
  const gracia = Number(bruto === null || bruto === undefined ? GRACIA_DEFECTO : bruto);
  if (!Number.isFinite(gracia) || gracia <= 0) return { ok: false, motivo: "reward_caducado" };

  const limite = Date.parse(hasta) + gracia * 60000;
  const t = Date.parse(ahora);
  if (Number.isNaN(limite) || Number.isNaN(t)) return { ok: false, motivo: "reward_caducado" };
  // Estricto: en el minuto exacto ya no vale.
  if (t < limite) return { ok: true, motivo: "en_gracia", limite: new Date(limite).toISOString() };
  return { ok: false, motivo: "reward_caducado" };
}

/** Lo que se le dice a quien publica, en sus palabras. */
export function textoGracia(minutos) {
  const m = Number(minutos);
  if (!Number.isFinite(m) || m <= 0) {
    return "Los descuentos ya mostrados en tickets abiertos dejarán de poder utilizarse al instante.";
  }
  const h = Math.floor(m / 60), r = m % 60;
  const cuanto = h && r ? `${h} h ${r} min` : h ? `${h} ${h === 1 ? "hora" : "horas"}` : `${r} minutos`;
  return `Los descuentos ya mostrados en tickets abiertos podrán utilizarse durante ${cuanto}.`;
}

/** Los Rewards que Ágora dice haber aplicado. Se buscan donde la guía los pone: en las líneas. */
export function rewardsAplicados(json) {
  const out = [];
  const visto = new Set();
  const recorre = (v, d) => {
    if (!v || typeof v !== "object" || d > 12 || visto.has(v)) return;
    visto.add(v);
    if (Array.isArray(v)) { for (const x of v) recorre(x, d + 1); return; }
    const lp = v.LoyaltyProgram;
    if (lp && typeof lp === "object" && Array.isArray(lp.Rewards)) {
      for (const r of lp.Rewards) if (r && typeof r === "object") out.push(r);
    }
    for (const x of Object.values(v)) if (x && typeof x === "object") recorre(x, d + 1);
  };
  recorre(json, 0);
  return out;
}

// ── Devoluciones ─────────────────────────────────────────────────────────────────────────────

/** Los tipos de documento que la guía define como devolución. Nada de deducirlo por el signo. */
export const TIPOS_DEVOLUCION = Object.freeze(["BasicRefund", "StandardRefund"]);

/**
 * ¿Qué clase de devolución es?
 *
 * NO SE DEDUCE POR LOS IMPORTES NEGATIVOS. Una factura puede traer una línea negativa por mil
 * motivos —un abono, una corrección, una invitación— y tratarla como devolución revertiría puntos
 * que el cliente ganó de verdad.
 *
 * Solo se revierte sola la devolución TOTAL con el original identificado sin ambigüedad. Todo lo
 * demás se acepta y se marca: sin una devolución parcial real delante, cualquier reparto que
 * inventemos aquí sería adivinar con el saldo de un cliente.
 */
export function clasificarDevolucion(json, { original }) {
  const tipo = String(json?.DocumentType || "");
  if (!TIPOS_DEVOLUCION.includes(tipo)) return { es: false };

  const rel = json?.RelatedInvoice;
  const serie = rel && typeof rel === "object" ? rel.Serie ?? null : null;
  const numero = rel && typeof rel === "object" ? rel.Number ?? null : null;
  if (serie === null && numero === null) {
    return { es: true, clase: "sin_original", motivo: MOTIVOS.DEVOLUCION_SIN_ORIGEN };
  }
  if (!original) return { es: true, clase: "sin_original", motivo: MOTIVOS.DEVOLUCION_SIN_ORIGEN, serie, numero };

  // Total si se devuelve exactamente lo que se pagó. En céntimos y en valor absoluto: el signo del
  // documento de devolución no está garantizado por la guía.
  const dev = Math.abs(importePagado(json).amount);
  const ori = Math.abs(Number(original.importe_centimos) || 0);
  if (dev === ori && ori > 0) return { es: true, clase: "total", serie, numero, centimos: dev };
  return { es: true, clase: "parcial", serie, numero, centimos: dev, original_centimos: ori,
           motivo: MOTIVOS.DEVOLUCION_PARCIAL };
}

// ── Claves de idempotencia ───────────────────────────────────────────────────────────────────

/**
 * La clave de cada movimiento. Lleva el local dentro, como el resto de la casa.
 *
 * Un reenvío de la misma factura produce EXACTAMENTE las mismas claves, y el índice único de
 * `fid_movimientos` las rechaza. Por eso no hacen falta comprobaciones extra: la base es la que
 * garantiza que nadie cobre dos veces por el mismo documento.
 */
export const claveMov = (idemV, local, tipo, globalId, sufijo) =>
  `${idemV}:${localSlug(local)}:${tipo}:${globalId}:${sufijo}`;

/** El mismo slug que usa el resto de fidelización, repetido aquí para no acoplar los módulos. */
export function localSlug(local) {
  return String(local || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
