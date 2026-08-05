// Ágora JSON  →  nuestro modelo. PURO y testeable (sin red).
//
// ⚠️ AJUSTAR con la respuesta REAL de la API de Ágora ("Servicios de Integración").
// La especificación de campos no es pública; hoy se aceptan varios nombres candidatos
// (importe/total/ventas, tickets/numDocumentos, comensales/cubiertos…) para que, en cuanto
// veamos una respuesta real (doc del distribuidor o script de sondeo con un local abierto),
// baste con fijar aquí los nombres correctos. Hay un test con una muestra mock.

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return undefined;
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function int(v) { return Math.round(num(v)); }
const r2 = (n) => Math.round(n * 100) / 100;

// Normaliza una "venta de un día" de un local.
export function mapVentasDia(json, { dia } = {}) {
  if (json == null) return null;
  // Ágora puede devolver un objeto de resumen o un array de documentos/tickets; contemplamos ambos.
  if (Array.isArray(json)) return mapVentasDesdeDocumentos(json, { dia });
  const ventas = num(pick(json, ["importe", "total", "ventas", "totalVentas", "importeTotal", "Total", "Importe"]));
  const tickets = int(pick(json, ["tickets", "numTickets", "documentos", "numDocumentos", "count", "NumTickets"]) || 0);
  const comensales = int(pick(json, ["comensales", "cubiertos", "personas", "Comensales"]) || 0);
  const tm = pick(json, ["ticketMedio", "ticket_medio", "TicketMedio"]);
  const ticket_medio = tm != null ? r2(num(tm)) : (tickets > 0 ? r2(ventas / tickets) : 0);
  return { dia: dia || pick(json, ["fecha", "dia", "date", "Fecha"]) || null, ventas: r2(ventas), tickets, comensales, ticket_medio };
}

// Si la API devuelve la lista de documentos/tickets del día, los agregamos.
export function mapVentasDesdeDocumentos(docs, { dia } = {}) {
  const list = Array.isArray(docs) ? docs : [];
  let ventas = 0, comensales = 0;
  for (const d of list) {
    ventas += num(pick(d, ["importe", "total", "totalDocumento", "Total", "Importe"]));
    comensales += int(pick(d, ["comensales", "cubiertos", "personas", "Comensales"]) || 0);
  }
  const tickets = list.length;
  return { dia: dia || null, ventas: r2(ventas), tickets, comensales, ticket_medio: tickets > 0 ? r2(ventas / tickets) : 0 };
}
