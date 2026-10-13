// Misma lectura para cualquier selección de los últimos siete días.
// El respaldo solo sustituye días cerrados; nunca se suma a la lectura del TPV.
export function ventasRecientes({ vivo, respaldo = [], locales, from, to, hoy }) {
  const serie = [];
  let parcial = false, hoyEnVivo = false;
  const valida = r => r && r.ventas != null && Number.isFinite(Number(r.ventas));
  for (let dia = from; dia <= to && dia <= hoy;) {
    let ventas = 0, tickets = 0, disponibles = 0;
    for (const local of new Set(locales)) {
      const fuente = vivo?.hoy === hoy ? vivo.locales?.find(l => l.local === local && !l.error) : null;
      const lectura = fuente?.dias?.find(r => r.dia === dia && valida(r));
      const fila = lectura || (dia < hoy ? respaldo.find(r => r.local === local && r.dia === dia && valida(r)) : null);
      if (fila) {
        disponibles++;
        ventas += Number(fila.ventas);
        tickets += Number(fila.tickets) || 0;
        if (dia === hoy && lectura) hoyEnVivo = true;
      } else parcial = true;
    }
    if (disponibles) serie.push({ dia, ventas: Math.round(ventas * 100) / 100, tickets });
    const siguiente = new Date(dia + 'T00:00:00Z');
    siguiente.setUTCDate(siguiente.getUTCDate() + 1);
    dia = siguiente.toISOString().slice(0, 10);
  }
  return { serie, parcial, hoyEnVivo };
}
