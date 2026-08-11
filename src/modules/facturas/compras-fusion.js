// «Qué compramos» — sumar varios establecimientos en uno. Lógica PURA.
//
// Igual que en el dashboard: se pide lo de CADA local con la consulta de siempre (sin tocar el
// `local = ?`, ver ADR 0001) y se suman las respuestas aquí.
//
// Aquí la suma sí es exacta, y no por suerte: la respuesta de cada local no trae solo el
// resultado, trae los ACUMULADORES con los que se calculó —cuántas veces, cuántas líneas
// traían importe, el precio mínimo y el máximo, la primera y la última compra—. Con eso, juntar
// dos locales da lo mismo que si se hubieran contado juntos desde el principio. Si solo llegara
// el porcentaje de subida ya calculado, no habría forma de fundirlo sin inventar.
//
// Lo único que NO se suma es el número de PRODUCTOS: dos locales que compran Coca-Cola no
// compran dos productos distintos. Se cuentan los productos del conjunto ya fusionado.

import { recortarPrecios, medianaPrecios } from "./lineas.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const red2 = (x) => Math.round(x * 100) / 100;
const red3 = (x) => Math.round(x * 1000) / 1000;
const menor = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));
const mayor = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));
const antes = (a, b) => (!a ? b : !b ? a : (String(a) < String(b) ? a : b));
const despues = (a, b) => (!a ? b : !b ? a : (String(a) >= String(b) ? a : b));

/** Un producto visto en varios locales es UN producto: se juntan sus acumuladores. */
export function fusionarGrupos(listas = []) {
  const mapa = new Map();
  for (const g of listas.flat()) {
    if (!g || !g.clave) continue;
    const k = g.clave;
    if (!mapa.has(k)) { mapa.set(k, { ...g, proveedores: [...(g.proveedores || [])] }); continue; }
    const a = mapa.get(k);
    a.veces = n(a.veces) + n(g.veces);
    a.dudosas = n(a.dudosas) + n(g.dudosas);
    a.conCantidad = n(a.conCantidad) + n(g.conCantidad);
    a.conImporte = n(a.conImporte) + n(g.conImporte);
    // null significa «no se pudo leer», no «cero». Se conserva: si ninguno de los dos locales
    // traía la cantidad, el resultado sigue sin traerla en vez de convertirse en un 0 falso.
    a.cantidad = a.conCantidad ? red3(n(a.cantidad) + n(g.cantidad)) : null;
    a.importe = a.conImporte ? red2(n(a.importe) + n(g.importe)) : null;
    a.precioMin = menor(a.precioMin, g.precioMin);
    a.precioMax = mayor(a.precioMax, g.precioMax);
    a.primera = antes(a.primera, g.primera);
    // El último precio es el de la compra más reciente de CUALQUIERA de los locales.
    if (g.ultima && (!a.ultima || String(g.ultima) >= String(a.ultima))) {
      if (g.ultimoPrecio != null) a.ultimoPrecio = g.ultimoPrecio;
    }
    a.ultima = despues(a.ultima, g.ultima);
    a.proveedores = [...new Set([...(a.proveedores || []), ...(g.proveedores || [])])];
    // Las listas de precios se JUNTAN y se vuelve a calcular la mediana. De dos medianas no
    // sale una mediana; de dos listas sí. Por eso cada local manda sus últimas compras y no
    // solo su resultado — el mismo motivo por el que la suma de todo lo demás es exacta.
    a.precios = recortarPrecios([...(a.precios || []), ...(g.precios || [])]);
    a.precioNormal = a.proveedores.length === 1 ? medianaPrecios(a.precios) : null;
    // Se recalcula con los mínimos y máximos ya juntos: el porcentaje de subida de dos locales
    // no es la media de sus porcentajes.
    a.variacionPct = a.precioMin != null && a.precioMax != null && a.precioMin > 0
      ? Math.round(((a.precioMax - a.precioMin) / a.precioMin) * 1000) / 10
      : null;
  }
  return [...mapa.values()].sort((x, y) => (y.importe ?? -1) - (x.importe ?? -1));
}

/** El gasto por categoría de varios locales: por categoría y por subcategoría. */
export function fusionarCategorias(partes = []) {
  const acc = new Map();
  for (const p of partes) {
    for (const c of (p?.categorias || [])) {
      if (!acc.has(c.categoria)) acc.set(c.categoria, { categoria: c.categoria, importe: 0, proveedores: new Set(), subs: new Map() });
      const g = acc.get(c.categoria);
      g.importe += n(c.importe);
      for (const pr of (c.proveedores || [])) g.proveedores.add(pr);
      for (const s of (c.subs || [])) g.subs.set(s.subcategoria, n(g.subs.get(s.subcategoria)) + n(s.importe));
    }
  }
  return {
    categorias: [...acc.values()].map((g) => ({
      categoria: g.categoria,
      importe: red2(g.importe),
      proveedores: [...g.proveedores].sort((a, b) => a.localeCompare(b, "es")),
      subs: [...g.subs.entries()].map(([subcategoria, importe]) => ({ subcategoria, importe: red2(importe) }))
        .sort((a, b) => b.importe - a.importe),
    })).sort((a, b) => b.importe - a.importe),
    sinCategoria: red2(partes.reduce((s, p) => s + n(p?.sinCategoria), 0)),
    sinCatProveedores: [...new Set(partes.flatMap((p) => p?.sinCatProveedores || []))].sort((a, b) => a.localeCompare(b, "es")),
    repartido: red2(partes.reduce((s, p) => s + n(p?.repartido), 0)),
    total: red2(partes.reduce((s, p) => s + n(p?.total), 0)),
  };
}

/**
 * Junta las respuestas de «Qué compramos» de varios locales.
 * `partes` en el mismo orden que `locales`.
 */
export function fusionarCompras(partes = [], { locales = [] } = {}) {
  const buenas = partes.filter(Boolean);
  if (!buenas.length) return null;
  if (buenas.length === 1) return buenas[0];
  const primera = buenas[0];

  const grupos = fusionarGrupos(buenas.map((p) => p.grupos || []));
  const cob = (k) => buenas.reduce((s, p) => s + n(p.cobertura?.[k]), 0);

  return {
    ...primera,
    ok: true,
    local: null,
    locales: locales.length ? locales : buenas.map((p) => p.local).filter(Boolean),
    categorias: fusionarCategorias(buenas.map((p) => p.categorias)),
    grupos: grupos.slice(0, 300),
    // Las líneas sueltas (solo salen al buscar) se juntan y se ordenan por fecha: pegar una
    // lista detrás de otra dejaría todo un local antes que el otro, no lo más reciente arriba.
    lineas: buenas.flatMap((p) => p.lineas || [])
      .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || ""))).slice(0, 400),
    albaranesYaFacturados: buenas.reduce((s, p) => s + n(p.albaranesYaFacturados), 0),
    totales: {
      importe: red2(grupos.reduce((s, g) => s + n(g.importe), 0)),
      // Y NO la suma de los productos de cada local: dos locales que compran lo mismo compran
      // un producto, no dos.
      productos: grupos.length,
    },
    cobertura: {
      facturas: cob("facturas"), conDetalle: cob("conDetalle"), descuadradas: cob("descuadradas"),
      sinLeer: cob("sinLeer"), noLeibles: cob("noLeibles"), noAplica: cob("noAplica"),
    },
  };
}
