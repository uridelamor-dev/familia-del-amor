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
