// Ágora — REGISTRO de informes del bus (analítica profunda). PURO y testeable.
// Cada definición: cómo construir la petición al bus y cómo NORMALIZAR la respuesta a un shape
// único { columnas, filas, totales, ordenPor } que la tabla genérica del panel sabe pintar.
// Los CLRType, campos de request y forma de fila están CONFIRMADOS en vivo contra el TPV real.
//
// Semántica de fechas confirmada: From y To son AMBOS inclusivos (From=05 To=05 → solo el día 05).

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
const r2 = (n) => Math.round(num(n) * 100) / 100;
const iso = (d) => String(d) + "T00:00:00.000";

// ── Mappers (respuesta cruda del bus → shape normalizado) ──

// Ventas por producto: Report.Sales[] con ProductName/FamilyName/ProductQuantity/ProductNetAmount(con IVA)/ProductGrossAmount(base).
export function mapProducto(resp) {
  const rows = (resp && resp.Message && resp.Message.Report && resp.Message.Report.Sales) || [];
  const filas = rows.map((r) => ({
    producto: r.ProductName || "—",
    familia: r.FamilyName || "",
    uds: num(r.ProductQuantity),
    importe: r2(r.ProductNetAmount),   // con IVA (lo facturado)
    base: r2(r.ProductGrossAmount),    // sin IVA
  })).filter((f) => f.uds || f.importe);
  return {
    columnas: [
      { key: "producto", label: "Producto", tipo: "texto" },
      { key: "familia", label: "Familia", tipo: "texto" },
      { key: "uds", label: "Uds", tipo: "num" },
      { key: "importe", label: "Importe", tipo: "eur" },
    ],
    filas,
    ordenPor: "importe",
  };
}

// Ventas por EMPLEADO: Report.Sales[] por (usuario × método de pago). Se agrega por usuario;
// MethodTotalAmount = lo cobrado (Σ por usuario cuadra con el total del día). Confirmado en vivo.
export function mapEmpleado(resp) {
  const rows = (resp && resp.Message && resp.Message.Report && resp.Message.Report.Sales) || [];
  const byU = {};
  for (const r of rows) {
    const u = r.UserName || "—";
    const e = byU[u] || (byU[u] = { empleado: u, ventas: 0, cancelado: 0 });
    e.ventas += num(r.MethodTotalAmount);
    e.cancelado += num(r.CancellationNetAmount);
  }
  const filas = Object.values(byU).map((e) => ({ empleado: e.empleado, ventas: r2(e.ventas), cancelado: r2(e.cancelado) })).filter((f) => f.ventas || f.cancelado);
  return {
    columnas: [
      { key: "empleado", label: "Empleado", tipo: "texto" },
      { key: "ventas", label: "Ventas", tipo: "eur" },
      { key: "cancelado", label: "Cancelado", tipo: "eur" },
    ],
    filas, ordenPor: "ventas",
  };
}

// CANCELACIONES por usuario: Report.Cancellations[] { UserName, ProductName, Reason, Quantity, CancellationAmount }.
export function mapCancelaciones(resp) {
  const rows = (resp && resp.Message && resp.Message.Report && resp.Message.Report.Cancellations) || [];
  const filas = rows.map((r) => ({
    empleado: r.UserName || "—",
    producto: r.ProductName || "",
    motivo: r.Reason || "",
    uds: num(r.Quantity),
    importe: r2(r.CancellationAmount),
  }));
  return {
    columnas: [
      { key: "empleado", label: "Empleado", tipo: "texto" },
      { key: "producto", label: "Producto", tipo: "texto" },
      { key: "motivo", label: "Motivo", tipo: "texto" },
      { key: "uds", label: "Uds", tipo: "num" },
      { key: "importe", label: "Importe", tipo: "eur" },
    ],
    filas, ordenPor: "uds",
  };
}

// DESCUENTOS por usuario y tipo: Report.Discounts[] { UserName, DiscountName, DiscountType, DiscountCount, DiscountAmount }.
export function mapDescuentos(resp) {
  const rows = (resp && resp.Message && resp.Message.Report && resp.Message.Report.Discounts) || [];
  const filas = rows.map((r) => ({
    empleado: r.UserName || "—",
    descuento: r.DiscountName || "",
    tipo: r.DiscountType || "",
    n: num(r.DiscountCount),
    importe: r2(r.DiscountAmount),
  }));
  return {
    columnas: [
      { key: "empleado", label: "Empleado", tipo: "texto" },
      { key: "descuento", label: "Descuento", tipo: "texto" },
      { key: "tipo", label: "Tipo", tipo: "texto" },
      { key: "n", label: "Nº", tipo: "num" },
      { key: "importe", label: "Importe", tipo: "eur" },
    ],
    filas, ordenPor: "importe",
  };
}

// INVITACIONES por jornada: Report.Invitations[] { BusinessDay, ProductName, Quantity, GrossAmount, NetAmount }.
export function mapInvitaciones(resp) {
  const rows = (resp && resp.Message && resp.Message.Report && resp.Message.Report.Invitations) || [];
  const filas = rows.map((r) => ({
    dia: String(r.BusinessDay || "").slice(0, 10),
    producto: r.ProductName || "",
    uds: num(r.Quantity),
    importe: r2(r.NetAmount),
  }));
  return {
    columnas: [
      { key: "dia", label: "Día", tipo: "texto" },
      { key: "producto", label: "Producto", tipo: "texto" },
      { key: "uds", label: "Uds", tipo: "num" },
      { key: "importe", label: "Importe", tipo: "eur" },
    ],
    filas, ordenPor: "importe",
  };
}

