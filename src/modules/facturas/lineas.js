// Facturas — las líneas del detalle. PURO.
//
// Fase A de docs/lineas-de-factura.md: leer y guardar las líneas, sin enlazarlas todavía
// con inventario ni con Ágora. Con eso solo ya se contesta «cuántas Coca-Colas hemos
// comprado desde marzo» y, sobre todo, «a cómo nos las están cobrando y cómo ha cambiado».
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  LA SUMA DE LAS LÍNEAS TIENE QUE CUADRAR CON LA BASE IMPONIBLE.              │
// │                                                                              │
// │  Un total se verifica solo: base + IVA = total. Una cantidad de línea no se  │
// │  verifica contra nada, así que si se lee «12» donde ponía «1,2» no lo        │
// │  detecta nadie y ese error se arrastra a todo lo que venga detrás. Con la    │
// │  suma cuadrando, casi cualquier error de lectura descuadra el total y salta. │
// │                                                                              │
// │  Y si una línea no se lee bien, SE DICE. Una factura con 18 de 20 líneas y   │
// │  2 marcadas es útil. Una con 20 de las que 2 son inventadas es peor que no   │
// │  tener nada, porque no se sabe cuáles.                                       │
// └──────────────────────────────────────────────────────────────────────────────┘

// Tolerancia al cuadrar. Los redondeos por línea son reales: un céntimo por línea en una
// factura de 30 líneas son 30 céntimos, y eso no es un error de lectura.
export const TOLERANCIA_ABS = 0.02;      // por línea
export const TOLERANCIA_MIN = 0.05;      // suelo, para facturas de pocas líneas
export const TOLERANCIA_PCT = 0.01;      // 1 % de la base, para las grandes

// Número o null. El `null` importa: si esto devolviera 0 para lo que no se lee, una
// cantidad ilegible se convertiría en «compramos 0», que es una mentira que además cuadra.
const n = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

// Normaliza una línea tal y como la devuelve el modelo. Nunca inventa: lo que no venga
// queda en null y se marca.
export function normalizarLinea(cruda = {}, orden = 0) {
  const descripcion = String(cruda.descripcion ?? "").trim().slice(0, 300);
  const cantidad = n(cruda.cantidad);
  const precio = n(cruda.precio_unitario);
  let importe = n(cruda.importe);

  // Si falta el importe pero están cantidad y precio, se deriva: es aritmética, no adivinar.
  if (importe == null && cantidad != null && precio != null) importe = Math.round(cantidad * precio * 100) / 100;

  return {
    orden,
    descripcion,
    cantidad,
    unidad: String(cruda.unidad ?? "").trim().slice(0, 20) || null,
    precio_unitario: precio,
    importe,
    // Una línea es dudosa si le falta lo mínimo para servir de algo.
    dudosa: !descripcion || importe == null,
  };
}

export function normalizarLineas(crudas) {
  if (!Array.isArray(crudas)) return [];
  return crudas.map((l, i) => normalizarLinea(l, i)).filter((l) => l.descripcion || l.importe != null);
}

// ¿Cuadran las líneas con la base imponible de la cabecera?
export function validarSuma(lineas = [], baseImponible) {
  const base = n(baseImponible);
  const conImporte = lineas.filter((l) => l.importe != null);
  const suma = Math.round(conImporte.reduce((s, l) => s + l.importe, 0) * 100) / 100;

  if (!lineas.length) return { cuadra: false, motivo: "sin_lineas", suma: 0, base, diferencia: null };
  if (base == null) return { cuadra: false, motivo: "sin_base", suma, base: null, diferencia: null };

  const tolerancia = Math.max(TOLERANCIA_MIN, lineas.length * TOLERANCIA_ABS, Math.abs(base) * TOLERANCIA_PCT);
  const diferencia = Math.round((suma - base) * 100) / 100;
  const dudosas = lineas.filter((l) => l.dudosa).length;

  if (Math.abs(diferencia) > tolerancia) {
    return { cuadra: false, motivo: "descuadre", suma, base, diferencia, tolerancia: Math.round(tolerancia * 100) / 100, dudosas };
  }
  // Aunque cuadre, si hay líneas que no se leyeron se dice: el número global puede estar
  // bien y aun así faltar el detalle de dos productos.
  return { cuadra: true, motivo: dudosas ? "cuadra_con_dudosas" : "ok", suma, base, diferencia, dudosas };
}

