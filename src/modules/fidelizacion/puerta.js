// LA PUERTA DE PUESTA EN PRODUCCIÓN. PURA: sin BD, sin Express, y sin imports.
//
// ── DOS CERROJOS DISTINTOS, Y NO SE CONFUNDEN ────────────────────────────────────────────────
//
//   NIVEL (preparacion.js)   ¿está el CÓDIGO terminado? Es una constante que se sube en un commit
//                            revisado. Hoy vale "sombra".
//   PUERTA (esto)            ¿está ESTE NEGOCIO listo para encenderlo? Se guarda en la base, la
//                            confirma Dirección por escrito y se puede pausar al instante.
//
// Hacen falta los dos. El nivel dice que el programa se puede encender en alguna parte; la puerta
// dice que en ESTA casa, con ESTAS reglas y ESTE local, ya se ha comprobado todo. Un despliegue
// nunca abre la puerta: se abre desde el panel, después, mirando la pantalla.
//
// ── POR QUÉ NO ES UN INTERRUPTOR MÁS ─────────────────────────────────────────────────────────
//
// Porque encenderlo empieza a mover dinero de clientes reales. Un interruptor se pulsa sin leer;
// esto obliga a tener delante una lista de requisitos comprobados EN EL SERVIDOR, a escribir una
// confirmación y a que quede firmado con nombre y fecha. Y si algo sale mal, `pausado` corta al
// instante sin perder lo que ya se concedió.

/** Los cinco estados. Congelados. */
export const ESTADOS = Object.freeze([
  "no_preparado",       // falta código: el NIVEL todavía no es "completo"
  "sombra",             // el código está, y solo se está midiendo
  "listo_para_activar", // todos los requisitos cumplidos, falta la confirmación de Dirección
  "activo",             // concediendo puntos y ofreciendo descuentos de verdad
  "pausado",            // se ha cortado a propósito; lo concedido se conserva
]);

/**
 * LOS REQUISITOS. Cada uno se comprueba EN EL SERVIDOR contra un hecho, no contra una casilla.
 *
 * `comprueba` recibe el contexto que arma el servidor leyendo la base. Devuelve `true`, o un texto
 * con lo que falta — ese texto es el que se enseña en la pantalla, así que dice qué hacer.
 */
export const REQUISITOS = Object.freeze([
  Object.freeze({
    id: "codigo_completo",
    texto: "El código del programa está terminado",
    comprueba: (c) => c.nivel === "completo" || "El nivel de lanzamiento sigue en «sombra». Se sube en un despliegue revisado.",
  }),
  Object.freeze({
    id: "devolucion_total",
    texto: "Una devolución total revierte los puntos",
    comprueba: (c) => c.devolucionTotal === true || "Todavía no está implementada la reversión de una devolución total.",
  }),
  Object.freeze({
    id: "regla_publicada",
    texto: "Hay una regla vigente en el local",
    comprueba: (c) => (c.reglasVigentes > 0) || "Ningún local tiene una regla de puntos vigente. Publica una desde «Programa de puntos».",
  }),
  Object.freeze({
    id: "integracion_confirmada",
    texto: "La integración está activa y con su Workplace confirmado",
    comprueba: (c) => (c.localesConfirmados > 0) || "Ningún local tiene la integración activa con el Workplace confirmado.",
  }),
  Object.freeze({
    id: "sombra_revisada",
    texto: "El cálculo en sombra se ha revisado",
    comprueba: (c) => c.sombraRevisadaEn ? true
      : (c.sombraFacturas > 0
          ? "Hay facturas calculadas en sombra, pero nadie ha marcado que se hayan revisado."
          : "Todavía no hay ninguna factura calculada en sombra con la que comparar."),
  }),
  Object.freeze({
    id: "sin_revisiones_bloqueantes",
    texto: "No hay revisiones técnicas sin resolver",
    comprueba: (c) => (c.revisionesBloqueantes === 0)
      || `Hay ${c.revisionesBloqueantes} revisión(es) técnica(s) sin resolver.`,
  }),
  Object.freeze({
    id: "interruptores_coherentes",
    texto: "Conceder, ofrecer y consumir son coherentes entre sí",
    comprueba: (c) => (!c.ofrecer && !c.consumir) || c.conceder
      || "No se puede ofrecer ni consumir descuentos sin conceder puntos.",
  }),
]);

