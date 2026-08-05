"use strict";
/* ============================================================================
   ERP Familia del Amor — PROTOTIPO (datos mock, sin backend, sin APIs).
   Todo el estado vive en memoria (MOCK). Al recargar vuelve al estado inicial.
   ========================================================================== */

/* ---------- Formato español ---------- */
const nf = new Intl.NumberFormat("es-ES");
const eur = (n) => nf.format(Math.round(n)) + " €";
const eurK = (n) => (Math.abs(n) >= 1000 ? nf.format(Math.round(n / 100) / 10) + "k €" : eur(n));
const pct = (n, d = 1) => (n >= 0 ? "" : "−") + Math.abs(n).toFixed(d) + "%";
const signed = (n, d = 1) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d) + "%";

/* ---------- Iconos ---------- */
const P = {
  dash:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  shop:'<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9 13h6"/>',
  team:'<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 6a3 3 0 0 1 0 6"/><path d="M21 20a5 5 0 0 0-4-4.9"/>',
  users:'<circle cx="12" cy="8" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  hr:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  cart:'<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6"/>',
  mkt:'<path d="M3 11v3l14 5V6L3 11z"/><path d="M17 8a4 4 0 0 1 0 8"/><path d="M6 14v4a2 2 0 0 0 4 0"/>',
  wrench:'<path d="M14.5 6a3.5 3.5 0 0 0 4.6 4.6L21 12l-9 9-3-3 9-9 1.4-1.9A3.5 3.5 0 0 0 14.5 6z"/><path d="M6 15l3 3"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  spark:'<path d="M12 3l1.6 4.8L18 9l-4.4 1.2L12 15l-1.6-4.8L6 9l4.4-1.2z"/><path d="M5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8z"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  euro:'<path d="M15 5a7 7 0 1 0 0 14M4 10h8M4 14h7"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cal:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  msg:'<path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12z"/>',
  check:'<path d="M20 6L9 17l-5-5"/>',
  aU:'<path d="M12 19V5M5 12l7-7 7 7"/>',aD:'<path d="M12 5v14M5 12l7 7 7-7"/>',
  alert:'<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  wifi:'<path d="M5 12.5a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 18.5h.01"/>',
  star:'<path d="M12 3l2.6 5.6L21 9.4l-4.5 4.3 1.1 6.3L12 17l-5.6 3 1.1-6.3L3 9.4l6.4-.8z"/>',
  box:'<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 22V12"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',pin:'<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',chevD:'<path d="M6 9l6 6 6-6"/>',chevR:'<path d="M9 6l6 6-6 6"/>',
  doc:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
};
const ic = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[n] || ""}</svg>`;

/* ============================================================================
   MOCK STATE — datos base; los agregados se DERIVAN para ser coherentes.
   ========================================================================== */
const ESTAB = [
  { id: 1, n: "La Tapeta · Blanes", short: "Blanes", ini: "TB", empresa: "Del Amor Uriel SLU", ventas: 8420, ly: 7930, pw: 8180, obj: 8600, pPct: 31, cPct: 26, oPct: 8, lyPPct: 34, lyCPct: 27, ocup: 86, res: 34, ticket: 32, franja: "21:00–22:30", crec: 6.2 },
  { id: 2, n: "Cooperativa · Blanes", short: "Cooperativa", ini: "CB", empresa: "Del Amor Uriel SLU", ventas: 5210, ly: 5010, pw: 5120, obj: 5400, pPct: 33, cPct: 25, oPct: 8, lyPPct: 34, lyCPct: 26, ocup: 72, res: 21, ticket: 28, franja: "14:00–15:30", crec: 2.1 },
  { id: 3, n: "La Tapeta · Lloret", short: "Lloret", ini: "TL", empresa: "Del Amor Uriel SLU", ventas: 6890, ly: 6740, pw: 7020, obj: 7000, pPct: 36, cPct: 27, oPct: 9, lyPPct: 35, lyCPct: 27, ocup: 91, res: 29, ticket: 34, franja: "21:00–22:30", crec: -1.9 },
  { id: 4, n: "La Tapeta · Girona", short: "Girona", ini: "TG", empresa: "(por asignar)", ventas: 4120, ly: 5020, pw: 4460, obj: 4800, pPct: 35, cPct: 26, oPct: 9, lyPPct: 33, lyCPct: 25, ocup: 64, res: 18, ticket: 30, franja: "21:30–23:00", crec: -12.4 },
  { id: 5, n: "Can Mateu · Tordera", short: "Can Mateu", ini: "CM", empresa: "(por asignar)", ventas: 3260, ly: 3120, pw: 3180, obj: 3300, pPct: 32, cPct: 24, oPct: 8, lyPPct: 33, lyCPct: 25, ocup: 58, res: 12, ticket: 29, franja: "14:00–15:30", crec: 4.5 },
  { id: 6, n: "La Tapa Ibérica · Tordera", short: "Ibérica", ini: "TI", empresa: "(por asignar)", ventas: 2380, ly: 2360, pw: 2410, obj: 2600, pPct: 33, cPct: 25, oPct: 8, lyPPct: 33, lyCPct: 25, ocup: 44, res: 9, ticket: 27, franja: "13:30–15:00", crec: 0.8 },
  { id: 7, n: "Botiga d'en Mateu · Tordera", short: "Botiga", ini: "BM", empresa: "(por asignar)", ventas: 0, ly: 1180, pw: 0, obj: 1200, pPct: 0, cPct: 0, oPct: 0, lyPPct: 33, lyCPct: 25, ocup: 0, res: 0, ticket: 0, franja: "—", crec: 0, cerrado: true },
];
ESTAB.forEach(e => { e.cli = e.ticket ? Math.round(e.ventas / e.ticket) : 0; e.com = Math.round(e.res * 2.3); });
const byShort = (s) => ESTAB.find(e => e.short === s);

const INCID = [
  { id: 91, local: "Can Mateu", titulo: "Cámara frigorífica — temperatura alta", sev: "hi", estado: "Abierta", dias: 0.1, resp: "Sin asignar", prov: "Frío Costa Brava", coste: 0, reps: 4 },
  { id: 92, local: "Lloret", titulo: "Grifo de barra con fuga", sev: "md", estado: "En proceso", dias: 1, resp: "Oriol Mas", prov: "Fontanería Ríos", coste: 120, reps: 1 },
  { id: 93, local: "Blanes", titulo: "Luz de terraza fundida", sev: "lo", estado: "Abierta", dias: 3, resp: "Sin asignar", prov: "—", coste: 0, reps: 0 },
  { id: 94, local: "Girona", titulo: "Datáfono lento", sev: "md", estado: "En proceso", dias: 4, resp: "Clara Font", prov: "Redsys", coste: 0, reps: 2 },
];
const TEAM = [
  { id: 1, n: "Núria Camps", local: "Blanes", puesto: "Encargada", estado: "Activo", contr: 40, trab: 43, ventas: 0, ticket: 0, res: 4.9, ausencia: false, retraso: false },
  { id: 2, n: "David Soler", local: "Blanes", puesto: "Cocina", estado: "Activo", contr: 40, trab: 41, ventas: 0, ticket: 0, res: 4.7, ausencia: false, retraso: true },
  { id: 3, n: "Aina Prat", local: "Lloret", puesto: "Sala", estado: "Activo", contr: 30, trab: 34, ventas: 2140, ticket: 34, res: 4.8, ausencia: false, retraso: false },
  { id: 4, n: "Oriol Mas", local: "Lloret", puesto: "Encargado", estado: "Vacaciones", contr: 40, trab: 0, ventas: 0, ticket: 0, res: 4.6, ausencia: false, retraso: false },
  { id: 5, n: "Clara Font", local: "Girona", puesto: "Barra", estado: "Activo", contr: 30, trab: 26, ventas: 1620, ticket: 30, res: 4.5, ausencia: false, retraso: false },
  { id: 6, n: "Ivan Ruiz", local: "Can Mateu", puesto: "Cocina", estado: "Baja", contr: 40, trab: 0, ventas: 0, ticket: 0, res: 4.4, ausencia: true, retraso: false },
  { id: 7, n: "Sara Gil", local: "Blanes", puesto: "Sala", estado: "Activo", contr: 25, trab: 31, ventas: 2680, ticket: 33, res: 4.9, ausencia: false, retraso: false },
  { id: 8, n: "Pau Vidal", local: "Cooperativa", puesto: "Cocina", estado: "Activo", contr: 40, trab: 38, ventas: 0, ticket: 0, res: 4.6, ausencia: false, retraso: false },
];
const ORDERS = [
  { id: 501, prov: "Peix Fresc Costa Brava", local: "Blanes", cat: "Pescado", importe: 1240, estado: "Recibido", fecha: "ayer", desv: 3, critico: false },
  { id: 502, prov: "Distribucions Maresme", local: "Lloret", cat: "Bebidas", importe: 2870, estado: "Pendiente", fecha: "mañana", desv: 8, critico: true },
  { id: 503, prov: "Hortofrutícola Tordera", local: "Can Mateu", cat: "Verdura", importe: 540, estado: "Pendiente", fecha: "hoy", desv: -2, critico: false },
  { id: 504, prov: "Forn Vell Blanes", local: "Blanes", cat: "Panadería", importe: 320, estado: "Recibido", fecha: "hoy", desv: 0, critico: false },
  { id: 505, prov: "Carns Selectes Girona", local: "Girona", cat: "Carne", importe: 980, estado: "En camino", fecha: "hoy", desv: 5, critico: false },
];
const REVIEWS = [
  { id: 601, local: "Blanes", autor: "Marta S.", estrellas: 5, texto: "Trato excelente de Núria, comida de 10.", fecha: "hoy", respondida: false, trab: "Núria Camps" },
  { id: 602, local: "Lloret", autor: "Jordi P.", estrellas: 4, texto: "Muy bien, algo de espera en terraza.", fecha: "ayer", respondida: false, trab: "Aina Prat" },
  { id: 603, local: "Girona", autor: "Anna R.", estrellas: 2, texto: "El datáfono no iba y tardamos en pagar.", fecha: "ayer", respondida: false, trab: null },
  { id: 604, local: "Blanes", autor: "Pere V.", estrellas: 5, texto: "Repetiremos seguro.", fecha: "hace 2 días", respondida: true, trab: "Sara Gil" },
];
const ALERTS = [
  { id: 1, sev: "crit", local: "Lloret", causa: "WhatsApp de Sara desconectado (12 min). Riesgo de perder reservas.", tiempo: "12 min", resp: "Oriol Mas", accion: "Reconectar", dept: "Sara", estado: "Nueva" },
  { id: 2, sev: "imp", local: "Blanes", causa: "Reserva de 14 personas sin confirmar (sáb 21:30).", tiempo: "40 min", resp: "Núria Camps", accion: "Confirmar", dept: "Reservas", estado: "Nueva" },
  { id: 3, sev: "imp", local: "—", causa: "3 facturas sin asignar (>40 días).", tiempo: "2 días", resp: "Contabilidad", accion: "Asignar", dept: "Facturación", estado: "Nueva" },
  { id: 4, sev: "imp", local: "Can Mateu", causa: "Cámara frigorífica con temperatura alta (4ª reparación).", tiempo: "2 h", resp: "Sin asignar", accion: "Ver incidencia", dept: "Mantenimiento", estado: "Nueva" },
  { id: 5, sev: "info", local: "Girona", causa: "2 candidaturas nuevas (Cocina, Sala) sin revisar.", tiempo: "hoy", resp: "RR.HH.", accion: "Revisar", dept: "RR.HH.", estado: "Nueva" },
  { id: 6, sev: "info", local: "Girona", causa: "Reservas −18% este fin de semana vs. media.", tiempo: "hoy", resp: "Marketing", accion: "Preparar campaña", dept: "Marketing", estado: "Nueva" },
];
const CLIENTS = [
  { n: "Marta Serra", loc: "Blanes", tag: "VIP", res: 14, last: "hace 3 días" },
  { n: "Jordi Puig", loc: "Lloret", tag: "Habitual", res: 9, last: "hace 1 sem" },
  { n: "Anna Roca", loc: "Girona", tag: "Nuevo", res: 1, last: "ayer" },
  { n: "Pere Vidal", loc: "Blanes", tag: "Habitual", res: 7, last: "hace 5 días" },
  { n: "Laia Bosch", loc: "Can Mateu", tag: "VIP", res: 12, last: "hoy" },
  { n: "Marc Ferrer", loc: "Lloret", tag: "Nuevo", res: 2, last: "hace 2 días" },
];
const CAMPAIGNS = [
  { id: "c1", n: "Cumpleaños del mes", seg: "Cumple agosto · 212 contactos", canal: "WhatsApp", reservas: 34, ingresos: 1120, coste: 0, estado: "Activa" },
  { id: "c2", n: "Menú de temporada", seg: "Clientes VIP", canal: "WhatsApp", reservas: 0, ingresos: 0, coste: 0, estado: "Programada" },
  { id: "c3", n: "Reactivación 45+ días", seg: "Inactivos > 45 días · Girona", canal: "WhatsApp", reservas: 0, ingresos: 0, coste: 0, estado: "Borrador" },
];
const RECOS = [
  { id: "r1", prio: "Alta", titulo: "Girona con ocupación prevista 42% el miércoles", motivo: "Reservas −18% y peor desviación de margen del grupo.", impacto: "+ ~800 € estimados", datos: "Reservas, ocupación, histórico", accion: "Preparar campaña a inactivos (Girona)", estado: "Pendiente", go: "marketing" },
  { id: "r2", prio: "Alta", titulo: "3 facturas llevan 40 días sin pagar", motivo: "Riesgo de recargo con 2 proveedores.", impacto: "Evitar recargos", datos: "Facturación", accion: "Revisar con Contabilidad", estado: "Pendiente", go: "config" },
  { id: "r3", prio: "Media", titulo: "Cámara de Can Mateu: 4ª reparación en 8 meses", motivo: "Coste acumulado supera la sustitución.", impacto: "Ahorro estimado 600 €/año", datos: "Mantenimiento", accion: "Valorar sustitución", estado: "Pendiente", go: "mantenimiento" },
];
/* Estado mutable de UI (en memoria; al recargar vuelve al inicial) */
const S = { view: "dashboard", estab: "all", period: "ayer", collapsed: false, chat: [] };

/* ---------- Derivados coherentes ---------- */
const openIncid = () => INCID.filter(i => i.estado !== "Resuelta");
const pendingOrders = () => ORDERS.filter(o => o.estado === "Pendiente");
const absent = () => TEAM.filter(t => t.ausencia || t.estado === "Baja");
const newAlerts = () => ALERTS.filter(a => a.estado === "Nueva");
const alertsBySev = (s) => newAlerts().filter(a => a.sev === s);
const estabOf = (short) => byShort(short);
const incidOfLocal = (short) => openIncid().filter(i => i.local === short).length;
const absOfLocal = (short) => absent().filter(t => t.local === short).length;
const activeOfLocal = (short) => TEAM.filter(t => t.local === short && t.estado === "Activo").length;
const ordPendOfLocal = (short) => pendingOrders().filter(o => o.local === short).length;
const revAvgLocal = (short) => { const r = REVIEWS.filter(x => x.local === short); return r.length ? (r.reduce((s, x) => s + x.estrellas, 0) / r.length) : null; };
const reviewAvgAll = () => (REVIEWS.reduce((s, x) => s + x.estrellas, 0) / REVIEWS.length);

/* ---------- Finanzas ---------- */
function periodFactor(p) { return p === "7d" ? 6.9 : p === "mes" ? 29.6 : 1; }
function baseFin(e) {
  const costes = e.ventas * (e.pPct + e.cPct + e.oPct) / 100;
  const personal = e.ventas * e.pPct / 100, compras = e.ventas * e.cPct / 100, otros = e.ventas * e.oPct / 100;
  const margen = e.ventas - costes, margenPct = e.ventas ? margen / e.ventas * 100 : 0;
  const lyCostes = e.ly * (e.lyPPct + e.lyCPct + e.oPct) / 100, lyMargen = e.ly - lyCostes, lyMargenPct = e.ly ? lyMargen / e.ly * 100 : 0;
  return { ventas: e.ventas, ly: e.ly, pw: e.pw, obj: e.obj, personal, compras, otros, costes, margen, margenPct, lyMargen, lyMargenPct, ticket: e.ticket, cli: e.cli, res: e.res, com: e.com, ocup: e.ocup };
}
function getFin(scope, period) {
  const list = (scope === "all" ? ESTAB : ESTAB.filter(e => e.id === scope)).filter(e => !e.cerrado || scope !== "all");
  const f = periodFactor(period);
  const keys = ["ventas", "ly", "pw", "obj", "personal", "compras", "otros", "costes", "margen", "lyMargen", "cli", "res", "com"];
  const a = {}; keys.forEach(k => a[k] = 0); let ocupW = 0, n = 0;
  list.forEach(e => { const b = baseFin(e); keys.forEach(k => a[k] += b[k]); ocupW += b.ocup; n++; });
  keys.forEach(k => a[k] = Math.round(a[k] * f));
  a.margenPct = a.ventas ? a.margen / a.ventas * 100 : 0;
  a.lyMargenPct = a.ly ? a.lyMargen / a.ly * 100 : 0;
  a.ticket = a.cli ? a.ventas / a.cli : 0;
  a.ocup = n ? Math.round(ocupW / n) : 0;
  a.dVentasLY = a.ly ? (a.ventas - a.ly) / a.ly * 100 : 0;
  a.dVentasPW = a.pw ? (a.ventas - a.pw) / a.pw * 100 : 0;
  a.dObj = a.obj ? (a.ventas - a.obj) / a.obj * 100 : 0;
  a.dMargen = a.margenPct - a.lyMargenPct;
  return a;
}
function marginWhy(f) {
  const dir = f.dMargen >= 0 ? "aumentó" : "bajó";
  const ventasTxt = f.dVentasLY >= 0 ? "con ventas " + signed(f.dVentasLY) : "aunque las ventas bajaron " + pct(Math.abs(f.dVentasLY));
  const causa = f.dMargen >= 0 ? "menor coste de personal y de compras" : "mayor coste de personal y de compras";
  return `El margen ${dir} ${Math.abs(f.dMargen).toFixed(1)} pts respecto al mismo día del año pasado, ${ventasTxt}, principalmente por ${causa}.`;
}
function scopeLabel() { return S.estab === "all" ? "todos los establecimientos" : ESTAB.find(e => e.id === S.estab).n; }
function periodLabel() { return S.period === "ayer" ? "Ayer" : S.period === "7d" ? "Últimos 7 días" : "Este mes"; }
function comparativaLabel() { return S.period === "ayer" ? "vs. mismo día (martes) del año pasado" : "vs. mismo periodo del año pasado"; }

/* ---------- Series para gráficos (coherentes con el total) ---------- */
function serieVentas(scope, period) {
  const f = getFin(scope, period).ventas; const days = period === "mes" ? 12 : 7;
  const base = f / days; const w = [0.82, 0.9, 0.86, 0.95, 1.08, 1.28, 1.18].concat([0.8, 0.92, 1.0, 1.15, 1.3]);
  return Array.from({ length: days }, (_, i) => Math.round(base * (w[i % w.length])));
}

/* ============================================================================
   GRÁFICOS (SVG inline con hover)
   ========================================================================== */
function area(data, { h = 130, stroke = "var(--brand)", fmt = "eur", labels } = {}) {
  const w = 640, pad = 8, mn = Math.min(...data), mx = Math.max(...data), rng = (mx - mn) || 1;
  const X = i => pad + i * ((w - 2 * pad) / (data.length - 1));
  const Y = v => h - pad - ((v - mn) / rng) * (h - 2 * pad - 6);
  let d = "", a = `M${pad} ${h - pad}`;
  data.forEach((v, i) => { const x = X(i).toFixed(1), y = Y(v).toFixed(1); d += (i ? "L" : "M") + x + " " + y + " "; a += ` L${x} ${y}`; });
  a += ` L${w - pad} ${h - pad} Z`;
  const gid = "g" + Math.random().toString(36).slice(2, 7);
  const lx = X(data.length - 1).toFixed(1), ly = Y(data[data.length - 1]).toFixed(1);
  const pts = data.map((v, i) => ({ x: +X(i).toFixed(1), y: +Y(v).toFixed(1), v, l: labels ? labels[i] : "" }));
  return `<div class="chart" data-pts='${JSON.stringify(pts)}' data-fmt="${fmt}" data-w="${w}" style="position:relative">
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" style="display:block">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${stroke}" stop-opacity=".22"/><stop offset="1" stop-color="${stroke}" stop-opacity="0"/></linearGradient></defs>
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="var(--border)"/>
      <path d="${a}" fill="url(#${gid})"/>
      <path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle class="ep" cx="${lx}" cy="${ly}" r="3.6" fill="var(--surface)" stroke="${stroke}" stroke-width="2"/>
    </svg></div>`;
}
function spark(data, stroke = "var(--brand)") { return area(data, { h: 34, stroke, fmt: "eur" }).replace('class="chart"', 'class="chart mini"'); }
function bars(items, { h = 150, fmt = "eur" } = {}) {
  const mx = Math.max(...items.map(i => i.v)) || 1;
  return `<div style="display:flex;align-items:flex-end;gap:10px;height:${h}px;padding-top:6px">${items.map(it => {
    const bh = Math.max(6, (it.v / mx) * (h - 30));
    return `<button class="barcol" data-tip="${it.label}: ${fmt === "eur" ? eur(it.v) : it.v + (fmt === "pct" ? "%" : "")}" ${it.go ? `data-act="estab" data-id="${it.id}"` : ""} style="flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;min-width:0;background:none">
      <span style="font-size:11px;font-weight:650;color:var(--ink2)" class="tnum">${fmt === "eur" ? eurK(it.v) : it.v + (fmt === "pct" ? "%" : "")}</span>
      <span style="width:100%;height:${bh}px;background:linear-gradient(180deg,${it.c || "var(--brand)"},color-mix(in srgb,${it.c || "var(--brand)"} 72%,transparent));border-radius:7px 7px 3px 3px;transition:height .5s"></span>
      <span style="font-size:10.5px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${it.label}</span></button>`;
  }).join("")}</div>`;
}
function donut(segs, size = 140) {
  const tot = segs.reduce((a, s) => a + s.v, 0) || 1, R = 54, C = 2 * Math.PI * R; let acc = 0;
  const arcs = segs.map(s => { const frac = s.v / tot, len = frac * C, dash = `${Math.max(0, len - 3)} ${C - Math.max(0, len - 3)}`, off = -acc * C + C * .25; acc += frac; return `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${s.c}" stroke-width="15" stroke-dasharray="${dash}" stroke-dashoffset="${off}" transform="rotate(-90 70 70)" stroke-linecap="round"/>`; }).join("");
  return `<svg viewBox="0 0 140 140" width="${size}" height="${size}"><circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--surface2)" stroke-width="15"/>${arcs}<text x="70" y="66" text-anchor="middle" font-size="20" font-weight="700" fill="var(--ink)" style="letter-spacing:-1px">${tot}</text><text x="70" y="84" text-anchor="middle" font-size="10" fill="var(--ink3)">${segs.dLabel || "total"}</text></svg>`;
}
const CATC = ["var(--brand)", "#3F6E93", "#B9822B", "#8A5A9B", "#4C9B8F"];

