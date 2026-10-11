// Ágora 6.3.3: la propia web obtiene el histórico de los gráficos desde
// GetWorkplace{Sales,Tickets,TableCompanions}HeatMapRequest, con WorkplaceId=null
// para el total. Cada respuesta contiene Message.HeatMap.Days[{Day,Value}].
// No incluye bases ni IVA: se conservan como desconocidos, nunca se estiman.
function leerDias(respuesta, nombre) {
  const rows = respuesta?.Message?.HeatMap?.Days;
  if (!Array.isArray(rows)) throw new Error(`Ágora: respuesta de ${nombre} sin desglose diario`);
  const days = new Map();
  for (const row of rows) {
    const day = String(row?.Day || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || row.Value == null || !Number.isFinite(Number(row.Value))) {
      throw new Error(`Ágora: dato diario inválido en ${nombre}`);
    }
    if (days.has(day)) throw new Error(`Ágora: día repetido en ${nombre}`);
    days.set(day, Number(row.Value));
  }
  return days;
}

export function mapearVentasHeatMap(ventas, tickets, comensales, desde, hasta) {
  const sales = leerDias(ventas, "ventas");
  const counts = leerDias(tickets, "tickets");
  const guests = leerDias(comensales, "comensales");
  return [...sales].filter(([dia]) => dia >= desde && dia < hasta).sort(([a], [b]) => a.localeCompare(b)).map(([dia, amount]) => {
    if (!counts.has(dia) || !guests.has(dia)) throw new Error(`Ágora: informes diarios incompletos (${dia})`);
    const n = counts.get(dia), pax = guests.get(dia);
    if (!Number.isInteger(n) || n < 0 || !Number.isInteger(pax) || pax < 0) throw new Error("Ágora: recuentos diarios inválidos");
    return { dia, ventas: Math.round(amount * 100) / 100, tickets: n, comensales: pax,
      ticket_medio: n ? Math.round(amount / n * 100) / 100 : 0,
      base_imponible: null, cuota_iva: null };
  });
}
