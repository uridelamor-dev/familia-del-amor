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

/** ¿Este tipo necesita un `Code` de Ágora? */
export const exigeCodigo = (tipo) => !!TIPOS[tipo]?.codigo;

// ── EL CÓDIGO DE LA PROMOCIÓN EN ÁGORA ───────────────────────────────────────────────────────
//
// LA REGLA, ESCRITA UNA VEZ PARA QUE NADIE LA CAMBIE POR DESCUIDO:
//
//   1. Se recortan los espacios de los EXTREMOS. Nada más.
//   2. NO se cambia nada de dentro. Ni a mayúsculas, ni quitando acentos, ni sustituyendo
//      guiones. Un código válido se guarda EXACTAMENTE como se escribió.
//   3. Lo que no encaje en el alfabeto se RECHAZA con un motivo, no se arregla en silencio.
//
// El punto 2 es el importante y va contra el instinto. Lo natural sería «normalizar» a mayúsculas,
// y sería un error: Ágora compara el `Code` tal cual, así que convertir `esmorzar_girona` en
// `ESMORZAR_GIRONA` puede dejar de coincidir con lo que hay creado allí. Y cuando no coincide,
// ÁGORA IGNORA EL PREMIO EN SILENCIO: el cliente se queda sin su desayuno y nadie se entera. Un
// código mal escrito tiene que dar un error en la cara de quien lo escribe, no una promoción que
// parece publicada y no hace nada.
//
// El alfabeto son letras ASCII, dígitos y `_ - .`, que es lo que admite un identificador de
// promoción de Ágora. Un espacio INTERIOR se rechaza aparte porque es el error de dedo más común
// —pegar el código con un espacio de más en medio— y merece decirlo con esas palabras.

export const CODIGO_AGORA_MAX = 60;
const CODIGO_AGORA_RE = /^[A-Za-z0-9_.-]+$/;

/** Los espacios de los extremos, incluidos los raros que se pegan desde una hoja de cálculo. */
const ESPACIOS = /^[\s\u00a0\u200b\ufeff]+|[\s\u00a0\u200b\ufeff]+$/g;

/**
 * Recorta y comprueba. NUNCA transforma un código válido.
 *
 * @returns {{ok: boolean, codigo: string, motivo: string|null}}
 */
export function normalizarCodigoAgora(crudo) {
  const codigo = String(crudo ?? "").replace(ESPACIOS, "");
  if (!codigo) return { ok: false, codigo: "", motivo: "vacio" };
  if (codigo.length > CODIGO_AGORA_MAX) return { ok: false, codigo, motivo: "demasiado_largo" };
  if (/[\s\u00a0]/.test(codigo)) return { ok: false, codigo, motivo: "espacios_interiores" };
  if (!CODIGO_AGORA_RE.test(codigo)) return { ok: false, codigo, motivo: "caracter_no_valido" };
  return { ok: true, codigo, motivo: null };
}

/** Por qué no vale, en la frase que se le enseña a quien lo está escribiendo. */
export const CODIGO_AGORA_ERROR = Object.freeze({
  vacio: "Escribe el código de la promoción tal y como está creada en Ágora.",
  demasiado_largo: `El código no puede pasar de ${CODIGO_AGORA_MAX} caracteres.`,
  espacios_interiores: "El código no puede llevar espacios. Comprueba que no se ha colado uno al pegarlo.",
  caracter_no_valido: "El código solo puede llevar letras sin acentos, números, guiones, guiones bajos y puntos.",
});

// ── UNA PROMOCIÓN DE ÁGORA SIN DERECHO SE LA LLEVA TODO EL LOCAL ─────────────────────────────
//
// Es el descuido caro de esta pantalla, y no avisa de nada: se publica `ESMORZAR_GIRONA` sin
// marcar la casilla, y a partir de ese momento CUALQUIER socio que enseñe su carné en Girona se
// lleva el desayuno gratis. No hay error, no hay aviso, y se descubre cuadrando el mes.
//
// Por eso el valor SEGURO por defecto de un `Offer` es EXIGIR DERECHO, y ofrecerlo a todos es lo
// que hay que pedir a propósito, por escrito y con el local y el código delante.
//
// ⚠️ Esto SOLO afecta a lo que se publica de ahora en adelante. Lo ya publicado conserva su valor
// tal cual: ninguna migración toca una fila existente.