export function mensajeValidacion(v) {
  if (!v) return null;
  if (v.motivo === "sin_lineas") return "No se pudo leer el detalle de esta factura.";
  if (v.motivo === "sin_base") return "El detalle se leyó, pero la factura no trae base imponible con la que contrastarlo.";
  if (v.motivo === "descuadre") {
    return `El detalle suma ${v.suma} € y la base imponible es ${v.base} € (${v.diferencia > 0 ? "+" : ""}${v.diferencia} €). Revísalo antes de fiarte de las cantidades.`;
  }
  if (v.motivo === "cuadra_con_dudosas") return `Cuadra con la base, pero ${v.dudosas} ${v.dudosas === 1 ? "línea" : "líneas"} no se leyeron del todo.`;
  return null;
}

// ── Agrupar para responder «cuántas Coca-Colas» ──────────────────────────────
// Sin diccionario de productos todavía: se agrupa por la descripción tal cual la escribe
// el proveedor, normalizando solo lo que es ruido evidente (mayúsculas, acentos, espacios
// dobles). Dos proveedores que llamen distinto al mismo producto seguirán saliendo
// separados, y eso es correcto en esta fase: es mejor dos filas honestas que una fusión
// inventada.
export function claveProducto(descripcion) {
  return String(descripcion || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function agruparPorProducto(lineas = []) {
  const mapa = new Map();
  for (const l of lineas) {
    const k = claveProducto(l.descripcion);
    if (!k) continue;
    if (!mapa.has(k)) {
      mapa.set(k, {
        clave: k, descripcion: l.descripcion, proveedores: new Set(),
        cantidad: 0, importe: 0, veces: 0, conImporte: 0, conCantidad: 0, dudosas: 0,
        precioMin: null, precioMax: null, primera: null, ultima: null, ultimoPrecio: null,
      });
    }
    const g = mapa.get(k);
    g.veces += 1;
    if (l.dudosa) g.dudosas += 1;
    if (l.proveedor) g.proveedores.add(l.proveedor);
    if (l.cantidad != null) { g.cantidad += l.cantidad; g.conCantidad += 1; }
    if (l.importe != null) { g.importe += l.importe; g.conImporte += 1; }
    const p = l.precio_unitario;
    if (p != null) {
      g.precioMin = g.precioMin == null ? p : Math.min(g.precioMin, p);
      g.precioMax = g.precioMax == null ? p : Math.max(g.precioMax, p);
    }
    const f = l.fecha || null;
    if (f) {
      if (!g.primera || f < g.primera) g.primera = f;
      if (!g.ultima || f >= g.ultima) { g.ultima = f; if (p != null) g.ultimoPrecio = p; }
    }
  }
  return [...mapa.values()]
    .map((g) => ({
      ...g,
      proveedores: [...g.proveedores],
      // null y no 0 cuando NINGUNA línea traía el dato: un «0 €» se lee como «no gastamos
      // nada», y lo que pasa es que no se pudo leer. No es lo mismo.
      cantidad: g.conCantidad ? Math.round(g.cantidad * 1000) / 1000 : null,
      importe: g.conImporte ? Math.round(g.importe * 100) / 100 : null,
      // Cuánto ha subido el precio de la primera vez a la última. Es la cifra que hace que
      // esto valga la pena sin haber enlazado nada todavía.
      variacionPct: g.precioMin != null && g.precioMax != null && g.precioMin > 0
        ? Math.round(((g.precioMax - g.precioMin) / g.precioMin) * 1000) / 10
        : null,
    }))
    .sort((a, b) => (b.importe ?? -1) - (a.importe ?? -1));
}
