// Promociones y premios de Ágora. PURO: sin BD, sin Express, sin red.
//
// ── ESTO NO ES `pro_promociones`, Y NO SE MEZCLAN ────────────────────────────────────────────
//
// `pro_promociones` / `pro_canjes` son los cupones de la casa: un QR que el camarero escanea en la
// tablet y se marca como usado. Viven en su propio libro inmutable y funcionan.
//
// Esto es otra cosa: un `Reward` que le mandamos a ÁGORA para que lo aplique en el TPV, dentro de
// la factura. Ni comparten tabla, ni límite, ni contador. Juntarlos permitiría gastar dos veces el
// mismo beneficio —una en la tablet y otra en la caja— y nadie lo vería hasta cuadrar el mes.
//
// ── LOS OCHO TIPOS ───────────────────────────────────────────────────────────────────────────
//
// Cuatro son tipos de `Reward` de la guía; los otros cuatro son formas NUESTRAS de decidir quién
// se lo lleva, y acaban traduciéndose a uno de los cuatro al mandarlo.
//
// ⚠️ SOLO `CashDiscount` ESTÁ PROBADO CONTRA UN TPV REAL. Los demás se pueden configurar y quedan
// en borrador, pero publicar uno exige marcar que se ha comprobado en Ágora: la guía dice que si
// el `Code` de un `Offer` no existe allí, Ágora IGNORA el premio en silencio — el cliente se
// quedaría sin su desayuno y nosotros sin enterarnos.

/** Los tipos de `Reward` que define la guía. `Code` solo lo lleva `Offer`. */
export const TIPOS_REWARD = Object.freeze(["CashDiscount", "DiscountRate", "NamedDiscount", "Offer"]);

/** Qué puede configurarse, y a qué `Reward` se traduce cada cosa. */
export const TIPOS = Object.freeze({
  descuento_euros:   { reward: "CashDiscount",  valor: "euros",    codigo: false, probado: true },
  descuento_pct:     { reward: "DiscountRate",  valor: "porciento", codigo: false, probado: false },
  descuento_nombre:  { reward: "NamedDiscount", valor: "euros",    codigo: false, probado: false },
  oferta_agora:      { reward: "Offer",         valor: "ninguno",  codigo: true,  probado: false },
  producto_gratis:   { reward: "Offer",         valor: "ninguno",  codigo: true,  probado: false },
  campana_unica:     { reward: "Offer",         valor: "ninguno",  codigo: true,  probado: false },
  premio_puntos:     { reward: "CashDiscount",  valor: "euros",    codigo: false, probado: true },
  premio_campana:    { reward: "Offer",         valor: "ninguno",  codigo: true,  probado: false },
});

export const ESTADOS = Object.freeze(["borrador", "publicada", "pausada", "finalizada"]);

/** Solo una publicada y dentro de su ventana se ofrece. Un borrador no existe para nadie. */
export const estaPublicada = (p) => !!p && p.estado === "publicada";

// ── El tiempo, en hora de Madrid ─────────────────────────────────────────────────────────────

/**
 * Fecha, hora y día de la semana en Madrid.
 *
 * NO se usa la hora del servidor ni UTC. Una campaña «solo el 1 de octubre» empieza a las 00:00 de
 * Madrid, y en UTC eso son las 22:00 del día 30: con la hora equivocada, el desayuno se podría
 * pedir la noche anterior y no el propio día a última hora.
 */