/** Lo que hay que teclear para publicar una promoción de Ágora abierta a todo el local. */
export const CONFIRMACION_GENERAL = "OFRECER A TODOS";

export function confirmacionGeneralValida(texto) {
  return String(texto || "").trim().toUpperCase().replace(/\s+/g, " ") === CONFIRMACION_GENERAL;
}

/**
 * ¿Hay que escribir la confirmación para publicar ESTA promoción?
 *
 * Solo al PUBLICAR, solo si el premio es un `Offer` —los descuentos en euros no se «regalan a
 * todos»: se pagan con puntos— y solo si no exige derecho individual.
 *
 * Un borrador no la pide: guardar un borrador no ofrece nada a nadie, y pedirla ahí convertiría la
 * confirmación en un trámite que se teclea sin leer.
 */
export function exigeConfirmacionGeneral(promo, { publicar = false } = {}) {
  return !!publicar && exigeCodigo(promo?.tipo) && !promo?.requiere_derecho;
}

/**
 * El valor con el que nace la casilla en el panel.
 *
 * SIN base —una promoción nueva— manda el tipo: un `Offer` nace exigiendo derecho.
 * CON base —editando o copiando una versión— manda LO GUARDADO, siempre. Cambiarlo por detrás al
 * abrir la ventana sería exactamente el «cambio silencioso» que no puede pasar.
 */
