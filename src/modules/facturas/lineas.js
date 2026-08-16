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
const red = (x) => Math.round(x * 100) / 100;
const n = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

// Normaliza una línea tal y como la devuelve el modelo. Nunca inventa: lo que no venga
// queda en null y se marca.
/**
 * Una línea, con el DESCUENTO aplicado.
 *
 * EL FALLO QUE ARREGLA: las facturas de Tupinamba traen «P.UNIDAD 0,52 · IMPORTE 234,00 ·
 * DTO 48,08 % · TOTAL 121,49». Guardando el precio de tarifa y el importe bruto, «Qué
 * compramos» decía que esas cápsulas costaban 0,52 € y que se habían gastado 1.716 €, cuando
 * en realidad son 0,27 € y la mitad de dinero. Y lo peor: el seguimiento de subidas de precio
 * —que es para lo que sirve esa pantalla— compara precios que nadie paga.
 *
 * Aquí manda SIEMPRE lo que se paga de verdad. El bruto y el descuento se guardan aparte,
 * porque saber que te hacen un 48 % también vale (si un mes deja de aplicarse, se ve).
 */
export function normalizarLinea(cruda = {}, orden = 0) {
  const descripcion = String(cruda.descripcion ?? "").trim().slice(0, 300);
  const cantidad = n(cruda.cantidad);
  const precioBruto = n(cruda.precio_unitario);
  const dto = n(cruda.descuento_pct);
  let bruto = n(cruda.importe);
  let neto = n(cruda.importe_neto);

  // Si falta el importe pero están cantidad y precio, se deriva: es aritmética, no adivinar.
  if (bruto == null && cantidad != null && precioBruto != null) bruto = red(cantidad * precioBruto);

  // El neto: el que venga en la factura manda; si no, se calcula del descuento.
  if (neto == null && bruto != null && dto != null && dto > 0 && dto < 100) neto = red(bruto * (1 - dto / 100));
  if (neto == null) neto = bruto;

  // Y el precio que se guarda es el que se paga: el neto entre las unidades. Si no hay
  // cantidad no se puede repartir, y se deja el de tarifa antes que inventarse uno.
  const precioNeto = (neto != null && cantidad) ? red(neto / cantidad) : precioBruto;

  // Un descuento deducido de dos números que no cuadran es sospechoso: se marca para que la
  // línea salga como dudosa en vez de dar por bueno un precio que nadie ha comprobado.
  const incoherente = bruto != null && neto != null && neto > bruto + 0.01;

  return {
    orden,
    descripcion,
    cantidad,
    unidad: String(cruda.unidad ?? "").trim().slice(0, 20) || null,
    precio_unitario: precioNeto,
    importe: neto,
    // Lo de tarifa, para poder ver el descuento y notar si un mes deja de aplicarse.
    precio_bruto: precioBruto,
    importe_bruto: bruto != null && neto != null && Math.abs(bruto - neto) > 0.01 ? bruto : null,
    descuento_pct: dto != null && dto > 0 && dto < 100 ? dto : null,
    // Una línea es dudosa si le falta lo mínimo para servir de algo.
    dudosa: !descripcion || neto == null || incoherente,
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

/** Las últimas compras, de la más reciente a la más antigua, y como mucho `tope`. */
export function recortarPrecios(precios = [], tope = 40) {
  return [...precios].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, tope);
}

/**
 * La mediana de las últimas compras. Mediana y no media: una oferta puntual —o una línea mal
 * leída— desplaza la media, y entonces un precio normal parece una subida. Con menos de tres
 * compras no se afirma nada: con dos precios no hay «normal» que valga.
 */
export function medianaPrecios(precios = [], { minimo = 3, ventana = 12 } = {}) {
  const v = precios.slice(0, ventana).map((x) => Number(x.precio)).filter((x) => Number.isFinite(x) && x > 0);
  if (v.length < minimo) return null;
  v.sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round(((v[m - 1] + v[m]) / 2) * 100) / 100;
}

/**
 * Una fila YA AGRUPADA por la base de datos, hablada en el idioma del panel.
 *
 * POR QUÉ AGRUPA LA BASE Y NO AQUÍ: si un producto se ha comprado quinientas veces, la
 * pantalla enseña UN producto, no quinientas líneas. Traerse las quinientas para juntarlas
 * después obliga a poner un tope —y con tope, el total deja de ser el total sin que se note—.
 * Agrupando en la consulta salen tantas filas como productos hay, que es lo que se mira; el
 * detalle de las quinientas compras se pide aparte, al pulsar el producto.
 *
 * La base devuelve los precios y sus fechas en dos listas paralelas (es lo que sabe hacer);
 * aquí se casan, porque juntas son lo que permite calcular la mediana y fusionar locales.
 */
export function grupoDeSQL(fila = {}) {
  const precios = (fila.precios || []).map((precio, i) => ({
    precio: Number(precio),
    fecha: String((fila.precios_fechas || [])[i] || "").slice(0, 10),
  })).filter((x) => Number.isFinite(x.precio));

  const conCantidad = Number(fila.concantidad ?? fila.conCantidad) || 0;
  const conImporte = Number(fila.conimporte ?? fila.conImporte) || 0;
  const precioMin = fila.preciomin ?? fila.precioMin ?? null;
  const precioMax = fila.preciomax ?? fila.precioMax ?? null;
  const proveedores = (fila.proveedores || []).filter(Boolean);

  return {
    clave: fila.clave,
    descripcion: fila.descripcion,
    unificado: !!fila.unificado,
    proveedores,
    veces: Number(fila.veces) || 0,
    dudosas: Number(fila.dudosas) || 0,
    conCantidad, conImporte,
    // null significa «no se pudo leer», no «cero». Si ninguna línea traía la cantidad, la
    // cantidad sigue sin existir en vez de convertirse en un 0 que se lee como «no compramos».
    cantidad: conCantidad ? Number(fila.cantidad) : null,
    importe: conImporte ? Number(fila.importe) : null,
    precioMin: precioMin == null ? null : Number(precioMin),
    precioMax: precioMax == null ? null : Number(precioMax),
    primera: fila.primera || null,
    ultima: fila.ultima || null,
    ultimoPrecio: precios.length ? precios[0].precio : null,
    precios: recortarPrecios(precios),
    precioNormal: proveedores.length === 1 ? medianaPrecios(recortarPrecios(precios)) : null,
    variacionPct: precioMin != null && precioMax != null && Number(precioMin) > 0
      ? Math.round(((Number(precioMax) - Number(precioMin)) / Number(precioMin)) * 1000) / 10
      : null,
  };
}

// NOTA: aquí vivía `agruparPorProducto`, que juntaba las líneas en el servidor. Ya no existe:
// la pantalla de Productos agrupa en la CONSULTA (ver `comprasDeLocal` en server.js), porque
// traerse una fila por compra para juntarlas después obligaba a un tope — y con tope el total
// dejaba de ser el total sin que se notara: llegó a enseñar una cuarta parte del gasto.
//
// Lo que devuelve la consulta se traduce con `grupoDeSQL`, más arriba. Y para poder seguir
// probando con líneas de verdad las reglas que no se pueden perder —un null no es un cero, la
// fusión entre locales es exacta—, los tests tienen su propia versión del agrupado en
// `tests/helpers/agrupa-como-la-base.js`, que es donde debe estar: en producción esto lo hace
// PostgreSQL, y mandar dos implementaciones de lo mismo era el problema que se quitó.
