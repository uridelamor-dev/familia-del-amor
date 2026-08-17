// Facturas — el gasto que no es de un local, sino de una empresa. PURO.
//
// EL CASO: la gestoría factura a «Del Amor Uriel SLU», que tiene tres locales. Hoy hay que
// elegir uno —y ese carga con un gasto que no es suyo— o dejarla sin local, y entonces se queda
// en la bandeja de pendientes para siempre pidiendo una decisión que no se puede tomar.
//
// LA FACTURA NO SE PARTE. Es un documento y se pagó una vez: partirla en tres filas rompería lo
// único que aquí nunca puede fallar —que el importe es lo que se pagó— y además el detector de
// duplicados vería tres facturas casi iguales. Lo que se reparte es la CUENTA, al sumar por
// local; el documento se queda entero.

const cent = (v) => Math.round((Number(v) || 0) * 100);

/**
 * Reparte un importe entre varios locales según sus pesos, EN CÉNTIMOS.
 *
 * Los céntimos importan: 100 € entre 3 son 33,33 · 33,33 · 33,33 = 99,99. Ese céntimo perdido,
 * multiplicado por doce meses y varias empresas, es una diferencia que aparece en el cierre y
 * que nadie sabe de dónde sale. El resto va al local de mayor peso, que es donde menos se nota.
 */
export function repartirImporte(total, pesos = []) {
  const ps = pesos.map((p) => ({ local: p.local, peso: Math.max(0, Number(p.peso) || 0) }));
  if (!ps.length) return [];
  const suma = ps.reduce((s, p) => s + p.peso, 0);
  const totalCent = cent(total);
  // Sin pesos utilizables (todos a cero) se reparte a partes iguales: es preferible a devolver
  // ceros, que dejarían el gasto sin asignar a nadie sin decirlo.
  const base = suma > 0 ? ps : ps.map((p) => ({ ...p, peso: 1 }));
  const sumaBase = base.reduce((s, p) => s + p.peso, 0);

  const trozos = base.map((p) => ({ local: p.local, peso: p.peso, cent: Math.floor((totalCent * p.peso) / sumaBase) }));
  let resto = totalCent - trozos.reduce((s, t) => s + t.cent, 0);
  // El resto (nunca más de N−1 céntimos) va a los de más peso, de uno en uno.
  const orden = [...trozos].sort((a, b) => b.peso - a.peso || String(a.local).localeCompare(String(b.local)));
  for (let i = 0; resto > 0; i = (i + 1) % orden.length, resto--) orden[i].cent += 1;

  return trozos.map((t) => ({ local: t.local, importe: Math.round(t.cent) / 100 }));
}

/**
 * Con qué pesos se reparte: las ventas de cada local en el periodo.
 *
 * EL FRENO QUE HACE FALTA: si un local no tiene ventas registradas —el TPV no está conectado
 * ahí, o el mes aún no se ha volcado—, repartir por ventas lo dejaría fuera y concentraría el
 * gasto en los demás. Eso no es «más justo», es un número falso. Cuando falta el dato de
 * alguno, se reparte a partes iguales entre todos y se DICE con qué se ha repartido.
 */
export function pesosPorVentas(ventasPorLocal = [], locales = []) {
  const mapa = new Map((ventasPorLocal || []).map((v) => [v.local, Number(v.ventas) || 0]));
  const faltan = locales.filter((l) => !(mapa.get(l) > 0));

  if (!locales.length) return { pesos: [], base: "iguales", faltan: [] };
  if (faltan.length) {
    return { pesos: locales.map((l) => ({ local: l, peso: 1 })), base: "iguales", faltan };
  }
  return { pesos: locales.map((l) => ({ local: l, peso: mapa.get(l) })), base: "ventas", faltan: [] };
}

/** Cómo se explica el reparto en pantalla. Sin esto, un número repartido parece un número medido. */
export function textoReparto({ base, faltan = [], locales = [] } = {}) {
  if (!locales.length) return "";
  if (base === "ventas") return `repartido entre ${locales.length} locales según sus ventas`;
  return faltan.length
    ? `repartido a partes iguales entre ${locales.length} locales (faltan ventas de ${faltan.length})`
    : `repartido a partes iguales entre ${locales.length} locales`;
}

/**
 * Lo que le toca a UN local de una factura de empresa. Devuelve 0 si ese local no es de la
 * empresa: preguntar por un local ajeno no puede sumar nada.
 */
export function parteDe(local, total, pesos) {
  const r = repartirImporte(total, pesos).find((x) => x.local === local);
  return r ? r.importe : 0;
}