export function derechoPorDefecto(tipo, base = null) {
  if (base && typeof base === "object" && "requiere_derecho" in base) return !!base.requiere_derecho;
  return exigeCodigo(tipo);
}

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
export function elegible(promo, { ahora, local, usos = 0, usosTotales = 0, saldo = 0,
                                  importeCentimos = null, derechos = 0 }) {
  const v = vigente(promo, { ahora, local });
  if (!v.ok) return v;

  // ── ¿ESTA PROMOCIÓN ES PARA TODOS O SOLO PARA QUIEN SE LA GANÓ? ────────────────────────────
  //
  // Por defecto, NO: una promoción publicada se le ofrece a cualquier socio del local que cumpla
  // el resto. Es lo que había y lo que sigue valiendo para las promociones de siempre.
  //
  // Con `requiere_derecho`, en cambio, hay que habérsela concedido a ESA cuenta —apuntándose a un
  // formulario, hoy—. Sin eso, el desayuno de una campaña de captación se lo llevaría también
  // quien nunca se apuntó, que es justo lo contrario de para qué se hizo la campaña.
  if (promo.requiere_derecho && !(Number(derechos) > 0)) {
    return { ok: false, motivo: "sin_derecho" };
  }

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
  if (t.codigo) {
    // ÚLTIMO CANDADO. El `Code` sale de la FILA GUARDADA, nunca de la petición, y si lo que hay
    // guardado no es un código válido NO se manda un `Offer` a medias: Ágora lo ignoraría en
    // silencio y el camarero creería haber aplicado un premio que no existe. Preferimos no
    // ofrecer nada, que es visible, a ofrecer algo que no se puede cobrar.
    const c = normalizarCodigoAgora(promo.codigo_agora);
    if (!c.ok) return null;
    r.Code = c.codigo;
  }
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
    const c = normalizarCodigoAgora(promo?.codigo_agora);
    if (!c.ok) {
      falta.push(c.motivo === "vacio"
        ? "Falta el código de la promoción en Ágora. No se puede inventar: tiene que existir allí."
        : CODIGO_AGORA_ERROR[c.motivo]);
    } else if (!promo?.codigo_comprobado_en) {
      falta.push("El código de Ágora no se ha comprobado. Ágora ignora en silencio un Offer cuyo código no exista.");
    }
  } else if (String(promo?.codigo_agora || "").trim()) {
    // Un código guardado en un tipo que no lo usa no se manda a ninguna parte, y verlo en la ficha
    // hace creer que sí. Se dice, en vez de borrarlo por detrás.
    falta.push("Este tipo de premio no lleva código de Ágora. Bórralo o cambia el tipo a «Oferta de Ágora».");
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

// ── EL DIAGNÓSTICO, REQUISITO A REQUISITO ────────────────────────────────────────────────────
//
// `elegible()` contesta SÍ o NO y se para en el primer motivo. Es lo correcto en la barra —con el
// cliente delante solo importa si se lo lleva— y es exactamente lo que NO sirve para configurar.
//
// EL FALLO QUE ESTO ARREGLA: una promoción con `requiere_derecho` devolvía `sin_derecho` en el
// primer `return`, y el simulador pintaba esa misma frase en las cinco líneas —saldo, mínimo,
// unidades, cuenta y la cuenta elegible—. Parecía que todo fallaba por lo mismo y no se podía ver
// si el resto estaba bien configurado.
//
// Aquí se comprueba CADA requisito por su cuenta y se devuelven todos, con su respuesta real. Son
// independientes entre sí: que falte el derecho no impide saber si el saldo llega o si quedan
// unidades. Lo único que de verdad NO se puede evaluar es la compra mínima cuando todavía no hay
// importe —al ofrecer el premio la cuenta está abierta—, y eso se dice con esas palabras en vez de
// inventar un resultado.

/** Los tres estados de una línea del diagnóstico. */
export const CUMPLE = Object.freeze({ OK: "ok", FALLA: "falla", NO_EVALUADO: "no_evaluado" });

/**
 * Todos los requisitos, cada uno con SU resultado.
 *
 * @returns {{ok: boolean, motivo: string|null, requisitos: Array}}
 */
export function diagnosticar(promo, ctx = {}) {
  const { ahora, local, usos = 0, usosTotales = 0, saldo = 0,
          importeCentimos = null, derechos = 0 } = ctx;
  const linea = (id, texto, estado, detalle) => ({ id, texto, estado, detalle,
    ok: estado === CUMPLE.OK });
  const req = [];

  // 1 · Vigencia: estado, local, fechas, días y horas. Van juntas porque `vigente()` es una sola
  //     pregunta —«¿está viva aquí y ahora?»— y su motivo ya dice cuál de las cinco ha fallado.
  const v = vigente(promo, { ahora, local });
  req.push(linea("vigencia", "Está viva en este local y en este momento",
    v.ok ? CUMPLE.OK : CUMPLE.FALLA,
    v.ok ? `${v.madrid.fecha} a las ${v.madrid.hora} (hora de Madrid)` : EXPLICACION[v.motivo] || v.motivo));

  // 2 · El derecho individual. Solo se enseña si la promoción lo exige: en una general, una línea
  //     que siempre sale en verde es ruido.
  if (promo?.requiere_derecho) {
    const tiene = Number(derechos) > 0;
    req.push(linea("derecho", "La cuenta se ha ganado esta promoción",
      tiene ? CUMPLE.OK : CUMPLE.FALLA,
      tiene ? `${derechos} derecho(s) concedido(s)` : "no se apuntó a ningún formulario vinculado"));
  }

  // 3 · Usos de ESTA cuenta.
  const porCuenta = Number(promo?.limite_cuenta);
  const hayTope = Number.isFinite(porCuenta) && porCuenta > 0;
  req.push(linea("usos_cuenta", "A la cuenta le quedan usos",
    !hayTope || usos < porCuenta ? CUMPLE.OK : CUMPLE.FALLA,
    hayTope ? `${usos} de ${porCuenta} usada(s)` : `${usos} usada(s), sin límite por cuenta`));

  // 4 · Unidades de la promoción entera.
  const total = Number(promo?.limite_total);
  const hayTotal = Number.isFinite(total) && total > 0;
  req.push(linea("unidades", "Quedan unidades de la promoción",
    !hayTotal || usosTotales < total ? CUMPLE.OK : CUMPLE.FALLA,
    hayTotal ? `${usosTotales} de ${total} repartida(s)` : `${usosTotales} repartida(s), sin tope total`));

  // 5 · Puntos, solo si cuesta puntos.
  const coste = Number(promo?.coste_puntos) || 0;
  if (coste > 0) {
    req.push(linea("puntos", "La cuenta tiene puntos suficientes",
      Number(saldo) >= coste ? CUMPLE.OK : CUMPLE.FALLA,
      `${Number(saldo) || 0} de ${coste} punto(s)`));
  }

  // 6 · Compra mínima. LA ÚNICA que puede quedar sin evaluar: al ofrecer el premio la cuenta está
  //     abierta y todavía no hay importe. Se comprueba de verdad al cerrar la factura.
  const minimo = Number(promo?.compra_minima) || 0;
  if (minimo > 0) {
    const cent = Math.round(minimo * 100);
    req.push(importeCentimos === null || importeCentimos === undefined
      ? linea("compra_minima", "La cuenta llega a la compra mínima", CUMPLE.NO_EVALUADO,
          `no evaluado: al ofrecer el premio todavía no hay importe. Se comprueba al cerrar la factura (mínimo ${minimo} €)`)
      : linea("compra_minima", "La cuenta llega a la compra mínima",
          Number(importeCentimos) >= cent ? CUMPLE.OK : CUMPLE.FALLA,
          `${(Number(importeCentimos) / 100).toFixed(2)} € de ${minimo.toFixed(2)} €`));
  }

  // El veredicto lo sigue dando `elegible`: es el que usa la barra, y el simulador no puede
  // contestar una cosa distinta de la que pasará de verdad.
  const r = elegible(promo, ctx);
  return { ok: r.ok, motivo: r.motivo, requisitos: req };
}

/**
 * EL SIMULADOR. Qué le pasaría a una cuenta concreta, requisito a requisito.
 *
 * Cada escenario dice QUÉ CAMBIA respecto de la cuenta que sí se lo lleva. Sin eso, un escenario
 * que mueve el reloj a propósito —«así se vería fuera de fechas»— se lee como un veredicto sobre
 * hoy: alguien simula el 16 de septiembre, ve «todavía no ha empezado» y da por hecho que su
 * promoción no ha arrancado, cuando lo que estaba mirando era la prueba de otra fecha.
 */
export function simularPromo(promo, escenarios) {
  return (escenarios || []).map((e) => {
    const d = diagnosticar(promo, e);
    return {
      nombre: e.nombre,
      cambia: e.cambia || null,
      ok: d.ok,
      motivo: d.motivo,
      requisitos: d.requisitos,
      texto: d.ok
        ? `${e.nombre}: SÍ se lo lleva.`
        : `${e.nombre}: no — ${EXPLICACION[d.motivo] || d.motivo}.`,
    };
  });
}

/** El aviso de una promoción abierta a todo el local. Una frase, un sitio. */
export const AVISO_GENERAL = "Se ofrece a cualquier socio elegible del local";

/** ¿Es una promoción de Ágora abierta a todos? Es lo que enseña el aviso en el listado. */
export const esGeneral = (promo) => exigeCodigo(promo?.tipo) && !promo?.requiere_derecho;

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
  sin_derecho: "esta promoción es solo para quien se apuntó, y esta cuenta no lo hizo",
  agotada: "se han agotado las unidades",
  puntos_insuficientes: "no tiene puntos suficientes",
  compra_minima: "la cuenta no llega a la compra mínima",
  fecha_no_valida: "la fecha no es válida",
});

