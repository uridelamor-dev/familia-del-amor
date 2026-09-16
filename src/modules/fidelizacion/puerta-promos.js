// LA PUERTA DE LAS PROMOCIONES DE ÁGORA. PURA: sin BD, sin Express, y sin imports.
//
// ── POR QUÉ ESTO EXISTE APARTE DE `puerta.js` ────────────────────────────────────────────────
//
// Hasta ahora había un solo cerrojo para todo, y colgaba del programa de puntos:
//
//     if (!out.conceder) { out.ofrecer = false; out.consumir = false; }
//
// Ese razonamiento es correcto para lo que se escribió: ofrecer un descuento que se PAGA CON
// PUNTOS sin estar dando puntos es prometer dinero que nadie está ganando.
//
// Pero una promoción de Ágora NO se paga con puntos. La casa regala un producto —un desayuno—
// porque alguien se apuntó a una campaña. No hay saldo, no hay lote, no hay caducidad de puntos y
// no hace falta ninguna regla publicada. Colgarla del programa de puntos obligaba a encender un
// programa entero, con sus seis requisitos y su modo sombra revisado, para poder regalar un café.
//
// ── LO QUE NO SE COMPARTE, Y ES A PROPÓSITO ──────────────────────────────────────────────────
//
// Ni un interruptor, ni una fila, ni un estado. `fid_conceder`, `fid_ofrecer`, `fid_consumir` y
// `fid_puerta` siguen siendo del programa de puntos y no se tocan desde aquí. Encender las
// promociones NO enciende los puntos, y encender los puntos NO enciende las promociones. Las dos
// cosas se prueban.
//
// El precio de separarlos es que hay dos sitios que mirar. La alternativa —un interruptor que
// hace dos cosas— es la que hace que alguien encienda lo que no quería.

/** Los cuatro estados. Congelados. No hay `sombra`: una promoción no se calcula, se da o no se da. */
export const ESTADOS = Object.freeze(["apagado", "listo_para_activar", "activo", "pausado"]);

/** Los dos interruptores. NO son los del programa de puntos y no se mezclan nunca. */
export const INTERRUPTORES = Object.freeze(["promociones_ofrecer", "promociones_consumir"]);

/**
 * APAGADOS DE FÁBRICA.
 *
 * Es el valor que se usa cuando no hay nada guardado Y cuando la lectura FALLA. Un fallo leyendo
 * la configuración tiene que cerrar el sistema, nunca abrirlo: si no sabemos si podemos regalar
 * un desayuno, la respuesta es que no.
 */
export const APAGADOS = Object.freeze({ promociones_ofrecer: false, promociones_consumir: false });

// ── LOS REQUISITOS ───────────────────────────────────────────────────────────────────────────
//
// Cada uno se comprueba EN EL SERVIDOR contra un hecho de la base, no contra una casilla que
// alguien marcó. `comprueba` recibe el contexto que arma el servidor y devuelve `true` o el texto
// que se enseña en pantalla — así que ese texto dice QUÉ HACER, no qué ha fallado.

export const REQUISITOS = Object.freeze([
  Object.freeze({
    id: "promo_publicada",
    texto: "Hay al menos una promoción de Ágora publicada y vigente",
    comprueba: (c) => (c.promosVigentes > 0)
      || "Ninguna promoción de Ágora está publicada y dentro de sus fechas. Publica una desde «Premios de fidelización».",
  }),
  Object.freeze({
    id: "promo_con_local",
    texto: "Esas promociones tienen local configurado",
    comprueba: (c) => (c.promosSinLocal === 0)
      || `${c.promosSinLocal} promoción(es) vigente(s) sin local. Una oferta de un local concreto no puede valer en todos.`,
  }),
  Object.freeze({
    id: "codigo_valido",
    texto: "Su código de Ágora es válido",
    comprueba: (c) => (c.promosCodigoInvalido === 0)
      || `${c.promosCodigoInvalido} promoción(es) con un código de Ágora que no se puede mandar.`,
  }),
  Object.freeze({
    id: "codigo_comprobado",
    texto: "Alguien ha comprobado que ese código existe en Ágora",
    comprueba: (c) => (c.promosSinComprobar === 0)
      || `${c.promosSinComprobar} promoción(es) con el código sin comprobar. Ágora ignora EN SILENCIO un Offer cuyo código no exista allí.`,
  }),
  Object.freeze({
    id: "derecho_concedible",
    texto: "Las promociones que exigen derecho tienen cómo concederlo",
    comprueba: (c) => (c.promosDerechoSinVia === 0)
      || `${c.promosDerechoSinVia} promoción(es) solo para quien se la gane, pero ningún formulario publicado la concede. Nadie podría llevársela.`,
  }),
  Object.freeze({
    id: "integracion_confirmada",
    texto: "La integración de esos locales está activa y con su Workplace confirmado",
    comprueba: (c) => (c.localesSinIntegracion === 0)
      || `${c.localesSinIntegracion} local(es) con promoción vigente y la integración sin confirmar. Un descuento es dinero: no se ofrece sin saber en qué caja está el token.`,
  }),
  Object.freeze({
    id: "sin_revisiones_promo",
    texto: "No hay revisiones técnicas de promociones sin resolver",
    comprueba: (c) => (c.revisionesPromo === 0)
      || `Hay ${c.revisionesPromo} revisión(es) de promociones sin resolver.`,
  }),
]);

/**
 * El estado de la puerta con su lista de comprobaciones.
 *
 * `estado` es lo GUARDADO; `puede_activar` es lo que dice el servidor AHORA. Se enseñan los dos:
 * una puerta abierta cuyos requisitos han dejado de cumplirse es exactamente el aviso que hay que
 * ver, y por eso no se cierra sola.
 */
