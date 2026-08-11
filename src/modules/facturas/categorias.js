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

/**
 * Catálogo en dos niveles: categoría y, dentro, subcategoría.
 *
 * Un proveedor es de UNA categoría con su subcategoría —Grau es «Bebidas · Alcohólicas»— y no
 * de dos categorías sueltas. La diferencia importa: con dos categorías sueltas su gasto había
 * que repartirlo entre ambas y las cifras salían aproximadas. Con categoría y subcategoría, el
 * gasto va entero a un sitio, «Bebidas» es la suma exacta de sus subcategorías, y aun así se
 * puede afinar («cuánto en vino» sin dejar de saber «cuánto en bebida»).
 *
 * Sobre «alcohólicas»: en lugar de un cajón único se parte en cervezas, vinos y licores. Un
 * bloque «Alcohólicas» de 20.000 € no contesta ninguna pregunta que se haga de verdad, y
 * «cuánto vino compro» sí. Filtrando por «Bebidas» siguen saliendo las tres juntas.
 */
export const CATALOGO = [
  { nombre: "Bebidas", subs: ["Refrescos", "Aguas", "Zumos", "Cervezas", "Vinos y cavas", "Licores y destilados", "Cafés e infusiones"] },
  { nombre: "Carne y aves", subs: ["Ternera", "Cerdo", "Pollo y aves", "Cordero y caza"] },
  { nombre: "Embutidos y quesos", subs: ["Embutido", "Jamón", "Quesos"] },
  { nombre: "Pescado y marisco", subs: ["Pescado fresco", "Marisco", "Salazones y ahumados"] },
  { nombre: "Fruta y verdura", subs: [] },
  { nombre: "Pan y bollería", subs: [] },
  { nombre: "Congelados", subs: [] },
  { nombre: "Ultramarinos y conservas", subs: ["Aceite y vinagre", "Conservas", "Legumbres y pasta", "Especias y salsas", "Postres y helados"] },
  { nombre: "Limpieza e higiene", subs: [] },
  { nombre: "Desechables y envases", subs: [] },
  { nombre: "Menaje y utillaje", subs: [] },
  { nombre: "Suministros", subs: ["Luz", "Agua", "Gas", "Internet y teléfono", "Basuras"] },
  { nombre: "Mantenimiento y obras", subs: [] },
  { nombre: "Servicios y profesionales", subs: ["Gestoría", "Prevención y formación", "Software y licencias", "Otros servicios"] },
  { nombre: "Impuestos y seguros", subs: [] },
  { nombre: "Alquileres", subs: [] },
  { nombre: "Marketing", subs: [] },
  { nombre: "Varios", subs: [] },
];

/**
 * El color de cada categoría. NO es decoración: es lo que permite leer «en qué se va el dinero»
 * sin leer. Hoy todas las barras son del mismo verde y solo cambia la longitud, así que hay que
 * ir etiqueta por etiqueta para saber qué es cada cosa.
 *
 * Se guardan NOMBRES DE TOKEN, no colores: el valor de cada uno lo pone el CSS y cambia entre
 * el tema claro y el oscuro. Un hexadecimal escrito aquí se vería mal en uno de los dos —que es
 * justo lo que pasa hoy con la paleta cableada del dashboard.
 *
 * La agrupación tiene sentido de cocina, no de diseño: la comida en tonos cálidos (lo que se
 * compra a diario y se mira más), la limpieza y el menaje en fríos, y el gasto estructural
 * —alquiler, impuestos, gestoría— en grises, porque es el que no se toca.
 */
export const COLOR_CATEGORIA = {
  "Bebidas": "uva",
  "Carne y aves": "carne",
  "Embutidos y quesos": "curado",
  "Pescado y marisco": "mar",
  "Fruta y verdura": "huerta",
  "Pan y bollería": "pan",
  "Congelados": "hielo",
  "Ultramarinos y conservas": "despensa",
  "Limpieza e higiene": "limpieza",
  "Desechables y envases": "envase",
  "Menaje y utillaje": "menaje",
  "Suministros": "gris",
  "Mantenimiento y obras": "gris",
  "Servicios y profesionales": "gris",
  "Impuestos y seguros": "gris",
  "Alquileres": "gris",
  "Marketing": "marketing",
  "Varios": "gris",
};