// ── CUÁL DE TODOS, CUANDO HAY VARIOS ─────────────────────────────────────────────────────────
//
// ── ¿POR QUÉ UNO SOLO? ───────────────────────────────────────────────────────────────────────
//
// Porque no hay evidencia de que Ágora sepa enseñarle varios al camarero para que elija. Lo único
// que el proyecto tiene documentado de la guía es la forma de la respuesta —`Rewards` es una
// lista— y en Fase 1 iba siempre VACÍA. Ninguna factura real capturada trae un premio aplicado.
//
// Y hay un hecho que sí conocemos: nuestro propio cierre RECHAZA una factura con más de un premio
// aplicado (`varios_rewards`). Mandar dos y que el camarero aplicara los dos sería una factura que
// no se puede cerrar, en hora punta.
//
// Así que se manda UNO, y entonces cuál se manda importa mucho.
//
// ── EL ORDEN, Y POR QUÉ ESTE ─────────────────────────────────────────────────────────────────
//
//   1. PROMOCIÓN CON DERECHO INDIVIDUAL. Alguien se apuntó a una campaña y se le prometió un
//      desayuno. Es lo más concreto que hay y es una promesa hecha a una persona.
//   2. PROMOCIÓN GENERAL DE ÁGORA. La casa la ofrece a todo el que pase.
//   3. DESCUENTO POR PUNTOS. Es lo más sustituible: los puntos no caducan hoy y siguen ahí mañana.
//
// ESTO INVIERTE LO QUE HABÍA. Antes ganaba el descuento por puntos, y eso impedía a alguien usar
// el desayuno que se había ganado: venía a por su esmorzar, tenía saldo suficiente, y la barra le
// ofrecía otra cosa. El derecho concedido es el que se pierde si no se usa; los puntos, no.
//
// Dentro del mismo nivel manda `prioridad` y, empatados, LA QUE ANTES CADUCA — que es la que se
// pierde si no se usa hoy. Y si todo empata, la clave y la versión, para que la elección no
// dependa NUNCA del orden en que la base devolvió las filas.

