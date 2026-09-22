// Un origen sin datos no equivale a cero. No presentar pérdidas o beneficios
// hasta disponer de ambos importes para el mismo ámbito.
export function resultadoRegistrado(ventas, gastos) {
  if (!ventas?.disponible || !gastos?.disponible) return null;
  if (ventas.total == null || gastos.total == null) return null;
  const v = Number(ventas.total), g = Number(gastos.total);
  return Number.isFinite(v) && Number.isFinite(g) ? Math.round((v - g) * 100) / 100 : null;
}