/** El token de color de una categoría. Lo que no está en el catálogo va en gris, no en rojo. */
export function colorCategoria(categoria) {
  return COLOR_CATEGORIA[normalizarCategoria(categoria)] || "gris";
}

/** Solo los nombres de categoría, que es lo que se guarda y con lo que se filtra. */
export const CATEGORIAS = CATALOGO.map((c) => c.nombre);

/** Subcategorías de una categoría. Vacío si esa categoría no se subdivide. */
export const subcategoriasDe = (categoria) => (CATALOGO.find((c) => c.nombre === categoria) || {}).subs || [];

/**
 * Categorías de gasto estructural: lo que se paga para tener el negocio abierto, no lo que se
 * vende. De estas facturas NO se lee el detalle línea a línea, por dos razones:
 *
 *   · No se va a analizar. «Cuántas Coca-Colas he comprado» tiene sentido; «cuántos alquileres
 *     de julio» no. La línea de una factura de la luz o del gestor no es un producto.
 *   · Ensucia. Sin esto, «Qué compramos» acaba con «Alquiler local julio», «Cuota mensual
 *     asesoría» y «Consumo kWh» mezclados entre las gambas y el aceite, y el ranking de gasto
 *     por producto deja de servir para lo que sirve.
 *
 * El gasto SÍ cuenta: la factura se guarda igual y suma en los totales y en su categoría. Lo
 * único que no se guarda es el desglose.
 */
export const SIN_LINEAS = new Set([
  "Suministros", "Mantenimiento y obras", "Servicios y profesionales",
  "Impuestos y seguros", "Alquileres", "Marketing",
]);

/** Subcategorías que ya no existen o cambiaron de sitio, para no perderlas al migrar. */
export const ALIAS_CATEGORIA = {
  "alcohol": { categoria: "Bebidas", sub: "Licores y destilados" },
  "cafe e infusiones": { categoria: "Bebidas", sub: "Cafés e infusiones" },
  "carne": { categoria: "Carne y aves", sub: "" },
};

/**
 * ¿Hay que leer el detalle de las facturas de este proveedor?
 *
 * Sin categorías → SÍ. No saber de qué es un proveedor no es razón para dejar de leerlo; el
 * daño de no leer algo que había que leer (un hueco silencioso en el histórico de compras) es
 * mayor que el de leer algo que no hacía falta (una línea de más).
 *
 * Con categorías → solo si alguna es de mercancía. Un proveedor que es «Suministros» y nada
 * más no se lee; uno que sea «Suministros» y «Bebidas» sí, porque parte de lo que vende sí
 * interesa.
 */
export function seLeenLineas(categorias = []) {
  if (!categorias.length) return true;
  return categorias.some((c) => !SIN_LINEAS.has(c));
}

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

const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Nombre bueno de un proveedor, según lo que ya se haya corregido a mano.
 *
 * «Viruta Bronco S.L.» es en realidad «Virutas Branco S.L.»: la lectura se equivoca siempre
 * igual, así que corregirlo una vez debería valer para las siguientes.
 *
 * Se busca PRIMERO POR NIF y luego por el nombre. El NIF es lo único que no cambia entre
 * facturas del mismo proveedor: si el nombre se lee mal de otra forma la próxima vez
 * («Viruta Branko»), el alias por nombre ya no casaría y el del NIF sí.
 *
 * `alias` = [{ clave, nif, proveedor }].
 */
export function nombreCanonico({ proveedor, nif } = {}, alias = []) {
  const n = normNifProv(nif);
  if (n) {
    const porNif = alias.find((a) => normNifProv(a.nif) && normNifProv(a.nif) === n);
    if (porNif) return porNif.proveedor;
  }
  const k = claveProveedor(proveedor);
  if (!k) return null;
  const porNombre = alias.find((a) => a.clave === k);
  return porNombre ? porNombre.proveedor : null;
}

const normNifProv = (s) => String(s || "").replace(/[\s.\-/]/g, "").toUpperCase();

/** ¿Es una categoría del catálogo? Comparación tolerante a mayúsculas y acentos. */
export function normalizarCategoria(valor, catalogo = CATEGORIAS) {
  const buscada = norm(valor);
  if (!buscada) return null;
  return catalogo.find((c) => norm(c) === buscada) || null;
}

