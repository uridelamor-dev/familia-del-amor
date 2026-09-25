// Resumen del día en curso. Nunca mezcla reservas con comensales de TPV.
const numero = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const red = v => Math.round(v * 100) / 100;
export function resumenHoy(vivo, { hoy, locales = [] }) {
  const d = new Date(hoy + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7);
  const anterior = d.toISOString().slice(0, 10);
  const nombres = [...new Set(locales)];
  const fuentes = nombres.map(local => (vivo?.locales || []).find(l => l.local === local));
  const sumar = (dia, seleccion = fuentes, exigirTodos = false) => {
    const disponibles = seleccion.filter(l => !l?.error && l?.dias?.some(f => f.dia === dia && numero(f.ventas) !== null));
    if (!disponibles.length || (exigirTodos && disponibles.length !== seleccion.length)) return null;
    const filas = disponibles.map(l => l.dias.find(f => f.dia === dia && numero(f.ventas) !== null));
    const ventas = red(filas.reduce((s,f) => s + Number(f.ventas), 0));
    const tickets = filas.every(f => numero(f.tickets) !== null) ? filas.reduce((s,f) => s + Number(f.tickets), 0) : null;
    // El mapper legado escribe cero aunque el informe no proporciona este dato.
    const comensales = filas.every(f => f.comensales_disponibles === true && numero(f.comensales) !== null)
      ? filas.reduce((s,f) => s + Number(f.comensales), 0) : null;
    return { ventas, tickets, comensales, ticketMedio: tickets > 0 ? red(ventas / tickets) : null,
      localesDisponibles: disponibles.map(l => l.local), totalLocales: nombres.length,
      parcial: disponibles.length < nombres.length };
  };
  // Una caché de ayer no puede aparecer como ventas de hoy.
  const actual = vivo?.hoy === hoy ? sumar(hoy) : null;
  // Comparar exactamente los mismos locales que aportan ventas de hoy.
  const previo = actual ? sumar(anterior, fuentes.filter(l => actual.localesDisponibles.includes(l?.local)), true) : null;
  return { hoy, anterior, actual, previo,
    variacion: actual && previo && previo.ventas > 0 ? red((actual.ventas - previo.ventas) / previo.ventas * 100) : null,
    actualizado: vivo?.guardadoEn || vivo?.generado || null, sinRespuesta: !!vivo?.sinRespuesta };
}