/* ============================================================================
   COMPONENTES
   ========================================================================== */
const deltaEl = (v, invert) => { const good = invert ? v < 0 : v >= 0; const cls = v === 0 ? "flat" : good ? "up" : "down"; const arr = v > 0 ? ic("aU", 13) : v < 0 ? ic("aD", 13) : ""; return `<span class="delta ${cls}">${arr}${signed(v)}</span>`; };
function stat({ lab, icon, val, unit, delta, invert, spark: sp }) {
  return `<div class="card stat"><div class="lab">${icon ? `<span class="ci">${ic(icon, 14)}</span>` : ""}${lab}</div>
    <div class="val tnum">${val}${unit ? ` <small>${unit}</small>` : ""}</div>${delta != null ? deltaEl(delta, invert) : ""}
    ${sp ? `<div style="position:absolute;right:10px;bottom:8px;width:92px">${spark(sp)}</div>` : ""}</div>`;
}
function card(title, body, right = "") { return `<div class="card">${title ? `<div class="ch"><h3>${title}</h3>${right}</div>` : ""}${body}</div>`; }
const pill = (t, k = "") => `<span class="pill ${k}">${t}</span>`;
const tag = (t) => t === "VIP" ? pill("VIP", "brand") : t === "Nuevo" ? pill("Nuevo", "info") : pill(t);
function estadoState(e) { if (e.cerrado) return { k: "off", t: "Cerrado" }; const f = baseFin(e); if (incidOfLocal(e.short) >= 1 && e.short === "Can Mateu") return { k: "crit", t: "Crítico" }; if (f.dVentasLY < -8 || e.ocup >= 90) return { k: "warn", t: "Necesita atención" }; if (f.margenPct >= 35 && f.dVentasLY >= 0) return { k: "exc", t: "Excelente" }; return { k: "ok", t: "Correcto" }; }