/** Los requisitos que además exige una CAMPAÑA con premio, cuando hay alguna publicada. */
export const REQUISITOS_CAMPANA = Object.freeze([
  Object.freeze({
    id: "catalogo_sincronizado",
    texto: "El catálogo de productos está sincronizado en los locales de las campañas",
    comprueba: (c) => (c.campanasSinCatalogo === 0)
      || `${c.campanasSinCatalogo} campaña(s) con premio en un local sin catálogo sincronizado.`,
  }),
  Object.freeze({
    id: "grupos_con_productos",
    texto: "Los grupos de productos de las campañas no están vacíos",
    comprueba: (c) => (c.gruposVacios === 0) || `${c.gruposVacios} grupo(s) de productos sin ningún producto.`,
  }),
  Object.freeze({
    id: "offer_con_codigo",
    texto: "Las promociones de tipo Offer tienen su código de Ágora comprobado",
    comprueba: (c) => (c.offersSinCodigo === 0)
      || `${c.offersSinCodigo} promoción(es) Offer sin código comprobado en Ágora.`,
  }),
  Object.freeze({
    id: "textos_legales",
    texto: "Los formularios publicados tienen sus textos legales",
    comprueba: (c) => (c.formulariosSinLegal === 0)
      || `${c.formulariosSinLegal} formulario(s) publicado(s) sin consentimiento o política de privacidad.`,
  }),
]);

/** Qué requisitos aplican. Los de campaña solo si hay alguna campaña publicada. */
export const requisitosDe = (ctx) =>
  (ctx && ctx.campanasPublicadas > 0) ? [...REQUISITOS, ...REQUISITOS_CAMPANA] : [...REQUISITOS];

/**
 * El estado de la puerta, con su lista de comprobaciones.
 *
 * `estado` es lo que hay GUARDADO; `puede_activar` es lo que dice el servidor ahora mismo. Los dos
 * se enseñan: una puerta guardada como «activo» cuyos requisitos han dejado de cumplirse es
 * exactamente el aviso que hay que ver.
 */
export function evaluarPuerta(guardado, ctx) {
  const lista = requisitosDe(ctx).map((r) => {
    const v = r.comprueba(ctx || {});
    return { id: r.id, texto: r.texto, ok: v === true, motivo: v === true ? null : String(v) };
  });
  const pendientes = lista.filter((r) => !r.ok);
  const estado = guardado?.estado && ESTADOS.includes(guardado.estado) ? guardado.estado : "no_preparado";

  return {
    estado,
    requisitos: lista,
    pendientes: pendientes.map((r) => r.motivo),
    puede_activar: pendientes.length === 0,
    // Una puerta abierta cuyos requisitos han dejado de cumplirse. No se cierra sola —cerrarla por
    // sorpresa dejaría a un camarero sin poder cerrar una factura con descuento aplicado— pero se
    // avisa bien fuerte para que alguien decida.
    incoherente: estado === "activo" && pendientes.length > 0,
    confirmado_por: guardado?.confirmado_por || null,
    confirmado_en: guardado?.confirmado_en || null,
    pausado_en: guardado?.pausado_en || null,
    pausado_por: guardado?.pausado_por || null,
    motivo_pausa: guardado?.motivo_pausa || null,
  };
}

/**
 * ¿Se puede pasar de un estado a otro?
 *
 * PAUSAR SIEMPRE SE PUEDE desde activo: es el freno de emergencia y no puede depender de que se
 * cumpla nada. Reanudar sí vuelve a exigir los requisitos: si se pausó porque algo estaba mal, no
 * se reanuda sin comprobar que ya no lo está.
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
  // Volver atrás a «sombra» o «no_preparado» siempre se puede: es apagar.
  if (hacia === "sombra" || hacia === "no_preparado") {
    if (desde === "activo") return { ok: false, error: "Para eso hay que pausar primero" };
    return { ok: true };
  }
  return { ok: false, error: "Transición no permitida" };
}

/** La confirmación escrita que exige activar. Corta, pero escrita a mano. */
export const CONFIRMACION_EXIGIDA = "ACTIVAR";
export function confirmacionValida(texto) {
  return String(texto || "").trim().toUpperCase() === CONFIRMACION_EXIGIDA;
}
