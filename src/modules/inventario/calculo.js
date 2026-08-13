// Inventario — lógica PURA de cálculo (sin efectos ni acceso a BD ni Date). Testeable.
// Flujo: contar productos → comparar con el stock necesario → proponer pedido.
//   cantidad a pedir = stock necesario − cantidad contada  (si ≤ 0, no se pide)
// El "stock necesario" puede variar por temporada alta (fechas MM-DD).

// Número seguro (NaN/no-finito → 0). Nunca negativo cuando se usa para cantidades.
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

// Cantidad válida de conteo: número ≥ 0 (jamás negativa). Vacío/basura → 0.
export function sanitizarCantidad(v) {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return n;
}

// ¿La fecha "MM-DD" cae dentro de [inicio, fin]? Soporta temporadas que cruzan el fin de año
// (p.ej. inicio 11-01, fin 02-15 → activa de noviembre a febrero).
export function enTemporada(hoy, inicio, fin) {
  if (!hoy || !inicio || !fin) return false;
  if (inicio <= fin) return hoy >= inicio && hoy <= fin;
  return hoy >= inicio || hoy <= fin;
}

// Stock necesario de un producto para la fecha dada. Usa el stock de temporada si está
// configurado (temporada_stock + fechas) y "hoy" cae dentro; si no, el stock objetivo normal.
export function stockNecesario(prod = {}, hoy = null) {
  const temp = prod.temporada_stock;
  const tempOk = temp !== null && temp !== undefined && temp !== "";
  if (tempOk && prod.temporada_inicio && prod.temporada_fin && hoy && enTemporada(hoy, prod.temporada_inicio, prod.temporada_fin)) {
    return num(temp);
  }
  return num(prod.stock_objetivo);
}

/**
 * ¿Está por debajo del mínimo? Es una SEÑAL, no un cálculo: el mínimo no cambia cuánto se
 * pide —eso lo marca el stock objetivo— sino que avisa de que se está a punto de quedar sin.
 *
 * El campo se rellenaba en la ficha del producto y no lo leía nadie, así que quien lo ponía
 * estaba trabajando para nada. O se usa o se quita; esto es usarlo para lo único que puede
 * decir de verdad.
 */
export function bajoMinimo(prod = {}, contado) {
  const min = num(prod.stock_minimo);
  if (!(min > 0)) return false;                 // sin mínimo puesto no hay nada que avisar
  return num(contado) < min;
}

// Cantidad recomendada a pedir. Nunca negativa.
export function cantidadAPedir(necesario, contado) {
  const d = num(necesario) - num(contado);
  return d > 0 ? d : 0;
}

// Construye la revisión del inventario: por cada producto, lo contado vs. lo necesario.
// `cantidades` es un mapa { [producto_id]: cantidad }. `hoy` = "MM-DD".
export function construirRevision(productos, cantidades, hoy = null) {
  const map = (cantidades && typeof cantidades === "object") ? cantidades : {};
  return (Array.isArray(productos) ? productos : []).map((p) => {
    const contado = sanitizarCantidad(map[p.id]);
    const necesario = stockNecesario(p, hoy);
    const sugerido = cantidadAPedir(necesario, contado);
    return {
      producto_id: p.id, nombre: p.nombre, unidad: p.unidad,
      contado, necesario, diferencia: necesario - contado, sugerido,
      minimo: num(p.stock_minimo), bajoMinimo: bajoMinimo(p, contado),
    };
  });
}

// A partir de la revisión, líneas de la propuesta de pedido (solo lo que hay que pedir > 0).
// La cantidad_final arranca igual que la sugerida; el usuario la puede ajustar después.
export function lineasPropuestaPedido(revision) {
  return (Array.isArray(revision) ? revision : [])
    .filter((r) => num(r.sugerido) > 0)
    .map((r) => ({
      producto_id: r.producto_id, nombre: r.nombre, unidad: r.unidad,
      stock_contado: num(r.contado), stock_necesario: num(r.necesario),
      cantidad_sugerida: num(r.sugerido), cantidad_final: num(r.sugerido), observacion: "",
    }));
}

// Estados válidos de un pedido (no crear más de los necesarios).
export const ESTADOS_PEDIDO = ["DRAFT", "APPROVED", "CANCELLED"];
export function esEstadoPedidoValido(e) { return ESTADOS_PEDIDO.includes(e); }

// Valida "MM-DD" (o vacío → válido, significa "sin fecha").
export function esMMDDValido(s) {
  if (s === null || s === undefined || s === "") return true;
  if (!/^\d{2}-\d{2}$/.test(s)) return false;
  const [mm, dd] = s.split("-").map(Number);
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}