/* ============================================================================
   VISTAS
   ========================================================================== */
const V = {};

V.dashboard = () => {
  const f = getFin(S.estab, S.period);
  const nCrit = alertsBySev("crit").length, nImp = alertsBySev("imp").length;
  const ventasBars = ESTAB.filter(e => !e.cerrado).map(e => ({ label: e.short, v: baseFin(e).ventas, id: e.id, go: 1 }));
  const best = [...ESTAB].filter(e => !e.cerrado).sort((a, b) => b.crec - a.crec)[0];
  const worst = [...ESTAB].filter(e => !e.cerrado).sort((a, b) => a.crec - b.crec)[0];
  const attn = newAlerts();
  // Ventas + margen protagonistas
  const ventasCard = `<div class="card hero"><div class="ch"><h3>Ventas · ${periodLabel()}</h3><span class="pill">${scopeLabel()}</span></div>
    <div class="between" style="align-items:flex-start;margin-bottom:6px">
      <div><div class="big tnum">${eur(f.ventas)}</div>
        <div class="flex" style="gap:14px;margin-top:10px;flex-wrap:wrap">
          ${deltaEl(f.dVentasLY)} <span class="mut" style="font-size:12px">${comparativaLabel()}</span></div>
        <div class="flex" style="gap:14px;margin-top:6px;flex-wrap:wrap;font-size:12px" class="mut">
          <span>${deltaEl(f.dVentasPW)} <span class="mut">vs. semana anterior</span></span>
          <span>${deltaEl(f.dObj)} <span class="mut">vs. objetivo</span></span></div>
      </div>
      <div style="text-align:right"><div class="mut" style="font-size:12px">Ticket medio</div><div class="tnum" style="font-size:20px;font-weight:700">${eur(f.ticket)}</div>
        <div class="mut" style="font-size:12px;margin-top:8px">Clientes</div><div class="tnum" style="font-size:18px;font-weight:700">${nf.format(f.cli)}</div></div>
    </div>${area(serieVentas(S.estab, S.period), { h: 120 })}
    <div class="between" style="margin-top:12px"><span class="mut" style="font-size:12px">Mejor crecimiento: <b class="hl">${best.short} ${signed(best.crec)}</b></span><span class="mut" style="font-size:12px">Peor desviación: <b style="color:var(--danger)">${worst.short} ${signed(worst.crec)}</b></span></div></div>`;

  const margenCard = `<div class="card"><div class="ch"><h3>Margen y beneficio estimado</h3><span class="pill ${f.dMargen >= 0 ? "ok" : "bad"}">${f.dMargen >= 0 ? ic("aU", 12) : ic("aD", 12)} ${signed(f.dMargen)} pts</span></div>
    <div class="between" style="align-items:flex-end"><div><div class="mut" style="font-size:12px">Margen operativo estimado</div><div class="big tnum" style="color:var(--brand)">${eur(f.margen)}</div><div class="mut" style="font-size:12px;margin-top:6px">${f.margenPct.toFixed(1)}% sobre ventas</div></div>
      <div style="text-align:right;font-size:12px" class="mut"><div>Personal <b class="tnum" style="color:var(--ink)">${eur(f.personal)}</b> · ${(f.personal / f.ventas * 100).toFixed(0)}%</div><div style="margin-top:6px">Compras <b class="tnum" style="color:var(--ink)">${eur(f.compras)}</b> · ${(f.compras / f.ventas * 100).toFixed(0)}%</div><div style="margin-top:6px">Otros <b class="tnum" style="color:var(--ink)">${eur(f.otros)}</b></div></div></div>
    <div class="mbar" style="margin-top:14px">
      <span style="width:${f.personal / f.ventas * 100}%;background:#3F6E93"></span><span style="width:${f.compras / f.ventas * 100}%;background:#B9822B"></span><span style="width:${f.otros / f.ventas * 100}%;background:#8A5A9B"></span><span style="width:${f.margenPct}%;background:var(--brand)"></span></div>
    <div class="legend" style="margin-top:10px"><span><i style="background:#3F6E93"></i>Personal</span><span><i style="background:#B9822B"></i>Compras</span><span><i style="background:#8A5A9B"></i>Otros</span><span><i style="background:var(--brand)"></i>Margen</span></div>
    <div style="margin-top:14px;padding:12px;background:var(--brand-soft);border-radius:11px;font-size:12.5px;color:var(--ink);display:flex;gap:9px"><span style="color:var(--brand)">${ic("spark", 16)}</span><span>${marginWhy(f)}</span></div>
    <div class="mut" style="font-size:11px;margin-top:8px">Beneficio estimado, no contabilidad cerrada.</div></div>`;

  const attnCard = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3>Necesita tu atención <span class="pill bad" style="margin-left:6px">${nCrit} críticas</span> <span class="pill warn">${nImp}</span></h3><button class="link" data-act="go" data-view="alertas">Ver todo ${ic("chevR", 13)}</button></div>
    <div class="rows" style="margin-top:6px">${attn.slice(0, 5).map(a => attRow(a)).join("")}</div></div>`;

  const estabStrip = card("Estado por establecimiento", `<div class="rows" style="margin:-4px -18px -18px">${ESTAB.map(e => {
    const st = estadoState(e), f2 = baseFin(e);
    return `<button class="row" data-act="estab" data-id="${e.id}" style="width:100%;text-align:left;background:none"><span class="sdot st-${st.k}"></span><div class="ava">${e.ini}</div>
      <div class="grow"><div class="t1">${e.short}</div><div class="t2">${e.cerrado ? "Cerrado hoy" : eur(f2.ventas) + " · ocup " + e.ocup + "% · " + incidOfLocal(e.short) + " incid."}</div></div>
      <div style="text-align:right"><div class="pill ${st.k === "crit" ? "bad" : st.k === "warn" ? "warn" : st.k === "off" ? "" : "ok"}">${st.t}</div></div>${ic("chevR", 15)}</button>`;
  }).join("")}</div>`, `<span class="mut">${periodLabel()}</span>`);

  const opsCards = `<div class="grid g4">
    ${stat({ lab: "Reservas hoy", icon: "cal", val: nf.format(ESTAB.reduce((s, e) => s + e.res, 0)), delta: 14 })}
    ${stat({ lab: "Comensales", icon: "team", val: nf.format(ESTAB.reduce((s, e) => s + e.com, 0)), delta: 8 })}
    ${stat({ lab: "Faltó hoy", icon: "clock", val: String(absent().length), unit: "persona" + (absent().length !== 1 ? "s" : "") })}
    ${stat({ lab: "Mantenim. abierto", icon: "wrench", val: String(openIncid().length), unit: openIncid().some(i => i.sev === "hi") ? "· 1 crítica" : "" })}</div>`;

  const sara = card("Sara ahora", `<div class="flex" style="gap:12px;margin-bottom:12px"><span class="pill ok">${ic("wifi", 12)} Conectada</span><span class="mut" style="font-size:12px">6 conversaciones activas · ${ESTAB.reduce((s, e) => s + e.res, 0)} reservas hoy</span></div>
    <p style="font-size:13.5px;margin:0 0 12px">${saraSummary()}</p>
    <div class="wrapf"><button class="btn soft sm" data-act="go" data-view="sara">${ic("msg", 14)} Abrir panel de Sara</button><button class="btn ghost sm" data-act="soon">Reconectar WhatsApp</button></div>`, `<button class="link" data-act="go" data-view="sara">Recomendaciones ${ic("chevR", 13)}</button>`);

  const reviews = card("Google Reviews", `<div class="between"><div><div class="big tnum" style="font-size:34px">${reviewAvgAll().toFixed(1).replace(".", ",")}</div><div class="wrapf" style="margin-top:6px">${"★★★★★".split("").map(() => `<span style="color:var(--warning)">${ic("star", 14)}</span>`).join("")}</div></div><div style="width:130px">${area([4.4, 4.5, 4.5, 4.6, 4.6, 4.7, 4.8], { h: 66, fmt: "num" })}</div></div>
    <div class="mut" style="font-size:12px;margin-top:10px">${REVIEWS.filter(r => !r.respondida).length} sin responder · <b class="hl" data-act="go" data-view="marketing" style="cursor:pointer">gestionar</b></div>`);

  return opsCards + `<div class="grid g12" style="margin-top:16px">
    <div class="c8">${ventasCard}</div><div class="c4">${margenCard}</div>
    <div class="c7">${attnCard}</div><div class="c5">${estabStrip}</div>
    <div class="c8">${card("Ventas por establecimiento", bars(ventasBars), `<span class="mut">${periodLabel()}</span>`)}</div>
    <div class="c4">${reviews}</div><div class="c12">${sara}</div></div>`;
};

function attRow(a, done) {
  const icn = a.dept === "Sara" ? "wifi" : a.sev === "crit" ? "alert" : a.sev === "imp" ? "alert" : "bell";
  const k = a.sev === "crit" ? "bad" : a.sev === "imp" ? "warn" : "info";
  const reviewed = a.estado === "Revisada";
  return `<div class="att ${reviewed ? "done" : ""}"><div class="ic ${k}">${ic(icn, 17)}</div>
    <div class="grow"><b>${a.causa}</b><div class="meta">${a.local !== "—" ? ic("pin", 11) + " " + a.local + " · " : ""}${a.tiempo} · ${a.dept} · ${a.resp}</div></div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px">${reviewed ? pill("Revisada", "ok") : `<button class="btn ghost sm" data-act="alert-act" data-id="${a.id}">${a.accion}</button><button class="link" data-act="alert-review" data-id="${a.id}" style="font-size:11.5px">Marcar revisada</button>`}</div></div>`;
}

