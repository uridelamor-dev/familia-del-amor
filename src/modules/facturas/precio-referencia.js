// Facturas — el precio al que se compra normalmente, y el aviso cuando deja de serlo. PURO.
//
// EL PROBLEMA: hoy «Qué compramos» enseña la horquilla del periodo (del más barato al más
// caro). Eso INFORMA: hay que ir a mirarlo. Lo que hace falta es que AVISE — en el momento en
// que entra la factura, que es cuando todavía se puede llamar al comercial y decirle algo.
//
// EL PRECIO DE REFERENCIA es la MEDIANA de las últimas compras de ese producto a ese
// proveedor. Mediana y no media: una compra puntual a precio de oferta —o una línea mal leída—
// desplaza la media y a partir de ahí el aviso salta cuando no toca o deja de saltar cuando
// sí. La mediana se traga los extremos, que es justo lo que hay que hacer con ellos.
//
// Y se compara SIEMPRE contra el mismo proveedor. Que el aceite esté más caro en Makro que en
// el mayorista no es una subida: es otro proveedor. Mezclarlos daría avisos que no se pueden
// accionar, y un aviso que no se puede accionar se aprende a ignorar.

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const red = (x) => Math.round(x * 100) / 100;

/** Cuántas compras hacen falta para poder decir «lo normal es esto». */
export const MINIMO_COMPRAS = 3;
/** Cuánto se puede mover un precio sin que sea noticia. */
export const MARGEN_PCT = 10;

export function mediana(valores = []) {
  const v = valores.map(n).filter((x) => x != null && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : red((v[m - 1] + v[m]) / 2);
}

/**
 * El precio de referencia de un producto con un proveedor, a partir de sus compras anteriores.
 * `compras` = precios unitarios NETOS (lo que se paga), de la más reciente a la más antigua.
 *
 * Con menos de tres compras devuelve null y no se avisa de nada: con dos precios no hay
 * «normal» que valga, y un aviso basado en dos datos es una casualidad con formato de alerta.
 */
export function precioReferencia(compras = [], { minimo = MINIMO_COMPRAS, ventana = 12 } = {}) {
  const usados = compras.map(n).filter((x) => x != null && x > 0).slice(0, ventana);
  if (usados.length < minimo) return null;
  return mediana(usados);
}

/**
 * ¿Este precio se sale de lo normal? Devuelve el aviso o null.
 *
 * Solo avisa de SUBIDAS. Una bajada también es información, pero no es una decisión: nadie va a
 * llamar al proveedor porque le haya cobrado menos. Los avisos que no llevan a hacer nada son
 * los que hacen que se dejen de leer los que sí.
 */
export function avisoPrecio({ descripcion, proveedor, precio, referencia, compras } = {}, { margen = MARGEN_PCT } = {}) {
  const p = n(precio), r = n(referencia);
  if (p == null || r == null || r <= 0 || p <= 0) return null;
  const pct = Math.round(((p - r) / r) * 1000) / 10;
  if (pct <= margen) return null;
  const veces = Number(compras) || 0;
  return {
    clave: "precio_subido",
    grave: pct >= 25,
    pct,
    referencia: red(r),
    precio: red(p),
    texto: `«${descripcion}» de ${proveedor}: ${red(p).toFixed(2)} € cuando lo normal son ${red(r).toFixed(2)} €`
      + ` (un ${pct > 0 ? "+" : ""}${pct} %${veces ? `, sobre ${veces} compras anteriores` : ""}). Compruébalo antes de pagarla.`,
  };
}

/**
 * Revisa las líneas de una factura contra los precios de referencia que se le pasen.
 * `referencias` es un Map clave → { precio, compras }.
 *
 * Devuelve como mucho `tope` avisos, los más gordos primero: una factura de treinta líneas con
 * veinte avisos no se lee. Y se dice cuántos se han quedado fuera, que no es lo mismo que no
 * haberlos encontrado.
 */
export function revisarPrecios(lineas = [], referencias = new Map(), { proveedor = "", tope = 3, margen = MARGEN_PCT } = {}) {
  const avisos = [];
  for (const l of lineas) {
    const ref = referencias.get(l.clave);
    if (!ref) continue;
    const a = avisoPrecio({
      descripcion: l.descripcion, proveedor, precio: l.precio_unitario,
      referencia: ref.precio, compras: ref.compras,
    }, { margen });
    if (a) avisos.push(a);
  }
  avisos.sort((a, b) => b.pct - a.pct);
  return { avisos: avisos.slice(0, tope), total: avisos.length, ocultos: Math.max(0, avisos.length - tope) };
}
