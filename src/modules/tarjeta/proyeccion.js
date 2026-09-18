// EL ESTADO VISIBLE DE UN CARNÉ. PURO: sin BD, sin Express, sin red.
//
// ── UNA SOLA PROYECCIÓN, TRES CONSUMIDORES ───────────────────────────────────────────────────
//
//   · la tarjeta web            `/api/tarjeta/:token`
//   · el `.pkpass` que se baja  `GET /api/wallet/apple/:token`
//   · el `.pkpass` que Wallet vuelve a pedir cuando algo cambia
//
// Los tres tienen que decir LO MISMO. Si Wallet dice «1 regalo disponible» y la barra contesta que
// no, el cliente tiene razón y el camarero también, y eso se discute en la barra un sábado.
//
// ── LO QUE ESTE MÓDULO NO HACE ───────────────────────────────────────────────────────────────
//
// NO decide si una promoción se puede llevar. Eso es `elegible()`, que ya existe, ya está probada
// y es la que usa el endpoint de Ágora. Aquí se RECIBEN las promociones que alguien ya evaluó con
// esa función y se ordenan con `elegirPromo()`, que también existe. Copiar esas reglas aquí sería
// el segundo sitio donde equivocarse, y el que nadie mira cuando algo no cuadra.
//
// NO lee un saldo de Wallet. No existe: los puntos salen de `fid_movimientos`, los derechos de
// `fid_promo_derechos` y los usos de `fid_promo_usos`. Wallet es una foto, no una cuenta.
//
// ── LO QUE NUNCA SALE DE AQUÍ ────────────────────────────────────────────────────────────────
//
// Ni teléfono, ni MemberId, ni tokens, ni identificadores de lote, ni claves de idempotencia, ni
// versiones internas, ni una sola factura. Hay un test que recorre la proyección entera buscando
// esas claves. El carné es de un cliente y esta foto se la enseña a quien tenga el móvil delante.

import { elegirPromo, nivelDe, NIVEL } from "../fidelizacion/promos.js";

/** Lo que se enseña cuando el programa de puntos todavía no está concediendo. */
export const TEXTO_PREPARACION = "Programa de puntos en preparación";

/**
 * Una fecha ISO a `31/10/2026`. Devuelve `null` si no hay fecha: en el pase, un campo vacío es
 * mejor que un «Invalid Date», que es lo que salía al concatenar sin comprobar.
 */