V.establecimientos = () => `<div class="grid g3">${ESTAB.map(e => {
  const st = estadoState(e), f = baseFin(e);
  return `<button class="card lift" data-act="estab" data-id="${e.id}" style="text-align:left;display:flex;flex-direction:column;gap:14px">
    <div class="flex" style="align-items:flex-start"><div class="ava" style="width:44px;height:44px;border-radius:12px;font-size:15px">${e.ini}</div>
      <div class="grow"><div class="t1" style="font-size:15px">${e.short}</div><div class="t2">${e.empresa}</div></div><span class="flex" style="gap:6px"><span class="sdot st-${st.k}"></span><span class="mut" style="font-size:11.5px;font-weight:600">${st.t}</span></span></div>
    ${e.cerrado ? `<div class="mut" style="font-size:13px">Cerrado hoy</div>` : `<div><div class="between" style="font-size:12px;margin-bottom:6px"><span class="mut">Ventas ${periodLabel().toLowerCase()}</span><b class="tnum">${eur(f.ventas)}</b></div>
      <div class="between" style="font-size:12px;margin-bottom:6px"><span class="mut">Margen</span><b class="tnum" style="color:var(--brand)">${f.margenPct.toFixed(0)}%</b></div>
      <div class="between" style="font-size:12px;margin-bottom:6px"><span class="mut">Ocupación</span><b class="tnum">${e.ocup}%</b></div>
      <div class="prog ${e.ocup >= 88 ? "bad" : e.ocup >= 72 ? "warn" : ""}"><i style="width:${e.ocup}%"></i></div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;text-align:center;background:var(--surface2);border-radius:12px;padding:10px 0">
        <div><b class="tnum" style="font-size:16px">${incidOfLocal(e.short)}</b><div class="mut" style="font-size:10px;text-transform:uppercase">Incid.</div></div>
        <div><b class="tnum" style="font-size:16px">${activeOfLocal(e.short)}</b><div class="mut" style="font-size:10px;text-transform:uppercase">Equipo</div></div>
        <div><b class="tnum" style="font-size:16px">${revAvgLocal(e.short) ? revAvgLocal(e.short).toFixed(1).replace(".", ",") : "—"}</b><div class="mut" style="font-size:10px;text-transform:uppercase">Reseñas</div></div></div>`}</button>`;
}).join("")}</div>`;

V.equipo = () => {
  const on = TEAM.filter(t => t.estado === "Activo");
  const anomalias = TEAM.filter(t => t.retraso || t.ausencia || t.estado === "Baja");
  const topVend = [...TEAM].filter(t => t.ventas > 0).sort((a, b) => b.ventas - a.ventas);
  const stats = `<div class="grid g4">
    ${stat({ lab: "En plantilla", icon: "team", val: "48" })}
    ${stat({ lab: "Activos hoy", icon: "clock", val: String(on.length * 6) })}
    ${stat({ lab: "Ausencias / bajas", icon: "alert", val: String(absent().length) })}
    ${stat({ lab: "Horas extra (sem.)", icon: "clock", val: String(TEAM.reduce((s, t) => s + Math.max(0, t.trab - t.contr), 0)), unit: "h" })}</div>`;
  const destacados = card("Destacados y anomalías", `<div class="rows" style="margin:-4px -18px -18px">
    ${topVend.slice(0, 1).map(t => `<div class="row"><div class="ava">${ini(t.n)}</div><div class="grow"><div class="t1">${t.n} ${pill("Mejor vendedor", "brand")}</div><div class="t2">${t.local} · ${eur(t.ventas)} · ticket ${eur(t.ticket)}</div></div><button class="btn ghost sm" data-act="soon">Reconocer</button></div>`).join("")}
    ${anomalias.map(t => `<div class="row"><div class="ava">${ini(t.n)}</div><div class="grow"><div class="t1">${t.n} ${t.estado === "Baja" ? pill("Baja", "bad") : t.retraso ? pill("Fichaje irregular", "warn") : pill("Ausente", "warn")}</div><div class="t2">${t.local} · ${t.puesto} · ${t.trab}h/${t.contr}h</div></div></div>`).join("")}</div>`);
  const filters = `<div class="wrapf" style="margin:16px 0">${["Todos", ...[...new Set(TEAM.map(t => t.local))]].map((c, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="teamfilter" data-loc="${c}">${c}</button>`).join("")}</div>`;
  const table = card("Plantilla", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Persona</th><th>Local</th><th>Puesto</th><th>Estado</th><th class="r">Horas</th><th class="r">Extra</th><th class="r">Ventas</th><th class="r">Reseña</th></tr></thead><tbody id="teamBody">${teamRows("Todos")}</tbody></table></div>`, `<span class="mut">Comparativa completa</span>`);
  return stats + `<div class="grid g2" style="margin-top:16px">${destacados}${card("Reparto por establecimiento", bars([...new Set(TEAM.map(t => t.local))].map(l => ({ label: l, v: TEAM.filter(t => t.local === l).length })), { fmt: "num" }))}</div>` + filters + table;
};
const ini = (n) => n.split(" ").map(x => x[0]).slice(0, 2).join("");
function teamRows(loc) {
  return TEAM.filter(t => loc === "Todos" || t.local === loc).map(t => {
    const ex = Math.max(0, t.trab - t.contr);
    const estK = t.estado === "Activo" ? "ok" : t.estado === "Baja" ? "bad" : "warn";
    return `<tr><td><div class="flex"><span class="ava">${ini(t.n)}</span><b style="font-weight:600">${t.n}</b></div></td><td>${t.local}</td><td class="mut">${t.puesto}</td><td>${pill(t.estado, estK)}</td><td class="r tnum">${t.trab}/${t.contr}</td><td class="r tnum ${ex ? "" : "mut"}">${ex ? "+" + ex + "h" : "—"}</td><td class="r tnum">${t.ventas ? eur(t.ventas) : "—"}</td><td class="r tnum">${t.res.toFixed(1).replace(".", ",")}</td></tr>`;
  }).join("");
}

V.clientes = () => {
  const stats = `<div class="grid g4">${stat({ lab: "Clientes", icon: "users", val: nf.format(3482), delta: 4 })}${stat({ lab: "Nuevos (30 días)", icon: "spark", val: "124", delta: 18 })}${stat({ lab: "VIP", icon: "star", val: "212" })}${stat({ lab: "Cumpleaños esta semana", icon: "cal", val: "9" })}</div>`;
  const filters = `<div class="wrapf" style="margin:16px 0">${["Todos", "VIP", "Habitual", "Nuevo"].map((c, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="clientfilter" data-tag="${c}">${c}</button>`).join("")}</div>`;
  const t = card("Clientes", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Local habitual</th><th>Segmento</th><th class="r">Reservas</th><th class="r">Última visita</th></tr></thead><tbody id="cliBody">${cliRows("Todos")}</tbody></table></div>`, `<button class="btn ghost sm" data-act="toast" data-msg="CSV de ejemplo generado">${ic("doc", 14)} Exportar CSV</button>`);
  return stats + filters + t;
};
function cliRows(tg) { return CLIENTS.filter(c => tg === "Todos" || c.tag === tg).map(c => `<tr><td><div class="flex"><span class="ava">${ini(c.n)}</span><b style="font-weight:600">${c.n}</b></div></td><td>${c.loc}</td><td>${tag(c.tag)}</td><td class="r tnum">${c.res}</td><td class="r mut">${c.last}</td></tr>`).join(""); }

V.rrhh = () => {
  const cols = [["Nuevas", ["Cocinero/a · Girona", "Camarero/a · Lloret"], "info"], ["En proceso", ["Jefe de sala · Blanes", "Ayudante cocina · Tordera"], "warn"], ["Cerradas", ["Barra · Girona"], "ok"]];
  const stats = `<div class="grid g4">${stat({ lab: "Vacantes activas", icon: "hr", val: "5" })}${stat({ lab: "Candidaturas (mes)", icon: "users", val: "37", delta: 24 })}${stat({ lab: "Llamadas del mes", icon: "msg", val: "31/48" })}${stat({ lab: "Altas previstas", icon: "plus", val: "3" })}</div>`;
  const kan = `<div class="kan">${cols.map(c => `<div class="kcol"><div class="kh">${c[0]} <span class="pill ${c[2]}">${c[1].length}</span></div>${c[1].map(k => `<button class="kcard" data-act="soon" style="width:100%;text-align:left"><div class="t1">${k.split(" · ")[0]}</div><div class="t2">${ic("pin", 11)} ${k.split(" · ")[1]} · hace 2 días</div></button>`).join("")}</div>`).join("")}</div>`;
  return stats + `<div class="ph" style="margin:22px 0 12px"><div><div class="eyebrow">Selección</div><h1 style="font-size:19px">Candidaturas</h1></div><button class="btn primary" data-act="soon">${ic("plus", 15)} Nueva vacante</button></div>` + kan;
};

