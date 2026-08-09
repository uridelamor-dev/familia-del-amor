// Facturas — de qué es cada proveedor. Lógica PURA.
//
// «Grau es bebidas y alcohol; Cerezo es embutidos». Sirve para contestar «cuánto me gasto en
// bebida», que hoy no se puede porque el gasto solo está por proveedor y por producto suelto.
//
// DOS DECISIONES QUE CONVIENE TENER PRESENTES:
//
// 1. La categoría va en el PROVEEDOR, no en el producto. Es una aproximación: Makro te vende
//    lomo y lejía. Pero etiquetar 30 proveedores se hace en una tarde y etiquetar 4.000
//    líneas de producto no se hace nunca, así que un 80 % que existe vale más que un 100 %
//    que no. Los generalistas se marcan como «Varios» para que no ensucien el reparto, y el
//    día que haga falta se añade una excepción por producto sin rehacer nada.
//
// 2. Es una LISTA CERRADA, no texto libre. Si cada uno escribe «bebida», «Bebidas» y
//    «BEBIDA», el agrupar —que es para lo único que sirve esto— deja de funcionar. Es
//    exactamente lo que pasó con el campo `local` de las facturas.

/** Catálogo inicial. Dirección puede añadir, pero se empieza con algo, no con la nada. */
export const CATEGORIAS = [
  "Bebidas", "Alcohol", "Café e infusiones",
  "Carne", "Embutidos y quesos", "Pescado y marisco", "Fruta y verdura",
  "Pan y bollería", "Congelados", "Ultramarinos y conservas",
  "Limpieza e higiene", "Desechables y envases", "Menaje y utillaje",
  "Suministros", "Mantenimiento y obras", "Servicios y profesionales",
  "Impuestos y seguros", "Alquileres", "Marketing",
  "Varios",
];

/**
 * Clave con la que se reconoce a un proveedor pese a cómo venga escrito en cada factura.
 * «GRAU DISTRIBUCIONS, S.L.», «Grau Distribucions SL» y «grau distribucions» son el mismo
 * proveedor, y si no se unifican hay que etiquetarlo tres veces y el gasto sale partido.
 */
export function claveProveedor(nombre) {
  return String(nombre || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    // Formas jurídicas y ruido: no distinguen a un proveedor de otro.
    .replace(/[.,]/g, " ")
    .replace(/\b(s\s?l\s?u|s\s?l|s\s?a\s?u|s\s?a|s\s?c\s?p|s\s?c|c\s?b|slne|sociedad limitada|sociedad anonima)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** ¿Es una categoría del catálogo? Comparación tolerante a mayúsculas y acentos. */
export function normalizarCategoria(valor, catalogo = CATEGORIAS) {
  const n = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const buscada = n(valor);
  if (!buscada) return null;
  return catalogo.find((c) => n(c) === buscada) || null;
}

/**
 * Índice proveedor → categorías, listo para consultar. Las filas vienen de la tabla de
 * etiquetas: [{proveedor, categoria}].
 */
export function indiceCategorias(filas = []) {
  const m = new Map();
  for (const f of filas) {
    const k = claveProveedor(f.proveedor);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    if (!m.get(k).includes(f.categoria)) m.get(k).push(f.categoria);
  }
  for (const [, v] of m) v.sort((a, b) => CATEGORIAS.indexOf(a) - CATEGORIAS.indexOf(b));
  return m;
}

/** Categorías de un proveedor concreto. Array vacío si nadie lo ha etiquetado todavía. */
export const categoriasDe = (proveedor, indice) => indice.get(claveProveedor(proveedor)) || [];

/**
 * Reparto del gasto por categoría.
 *
 * Un proveedor con DOS categorías (Grau: bebidas + alcohol) plantea un problema real: si se
 * suma su gasto entero en las dos, el total sale inflado y no cuadra con la factura. Aquí se
 * REPARTE a partes iguales entre sus categorías, y se dice en `repartido` cuánto gasto ha
 * tenido que repartirse. Un número que no cuadra con las facturas es peor que uno aproximado
 * que avisa de que lo es.
 *
 * Lo que no está etiquetado NO se mete en «Varios»: va aparte, en `sinCategoria`. Si no,
 * «Varios» crecería sin que nadie supiera si es que hay mucho gasto vario o es que falta
 * etiquetar proveedores.
 */
export function gastoPorCategoria(filas = [], indice = new Map()) {
  const acc = new Map();
  let sinCategoria = 0, sinCatProveedores = new Set(), repartido = 0, total = 0;

  for (const f of filas) {
    const importe = Number(f.importe) || 0;
    total += importe;
    const cats = categoriasDe(f.proveedor, indice);
    if (!cats.length) {
      sinCategoria += importe;
      if (f.proveedor) sinCatProveedores.add(String(f.proveedor));
      continue;
    }
    if (cats.length > 1) repartido += importe;
    const trozo = importe / cats.length;
    for (const c of cats) {
      if (!acc.has(c)) acc.set(c, { categoria: c, importe: 0, proveedores: new Set() });
      const g = acc.get(c);
      g.importe += trozo;
      if (f.proveedor) g.proveedores.add(String(f.proveedor));
    }
  }

  const lista = [...acc.values()]
    .map((g) => ({ ...g, importe: Math.round(g.importe * 100) / 100, proveedores: [...g.proveedores].sort((a, b) => a.localeCompare(b, "es")) }))
    .sort((a, b) => b.importe - a.importe);

  return {
    categorias: lista,
    sinCategoria: Math.round(sinCategoria * 100) / 100,
    sinCatProveedores: [...sinCatProveedores].sort((a, b) => a.localeCompare(b, "es")),
    repartido: Math.round(repartido * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
