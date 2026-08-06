// Ágora — resumen PURO de ventas por local (para visibilidad en el panel).
// Sin BD ni red: agrega filas de ventas_diarias en un resumen legible y en estados claros.

// Suma segura de números que pueden venir como string/null.
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

// Resume las ventas por local: nº de días con datos, último día, ventas/tickets recientes.
// `rows`: [{ local, dia, ventas, tickets, comensales, ticket_medio }]. `desde` (ISO) acota "recientes".
export function resumenVentasPorLocal(rows = [], desde = null) {
  const porLocal = {};
  for (const r of rows) {
    if (!r || !r.local) continue;
    const e = porLocal[r.local] || (porLocal[r.local] = { local: r.local, dias: 0, ultimoDia: null, ventasRecientes: 0, ticketsRecientes: 0 });
    e.dias += 1;
    if (!e.ultimoDia || String(r.dia) > e.ultimoDia) e.ultimoDia = String(r.dia);
    if (!desde || String(r.dia) >= desde) { e.ventasRecientes += n(r.ventas); e.ticketsRecientes += n(r.tickets); }
  }
  return Object.values(porLocal).sort((a, b) => (b.ultimoDia || "").localeCompare(a.ultimoDia || ""));
}

// Estado de datos de un local para el panel, combinando configuración y ventas recogidas.
//  - "sin_configurar": no hay config del TPV.
//  - "desactivado": configurado pero inactivo.
//  - "con_datos": hay ventas en BD.
//  - "sin_datos": configurado y activo, pero aún sin ventas (típico hasta cablear la ruta / abrir el local).
export function estadoDatosLocal({ configurado, activo, dias } = {}) {
  if (!configurado) return "sin_configurar";
  if (!activo) return "desactivado";
  return (Number(dias) || 0) > 0 ? "con_datos" : "sin_datos";
}

export const ETIQUETA_ESTADO_DATOS = {
  sin_configurar: "Sin configurar",
  desactivado: "Desactivado",
  con_datos: "Con datos",
  sin_datos: "Sin datos aún",
};