V.compras = () => {
  const stats = `<div class="grid g4">${stat({ lab: "Gasto del mes", icon: "cart", val: eur(18940), delta: -4, invert: true })}${stat({ lab: "Pedidos pendientes", icon: "box", val: String(pendingOrders().length) })}${stat({ lab: "Proveedores activos", icon: "team", val: "23" })}${stat({ lab: "Productos críticos", icon: "alert", val: String(ORDERS.filter(o => o.critico).length) })}</div>`;
  const donutC = card("Gasto por categoría", `<div class="flex" style="gap:22px;flex-wrap:wrap"><div>${(() => { const s = [{ v: 38, c: CATC[0], l: "Pescado" }, { v: 22, c: CATC[1], l: "Bebidas" }, { v: 18, c: CATC[2], l: "Verdura" }, { v: 14, c: CATC[3], l: "Carne" }, { v: 8, c: CATC[4], l: "Otros" }]; s.dLabel = "% gasto"; return donut(s); })()}</div>
    <div class="legend" style="flex-direction:column;gap:10px">${[["Pescado", 38], ["Bebidas", 22], ["Verdura", 18], ["Carne", 14], ["Otros", 8]].map((x, i) => `<div><i style="background:${CATC[i]}"></i>${x[0]} <b class="tnum" style="margin-left:6px">${x[1]}%</b></div>`).join("")}</div></div>`);
  const list = card("Pedidos", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Proveedor</th><th>Local</th><th>Estado</th><th class="r">Importe</th><th class="r">Desvío</th><th></th></tr></thead><tbody>${ORDERS.map(o => `<tr><td><div><b style="font-weight:600">${o.prov}</b><div class="mut" style="font-size:11.5px">${o.cat} · ${o.fecha}</div></div></td><td>${o.local}</td><td>${pill(o.estado, o.estado === "Pendiente" ? "warn" : o.estado === "Recibido" ? "ok" : "info")}</td><td class="r tnum">${eur(o.importe)}</td><td class="r tnum ${o.desv > 3 ? "down" : o.desv < 0 ? "up" : "mut"}">${o.desv > 0 ? "+" : ""}${o.desv}%</td><td class="r"><button class="btn ghost sm" data-act="order" data-id="${o.id}">Ver</button></td></tr>`).join("")}</tbody></table></div>`, `<button class="btn primary sm" data-act="soon">${ic("plus", 14)} Nuevo pedido</button>`);
  const reco = card("Recomendación de reposición", `<div class="reco"><div class="rc">${ic("box", 16)}</div><div class="grow"><b style="font-size:13.5px">Pescado en Blanes por debajo de stock objetivo</b><p class="mut" style="margin:3px 0 8px;font-size:12.5px">Impacto estimado en margen: +0,4 pts si se repone hoy.</p><div class="wrapf"><button class="btn primary sm" data-act="approve-reco" data-txt="Reposición aprobada">Aprobar</button><button class="btn ghost sm" data-act="soon">Ver impacto</button></div></div></div>`);
  return stats + `<div class="grid g2" style="margin-top:16px">${donutC}${reco}</div><div style="margin-top:16px">${list}</div>`;
};

V.marketing = () => {
  const stats = `<div class="grid g4">${stat({ lab: "Leads (30 días)", icon: "spark", val: "327", delta: 22 })}${stat({ lab: "Campañas activas", icon: "msg", val: String(CAMPAIGNS.filter(c => c.estado === "Activa").length) })}${stat({ lab: "Reservas generadas", icon: "cal", val: String(CAMPAIGNS.reduce((s, c) => s + c.reservas, 0)) })}${stat({ lab: "Google Reviews", icon: "star", val: reviewAvgAll().toFixed(1).replace(".", ","), delta: 0 })}</div>`;
  const saraSug = card("Sugerencia de Sara", `<div class="reco"><div class="rc">${ic("spark", 16)}</div><div class="grow"><b style="font-size:13.5px">Girona: ocupación prevista 42% el miércoles</b><p class="mut" style="margin:3px 0 8px;font-size:12.5px">Preparar campaña para clientes inactivos desde hace más de 45 días. Impacto estimado +800 €.</p><div class="wrapf" id="sugActions"><button class="btn primary sm" data-act="approve-camp">Aprobar campaña</button><button class="btn ghost sm" data-act="soon">Revisar</button></div></div></div>`);
  const camps = card("Campañas", `<div class="rows" style="margin:0 -18px -18px" id="campList">${CAMPAIGNS.map(c => campRow(c)).join("")}</div>`);
  const reviews = card("Reseñas recientes", `<div class="rows" style="margin:0 -18px -18px">${REVIEWS.map(r => `<div class="row"><div style="display:flex;color:var(--warning)">${Array.from({ length: r.estrellas }, () => ic("star", 13)).join("")}</div><div class="grow"><div class="t1">${r.autor} · ${r.local}</div><div class="t2">${r.texto}${r.trab ? " — " + r.trab : ""}</div></div>${r.respondida ? pill("Respondida", "ok") : `<button class="btn ghost sm" data-act="reply-review" data-id="${r.id}">Preparar respuesta</button>`}</div>`).join("")}</div>`);
  return stats + `<div class="grid g2" style="margin-top:16px">${saraSug}${camps}</div><div style="margin-top:16px">${reviews}</div>`;
};
function campRow(c) { return `<div class="row"><div class="ic info" style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center">${ic("msg", 16)}</div><div class="grow"><div class="t1">${c.n}</div><div class="t2">${c.seg} · ${c.canal}${c.reservas ? " · " + c.reservas + " reservas · " + eur(c.ingresos) : ""}</div></div>${pill(c.estado, c.estado === "Activa" ? "ok" : c.estado === "Programada" ? "info" : c.estado === "Preparada" ? "brand" : "warn")}</div>`; }

V.mantenimiento = () => {
  const stats = `<div class="grid g4">${stat({ lab: "Abiertas", icon: "wrench", val: String(openIncid().length), unit: openIncid().some(i => i.sev === "hi") ? "· 1 crítica" : "" })}${stat({ lab: "En proceso", icon: "clock", val: String(INCID.filter(i => i.estado === "En proceso").length) })}${stat({ lab: "Resueltas (mes)", icon: "check", val: "17", delta: 28 })}${stat({ lab: "Tiempo medio", icon: "clock", val: "1,8", unit: "días" })}</div>`;
  const filters = `<div class="wrapf" style="margin:16px 0">${["Todas", "Crítica", "Abierta", "En proceso"].map((c, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="incidfilter" data-f="${c}">${c}</button>`).join("")}</div>`;
  const list = card("Incidencias", `<div class="rows" id="incidList" style="margin:0 -18px -18px">${INCID.map(i => incidRow(i)).join("")}</div>`, `<button class="btn primary sm" data-act="soon">${ic("plus", 14)} Nueva</button>`);
  return stats + filters + list;
};
function incidRow(i) {
  const kold = i.reps >= 3;
  return `<div class="row"><span class="sev ${i.sev}"></span><div class="grow"><div class="t1">${i.titulo}</div><div class="t2">${ic("pin", 11)} ${i.local} · ${i.dias < 1 ? "hace horas" : Math.round(i.dias) + " días"} · ${i.resp}</div>${kold ? `<div class="meta" style="margin-top:5px;font-size:11.5px;color:var(--warning)">${ic("alert", 11)} ${i.reps}ª reparación en 8 meses — revisar sustitución</div>` : ""}</div>
    <button class="btn ghost sm" data-act="incid" data-id="${i.id}">Ver</button>
    ${i.estado === "Abierta" ? pill("Abierta", "bad") : i.estado === "En proceso" ? pill("En proceso", "warn") : pill("Resuelta", "ok")}
    <button class="btn ghost sm" data-act="incid-next" data-id="${i.id}">${i.estado === "Abierta" ? "Tomar" : "Cerrar"}</button></div>`;
}

V.alertas = () => {
  const groups = [["Crítico", "crit", "bad"], ["Requiere revisión", "imp", "warn"], ["Informativo", "info", "info"]];
  const filterbar = `<div class="wrapf" style="margin-bottom:16px">${["Todas", ...[...new Set(ALERTS.map(a => a.dept))]].map((d, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="alertfilter" data-d="${d}">${d}</button>`).join("")}</div>`;
  const blocks = groups.map(g => { const items = ALERTS.filter(a => a.sev === g[1]); return card(`${g[0]} <span class="pill ${g[2]}" style="margin-left:8px">${items.filter(a => a.estado === "Nueva").length}</span>`, `<div class="rows" id="al-${g[1]}" style="margin:-4px -18px -18px">${items.map(a => attRow(a)).join("")}</div>`); }).join("");
  return `<div class="between" style="margin-bottom:8px"><div></div><button class="btn ghost sm" data-act="review-all">${ic("check", 14)} Marcar todo revisado</button></div>` + filterbar + `<div class="grid" style="gap:16px">${blocks}</div>`;
};

V.sara = () => {
  const chatMsgs = S.chat.length ? S.chat : [{ who: "her", t: saraSummary() }];
  const left = card("Sara · asistente operativo", `<div class="chat" id="chatBox">${chatMsgs.map(m => `<div class="msg ${m.who}">${m.who === "her" ? '<div class="mn">Sara</div>' : ""}${m.t}</div>`).join("")}</div>
    <div class="suggs">${["¿Cómo fue ayer?", "¿Qué local tuvo peor margen?", "¿Quién hizo horas extra?", "¿Qué pedidos están pendientes?", "¿Qué mantenimiento es urgente?"].map(q => `<button class="chip" data-act="ask" data-q="${q}">${q}</button>`).join("")}</div>
    <div class="chatin"><input id="chatInput" placeholder="Pregúntale a Sara…" aria-label="Pregunta a Sara"/><button class="btn primary" data-act="ask-input">Enviar</button></div>`, `<span class="pill ok">${ic("wifi", 12)} En vivo</span>`);
  const reco = `<div class="card"><div class="ch"><h3>Recomendaciones</h3><span class="mut">Prioridad</span></div><div style="display:flex;flex-direction:column;gap:11px" id="recoList">${RECOS.map(r => recoRow(r)).join("")}</div></div>`;
  const autonomy = card("Niveles de autonomía", `<div class="rows" style="margin:0 -18px -18px">${[["Informar", "Resúmenes y respuestas", "ok"], ["Recomendar", "Sugerencias con impacto", "info"], ["Preparar acción", "Deja la acción lista", "warn"], ["Ejecutar", "Requiere aprobación humana", "brand"]].map(x => `<div class="row"><div class="grow"><div class="t1">${x[0]}</div><div class="t2">${x[1]}</div></div>${pill(x[2] === "brand" ? "Con aprobación" : "Activo", x[2])}</div>`).join("")}</div>`);
  return `<div class="grid g12"><div class="c7">${left}</div><div class="c5">${reco}<div style="height:16px"></div>${autonomy}</div></div>`;
};
function recoRow(r) { return `<div class="reco ${r.estado !== "Pendiente" ? "done" : ""}" data-reco="${r.id}"><div class="rc">${ic("spark", 16)}</div><div class="grow"><div class="flex" style="gap:8px"><b style="font-size:13.5px">${r.titulo}</b>${pill(r.prio, r.prio === "Alta" ? "bad" : "warn")}</div><p class="mut" style="margin:4px 0 4px;font-size:12.5px">${r.motivo}</p><div class="mut" style="font-size:11.5px;margin-bottom:8px">Impacto: <b class="hl">${r.impacto}</b> · Datos: ${r.datos}</div>${r.estado === "Pendiente" ? `<div class="wrapf"><button class="btn primary sm" data-act="reco-approve" data-id="${r.id}">Aprobar</button><button class="btn ghost sm" data-act="go" data-view="${r.go}">Revisar</button><button class="btn ghost sm" data-act="reco-dismiss" data-id="${r.id}">Descartar</button></div>` : pill(r.estado, "ok")}</div></div>`; }

V.config = () => {
  const tog = on => `<div class="tog ${on ? "on" : ""}" data-act="toggle"></div>`;
  const sec = (t, rows) => card(t, `<div style="margin:-4px 0">${rows.map(r => `<div class="setrow"><div class="grow"><b>${r[0]}</b><p>${r[1]}</p></div>${r[2]}</div>`).join("")}</div>`);
  const modules = sec("Módulos", [["Reservas", "Núcleo operativo", pill("Siempre activo", "ok")], ["Mantenimiento", "Incidencias por local", tog(true)], ["RR. HH.", "Selección y seguimiento", tog(true)], ["Marketing", "Campañas y reseñas", tog(true)], ["Compras / Inventario", "Próximamente", tog(false)]]);
  const integ = sec("Integraciones", [["Google Business", "Reseñas", pill("Conectado", "ok")], ["WhatsApp (Sara)", "Sesión de Baileys", pill("Conectado", "ok")], ["Ágora POS", "Por establecimiento", tog(false)], ["Skello", "Turnos", tog(false)], ["Haddock", "Escandallos", tog(false)]]);
  const perms = card("Usuarios y permisos", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Rol</th><th>Establecimientos</th><th>Ámbito</th><th class="r">Financiero</th></tr></thead><tbody>${[["Dirección", "Todos", "Global", pill("Sí", "ok")], ["Encargado", "Asignados", "Por local", pill("No")], ["Marketing", "Global", "Clientes/Web", pill("No")], ["Contabilidad", "Por empresa", "Facturación", pill("Según permiso", "warn")], ["Trabajador", "Asignados", "Solo consulta", pill("No")]].map(r => `<tr><td style="font-weight:600">${r[0]}</td><td>${r[1]}</td><td class="mut">${r[2]}</td><td class="r">${r[3]}</td></tr>`).join("")}</tbody></table></div>`, pill("Vista previa", "info"));
  const appear = sec("Apariencia", [["Tema", "Claro, oscuro o del sistema", `<div class="seg">${[["light", "Claro"], ["dark", "Oscuro"], ["auto", "Sistema"]].map(x => `<button data-act="theme-set" data-t="${x[0]}" class="${(localStorage_get() === x[0] || (x[0] === "auto" && !localStorage_get())) ? "on" : ""}">${x[1]}</button>`).join("")}</div>`]]);
  return `<div class="grid g2">${modules}${integ}</div><div style="margin-top:16px">${perms}</div><div style="margin-top:16px">${appear}</div>`;
};
function localStorage_get() { return document.documentElement.getAttribute("data-theme"); }

/* ---------- Sara: resumen + NLU mock ---------- */
function saraSummary() {
  const f = getFin(S.estab, S.period); const inc = openIncid().filter(i => i.sev === "hi").length; const au = absent().length;
  return `Buenos días, Uriel. En ${scopeLabel()}, ${periodLabel().toLowerCase()} se facturaron <b class="hl">${eur(f.ventas)}</b> (${signed(f.dVentasLY)} ${comparativaLabel()}). El margen operativo estimado fue de <b class="hl">${eur(f.margen)}</b> (${f.margenPct.toFixed(1)}%). ${au ? "Faltó " + au + " persona" + (au > 1 ? "s" : "") : "No hubo ausencias"} y ${inc ? "hay " + inc + " incidencia crítica de mantenimiento" : "no hubo incidencias críticas"}.`;
}
function saraAnswer(q) {
  q = q.toLowerCase();
  const f = getFin(S.estab, S.period);
  if (/ayer|hoy|fue|facturaci|ventas/.test(q)) return saraSummary();
  if (/margen/.test(q)) { const w = [...ESTAB].filter(e => !e.cerrado).map(e => ({ e, m: baseFin(e).margenPct })).sort((a, b) => a.m - b.m)[0]; return `El local con peor margen fue <b class="hl">${w.e.short}</b> con un ${w.m.toFixed(1)}%. ${marginWhy(getFin(w.e.id, "ayer"))}`; }
  if (/extra|horas/.test(q)) { const ex = TEAM.filter(t => t.trab > t.contr); return ex.length ? "Hicieron horas extra: " + ex.map(t => `<b>${t.n}</b> (+${t.trab - t.contr}h, ${t.local})`).join("; ") + "." : "Nadie hizo horas extra."; }
  if (/pedido|compra|proveedor/.test(q)) { const p = pendingOrders(); return p.length ? "Pedidos pendientes: " + p.map(o => `<b>${o.prov}</b> (${o.local}, ${eur(o.importe)}, ${o.fecha})`).join("; ") + "." : "No hay pedidos pendientes."; }
  if (/mantenim|incidenc|urgente|averí/.test(q)) { const c = openIncid().filter(i => i.sev === "hi"); return c.length ? "Urgente: " + c.map(i => `<b>${i.titulo}</b> en ${i.local}`).join("; ") + "." : "No hay incidencias urgentes de mantenimiento."; }
  if (/falt|ausen|baja/.test(q)) { const a = absent(); return a.length ? "Hoy falta: " + a.map(t => `<b>${t.n}</b> (${t.local}, ${t.estado})`).join("; ") + "." : "No hay ausencias hoy."; }
  if (/reseñ|review|estrell/.test(q)) return `La media de reseñas es <b class="hl">${reviewAvgAll().toFixed(1).replace(".", ",")}</b>. Hay ${REVIEWS.filter(r => !r.respondida).length} sin responder.`;
  return "Puedo darte ventas, margen, horas extra, pedidos pendientes, mantenimiento urgente, ausencias o reseñas. En el prototipo respondo con datos de ejemplo.";
}

/* ============================================================================
   NAV / SHELL / ROUTER
   ========================================================================== */
const NAV = [
  { g: "Operación", items: [["dashboard", "Dashboard", "dash"], ["establecimientos", "Establecimientos", "shop"], ["equipo", "Equipo", "team"], ["clientes", "Clientes", "users"]] },
  { g: "Gestión", items: [["rrhh", "RR. HH.", "hr"], ["compras", "Compras", "cart"], ["marketing", "Marketing", "mkt"], ["mantenimiento", "Mantenimiento", "wrench"]] },
  { g: "Inteligencia", items: [["alertas", "Centro de alertas", "bell"], ["sara", "Panel de Sara", "spark"]] },
  { g: "Sistema", items: [["config", "Configuración", "cog"]] },
];
const META = {
  dashboard: ["Buenos días, Uriel", "Dashboard ejecutivo", "El estado de todo el grupo, de un vistazo."],
  establecimientos: ["Operación", "Establecimientos", "7 locales · estado en tiempo real (datos de ejemplo)."],
  equipo: ["Personas", "Equipo", "Plantilla, turnos, fichajes y rendimiento."],
  clientes: ["CRM", "Clientes", "Base de clientes del grupo, unificada."],
  rrhh: ["Recursos humanos", "RR. HH.", "Selección, seguimiento y llamadas."],
  compras: ["Aprovisionamiento", "Compras", "Proveedores, pedidos y reposición."],
  marketing: ["Crecimiento", "Marketing", "Campañas, captación y reputación."],
  mantenimiento: ["Operativa", "Mantenimiento", "Incidencias por local, recurrencia y coste."],
  alertas: ["Inteligencia", "Centro de alertas", "Todo lo que requiere tu atención, priorizado."],
  sara: ["Asistente", "Panel de Sara", "Tu compañera operativa."],
  config: ["Sistema", "Configuración", "Módulos, integraciones, permisos y apariencia."],
};
function badgeFor(id) { return id === "alertas" ? newAlerts().length : 0; }

function sidebar() {
  return `<aside class="sidebar"><div class="brand"><div class="logo">FA</div><div class="bt"><b>Familia del Amor</b><span>Sistema operativo interno</span></div></div>
    <nav class="nav">${NAV.map(g => `<div class="ngt">${g.g}</div>${g.items.map(it => { const b = badgeFor(it[0]); return `<button class="navi ${it[0] === S.view ? "active" : ""}" data-act="go" data-view="${it[0]}"><span class="ico">${ic(it[2])}</span><span>${it[1]}</span>${b ? `<span class="badge">${b}</span>` : ""}</button>`; }).join("")}`).join("")}</nav>
    <div class="sbf"><div class="u"><span class="avatar">UD</span><div class="txt"><b>Uriel de la Mora</b><span>Dirección · acceso global</span></div></div></div></aside>`;
}
function topbar() {
  return `<header class="topbar"><button class="iconbtn" data-act="mtoggle" aria-label="Menú">${ic("menu")}</button>
    <button class="pick" data-act="estabmenu"><span class="dot"></span> <span class="lbl">${S.estab === "all" ? "Todos los establecimientos" : ESTAB.find(e => e.id === S.estab).short}</span> <span class="car">${ic("chevD", 16)}</span></button>
    <div class="seg hidesm">${[["ayer", "Ayer"], ["7d", "7 días"], ["mes", "Mes"]].map(p => `<button class="${S.period === p[0] ? "on" : ""}" data-act="period" data-p="${p[0]}">${p[1]}</button>`).join("")}</div>
    <button class="sbtn" data-act="cmdk">${ic("search", 16)}<span>Buscar o ir a…</span><span class="kbd">⌘K</span></button>
    <div class="spacer"></div>
    <span class="gstat hidesm"><span class="sdot st-ok"></span> Grupo estable</span>
    <button class="iconbtn bell" data-act="go" data-view="alertas" aria-label="Alertas">${ic("bell")}<span class="n">${newAlerts().length}</span></button>
    <button class="iconbtn" data-act="theme" aria-label="Tema">${ic("sun")}</button>
    <span class="avatar" title="Uriel">UD</span></header>`;
}
function pageHeader(k) { const m = META[k]; const acts = k === "dashboard" ? `<div class="seg" style="display:none"></div><button class="btn ghost" data-act="theme">${ic("sun", 15)}</button><button class="btn primary" data-act="cmdk">${ic("spark", 15)} Acción rápida</button>` : k === "clientes" ? `<button class="btn primary" data-act="soon">${ic("plus", 15)} Nuevo cliente</button>` : k === "establecimientos" ? `<button class="btn ghost" data-act="soon">${ic("plus", 15)} Añadir</button>` : ""; return `<div class="ph"><div><div class="eyebrow">${m[0]}</div><h1>${m[1]}</h1><div class="sub">${m[2]}</div></div><div class="acts">${acts}</div></div>`; }
function skeleton() { return `<div class="enter"><div class="ph"><div><div class="sk" style="width:120px;height:12px;margin-bottom:12px"></div><div class="sk" style="width:280px;height:26px"></div></div></div><div class="grid g4">${Array(4).fill('<div class="card"><div class="sk" style="width:60%;height:12px"></div><div class="sk" style="width:50%;height:26px;margin-top:12px"></div></div>').join("")}</div><div class="grid g2" style="margin-top:16px">${Array(2).fill('<div class="card"><div class="sk" style="width:40%;height:14px"></div><div class="sk" style="height:150px;margin-top:16px"></div></div>').join("")}</div></div>`; }

let _first = true;
function render(k, { skip } = {}) {
  S.view = k;
  document.getElementById("root").innerHTML = `<div class="app${S.collapsed ? " collapsed" : ""}" id="appEl">${sidebar()}<div class="main">${topbar()}<main class="content"><div class="wrap" id="view"></div></main></div></div>`;
  const view = document.getElementById("view");
  if (skip) { paint(k); return; }
  view.innerHTML = skeleton();
  setTimeout(() => paint(k), _first ? 120 : 240); _first = false;
}
function paint(k) {
  const view = document.getElementById("view");
  view.innerHTML = pageHeader(k) + `<div class="enter">${(V[k] || V.dashboard)()}</div>`;
  view.querySelectorAll(".enter > *").forEach((n, i) => n.style.animationDelay = (i * 45) + "ms");
  const c = document.querySelector(".content"); if (c) c.scrollTop = 0;
}
function go(k) { if (!META[k]) k = "dashboard"; location.hash = "#/" + k; }
function rerender() { render(S.view, { skip: true }); }

/* ============================================================================
   TOAST / DRAWER / TIP / CMDK / TEMA
   ========================================================================== */
let _toastT;
function toast(msg, tag) { const t = document.getElementById("toast"); t.innerHTML = (tag ? `<span class="tb">${tag}</span>` : "") + msg; t.classList.add("show"); clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove("show"), 2600); }
function openDrawer(title, html) { document.getElementById("drawerTitle").innerHTML = title; document.getElementById("drawerBody").innerHTML = html; document.getElementById("drawer").classList.add("open"); document.getElementById("ovl").classList.add("open"); document.getElementById("ovl").dataset.for = "drawer"; }
function closeOverlays() { document.getElementById("drawer").classList.remove("open"); document.getElementById("cmdk").classList.remove("open"); document.getElementById("ovl").classList.remove("open"); }
function estabDrawer(id) {
  const e = ESTAB.find(x => x.id === id); const f = baseFin(e); const st = estadoState(e);
  const inc = openIncid().filter(i => i.local === e.short); const team = TEAM.filter(t => t.local === e.short);
  openDrawer(`${e.n}`, `<div class="flex" style="gap:10px;margin-bottom:14px"><span class="sdot st-${st.k}"></span><b>${st.t}</b><span class="mut">·</span><span class="mut">${e.empresa}</span></div>
    ${e.cerrado ? '<p class="mut">Cerrado hoy.</p>' : `<div class="grid g2" style="gap:12px">
      ${miniStat("Ventas", eur(f.ventas))}${miniStat("Margen", f.margenPct.toFixed(0) + "%")}${miniStat("Ocupación", e.ocup + "%")}${miniStat("Ticket medio", eur(f.ticket))}</div>
    <div style="margin-top:16px">${card("Evolución 7 días", area(serieVentas(e.id, "7d"), { h: 90 }))}</div>
    <div style="margin-top:14px">${card("Equipo (" + team.length + ")", `<div class="rows" style="margin:0 -18px -18px">${team.map(t => `<div class="row"><span class="ava">${ini(t.n)}</span><div class="grow"><div class="t1">${t.n}</div><div class="t2">${t.puesto}</div></div>${pill(t.estado, t.estado === "Activo" ? "ok" : "warn")}</div>`).join("") || '<div class="mut" style="padding:8px 0">Sin datos.</div>'}</div>`)}</div>
    <div style="margin-top:14px">${card("Mantenimiento", inc.length ? `<div class="rows" style="margin:0 -18px -18px">${inc.map(i => `<div class="row"><span class="sev ${i.sev}"></span><div class="grow"><div class="t1">${i.titulo}</div><div class="t2">${i.estado} · ${i.resp}</div></div></div>`).join("")}</div>` : '<div class="mut">Sin incidencias abiertas.</div>')}</div>
    <div style="margin-top:14px" class="reco"><div class="rc">${ic("spark", 16)}</div><div class="grow"><b style="font-size:13px">Recomendación</b><p class="mut" style="margin:3px 0 0;font-size:12.5px">${st.k === "warn" || st.k === "crit" ? "Priorizar la incidencia abierta y revisar coste de personal (" + (f.personal / f.ventas * 100).toFixed(0) + "%)." : "Rendimiento estable. Mantener la pauta de reservas de terraza."}</p></div></div>`}
    <div style="margin-top:16px" class="wrapf"><button class="btn primary sm" data-act="go" data-view="mantenimiento">Ver mantenimiento</button><button class="btn ghost sm" data-act="soon">Ver informe completo</button></div>`);
}
const miniStat = (l, v) => `<div class="card" style="padding:14px"><div class="mut" style="font-size:11.5px">${l}</div><div class="tnum" style="font-size:20px;font-weight:700;margin-top:4px">${v}</div></div>`;
function incidDrawer(id) { const i = INCID.find(x => x.id === id); openDrawer(i.titulo, `<div class="flex" style="gap:10px;margin-bottom:12px">${pill(i.estado, i.estado === "Abierta" ? "bad" : i.estado === "En proceso" ? "warn" : "ok")}<span class="pill">${ic("pin", 11)} ${i.local}</span></div>
  <div class="grid g2" style="gap:12px">${miniStat("Días abierta", i.dias < 1 ? "<1" : Math.round(i.dias))}${miniStat("Reparaciones previas", i.reps)}${miniStat("Coste acumulado", eur(i.coste))}${miniStat("Responsable", i.resp)}</div>
  <div style="margin-top:14px">${card("Proveedor", `<div class="flex" style="justify-content:space-between"><span>${i.prov}</span>${pill("Contactar", "info")}</div>`)}</div>
  <div style="margin-top:14px;height:160px;border-radius:12px;background:repeating-linear-gradient(45deg,var(--surface2),var(--surface2) 10px,var(--surface3) 10px,var(--surface3) 20px);display:grid;place-items:center" class="mut">${ic("eye", 22)} <span style="margin-left:8px">Fotos (placeholder)</span></div>
  ${i.reps >= 3 ? `<div class="reco" style="margin-top:14px"><div class="rc">${ic("alert", 16)}</div><div class="grow"><b style="font-size:13px">${i.reps}ª reparación en 8 meses</b><p class="mut" style="margin:3px 0 8px;font-size:12.5px">El coste acumulado se acerca a la sustitución. Recomendación: <b class="hl">sustituir</b>.</p><button class="btn primary sm" data-act="soon">Solicitar presupuesto de sustitución</button></div></div>` : ""}
  <div style="margin-top:16px" class="wrapf"><button class="btn primary sm" data-act="incid-next" data-id="${i.id}">${i.estado === "Abierta" ? "Tomar" : "Cerrar"}</button><button class="btn ghost sm" data-act="soon">Asignar responsable</button></div>`); }
function orderDrawer(id) { const o = ORDERS.find(x => x.id === id); openDrawer(o.prov, `<div class="flex" style="gap:10px;margin-bottom:12px">${pill(o.estado, o.estado === "Pendiente" ? "warn" : "ok")}<span class="pill">${ic("pin", 11)} ${o.local}</span></div>
  <div class="grid g2" style="gap:12px">${miniStat("Importe", eur(o.importe))}${miniStat("Categoría", o.cat)}${miniStat("Fecha prevista", o.fecha)}${miniStat("Desvío de precio", (o.desv > 0 ? "+" : "") + o.desv + "%")}</div>
  <div style="margin-top:16px" class="wrapf">${o.estado === "Pendiente" ? `<button class="btn primary sm" data-act="order-review" data-id="${o.id}">Marcar revisado</button>` : pill("Revisado / recibido", "ok")}<button class="btn ghost sm" data-act="soon">Ver impacto en margen</button></div>`); }

function setTheme(v) { const r = document.documentElement; if (v === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", v); }
function toggleTheme() { const r = document.documentElement; const isDark = r.getAttribute("data-theme") === "dark" || (!r.getAttribute("data-theme") && matchMedia("(prefers-color-scheme:dark)").matches); setTheme(isDark ? "light" : "dark"); rerender(); }

/* ---------- Command palette ---------- */
let cmdSel = 0, cmdList = [];
function allCmd() {
  const nav = Object.keys(META).map(k => ({ t: META[k][1], s: "Ir a", g: "Navegación", ic: (NAV.flatMap(x => x.items).find(i => i[0] === k) || [])[2] || "dash", run: () => go(k) }));
  const locs = ESTAB.map(e => ({ t: e.short, s: "Establecimiento", g: "Establecimientos", ic: "shop", run: () => { S.estab = e.id; go("establecimientos"); setTimeout(() => estabDrawer(e.id), 300); } }));
  const people = TEAM.map(t => ({ t: t.n, s: t.puesto + " · " + t.local, g: "Personas", ic: "users", run: () => { go("equipo"); toast(t.n + " · " + t.local, "Equipo"); } }));
  const incs = INCID.map(i => ({ t: i.titulo, s: i.local, g: "Incidencias", ic: "wrench", run: () => { go("mantenimiento"); setTimeout(() => incidDrawer(i.id), 300); } }));
  const acts = [
    { t: "Ver horas extra", s: "Equipo", g: "Acciones", ic: "clock", run: () => go("equipo") },
    { t: "Abrir incidencias críticas", s: "Mantenimiento", g: "Acciones", ic: "wrench", run: () => go("mantenimiento") },
    { t: "Consultar margen", s: "Dashboard", g: "Acciones", ic: "euro", run: () => go("dashboard") },
    { t: "Hablar con Sara", s: "Asistente", g: "Acciones", ic: "spark", run: () => go("sara") },
    { t: "Cambiar tema", s: "Apariencia", g: "Acciones", ic: "sun", run: () => toggleTheme() },
  ];
  return [...nav, ...locs, ...people, ...incs, ...acts];
}
function openCmd() { document.getElementById("cmdk").classList.add("open"); document.getElementById("ovl").classList.add("open"); document.getElementById("ovl").dataset.for = "cmdk"; cmdSel = 0; const i = document.getElementById("cmdin"); i.value = ""; fillCmd(""); setTimeout(() => i.focus(), 30); }
function fillCmd(q) {
  q = q.toLowerCase().trim(); const all = allCmd();
  cmdList = all.filter(c => !q || c.t.toLowerCase().includes(q) || c.s.toLowerCase().includes(q) || c.g.toLowerCase().includes(q));
  if (cmdSel >= cmdList.length) cmdSel = 0;
  const groups = {}; cmdList.forEach((c, i) => { (groups[c.g] = groups[c.g] || []).push({ ...c, i }); });
  document.getElementById("cmdl").innerHTML = Object.entries(groups).map(([g, items]) => `<div class="cg">${g}</div>${items.map(c => `<button class="cr ${c.i === cmdSel ? "sel" : ""}" data-i="${c.i}"><span class="ci2">${ic(c.ic, 16)}</span>${c.t}<span class="kb">${c.s}</span></button>`).join("")}`).join("") || `<div class="cg">Sin resultados</div>`;
}
function runCmd(c) { closeOverlays(); if (c && c.run) c.run(); }

/* ---------- Tooltip de gráficos ---------- */
const tipEl = () => document.getElementById("tip");
document.addEventListener("mousemove", (e) => {
  const bar = e.target.closest("[data-tip]");
  const chart = e.target.closest(".chart:not(.mini)");
  const tip = tipEl();
  if (bar) { tip.textContent = bar.getAttribute("data-tip"); tip.classList.add("show"); tip.style.left = (e.clientX + 12) + "px"; tip.style.top = (e.clientY - 30) + "px"; return; }
  if (chart) {
    const pts = JSON.parse(chart.getAttribute("data-pts")); const w = +chart.getAttribute("data-w"); const fmt = chart.getAttribute("data-fmt");
    const rect = chart.getBoundingClientRect(); const rx = (e.clientX - rect.left) / rect.width * w;
    let best = pts[0], bd = 1e9; pts.forEach(p => { const d = Math.abs(p.x - rx); if (d < bd) { bd = d; best = p; } });
    tip.textContent = (best.l ? best.l + " · " : "") + (fmt === "eur" ? eur(best.v) : best.v); tip.classList.add("show");
    tip.style.left = (e.clientX + 12) + "px"; tip.style.top = (rect.top - 30) + "px"; return;
  }
  tip.classList.remove("show");
});

/* ============================================================================
   INTERACCIONES (delegación)
   ========================================================================== */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.getAttribute("data-act"), id = t.getAttribute("data-id");
  const stop = () => { e.preventDefault(); };
  switch (act) {
    case "go": stop(); document.getElementById("appEl")?.classList.remove("mopen"); go(t.getAttribute("data-view")); break;
    case "mtoggle": { const a = document.getElementById("appEl"); if (innerWidth <= 820) a.classList.toggle("mopen"); else { S.collapsed = !S.collapsed; a.classList.toggle("collapsed"); } break; }
    case "theme": toggleTheme(); break;
    case "theme-set": setTheme(t.getAttribute("data-t")); rerender(); break;
    case "period": S.period = t.getAttribute("data-p"); rerender(); toast("Periodo: " + periodLabel()); break;
    case "estabmenu": estabMenu(t); break;
    case "cmdk": openCmd(); break;
    case "estab": estabDrawer(+id); break;
    case "incid": incidDrawer(+id); break;
    case "order": orderDrawer(+id); break;
    case "soon": toast("Disponible próximamente", "Prototipo"); break;
    case "toast": toast(t.getAttribute("data-msg")); break;
    case "toggle": t.classList.toggle("on"); toast(t.classList.contains("on") ? "Módulo activado" : "Módulo desactivado"); break;
    case "alert-review": { const a = ALERTS.find(x => x.id == id); if (a) a.estado = "Revisada"; rerender(); toast("Alerta marcada como revisada", "✓"); break; }
    case "alert-act": { const a = ALERTS.find(x => x.id == id); toast((a ? a.accion : "Acción") + " (ejemplo)", "Alerta"); break; }
    case "review-all": ALERTS.forEach(a => a.estado = "Revisada"); rerender(); toast("Todas las alertas revisadas", "✓"); break;
    case "alertfilter": { document.querySelectorAll('[data-act="alertfilter"]').forEach(x => x.classList.toggle("on", x === t)); filterAlerts(t.getAttribute("data-d")); break; }
    case "incid-next": nextIncid(+id); break;
    case "incidfilter": { document.querySelectorAll('[data-act="incidfilter"]').forEach(x => x.classList.toggle("on", x === t)); filterIncid(t.getAttribute("data-f")); break; }
    case "teamfilter": { document.querySelectorAll('[data-act="teamfilter"]').forEach(x => x.classList.toggle("on", x === t)); document.getElementById("teamBody").innerHTML = teamRows(t.getAttribute("data-loc")); break; }
    case "clientfilter": { document.querySelectorAll('[data-act="clientfilter"]').forEach(x => x.classList.toggle("on", x === t)); document.getElementById("cliBody").innerHTML = cliRows(t.getAttribute("data-tag")); break; }
    case "reco-approve": { const r = RECOS.find(x => x.id === id); if (r) r.estado = "Aprobada"; rerender(); toast("Recomendación aprobada · queda preparada", "Sara"); break; }
    case "reco-dismiss": { const r = RECOS.find(x => x.id === id); if (r) r.estado = "Descartada"; rerender(); toast("Recomendación descartada"); break; }
    case "approve-reco": toast(t.getAttribute("data-txt") || "Aprobado", "✓"); break;
    case "approve-camp": { const c = CAMPAIGNS.find(x => x.id === "c3"); if (c) c.estado = "Preparada"; rerender(); toast("Campaña preparada para Girona", "Marketing"); break; }
    case "reply-review": { const r = REVIEWS.find(x => x.id == id); if (r) r.respondida = true; rerender(); toast("Respuesta preparada", "Reseñas"); break; }
    case "order-review": { const o = ORDERS.find(x => x.id == id); if (o) o.estado = "Recibido"; closeOverlays(); rerender(); toast("Pedido marcado como revisado", "✓"); break; }
    case "ask": ask(t.getAttribute("data-q")); break;
    case "ask-input": { const inp = document.getElementById("chatInput"); if (inp && inp.value.trim()) { ask(inp.value.trim()); } break; }
  }
});
function ask(q) { S.chat.push({ who: "them", t: q }); S.chat.push({ who: "her", t: saraAnswer(q) }); rerender(); setTimeout(() => { const b = document.getElementById("chatBox"); if (b) b.scrollTop = b.scrollHeight; const i = document.getElementById("chatInput"); if (i) i.focus(); }, 60); }
function nextIncid(id) { const i = INCID.find(x => x.id === id); if (!i) return; i.estado = i.estado === "Abierta" ? "En proceso" : i.estado === "En proceso" ? "Resuelta" : "Resuelta"; closeOverlays(); rerender(); toast("Incidencia → " + i.estado, "Mantenimiento"); }
function filterIncid(f) { document.querySelectorAll("#incidList .row").forEach((r, idx) => { const i = INCID[idx]; let show = true; if (f === "Crítica") show = i.sev === "hi"; else if (f === "Abierta") show = i.estado === "Abierta"; else if (f === "En proceso") show = i.estado === "En proceso"; r.style.display = show ? "" : "none"; }); }
function filterAlerts(d) { ["crit", "imp", "info"].forEach(sev => { const items = ALERTS.filter(a => a.sev === sev); const box = document.getElementById("al-" + sev); if (!box) return; box.querySelectorAll(".att").forEach((r, idx) => { r.style.display = (d === "Todas" || items[idx].dept === d) ? "" : "none"; }); }); }
function estabMenu(anchor) {
  const items = [["all", "Todos los establecimientos"], ...ESTAB.map(e => [e.id, e.short])];
  const html = items.map(it => `<button class="cr ${String(S.estab) === String(it[0]) ? "sel" : ""}" data-estabpick="${it[0]}"><span class="ci2">${ic("shop", 15)}</span>${it[1]}</button>`).join("");
  openDrawer("Establecimiento", `<p class="mut" style="margin-top:0">Filtra todo el panel por establecimiento.</p><div style="display:flex;flex-direction:column;gap:2px">${html}</div>`);
}
document.addEventListener("click", (e) => { const p = e.target.closest("[data-estabpick]"); if (!p) return; const v = p.getAttribute("data-estabpick"); S.estab = v === "all" ? "all" : +v; closeOverlays(); rerender(); toast("Filtrando: " + scopeLabel()); });

/* ---------- Teclado ---------- */
document.addEventListener("keydown", (e) => {
  const cmdOpen = document.getElementById("cmdk").classList.contains("open");
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); cmdOpen ? closeOverlays() : openCmd(); return; }
  if (e.key === "Escape") { closeOverlays(); return; }
  if (!cmdOpen) return;
  if (e.key === "ArrowDown") { e.preventDefault(); cmdSel = Math.min(cmdList.length - 1, cmdSel + 1); fillCmd(document.getElementById("cmdin").value); document.querySelector(".cr.sel")?.scrollIntoView({ block: "nearest" }); }
  else if (e.key === "ArrowUp") { e.preventDefault(); cmdSel = Math.max(0, cmdSel - 1); fillCmd(document.getElementById("cmdin").value); document.querySelector(".cr.sel")?.scrollIntoView({ block: "nearest" }); }
  else if (e.key === "Enter") { e.preventDefault(); runCmd(cmdList[cmdSel]); }
});
document.addEventListener("input", (e) => { if (e.target.id === "cmdin") fillCmd(e.target.value); });
document.addEventListener("keydown", (e) => { if (e.target.id === "chatInput" && e.key === "Enter") { e.preventDefault(); if (e.target.value.trim()) ask(e.target.value.trim()); } });
document.getElementById("cmdl").addEventListener("click", (e) => { const r = e.target.closest(".cr"); if (r && r.dataset.i != null) runCmd(cmdList[+r.dataset.i]); });
document.getElementById("drawerClose").addEventListener("click", closeOverlays);
document.getElementById("ovl").addEventListener("click", closeOverlays);

/* ---------- Init ---------- */
window.addEventListener("hashchange", () => render(location.hash.replace("#/", "") || "dashboard"));
render(location.hash.replace("#/", "") || "dashboard");