export function fechaCorta(iso) {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * EL ESTADO VISIBLE, en una sola pieza.
 *
 * @param {object}   qr             la fila de `pro_qr` (carné)
 * @param {object}   saldo          lo que devuelve `saldoDe`: { disponible, proxima_caducidad, … }
 * @param {object}   regla          la regla de puntos vigente, o null
 * @param {Array}    promosElegibles promociones que YA han pasado por `elegible()` y valen
 * @param {object}   interruptores  los del programa de puntos: { conceder, ofrecer, … }
 * @param {object}   promoSw        los de promociones: { promociones_ofrecer, … }
 * @param {object}   cfg            `fid_tarjeta_config` publicada (textos configurables)
 * @param {string}   ahora          ISO con offset
 */
export function proyectarCarne({
  qr = null, saldo = null, regla = null, promosElegibles = [],
  interruptores = {}, promoSw = {}, cfg = {}, ahora = "",
} = {}) {
  if (!qr) return null;

  // ── LOS PUNTOS ────────────────────────────────────────────────────────────────────────────
  //
  // `activo` es la ÚNICA puerta. Con el programa apagado no se enseña un saldo: decirle a alguien
  // que tiene 0 puntos cuando el programa no está concediendo es enseñarle un marcador que no
  // existe, y el día que se encienda parecerá que ha perdido lo que tenía.
  //
  // `mostrar_puntos === false` es el interruptor de Marketing en la configuración publicada, y
  // manda igual: hay campañas en las que la casa prefiere no hablar de puntos todavía.
  const puntosActivos = !!interruptores.conceder && cfg.mostrar_puntos !== false;
  const necesarios = regla ? Number(regla.puntos_necesarios) : null;
  const disponible = puntosActivos ? Number(saldo?.disponible) || 0 : null;

  const puntos = puntosActivos
    ? {
        activo: true,
        saldo: disponible,
        objetivo: Number.isFinite(necesarios) && necesarios > 0 ? necesarios : null,
        faltan: Number.isFinite(necesarios) && necesarios > 0
          ? Math.max(0, necesarios - disponible) : null,
        proxima_caducidad: saldo?.proxima_caducidad || null,
        // CUÁNTOS caducan, no solo cuándo. «Tus puntos caducan el 31/03/2027» no dice nada
        // accionable; «28 puntos caducan el 31/03/2027» sí.
        caducan: Number(saldo?.lotes?.[0]?.restante) || 0,
        // El descuento por puntos solo se puede usar si además se está OFRECIENDO. Tener saldo y
        // que la barra no lo ofrezca son dos cosas distintas y el cliente nota la diferencia.
        canjeable: !!interruptores.ofrecer && !!necesarios && disponible >= necesarios,
      }
    : {
        activo: false,
        saldo: null, objetivo: null, faltan: null, proxima_caducidad: null, canjeable: false,
        texto: cfg.texto_preparacion || TEXTO_PREPARACION,
      };

  // ── LOS PREMIOS ───────────────────────────────────────────────────────────────────────────
  //
  // Solo cuentan si las promociones se están OFRECIENDO de verdad. `promoSw` llega ya pasado por
  // su puerta, así que con las promociones pausadas esto queda en cero y el pase no promete un
  // regalo que la barra no daría.
  const seOfrecen = !!promoSw.promociones_ofrecer;
  const lista = seOfrecen ? (promosElegibles || []).filter(Boolean) : [];

  // EL MISMO ORDEN QUE ÁGORA: derecho individual, general, y dentro del nivel prioridad, la que
  // antes caduca y la clave. No se reimplementa: se llama a la función que ya lo hace.
  const principal = elegirPromo(lista);

  const ficha = (p) => ({
    nombre: String(p.texto_cliente || p.nombre || "Regalo").slice(0, 120),
    local: p.local || null,
    hasta: p.hasta || null,
    hasta_texto: fechaCorta(p.hasta),
    horario: p.hora_desde && p.hora_hasta
      ? `de ${String(p.hora_desde).slice(0, 5)} a ${String(p.hora_hasta).slice(0, 5)}` : null,
    // ¿Este vale es SOLO de un local? Es lo que evita que el detalle contradiga al «Dónde vale»
    // general: la tarjeta vale en todos, pero este vale concreto puede que no.
    solo_aqui: !!p.local,
    // `personal` distingue «te lo has ganado» de «lo tiene todo el mundo». No sale ningún dato
    // del derecho: solo si lo es o no.
    personal: nivelDe(p) === NIVEL.CON_DERECHO,
  });

  const premios = {
    cantidad: lista.length,
    principal: principal ? ficha(principal) : null,
    disponibles: lista.map(ficha),
  };

  return {
    socio: {
      // El nombre y el código de ocho dígitos: lo mismo que ya lleva el pase hoy. Nada más.
      nombre: qr.nombre || "",
      codigo: qr.codigo || "",
    },
    puntos,
    premios,
    actualizado_en: ahora || null,
  };
}

/**
 * LA HUELLA DE LO VISIBLE. Es lo que decide si hay que avisar a Wallet.
 *
 * Solo entra lo que se VE en el pase. Si cambia un identificador interno, una fecha de creación o
 * el orden de una consulta, la huella no se mueve y no se manda ningún aviso: despertar el móvil
 * de alguien para no cambiarle nada es la forma más rápida de que borre el carné.
 *
 * Es una cadena, no un hash: se guarda tal cual y se compara entera. Cabe de sobra, y cuando algo
 * no cuadra se puede leer con los ojos en vez de adivinar qué había dentro de un sha.
 */
export function huellaVisible(p) {
  if (!p) return "";
  const pt = p.puntos || {};
  const pr = p.premios || {};
  const trozos = [
    `s=${pt.activo ? pt.saldo : "x"}`,
    `o=${pt.objetivo ?? "x"}`,
    `c=${pt.canjeable ? 1 : 0}`,
    `e=${String(pt.proxima_caducidad || "").slice(0, 10) || "x"}`,
    `n=${pr.cantidad || 0}`,
    // Del premio principal, lo que se pinta: nombre, local y caducidad.
    `p=${pr.principal ? `${pr.principal.nombre}|${pr.principal.local || ""}|${pr.principal.hasta || ""}` : "x"}`,
    `t=${p.socio?.nombre || ""}`,
  ];
  return trozos.join(";");
}