export function enMadrid(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const fecha = `${p.year}-${p.month}-${p.day}`;
  const hora = `${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
  // El día de la semana, también en Madrid: 0 = domingo, como en JavaScript.
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return { fecha, hora, dia };
}

/**
 * ¿Está esta promoción disponible AHORA y AQUÍ?
 *
 * Devuelve siempre un motivo cuando no: es lo que se enseña en el simulador y lo que explica a un
 * camarero por qué un cliente no ve su premio.
 */
export function vigente(promo, { ahora, local }) {
  if (!promo) return { ok: false, motivo: "no_existe" };
  if (!estaPublicada(promo)) return { ok: false, motivo: `estado_${promo.estado || "desconocido"}` };
  if (promo.local && String(promo.local) !== String(local)) return { ok: false, motivo: "otro_local" };

  const m = enMadrid(ahora);
  if (!m) return { ok: false, motivo: "fecha_no_valida" };

  if (promo.desde && m.fecha < String(promo.desde).slice(0, 10)) return { ok: false, motivo: "aun_no_empieza" };
  if (promo.hasta && m.fecha > String(promo.hasta).slice(0, 10)) return { ok: false, motivo: "ya_termino" };

  const dias = leerLista(promo.dias);
  if (dias.length && !dias.map(Number).includes(m.dia)) return { ok: false, motivo: "otro_dia" };

  if (promo.hora_desde && m.hora < String(promo.hora_desde).slice(0, 5)) return { ok: false, motivo: "aun_no_es_la_hora" };
  // `>=` en el final: a las 12:00 con final a las 12:00 ya ha terminado, como cualquier horario.
  if (promo.hora_hasta && m.hora >= String(promo.hora_hasta).slice(0, 5)) return { ok: false, motivo: "fuera_de_horario" };

  return { ok: true, motivo: null, madrid: m };
}

/** Una lista guardada como JSON, o ya como array. Nunca revienta por un texto mal guardado. */
export function leerLista(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || !v.trim()) return [];
  try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return []; }
}

/**
 * ¿Puede ESTA cuenta llevárselo?
 *
 * `usos` son los que ya tiene esta cuenta y `usosTotales` los de la promoción entera. Los dos
 * límites se comprueban aquí y OTRA VEZ dentro de la transacción al cerrar: entre que se ofrece y
 * se cierra pueden pasar veinte minutos y otra caja puede haberse llevado el último.
 */
export function elegible(promo, { ahora, local, usos = 0, usosTotales = 0, saldo = 0, importeCentimos = null }) {
  const v = vigente(promo, { ahora, local });
  if (!v.ok) return v;

  const porCuenta = Number(promo.limite_cuenta);
  if (Number.isFinite(porCuenta) && porCuenta > 0 && usos >= porCuenta) {
    return { ok: false, motivo: "ya_utilizada" };
  }
  const total = Number(promo.limite_total);
  if (Number.isFinite(total) && total > 0 && usosTotales >= total) {
    return { ok: false, motivo: "agotada" };
  }
  const coste = Number(promo.coste_puntos) || 0;
  if (coste > 0 && Number(saldo) < coste) return { ok: false, motivo: "puntos_insuficientes" };

  // La compra mínima solo se puede comprobar cuando hay importe: al ofrecer todavía no lo hay.
  const minimo = Number(promo.compra_minima) || 0;
  if (minimo > 0 && importeCentimos !== null && Number(importeCentimos) < Math.round(minimo * 100)) {
    return { ok: false, motivo: "compra_minima" };
  }
  return { ok: true, motivo: null };
}

/**
 * El `Reward` que se le manda a Ágora.
 *
 * El `Id` es el `reward_id` GUARDADO al publicar, nunca uno calculado: entre ofrecerlo y cerrar la
 * factura puede publicarse otra versión, y recalcularlo rechazaría en caja lo que acabamos de
 * ofrecer. `Code` solo va en los `Offer`, y es el que existe en Ágora — no se inventa.
 */
export function rewardDePromo(promo) {
  if (!promo || !promo.reward_id) return null;
  const t = TIPOS[promo.tipo];
  if (!t) return null;
  const r = {
    Id: String(promo.reward_id),
    Name: String(promo.texto_camarero || promo.nombre || "").slice(0, 120),
    Description: String(promo.texto_cliente || "").slice(0, 400),
    Type: t.reward,
  };
  if (t.valor === "euros") r.Value = Number(promo.valor);
  if (t.valor === "porciento") r.Value = Number(promo.valor);
  if (t.codigo) r.Code = String(promo.codigo_agora || "");
  return r;
}

/**
 * ¿SE PUEDE PUBLICAR? Lo que falta, en frases que dicen qué hacer.
 *
 * Aquí está el candado del `Offer`: la guía dice que si el `Code` no existe en Ágora como promoción
 * de «Sólo clientes y tickets seleccionados», ÁGORA IGNORA EL PREMIO EN SILENCIO. El cliente se
 * queda sin su desayuno y nosotros sin enterarnos. Por eso no basta con escribir un código: hay que
 * marcar que se ha comprobado allí, y esa comprobación la hace una persona porque la guía no
 * documenta ninguna forma de preguntárselo a Ágora.
 */
export function puedePublicar(promo, { grupos = {}, catalogo = null } = {}) {
  const falta = [];
  const t = TIPOS[promo?.tipo];
  if (!t) falta.push("El tipo de promoción no es válido.");
  if (!String(promo?.nombre || "").trim()) falta.push("Falta el nombre interno.");
  if (!String(promo?.texto_camarero || "").trim()) falta.push("Falta el texto que verá el camarero.");
  if (!String(promo?.texto_cliente || "").trim()) falta.push("Falta el texto que verá el cliente.");

  if (t && t.valor !== "ninguno") {
    const v = Number(promo?.valor);
    if (!Number.isFinite(v) || v <= 0) falta.push("Falta el valor del descuento.");
    if (t.valor === "porciento" && v > 100) falta.push("Un descuento porcentual no puede pasar del 100 %.");
  }
  if (t && t.codigo) {
    if (!String(promo?.codigo_agora || "").trim()) {
      falta.push("Falta el código de la promoción en Ágora. No se puede inventar: tiene que existir allí.");
    } else if (!promo?.codigo_comprobado_en) {
      falta.push("El código de Ágora no se ha comprobado. Ágora ignora en silencio un Offer cuyo código no exista.");
    }
  }
  if (!promo?.local) falta.push("Falta el local, o marcarla como global.");
  if (promo?.desde && promo?.hasta && String(promo.desde) > String(promo.hasta)) {
    falta.push("La fecha de inicio es posterior a la de final.");
  }

  // Los grupos de productos: si la promoción regala algo, tiene que saber QUÉ regala.
  const refs = leerLista(promo?.grupos);
  if (t && (promo?.tipo === "producto_gratis" || promo?.tipo === "campana_unica" || promo?.tipo === "premio_campana")) {
    if (!refs.length) falta.push("Falta elegir qué productos entran en el premio.");
    for (const g of refs) {
      const key = `${g.clave}:${g.version}`;
      const lista = grupos[key];
      if (!lista) falta.push(`El grupo «${g.clave}» (versión ${g.version}) no existe.`);
      else if (!lista.length) falta.push(`El grupo «${g.clave}» no tiene ningún producto.`);
    }
    if (catalogo !== null && catalogo === 0) {
      falta.push("El catálogo de este local no está sincronizado.");
    }
  }
  return { ok: falta.length === 0, falta };
}

/**
 * EL SIMULADOR. Qué le pasaría a una cuenta concreta, en frases.
 *
 * Los escenarios son los que se equivocan de verdad: una cuenta que no cumple, un premio ya usado,
 * un día que no toca, el local equivocado y un producto que no entra.
 */
export function simularPromo(promo, escenarios) {
  return (escenarios || []).map((e) => {
    const r = elegible(promo, e);
    return {
      nombre: e.nombre,
      ok: r.ok,
      motivo: r.motivo,
      texto: r.ok
        ? `${e.nombre}: SÍ se lo lleva.`
        : `${e.nombre}: no — ${EXPLICACION[r.motivo] || r.motivo}.`,
    };
  });
}

/** Por qué no, en castellano. Lo lee quien configura, no un programador. */
export const EXPLICACION = Object.freeze({
  no_existe: "esa promoción no existe",
  estado_borrador: "todavía es un borrador",
  estado_pausada: "está pausada",
  estado_finalizada: "ya ha terminado",
  otro_local: "es de otro local",
  aun_no_empieza: "todavía no ha empezado",
  ya_termino: "ya ha terminado",
  otro_dia: "hoy no es uno de sus días",
  aun_no_es_la_hora: "todavía no es la hora",
  fuera_de_horario: "ya ha pasado su horario",
  ya_utilizada: "esta cuenta ya se la ha llevado",
  agotada: "se han agotado las unidades",
  puntos_insuficientes: "no tiene puntos suficientes",
  compra_minima: "la cuenta no llega a la compra mínima",
  fecha_no_valida: "la fecha no es válida",
});
