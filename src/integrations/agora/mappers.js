// Ágora JSON → nuestro modelo. PURO y testeable (sin red).
//
// Fuente REAL confirmada (2026-08): GetGlobalSalesReportResponse.Message.Report.Sales es una lista
// de líneas de venta; cada una trae { BusinessDay, NetAmount, GrossAmount, Serie, Number, PosName, … }.
// Validado contra el "Diario de Ventas" de Ágora:
//   NetAmount  = importe CON IVA  → suma por día = "Total"  (p.ej. 3320.50)
//   GrossAmount= base imponible   → suma por día = "Base"   (p.ej. 3018.61)
//   Cuota IVA  = Net - Gross ; nº tickets = nº de (Serie, Number) distintos.

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
const r2 = (n) => Math.round(n * 100) / 100;

// Agrega las líneas de venta en un total por día (BusinessDay → fila de ventas_diarias).
export function agregarVentasPorDia(sales) {
  const byDay = {};
  for (const s of (Array.isArray(sales) ? sales : [])) {
    const dia = String((s && s.BusinessDay) || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    const e = byDay[dia] || (byDay[dia] = { dia, ventas: 0, base: 0, tickets: new Set() });
    e.ventas += num(s.NetAmount);
    e.base += num(s.GrossAmount);
    if (s.Serie != null && s.Number != null) e.tickets.add(String(s.Serie) + "·" + String(s.Number));
  }
  return Object.values(byDay).map((e) => {
    const tickets = e.tickets.size;
    return {
      dia: e.dia,
      ventas: r2(e.ventas),                 // total con IVA (lo que se ve como "Total")
      base_imponible: r2(e.base),           // base sin IVA
      cuota_iva: r2(e.ventas - e.base),     // IVA
      tickets,
      comensales: 0,                        // el informe global no trae comensales
      ticket_medio: tickets ? r2(e.ventas / tickets) : 0,
    };
  }).sort((a, b) => a.dia.localeCompare(b.dia));
}

// Extrae la versión de Ágora del recurso /version/ (contenido: var AGORA_VERSION = '8.7.4';).
export function parseAgoraVersion(texto, porDefecto = "8.7.4") {
  const m = String(texto || "").match(/AGORA_VERSION\s*=\s*'([^']+)'/);
  return m ? m[1] : porDefecto;
}

// IDs de grupos de TPV desde GetAllPosGroupsResponse.Message.All ([{Id,Name}]).
export function extraerPosGroupIds(resp) {
  const all = resp && resp.Message && Array.isArray(resp.Message.All) ? resp.Message.All : [];
  return all.map((g) => g && g.Id).filter((x) => x != null);
}