/** Los tres niveles. Cuanto más bajo, antes se ofrece. */
export const NIVEL = Object.freeze({ CON_DERECHO: 0, GENERAL: 1, PUNTOS: 2 });

/** En qué nivel juega una promoción. Los puntos no pasan por aquí: son el nivel 2 por definición. */
export const nivelDe = (promo) => (promo && promo.requiere_derecho ? NIVEL.CON_DERECHO : NIVEL.GENERAL);

/** `hasta` como número comparable. Sin fecha de final = no caduca = la última en desempatar. */
const caduca = (p) => {
  const h = String(p?.hasta || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : "9999-12-31";
};

/**
 * El orden entre dos promociones candidatas. TOTAL y DETERMINISTA: nunca devuelve 0 para dos
 * filas distintas, así que dos promociones idénticas en todo lo demás se ordenan igual siempre.
 */
export function compararPromos(a, b) {
  const n = nivelDe(a) - nivelDe(b);
  if (n) return n;
  const p = (Number(b?.prioridad) || 0) - (Number(a?.prioridad) || 0);   // mayor prioridad, antes
  if (p) return p;
  const c = caduca(a).localeCompare(caduca(b));                          // la que antes caduca
  if (c) return c;
  const k = String(a?.clave || "").localeCompare(String(b?.clave || ""));
  if (k) return k;
  return (Number(b?.version) || 0) - (Number(a?.version) || 0);          // la versión más nueva
}

/**
 * La que se ofrece, de entre las que YA se ha comprobado que son elegibles.
 *
 * No filtra nada: filtrar es de `elegible()`, que necesita la base para contar usos y derechos.
 * Aquí solo se elige, y se elige siempre igual.
 */
export function elegirPromo(candidatas) {
  const lista = (candidatas || []).filter(Boolean);
  if (!lista.length) return null;
  return [...lista].sort(compararPromos)[0];
}

/**
 * ¿Gana la promoción al descuento por puntos?
 *
 * Sí siempre que haya una promoción elegible: los dos niveles de promoción van por delante del 2.
 * Está escrito como función para que el servidor no tenga que recordar la regla, y para que el
 * test que la blinda apunte a un sitio.
 */
export const ganaLaPromo = (promo) => !!promo && nivelDe(promo) < NIVEL.PUNTOS;
