// Redondeo comercial simétrico: 1,5 × 1,65 debe dar 2,48, también en abonos.
export function redondearImporte(valor) {
  const magnitud = Math.abs(valor) * 100;
  return Math.sign(valor) * Math.round(magnitud + Number.EPSILON * Math.max(1, magnitud)) / 100;
}
