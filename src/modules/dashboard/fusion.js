// Dashboard — sumar el de varios establecimientos en uno. Lógica PURA.
//
// POR QUÉ ASÍ: quien lleva dos locales quiere verlos juntos. La forma barata sería meter un
// `local IN (...)` en las consultas, y es justo lo que el ADR 0001 aparta hasta después de
// producción: tocar el filtrado por local no se ve cuando falla —salen menos reservas, o las
// de otro— y hoy filtra igual en reservas, facturas y fichajes. Así que se pide el dashboard
// de CADA local con la consulta de siempre, sin tocarla, y se suman las respuestas aquí.
//
// LO DELICADO NO ES SUMAR: ES SABER QUÉ NO SE SUMA. El dashboard trae dos clases de cifras
// mezcladas:
//   · Las que se calculan CON el filtro de local (reservas de ayer, lo que se debe, las
//     incidencias abiertas): esas sí se suman, porque cada respuesta trae solo su parte.
//   · Las que se calculan SIN filtro y son iguales en todas las respuestas (la nota media de
//     Google, las reseñas sin responder, las conversaciones del mes con el equipo): sumar dos
//     copias del mismo número lo duplica. Esas se cogen UNA vez.
// Confundir las dos es exactamente el error que nadie detectaría: el número sale, parece
// razonable, y es el doble del real.
//
// Y hay una tercera clase: listas por local que vienen ENTERAS en cada respuesta (el gasto de
// todos los establecimientos). De esas se coge solo la fila del local de cada parte, que además
// deja de enseñarle a un encargado el gasto de locales que no lleva.

import { buildAgenda, buildTitular } from "./dashboard.service.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const suma = (partes, saca) => partes.reduce((s, p) => s + num(saca(p)), 0);
const ORDEN_SEV = { crit: 0, imp: 1, info: 2 };

/** El nombre corto que se usa en los textos: «La Tapeta - Lloret» → «Lloret». */
export function nombreCorto(local) {
  const s = String(local || "").trim();
  const i = s.lastIndexOf(" - ");
  return (i >= 0 ? s.slice(i + 3) : s).trim() || s;
}

/** «Lloret y Girona» · «Lloret, Girona y Blanes». Para los textos, no para filtrar. */
export function etiquetaLocales(locales = []) {
  const n = locales.map(nombreCorto).filter(Boolean);
  if (!n.length) return "";
  if (n.length === 1) return n[0];
  return n.slice(0, -1).join(", ") + " y " + n[n.length - 1];
}

/**
 * La tira de arriba del dashboard (reservas, ventas y gasto del periodo elegido) de varios
 * locales. Aquí todo viene filtrado por local, así que todo se suma —salvo el ticket medio y
 * el resultado, que son divisiones y restas: se rehacen con los totales ya sumados. Promediar
 * dos ticket medios daría un número que no es el de nadie.
 */
export function fusionarPeriodo(partes = []) {
  const buenas = partes.filter(Boolean);
  if (!buenas.length) return null;
  if (buenas.length === 1) return buenas[0];
  const primera = buenas[0];
  const serie = (saca, campos) => fusionarPorClave(buenas.map(saca), (r) => r.dia, campos)
    .sort((a, b) => String(a.dia).localeCompare(String(b.dia)));

  const ventasTotal = suma(buenas, (p) => p.ventas?.total);
  const tickets = suma(buenas, (p) => p.ventas?.tickets);
  const gastos = suma(buenas, (p) => p.gastos?.total);
  const hayVentas = buenas.some((p) => p.ventas?.disponible);
  const hayGastos = buenas.some((p) => p.gastos?.disponible);
  const red = (x) => Math.round(x * 100) / 100;

  return {
    from: primera.from, to: primera.to, hoy: primera.hoy,
    hoyEnVivo: buenas.some((p) => p.hoyEnVivo),
    reservas: {
      total: suma(buenas, (p) => p.reservas?.total),
      personas: suma(buenas, (p) => p.reservas?.personas),
      serie: serie((p) => p.reservas?.serie || [], ["n", "personas"]),
    },
    ventas: {
      disponible: hayVentas, total: red(ventasTotal), tickets,
      ticket_medio: tickets ? red(ventasTotal / tickets) : 0,
      serie: serie((p) => p.ventas?.serie || [], ["ventas", "tickets"]),
      fuente: buenas.some((p) => p.ventas?.fuente === "live") ? "live" : primera.ventas?.fuente,
    },
    gastos: {
      disponible: hayGastos, total: red(gastos),
      base: red(suma(buenas, (p) => p.gastos?.base)),
      n: suma(buenas, (p) => p.gastos?.n),
      // La parte de gasto de empresa imputada a estos locales. Se suma como todo lo demás: cada
      // parte trae solo la suya, así que mirando dos locales de tres no aparece el tercio ajeno.
      empresa: red(suma(buenas, (p) => p.gastos?.empresa)),
      notaEmpresa: (buenas.find((p) => p.gastos?.notaEmpresa) || {}).gastos?.notaEmpresa || "",
    },
    resultado: (hayVentas || hayGastos) ? red(ventasTotal - gastos) : null,
  };
}