/**
 * Valida el par (categoría, subcategoría). Devuelve `null` si la categoría no existe, y la
 * subcategoría se limpia a "" si no pertenece a esa categoría: NUNCA se guarda una
 * subcategoría colgando de la categoría equivocada, porque el desglose dejaría de sumar.
 */
export function normalizarPar(categoria, subcategoria) {
  const cat = normalizarCategoria(categoria);
  if (!cat) {
    // «Alcohol» y «Café e infusiones» eran categorías sueltas antes de partir Bebidas.
    const alias = ALIAS_CATEGORIA[norm(categoria)];
    if (!alias) return null;
    return { categoria: alias.categoria, subcategoria: alias.sub };
  }
  const subs = subcategoriasDe(cat);
  const sub = subs.find((x) => norm(x) === norm(subcategoria)) || "";
  return { categoria: cat, subcategoria: sub };
}

/** Cómo se escribe un par para leerlo: «Bebidas · Vinos y cavas». */
export const etiquetaPar = (p) => (p.subcategoria ? `${p.categoria} · ${p.subcategoria}` : p.categoria);

/**
 * Índice proveedor → pares {categoria, subcategoria}. Las filas vienen de la tabla de
 * etiquetas. La clave del mapa es la del proveedor normalizada, así que las distintas formas
 * de escribir el mismo nombre caen en la misma entrada.
 */
export function indiceCategorias(filas = []) {
  const m = new Map();
  for (const f of filas) {
    const k = claveProveedor(f.proveedor);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    const par = { categoria: f.categoria, subcategoria: f.subcategoria || "" };
    if (!m.get(k).some((x) => x.categoria === par.categoria && x.subcategoria === par.subcategoria)) m.get(k).push(par);
  }
  for (const [, v] of m) {
    v.sort((a, b) => CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria)
      || String(a.subcategoria).localeCompare(String(b.subcategoria), "es"));
  }
  return m;
}

/** Pares de un proveedor concreto. Array vacío si nadie lo ha etiquetado todavía. */
export const categoriasDe = (proveedor, indice) => indice.get(claveProveedor(proveedor)) || [];
/** Solo los nombres de categoría, sin repetir: para decidir si se leen las líneas. */
export const soloCategorias = (pares = []) => [...new Set(pares.map((p) => p.categoria))];

/**
 * Reparto del gasto por categoría, con su desglose en subcategorías.
 *
 * Lo normal es que un proveedor tenga UN par (Grau → Bebidas · Alcohólicas), y entonces su
 * gasto va entero a un sitio: no hay nada aproximado. Si alguien tiene varios pares se
 * reparte a partes iguales y se dice cuánto ha habido que repartir — sumar el gasto entero
 * en cada uno inflaría el total y dejaría de cuadrar con las facturas.
 *
 * `categoria.importe` es SIEMPRE la suma exacta de sus subcategorías. Esa es la ventaja de
 * los dos niveles sobre las categorías sueltas: se puede afinar sin perder el total.
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
    const pares = categoriasDe(f.proveedor, indice);
    if (!pares.length) {
      sinCategoria += importe;
      if (f.proveedor) sinCatProveedores.add(String(f.proveedor));
      continue;
    }
    if (pares.length > 1) repartido += importe;
    const trozo = importe / pares.length;
    for (const par of pares) {
      if (!acc.has(par.categoria)) acc.set(par.categoria, { categoria: par.categoria, importe: 0, proveedores: new Set(), subs: new Map() });
      const g = acc.get(par.categoria);
      g.importe += trozo;
      if (f.proveedor) g.proveedores.add(String(f.proveedor));
      const sk = par.subcategoria || "";
      g.subs.set(sk, (g.subs.get(sk) || 0) + trozo);
    }
  }

  const red = (n) => Math.round(n * 100) / 100;
  const lista = [...acc.values()].map((g) => ({
    categoria: g.categoria,
    importe: red(g.importe),
    proveedores: [...g.proveedores].sort((a, b) => a.localeCompare(b, "es")),
    subs: [...g.subs.entries()]
      .map(([subcategoria, importe]) => ({ subcategoria, importe: red(importe) }))
      .sort((a, b) => b.importe - a.importe),
  })).sort((a, b) => b.importe - a.importe);

  return {
    categorias: lista,
    sinCategoria: red(sinCategoria),
    sinCatProveedores: [...sinCatProveedores].sort((a, b) => a.localeCompare(b, "es")),
    repartido: red(repartido),
    total: red(total),
  };
}