export function evaluarPuerta(guardado, ctx) {
  const c = ctx || {};
  const requisitos = REQUISITOS.map((r) => {
    const v = r.comprueba(c);
    return { id: r.id, texto: r.texto, ok: v === true, motivo: v === true ? null : String(v) };
  });
  const pendientes = requisitos.filter((r) => !r.ok);
  // Un estado guardado que no reconocemos se trata como APAGADO. Es la lectura más cerrada, y la
  // correcta: un valor raro en la base no puede abrir nada.
  const estado = ESTADOS.includes(guardado?.estado) ? guardado.estado : "apagado";

  return {
    estado,
    requisitos,
    pendientes: pendientes.map((r) => r.motivo),
    puede_activar: pendientes.length === 0,
    incoherente: estado === "activo" && pendientes.length > 0,
    confirmado_por: guardado?.confirmado_por || null,
    confirmado_en: guardado?.confirmado_en || null,
    pausado_por: guardado?.pausado_por || null,
    pausado_en: guardado?.pausado_en || null,
    motivo_pausa: guardado?.motivo_pausa || null,
  };
}

/**
 * ¿Se puede pasar de un estado a otro?
 *
 * PAUSAR SIEMPRE SE PUEDE. Es el freno, y un freno que depende de que se cumplan requisitos no es
 * un freno. Reanudar sí los vuelve a exigir: si se pausó porque algo estaba mal, no se reanuda sin
 * comprobar que ya no lo está.
 */
export function puedeTransitar(desde, hacia, { puedeActivar = false } = {}) {
  if (!ESTADOS.includes(hacia)) return { ok: false, error: "Ese estado no existe" };
  if (desde === hacia) return { ok: false, error: "Ya está en ese estado" };

  if (hacia === "pausado") {
    if (desde !== "activo") return { ok: false, error: "Solo se puede pausar algo que esté activo" };
    return { ok: true };
  }
  if (hacia === "activo") {
    if (desde !== "listo_para_activar" && desde !== "pausado") {
      return { ok: false, error: "Antes hay que pasar por «listo para activar»" };
    }
    if (!puedeActivar) return { ok: false, error: "Todavía no se cumplen todos los requisitos" };
    return { ok: true };
  }
  if (hacia === "listo_para_activar") {
    if (!puedeActivar) return { ok: false, error: "Todavía no se cumplen todos los requisitos" };
    if (desde === "activo") return { ok: false, error: "Para eso hay que pausar primero" };
    return { ok: true };
  }
  // Volver a «apagado» siempre se puede desde cualquier sitio que no sea activo: es apagar.
  if (hacia === "apagado") {
    if (desde === "activo") return { ok: false, error: "Para eso hay que pausar primero" };
    return { ok: true };
  }
  return { ok: false, error: "Transición no permitida" };
}

/** La confirmación escrita. Distinta de la de puntos A PROPÓSITO: no se confunden ni de copiar. */
export const CONFIRMACION_EXIGIDA = "ACTIVAR PROMOCIONES";
export function confirmacionValida(texto) {
  // Se acepta con los espacios interiores que sean: lo que importa es que se haya escrito a mano.
  return String(texto || "").trim().toUpperCase().replace(/\s+/g, " ") === CONFIRMACION_EXIGIDA;
}

/**
 * ¿SE PUEDE MOVER ESTE INTERRUPTOR?
 *
 * APAGAR SIEMPRE SE PUEDE, pase lo que pase y esté como esté la puerta. Encender exige la puerta
 * abierta, y consumir exige además estar ofreciendo: consumir sin ofrecer significaría marcar como
 * gastado un premio que nunca enseñamos.
 */
export function puedeEncender(interruptor, valor, { estadoPuerta = "apagado", guardados = {} } = {}) {
  if (!INTERRUPTORES.includes(interruptor)) {
    return { ok: false, error: "Ese interruptor no existe" };
  }
  if (valor === false) return { ok: true };   // apagar, siempre

  if (estadoPuerta !== "activo") {
    return { ok: false,
      error: "Las promociones de Ágora no están puestas en producción. Actívalas primero desde «Promociones de Ágora»." };
  }
  if (interruptor === "promociones_consumir" && !guardados.promociones_ofrecer) {
    return { ok: false,
      error: "No se puede consumir una promoción que no se está ofreciendo. Enciende primero «ofrecer»." };
  }
  return { ok: true };
}

/**
 * EL CANDADO FINAL. Lo guardado es una intención; ESTO es lo que pasa de verdad.
 *
 * Se aplica en cada petición, encima de lo que haya en la configuración. Aunque alguien
 * consiguiera escribir `fid_promociones_ofrecer = 1` por cualquier vía —una migración, la consola
 * de la base, un despiste— aquí se vuelve a apagar si la puerta no está abierta.
 *
 * La puerta va la última porque es la que se mueve en caliente: pausar tiene que cortar al
 * instante, sin esperar a un despliegue.
 */
export function aplicarPuerta(guardados, estadoPuerta) {
  const out = { ...APAGADOS, ...(guardados || {}) };
  // Consumir sin ofrecer no es un estado válido en ningún caso.
  if (!out.promociones_ofrecer) out.promociones_consumir = false;
  if (estadoPuerta !== "activo") return { ...APAGADOS };
  return { promociones_ofrecer: !!out.promociones_ofrecer,
           promociones_consumir: !!out.promociones_consumir };
}