// MÉTODOS DE PAGO: Report.Sales[] una fila por método { PaymentMethod, PaidAmount }. Se agrega por método + %.
export function mapPagos(resp) {
  const rows = (resp && resp.Message && resp.Message.Report && resp.Message.Report.Sales) || [];
  const byM = {};
  for (const r of rows) { const m = r.PaymentMethod || "—"; byM[m] = (byM[m] || 0) + num(r.PaidAmount); }
  const total = Object.values(byM).reduce((s, v) => s + v, 0) || 0;
  const filas = Object.entries(byM).map(([metodo, importe]) => ({ metodo, importe: r2(importe), pct: total ? Math.round((importe / total) * 1000) / 10 : 0 }))
    .filter((f) => f.importe).sort((a, b) => b.importe - a.importe);
  return {
    columnas: [
      { key: "metodo", label: "Método", tipo: "texto" },
      { key: "importe", label: "Importe", tipo: "eur" },
      { key: "pct", label: "%", tipo: "pct" },
    ],
    filas, ordenPor: "importe",
  };
}

// POR HORA / franja: Report.Sales[] { TimeFrameName, TimeFrameIndex, TicketCount, NetAmount }. Agrega por franja,
// orden cronológico (TimeFrameIndex). Sin ordenPor → la tabla respeta el orden por franja.
export function mapHora(resp) {
  const rows = (resp && resp.Message && resp.Message.Report && resp.Message.Report.Sales) || [];
  const byF = {};
  for (const r of rows) {
    const f = r.TimeFrameName || "—";
    const e = byF[f] || (byF[f] = { franja: f, idx: num(r.TimeFrameIndex), tickets: 0, importe: 0 });
    e.tickets += num(r.TicketCount); e.importe += num(r.NetAmount); e.idx = Math.min(e.idx, num(r.TimeFrameIndex));
  }
  const filas = Object.values(byF).sort((a, b) => a.idx - b.idx).map((e) => ({ franja: e.franja, tickets: e.tickets, importe: r2(e.importe) }));
  return {
    columnas: [
      { key: "franja", label: "Franja", tipo: "texto" },
      { key: "tickets", label: "Tickets", tipo: "num" },
      { key: "importe", label: "Importe", tipo: "eur" },
    ],
    filas,
  };
}

// ── Registro de informes ──
export const INFORMES = {
  producto: {
    key: "producto",
    label: "Producto",
    clrType: "IGT.POS.Bus.Reporting.Messages.GetProductSalesReportRequest",
    needs: ["groups", "familias"], // el informe filtra por familias: hay que pasar TODAS
    buildExtra: ({ from, to, groups, familias }) => ({
      From: iso(from), To: iso(to), PosGroupsIds: groups, FamiliesIds: familias,
      IncludeDeliveryNotes: false, IncludeNotSoldProducts: false, SortOrder: 0,
    }),
    map: mapProducto,
  },
  empleado: {
    key: "empleado", label: "Empleado", needs: ["groups"],
    clrType: "IGT.POS.Bus.Reporting.Messages.GetUserSalesFileReportRequest",
    buildExtra: ({ from, to, groups }) => ({ From: iso(from), To: iso(to), PosGroupsIds: groups }),
    map: mapEmpleado,
  },
  cancelaciones: {
    key: "cancelaciones", label: "Cancelaciones", needs: ["groups", "categorias"],
    clrType: "IGT.POS.Bus.Reporting.Messages.GetCancellationsByUserAndTypeReportRequest",
    buildExtra: ({ from, to, groups, categorias }) => ({ From: iso(from), To: iso(to), PosGroupsIds: groups, CategoryIds: categorias }),
    map: mapCancelaciones,
  },
  descuentos: {
    key: "descuentos", label: "Descuentos", needs: ["groups"],
    clrType: "IGT.POS.Bus.Reporting.Messages.GetDiscountsByUserAndTypeReportRequest",
    buildExtra: ({ from, to, groups }) => ({ From: iso(from), To: iso(to), PosGroupsIds: groups }),
    map: mapDescuentos,
  },
  invitaciones: {
    key: "invitaciones", label: "Invitaciones", needs: ["groups"],
    clrType: "IGT.POS.Bus.Reporting.Messages.GetInvitationsByBusinessDayReportRequest",
    buildExtra: ({ from, to, groups }) => ({ From: iso(from), To: iso(to), PosGroupsIds: groups }),
    map: mapInvitaciones,
  },
  pagos: {
    key: "pagos", label: "Métodos de pago", needs: ["groups"],
    clrType: "IGT.POS.Bus.Reporting.Messages.GetPaymentMethodSalesReportRequest",
    buildExtra: ({ from, to, groups }) => ({ From: iso(from), To: iso(to), PosGroupsIds: groups }),
    map: mapPagos,
  },
  hora: {
    key: "hora", label: "Por hora", needs: ["groups", "timeframe"],
    clrType: "IGT.POS.Bus.Reporting.Messages.GetTicketsByTimeFrameReportRequest",
    buildExtra: ({ from, to, groups, timeFrameGroupId }) => ({ From: iso(from), To: iso(to), PosGroupsIds: groups, TimeFrameGroupId: timeFrameGroupId, IncludeDeliveryNotes: false }),
    map: mapHora,
  },
};

export function getInforme(tipo) { return INFORMES[tipo] || null; }
export function listaInformes() { return Object.values(INFORMES).map((d) => ({ key: d.key, label: d.label })); }

// Recalcula la fila de totales (suma de columnas numéricas/eur) sobre un conjunto de filas.
export function calcularTotales(columnas, filas) {
  const out = {};
  for (const c of (columnas || [])) {
    if (c.tipo === "num" || c.tipo === "eur") out[c.key] = r2((filas || []).reduce((s, f) => s + num(f[c.key]), 0));
  }
  return out;
}