/** Suma dos listas de filas con clave, sumando los campos numéricos que se le digan. */
function fusionarPorClave(listas, clave, campos, extra) {
  const mapa = new Map();
  for (const fila of listas.flat()) {
    if (!fila) continue;
    const k = clave(fila);
    if (k == null) continue;
    if (!mapa.has(k)) mapa.set(k, { ...fila });
    else {
      const g = mapa.get(k);
      for (const c of campos) g[c] = num(g[c]) + num(fila[c]);
      if (extra) extra(g, fila);
    }
  }
  return [...mapa.values()];
}

/**
 * Junta los dashboards de varios locales en uno solo.
 * `partes` son las respuestas de `getDashboard`, una por local, en el orden de `locales`.
 */
export function fusionarDashboards(partes = [], { locales = [], whatsappConnected = null } = {}) {
  const buenas = partes.filter(Boolean);
  if (!buenas.length) return null;
  if (buenas.length === 1) return buenas[0];
  const primera = buenas[0];
  const mios = locales.length ? locales : buenas.map((p) => p?.scope?.local).filter(Boolean);
  const etiqueta = etiquetaLocales(mios);

  // ── Preocupaciones: se juntan las de todos y mandan las más graves ────────
  // Cada aviso ya dice de qué local habla en su título («El gasto de Lloret se ha disparado»),
  // así que juntarlos se lee bien. Se recorta a 7 como en una sola: una lista de veinte cosas
  // urgentes no es una lista de cosas urgentes.
  const preocupaciones = buenas.flatMap((p) => p.preocupaciones || [])
    .sort((a, b) => (ORDEN_SEV[a.sev] ?? 9) - (ORDEN_SEV[b.sev] ?? 9))
    .slice(0, 7);

  // ── Ayer y hoy: se suman y se dice cuánto puso cada uno ───────────────────
  const conAyer = buenas.filter((p) => p.ayer && p.ayer.disponible);
  const ayerRes = suma(conAyer, (p) => p.ayer.reservas), ayerCom = suma(conAyer, (p) => p.ayer.comensales);
  const desglose = (saca) => buenas.map((p, i) => `${saca(p)} en ${nombreCorto(mios[i] || p?.scope?.local)}`).join(", ");
  const ayer = conAyer.length
    ? { disponible: true, reservas: ayerRes, comensales: ayerCom, delta: null,
        texto: `Ayer ${etiqueta} ${conAyer.length > 1 ? "tuvieron" : "tuvo"} <b>${ayerRes} reserva${ayerRes === 1 ? "" : "s"}</b> (${ayerCom} comensales): ${desglose((p) => (p.ayer && p.ayer.reservas) || 0)}.` }
    : { disponible: false, texto: "Aún no hay datos de reservas de ayer." };

  const conHoy = buenas.filter((p) => p.hoy && p.hoy.disponible);
  const hoyRes = suma(conHoy, (p) => p.hoy.hoy && p.hoy.hoy.n), hoyCom = suma(conHoy, (p) => p.hoy.hoy && p.hoy.hoy.personas);
  const prox7 = { n: suma(conHoy, (p) => p.hoy.prox7 && p.hoy.prox7.n), personas: suma(conHoy, (p) => p.hoy.prox7 && p.hoy.prox7.personas) };
  const vacio = hoyRes === 0 && prox7.n === 0;
  const hoy = conHoy.length
    ? { disponible: true, hoy: { n: hoyRes, personas: hoyCom }, prox7, alerta: vacio,
        texto: vacio
          ? `No hay reservas registradas para hoy ni los próximos días en ${etiqueta}. Si esperas servicio, conviene revisar que Sara esté tomando reservas.`
          : `Para hoy hay <b>${hoyRes} reserva${hoyRes === 1 ? "" : "s"}</b> (${hoyCom} comensales) en ${etiqueta}: ${desglose((p) => (p.hoy && p.hoy.hoy && p.hoy.hoy.n) || 0)}. Los próximos 7 días suman ${prox7.n} reservas (${prox7.personas} comensales).` }
    : { disponible: false, texto: "" };

  // ── Dinero ────────────────────────────────────────────────────────────────
  // `gastoLocal` viene ENTERO en cada respuesta (no lo filtra el local), así que sumarlo
  // multiplicaría el gasto por el número de locales. Se coge de cada parte SU fila.
  const gastoLocal = buenas.map((p, i) => {
    const suyo = mios[i] || p?.scope?.local;
    return (p.dinero?.gastoLocal || []).find((g) => g.local === suyo) || null;
  }).filter(Boolean).sort((a, b) => num(b.actual) - num(a.actual));

  const masAntiguas = buenas.map((p) => p.dinero?.masAntigua).filter(Boolean);
  const masAntigua = masAntiguas.length
    ? masAntiguas.reduce((a, b) => (String(a.fecha) <= String(b.fecha) ? a : b))
    : null;

  const dinero = {
    porPagar: { total: suma(buenas, (p) => p.dinero?.porPagar?.total), n: suma(buenas, (p) => p.dinero?.porPagar?.n) },
    acreedores: fusionarPorClave(buenas.map((p) => p.dinero?.acreedores || []), (a) => a.proveedor, ["total", "n"])
      .sort((a, b) => b.total - a.total).slice(0, 5),
    masAntigua,
    gastoLocal,
    sinFuente: primera.dinero?.sinFuente,
  };

  // ── Equipo ────────────────────────────────────────────────────────────────
  // La plantilla sí se suma (cada local trae la suya); las conversaciones del mes NO: esa
  // cifra se cuenta sin filtrar por local, así que las dos respuestas traen la misma.
  const conCheckins = buenas.map((p) => p.equipo?.checkins).filter(Boolean);
  const equipo = {
    incidencias: fusionarPorClave(buenas.map((p) => p.equipo?.incidencias || []), (w) => `${w.nombre}|${w.local}`, ["c"])
      .sort((a, b) => b.c - a.c).slice(0, 5),
    checkins: conCheckins.length
      ? { plantilla: suma(conCheckins, (c) => c.plantilla), hechos: num(conCheckins[0].hechos), mes: conCheckins[0].mes }
      : null,
    sinFuente: primera.equipo?.sinFuente,
  };

  // ── Radar: aquí se puede armar bien, porque cada parte es un local ────────
  const radarLocales = buenas.map((p, i) => {
    const local = mios[i] || p?.scope?.local;
    const g = (p.dinero?.gastoLocal || []).find((x) => x.local === local);
    return {
      local,
      hoyPersonas: num(p.hoy?.hoy?.personas), hoyReservas: num(p.hoy?.hoy?.n),
      incidenciasAbiertas: num(p.mantenimiento?.abiertas),
      gastoMes: Math.round(num(g?.actual)),
    };
  }).sort((a, b) => b.incidenciasAbiertas - a.incidenciasAbiertas || b.gastoMes - a.gastoMes);

  // ── Serie de reservas: se suma día a día ──────────────────────────────────
  const serieReservas = fusionarPorClave(buenas.map((p) => p.serieReservas || []), (r) => r.dia, ["n", "personas"])
    .sort((a, b) => String(a.dia).localeCompare(String(b.dia)));

  // ── Ventas: el importe se suma; los días NO ───────────────────────────────
  // «30 días de ventas» en dos locales siguen siendo los mismos 30 días del calendario.
  const conVentas = buenas.filter((p) => p.ventas && p.ventas.disponible);
  const ventas = conVentas.length
    ? { disponible: true, total: suma(conVentas, (p) => p.ventas.total),
        dias: Math.max(...conVentas.map((p) => num(p.ventas.dias))),
        porLocal: (primera.ventas?.porLocal || []).filter((v) => mios.includes(v.local)) }
    : { disponible: false };

  return {
    fecha: primera.fecha, ayerFecha: primera.ayerFecha,
    scope: { local: null, locales: mios, etiqueta },
    titular: buildTitular(preocupaciones, etiqueta),
    ayer, hoy,
    preocupaciones,
    agenda: buildAgenda(preocupaciones),
    decisionSara: preocupaciones.length ? preocupaciones[0].decision : null,
    radarLocales,
    dinero,
    equipo,
    clientes: {
      enfriando: buenas.flatMap((p) => p.clientes?.enfriando || []).sort((a, b) => b.visitas - a.visitas).slice(0, 8),
      mejores: buenas.flatMap((p) => p.clientes?.mejores || []).sort((a, b) => b.visitas - a.visitas).slice(0, 6),
    },
    // Reputación y reseñas se calculan SIN filtro de local: son la misma cifra en todas las
    // respuestas. Se coge una. Sumarlas diría que hay el doble de reseñas de las que hay.
    reputacionLocales: primera.reputacionLocales || [],
    resenas: primera.resenas,
    serieReservas,
    ventas,
    mantenimiento: { abiertas: suma(buenas, (p) => p.mantenimiento?.abiertas) },
    whatsapp: { connected: whatsappConnected != null ? whatsappConnected : primera.whatsapp?.connected },
  };
}
