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
// Objetivo de margen operativo por establecimiento (%). Sirve para "margen vs previsto".
const MARGEN_OBJ = { 1: 34, 2: 33, 3: 33, 4: 32, 5: 34, 6: 33, 7: 33 };

const INCID = [
  { id: 91, local: "Can Mateu", titulo: "Cámara frigorífica — temperatura alta", sev: "hi", estado: "Abierta", dias: 0.1, resp: "Sin asignar", prov: "Frío Costa Brava", coste: 0, reps: 4 },
  { id: 92, local: "Lloret", titulo: "Grifo de barra con fuga", sev: "md", estado: "En proceso", dias: 1, resp: "Oriol Mas", prov: "Fontanería Ríos", coste: 120, reps: 1 },
  { id: 93, local: "Blanes", titulo: "Luz de terraza fundida", sev: "lo", estado: "Abierta", dias: 3, resp: "Sin asignar", prov: "—", coste: 0, reps: 0 },
  { id: 94, local: "Girona", titulo: "Datáfono lento", sev: "md", estado: "En proceso", dias: 4, resp: "Clara Font", prov: "Redsys", coste: 0, reps: 2, reabierta: true },
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
// Clientes con gasto acumulado, nº de reseñas y semanas desde la última visita.
const CLIENTS = [
  { n: "Laia Bosch", loc: "Can Mateu", res: 22, gasto: 1840, resenas: 5, semanas: 0 },
  { n: "Marta Serra", loc: "Blanes", res: 14, gasto: 1220, resenas: 3, semanas: 0 },
  { n: "Guillem Roig", loc: "Lloret", res: 9, gasto: 690, resenas: 3, semanas: 1, recuperado: true },
  { n: "Jordi Puig", loc: "Lloret", res: 11, gasto: 980, resenas: 1, semanas: 1 },
  { n: "Pere Vidal", loc: "Blanes", res: 8, gasto: 760, resenas: 2, semanas: 1 },
  { n: "Anna Roca", loc: "Girona", res: 1, gasto: 60, resenas: 1, semanas: 0 },
  { n: "Marc Ferrer", loc: "Lloret", res: 2, gasto: 150, resenas: 0, semanas: 2 },
  { n: "Rosa Prat", loc: "Blanes", res: 18, gasto: 1560, resenas: 4, semanas: 7 },
  { n: "Toni Mas", loc: "Girona", res: 12, gasto: 1040, resenas: 2, semanas: 9 },
  { n: "Elena Sanz", loc: "Blanes", res: 6, gasto: 520, resenas: 1, semanas: 5 },
];
function clienteEstado(c) {
  if (c.semanas >= 8) return { k: "Perdido", c: "bad" };
  if (c.gasto >= 1500 || c.res >= 15) return { k: "VIP", c: "brand" };
  if (c.semanas >= 4) return { k: "En riesgo", c: "warn" };
  if (c.recuperado) return { k: "Recuperado", c: "ok" };
  if (c.res <= 2) return { k: "Nuevo", c: "info" };
  return { k: "Habitual", c: "" };
}
const CAMPAIGNS = [
  { id: "c1", n: "Cumpleaños del mes", seg: "Cumple agosto · 212 contactos", canal: "WhatsApp", reservas: 34, ingresos: 1120, coste: 0, estado: "Activa" },
  { id: "c4", n: "Google Ads · fin de semana", seg: "Radio 15 km · Blanes/Lloret", canal: "Ads", reservas: 26, ingresos: 1180, coste: 320, estado: "Activa" },
  { id: "c2", n: "Menú de temporada", seg: "Clientes VIP", canal: "WhatsApp", reservas: 0, ingresos: 0, coste: 0, estado: "Programada" },
  { id: "c3", n: "Reactivación 45+ días", seg: "Inactivos > 45 días · Girona", canal: "WhatsApp", reservas: 0, ingresos: 0, coste: 0, estado: "Borrador" },
];
// Movimiento de clientes (mock) y datos de gestión de personas por id de trabajador.
const MKT = { recuperados: 18, perdidos: 12, inactivos45: 64, leads: 327 };
const TEAM_X = {
  1: { horas4s: 172, sinLibrar: 9, form: null, rend: 88 },
  2: { horas4s: 168, sinLibrar: 11, form: "Seguridad alimentaria", rend: 74 },
  3: { horas4s: 150, sinLibrar: 5, form: null, rend: 92 },
  4: { horas4s: 0, sinLibrar: 0, form: null, rend: 80 },
  5: { horas4s: 118, sinLibrar: 6, form: "Atención al cliente", rend: 70 },
  6: { horas4s: 0, sinLibrar: 0, form: null, rend: 60 },
  7: { horas4s: 176, sinLibrar: 12, form: null, rend: 95 },
  8: { horas4s: 158, sinLibrar: 7, form: "Nuevos platos", rend: 78 },
};
const RECOS = [
  { id: "r1", prio: "Alta", titulo: "Girona con ocupación prevista 42% el miércoles", motivo: "Reservas −18% y peor desviación de margen del grupo.", impacto: "+ ~800 € estimados", datos: "Reservas, ocupación, histórico", accion: "Preparar campaña a inactivos (Girona)", estado: "Pendiente", go: "marketing" },
  { id: "r2", prio: "Alta", titulo: "3 facturas llevan 40 días sin pagar", motivo: "Riesgo de recargo con 2 proveedores.", impacto: "Evitar recargos", datos: "Facturación", accion: "Revisar con Contabilidad", estado: "Pendiente", go: "config" },
  { id: "r3", prio: "Media", titulo: "Cámara de Can Mateu: 4ª reparación en 8 meses", motivo: "Coste acumulado supera la sustitución.", impacto: "Ahorro estimado 600 €/año", datos: "Mantenimiento", accion: "Valorar sustitución", estado: "Pendiente", go: "mantenimiento" },
];
// Compras: categorías (gasto vs presupuesto), proveedores (tendencia de precio, plazo,
// fiabilidad) e insumos (rotación y desperdicio). Ahorros = oportunidades detectadas.
const CATG = [
  { cat: "Pescado", gasto: 7180, bud: 6800, trend: 5 },
  { cat: "Bebidas", gasto: 4160, bud: 3900, trend: 8 },
  { cat: "Verdura", gasto: 3400, bud: 3500, trend: -2 },
  { cat: "Carne", gasto: 2640, bud: 2700, trend: 3 },
  { cat: "Otros", gasto: 1560, bud: 1600, trend: 1 },
];
const SUPPLIERS = [
  { n: "Peix Fresc Costa Brava", cat: "Pescado", trend: 5, lead: 1, fiab: 96, gasto: 7180 },
  { n: "Distribucions Maresme", cat: "Bebidas", trend: 8, lead: 2, fiab: 88, gasto: 4160 },
  { n: "Carns Selectes Girona", cat: "Carne", trend: 5, lead: 2, fiab: 92, gasto: 2640 },
  { n: "Hortofrutícola Tordera", cat: "Verdura", trend: -2, lead: 1, fiab: 90, gasto: 3400 },
  { n: "Forn Vell Blanes", cat: "Panadería", trend: 0, lead: 1, fiab: 98, gasto: 820 },
];
const INSUMOS = [
  { n: "Merluza", cat: "Pescado", rot: "Baja", desp: 12, tend: "subiendo", ahorro: 180 },
  { n: "Lechuga", cat: "Verdura", rot: "Normal", desp: 8, tend: "subiendo", ahorro: 60 },
  { n: "Solomillo", cat: "Carne", rot: "Anómala", desp: 6, tend: "estable", ahorro: 90 },
  { n: "Gambas", cat: "Pescado", rot: "Alta", desp: 3, tend: "estable", ahorro: 0 },
  { n: "Cerveza barril", cat: "Bebidas", rot: "Alta", desp: 1, tend: "estable", ahorro: 0 },
];
const AHORROS = [
  { t: "Reducir el pedido semanal de merluza", d: "12% de desperdicio y rotación baja.", val: 180, go: "compras" },
  { t: "Renegociar bebidas con proveedor alternativo", d: "Distribucions Maresme ha subido 8%.", val: 250, go: "compras" },
  { t: "Ajustar ración de solomillo", d: "Rotación anómala con merma del 6%.", val: 90, go: "compras" },
];
// Mantenimiento: proveedores (tiempo medio de respuesta) y deterioro por local (incidencias 90 días).
const MANT_PROV = [
  { n: "Frío Costa Brava", cat: "Refrigeración", tiempo: 3.2, lento: true, inc: 5 },
  { n: "Redsys (TPV)", cat: "Datáfonos", tiempo: 2.6, lento: true, inc: 2 },
  { n: "Fontanería Ríos", cat: "Fontanería", tiempo: 1.1, lento: false, inc: 3 },
  { n: "ElectroLloret", cat: "Electricidad", tiempo: 0.8, lento: false, inc: 4 },
];
const MANT_LOCAL = [
  { local: "Can Mateu", inc90: 6, tend: "subiendo" },
  { local: "Girona", inc90: 5, tend: "subiendo" },
  { local: "Lloret", inc90: 3, tend: "estable" },
  { local: "Blanes", inc90: 2, tend: "estable" },
  { local: "Cooperativa", inc90: 1, tend: "bajando" },
  { local: "Ibérica", inc90: 1, tend: "estable" },
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
  const margenObj = MARGEN_OBJ[e.id] || 33, dMargenObj = margenPct - margenObj;
  const dVentasLY = e.ly ? (e.ventas - e.ly) / e.ly * 100 : 0, dObj = e.obj ? (e.ventas - e.obj) / e.obj * 100 : 0;
  return { ventas: e.ventas, ly: e.ly, pw: e.pw, obj: e.obj, personal, compras, otros, costes, margen, margenPct, lyMargen, lyMargenPct, margenObj, dMargenObj, dVentasLY, dObj, ticket: e.ticket, cli: e.cli, res: e.res, com: e.com, ocup: e.ocup };
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

/* ============================================================================
   CAPA DE INTELIGENCIA — deriva RESPUESTAS del estado (todo cuadra con los datos).
   ========================================================================== */
function localHealth(e) {
  if (e.cerrado) return { e, score: null, reasons: ["cerrado hoy"], estado: "off" };
  const f = baseFin(e); const reasons = []; let score = 100;
  if (f.dMargenObj <= -4) { score -= 32; reasons.push(`margen ${f.dMargenObj.toFixed(0)} pts bajo lo previsto (${f.margenPct.toFixed(0)}% vs ${f.margenObj}%)`); }
  else if (f.dMargenObj < -0.5) { score -= 12; reasons.push(`margen ${f.dMargenObj.toFixed(1)} pts bajo objetivo`); }
  if (f.dVentasLY <= -8) { score -= 30; reasons.push(`ventas ${signed(f.dVentasLY)} vs. año pasado`); }
  else if (f.dVentasLY < 0) { score -= 8; reasons.push(`ventas ${signed(f.dVentasLY)}`); }
  const inc = openIncid().filter(i => i.local === e.short);
  if (inc.some(i => i.sev === "hi")) { score -= 24; reasons.push("incidencia crítica abierta"); }
  else if (inc.length) { score -= 7; reasons.push(`${inc.length} incidencia${inc.length > 1 ? "s" : ""} abierta${inc.length > 1 ? "s" : ""}`); }
  const rv = revAvgLocal(e.short); if (rv && rv < 3.5) { score -= 16; reasons.push(`reseñas bajas (${rv.toFixed(1).replace(".", ",")})`); }
  if (e.ocup >= 92) { score -= 6; reasons.push(`ocupación muy alta (${e.ocup}%)`); }
  if (absOfLocal(e.short)) { score -= 5; reasons.push(`${absOfLocal(e.short)} ausencia`); }
  const estado = score >= 85 ? "exc" : score >= 70 ? "ok" : score >= 50 ? "warn" : "crit";
  return { e, score: Math.max(0, Math.round(score)), reasons, estado, f };
}
function localsByNeed() { return ESTAB.filter(e => !e.cerrado).map(localHealth).sort((a, b) => a.score - b.score); }
function employeeSupport() {
  return TEAM.map(t => { let s = 0; const r = [];
    if (t.estado === "Baja") { s += 3; r.push("de baja médica"); }
    if (t.retraso) { s += 2; r.push("fichajes irregulares esta semana"); }
    if (t.ventas > 0 && t.ventas < 1800) { s += 2; r.push("ventas por debajo de la media del grupo"); }
    if (t.estado === "Activo" && t.trab < t.contr) { s += 1; r.push(`${t.contr - t.trab}h por debajo de contrato`); }
    if (t.res > 0 && t.res < 4.6) { s += 1; r.push(`valoración ${t.res.toFixed(1).replace(".", ",")}`); }
    return { t, s, r }; }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
}
function insights() {
  const g = getFin("all", "ayer");
  const health = localsByNeed();
  const worstMargin = [...ESTAB].filter(e => !e.cerrado).map(e => ({ e, f: baseFin(e) })).sort((a, b) => a.f.dMargenObj - b.f.dMargenObj)[0];
  const topEmp = [...TEAM].filter(t => t.ventas > 0).sort((a, b) => (b.ventas - a.ventas) || (b.res - a.res))[0];
  const support = employeeSupport()[0];
  const spikes = ORDERS.filter(o => o.desv >= 5).sort((a, b) => b.desv - a.desv);
  const agingIncid = [...openIncid()].sort((a, b) => b.dias - a.dias);
  const riskIncid = openIncid().filter(i => i.reps >= 3 || i.sev === "hi");
  const topCamp = [...CAMPAIGNS].filter(c => c.reservas > 0).sort((a, b) => b.ingresos - a.ingresos)[0];
  const extra = TEAM.filter(t => t.trab > t.contr);
  const fiveStar = REVIEWS.filter(r => r.estrellas === 5).length;
  return { g, health, worstMargin, topEmp, support, spikes, agingIncid, riskIncid, topCamp, extra, fiveStar, au: absent() };
}
/* Sara como Dirección de Operaciones: informa (no espera preguntas). */
function saraBriefing() {
  const I = insights(), f = I.g, p = [];
  p.push(`Ayer facturaste <b>${eur(f.ventas)}</b> (${signed(f.dVentasLY)} ${comparativaLabel()}).`);
  p.push(`El margen operativo fue de <b>${eur(f.margen)}</b> (${f.margenPct.toFixed(1)}% sobre ventas).`);
  p.push(I.au.length ? `Hubo ${I.au.length} ausencia${I.au.length > 1 ? "s" : ""} (${I.au.map(t => t.n).join(", ")}).` : "No hubo ninguna ausencia.");
  const inc = openIncid().length, crit = openIncid().some(i => i.sev === "hi");
  p.push(inc ? `Hay ${inc} incidencia${inc > 1 ? "s" : ""} abierta${inc > 1 ? "s" : ""}${crit ? ", una de ellas crítica" : ""}.` : "El mantenimiento está al día.");
  p.push(I.extra.length ? `${I.extra.length} trabajador${I.extra.length > 1 ? "es hicieron" : " hizo"} horas extra.` : "Nadie hizo horas extra.");
  p.push(`Entraron ${I.fiveStar} reseña${I.fiveStar !== 1 ? "s" : ""} de cinco estrellas.`);
  const nc = alertsBySev("crit").length;
  p.push(nc ? `Y tienes ${nc} alerta crítica que revisar.` : "No hay ninguna alerta crítica.");
  return p;
}
function saraConcern() {
  const I = insights();
  if (I.worstMargin && I.worstMargin.f.dMargenObj <= -3) {
    const e = I.worstMargin.e, f = I.worstMargin.f;
    return { sev: "warn", id: e.id, go: "establecimientos", t: `Creo que deberías revisar <b>${e.short}</b>: el margen cayó a ${f.margenPct.toFixed(0)}%, ${Math.abs(f.dMargenObj).toFixed(0)} puntos por debajo del ${f.margenObj}% previsto. El coste de personal (${(f.personal / f.ventas * 100).toFixed(0)}%) está por encima de lo habitual.` };
  }
  const w = I.health[0];
  if (w && w.score < 65 && w.reasons.length) return { sev: "warn", id: w.e.id, go: "establecimientos", t: `Vigila <b>${w.e.short}</b>: ${w.reasons.slice(0, 2).join(" y ")}.` };
  return null;
}
const miniKV = (l, v) => `<div style="background:var(--surface2);border-radius:10px;padding:9px 11px"><div class="mut" style="font-size:11px">${l}</div><div class="tnum" style="font-weight:700;font-size:15px;margin-top:2px">${v}</div></div>`;
function answerCard(q, body, { icon = "spark", sev, go, right } = {}) {
  const k = sev === "crit" ? "bad" : sev === "warn" ? "warn" : sev === "ok" ? "ok" : "";
  const rt = right || (sev ? pill(sev === "crit" ? "Atención" : sev === "warn" ? "Revisar" : "OK", k) : (go ? `<span class="link">Abrir ${ic("chevR", 12)}</span>` : ""));
  return `<div class="card"${go ? ` data-act="go" data-view="${go}" style="cursor:pointer"` : ""}>
    <div class="ch"><h3 style="font-size:13px;color:var(--ink2);font-weight:650;display:flex;align-items:center;gap:8px"><span style="color:var(--brand)">${ic(icon, 15)}</span>${q}</h3>${rt}</div>${body}</div>`;
}

/* Sara razona como Directora General: diagnóstico, prioridad, agenda y decisión. */
function saraReasoning() {
  const g = getFin("all", "ayer");
  const worst = [...ESTAB].filter(e => !e.cerrado).map(e => ({ e, f: baseFin(e) })).sort((a, b) => a.f.dMargenObj - b.f.dMargenObj)[0];
  const health = localsByNeed();
  const spike = ORDERS.filter(o => o.desv >= 5).sort((a, b) => b.desv - a.desv)[0];
  const risk = openIncid().find(i => i.reps >= 3) || openIncid().find(i => i.sev === "hi");
  const wf = worst.f, personalPts = wf.personal / wf.ventas * 100, puntoDia = wf.ventas * 0.01;
  const diagnostico = `El grupo cerró en <b>${g.margenPct.toFixed(1)}%</b> de margen, pero <b>${worst.e.short}</b> lo está frenando: ${wf.margenPct.toFixed(0)}%, ${Math.abs(wf.dMargenObj).toFixed(0)} puntos por debajo del ${wf.margenObj}% previsto. No es un problema de ventas (${signed(wf.dVentasLY)} vs. año pasado), sino de <b>coste de personal al ${personalPts.toFixed(0)}%</b> cuando lo sano ronda el 31%. Cada punto de personal ahí son ~${eur(puntoDia)}/día.`;
  const first = health[0];
  const prioridad = `Atendería primero <b>${first.e.short}</b> (salud ${first.score}/100): ${first.reasons.slice(0, 2).join(" y ")}. Es donde una intervención hoy rinde más.`;
  const agenda = [];
  if (risk) agenda.push({ t: `${risk.reps >= 3 ? "Sustituir" : "Cerrar"} «${risk.titulo}» · ${risk.local}`, why: risk.reps >= 3 ? `${risk.reps}ª reparación en 8 meses: repararla otra vez es tirar dinero` : "incidencia crítica aún sin asignar", go: "mantenimiento" });
  agenda.push({ t: `Ajustar el cuadrante de ${worst.e.short}`, why: `personal al ${personalPts.toFixed(0)}%: reorganizar un turno recupera ~${eur(puntoDia)}/día por punto`, id: worst.e.id, go: "establecimientos" });
  if (spike) agenda.push({ t: `Renegociar con ${spike.prov}`, why: `ha subido ${spike.desv}% en ${spike.cat} (${spike.local})`, go: "compras" });
  const ahorroDia = wf.ventas * Math.abs(wf.dMargenObj) / 100;
  const decision = `Si dirigiera yo hoy: bajaría el personal de <b>${worst.e.short}</b> del ${personalPts.toFixed(0)}% al ~31% reorganizando un turno de cocina — recupera ${Math.abs(wf.dMargenObj).toFixed(0)} puntos de margen, unos <b>${eur(ahorroDia)}/día</b> (≈ ${eur(ahorroDia * 26)}/mes). Aprobaría la campaña de reactivación de Girona antes del miércoles y sustituiría la cámara de Can Mateu en lugar de repararla por cuarta vez.`;
  return { diagnostico, prioridad, agenda, decision };
}
function criterioCard() {
  const R = saraReasoning();
  return `<div class="card"><div class="ch"><h3 style="display:flex;gap:9px;align-items:center"><span class="avatar" style="width:26px;height:26px;font-size:11px">S</span> El criterio de Sara</h3><span class="pill brand">Análisis de dirección</span></div>
    <div class="grid g2" style="gap:22px">
      <div>
        <div class="eyebrow" style="margin-bottom:8px">Por qué ha bajado el margen</div>
        <p style="font-size:13.5px;line-height:1.55;margin:0 0 16px">${R.diagnostico}</p>
        <div class="eyebrow" style="margin-bottom:8px">Qué local atendería primero</div>
        <p style="font-size:13.5px;line-height:1.55;margin:0">${R.prioridad}</p>
      </div>
      <div>
        <div class="eyebrow" style="margin-bottom:8px">Qué revisaría hoy</div>
        <div style="display:flex;flex-direction:column;gap:2px">${R.agenda.map((a, i) => `<button class="att" data-act="${a.id ? "estab" : "go"}" ${a.id ? `data-id="${a.id}"` : `data-view="${a.go}"`} style="width:100%;text-align:left;background:none;border-top:1px solid var(--border);padding:11px 2px"><div class="ic ${i === 0 ? "bad" : "warn"}" style="width:26px;height:26px;border-radius:8px;font-weight:700;font-size:12px">${i + 1}</div><div class="grow"><b style="font-size:13px">${a.t}</b><p class="mut" style="margin:2px 0 0;font-size:12px">${a.why}</p></div><span style="color:var(--ink3)">${ic("chevR", 15)}</span></button>`).join("")}</div>
      </div>
    </div>
    <div style="margin-top:18px;padding:15px 17px;background:var(--brand-soft);border-radius:13px;display:flex;gap:12px"><span style="color:var(--brand);flex:none;margin-top:1px">${ic("spark", 20)}</span><div><b style="font-size:13.5px">La decisión que yo tomaría</b><p style="margin:5px 0 0;font-size:14px;line-height:1.55">${R.decision}</p></div></div></div>`;
}

V.dashboard = () => {
  const gf = getFin(S.estab, S.period);
  const I = insights();
  const c = saraConcern();

  // ── Sara · Dirección de Operaciones (parte de la mañana) ──
  const hero = `<div class="card hero" style="padding:22px">
    <div class="flex" style="gap:12px;margin-bottom:14px"><span class="avatar" style="width:40px;height:40px">S</span>
      <div><div style="font-weight:680;font-size:15px;letter-spacing:-.01em">Sara · Dirección de Operaciones</div><div class="mut" style="font-size:12px">Parte de la mañana · ${new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(2026, 7, 5))}</div></div>
      <span class="pill ok" style="margin-left:auto">${ic("wifi", 12)} Todo operativo</span></div>
    <p style="font-size:15px;line-height:1.65;margin:0 0 14px;max-width:74ch">Buenos días, Uriel. ${saraBriefing().join(" ")}</p>
    ${c ? `<div style="display:flex;gap:11px;padding:13px 15px;background:var(--warning-soft);border-radius:12px;align-items:flex-start"><span style="color:var(--warning);flex:none">${ic("alert", 18)}</span><div style="flex:1"><b style="font-size:13.5px">Lo que más me preocupa</b><p style="margin:4px 0 10px;font-size:13.5px;line-height:1.5">${c.t}</p><button class="btn ghost sm" data-act="estab" data-id="${c.id}">Revisar el local ${ic("chevR", 12)}</button></div></div>` : `<span class="pill ok">${ic("check", 12)} Nada urgente que revisar ahora</span>`}
    <div class="wrapf" style="margin-top:14px"><button class="btn primary sm" data-act="go" data-view="sara">${ic("spark", 14)} Hablar con Sara</button><button class="btn ghost sm" data-act="go" data-view="alertas">Ver alertas (${newAlerts().length})</button></div></div>`;

  // ── KPIs de un vistazo ──
  const kpis = `<div class="grid g4">
    ${stat({ lab: "Ventas · " + periodLabel().toLowerCase(), icon: "euro", val: eur(gf.ventas), delta: gf.dVentasLY })}
    ${stat({ lab: "Margen operativo", icon: "chart", val: eur(gf.margen), unit: gf.margenPct.toFixed(0) + "%", delta: gf.dMargen })}
    ${stat({ lab: "Ocupación media", icon: "team", val: gf.ocup + "%" })}
    ${stat({ lab: "Reservas hoy", icon: "cal", val: nf.format(ESTAB.reduce((s, e) => s + e.res, 0)), delta: 14 })}</div>`;

  const atencion = answerCard("¿Qué requiere tu atención?", `<div class="rows" style="margin:-4px -18px -18px">${newAlerts().slice(0, 5).map(a => attRow(a)).join("") || '<div class="mut" style="padding:10px 0">Nada pendiente. Todo bajo control.</div>'}</div>`, { icon: "bell", go: "alertas" });

  const needHelp = `<div class="card p0"><div class="ch" style="padding:18px 18px 0"><h3 style="font-size:13px;color:var(--ink2);font-weight:650;display:flex;gap:8px"><span style="color:var(--brand)">${ic("pin", 15)}</span>¿Qué local necesita ayuda?</h3></div>
    <div class="rows" style="margin-top:6px">${I.health.slice(0, 5).map(h => {
      const col = h.estado === "crit" ? "var(--danger)" : h.estado === "warn" ? "var(--warning)" : "var(--success)";
      return `<button class="row" data-act="estab" data-id="${h.e.id}" style="width:100%;text-align:left;background:none;align-items:flex-start">
        <div class="ava" style="background:${h.estado === "crit" ? "var(--danger-soft)" : h.estado === "warn" ? "var(--warning-soft)" : "var(--brand-soft)"};color:${col}">${h.e.ini}</div>
        <div class="grow"><div class="between"><div class="t1">${h.e.short}</div><b class="tnum" style="font-size:13px;color:${col}">${h.score}</b></div>
          <div class="prog ${h.estado === "crit" ? "bad" : h.estado === "warn" ? "warn" : ""}" style="margin:6px 0"><i style="width:${h.score}%"></i></div>
          <div class="t2">${h.reasons.length ? h.reasons.slice(0, 2).join(" · ") : "Rendimiento correcto, sin incidencias"}</div></div></button>`;
    }).join("")}</div></div>`;

  const ventasBlk = card("Ventas por establecimiento", bars(ESTAB.filter(e => !e.cerrado).map(e => ({ label: e.short, v: baseFin(e).ventas, id: e.id, go: 1 })), { h: 168 }), `<span class="mut">${periodLabel()}</span>`);
  const margenTbl = card("Margen vs. objetivo por local", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Local</th><th class="r">Margen</th><th class="r">Objetivo</th><th class="r">Desv.</th></tr></thead><tbody>${ESTAB.filter(e => !e.cerrado).map(e => { const f = baseFin(e); return `<tr><td style="font-weight:600">${e.short}</td><td class="r tnum">${f.margenPct.toFixed(0)}%</td><td class="r tnum mut">${f.margenObj}%</td><td class="r tnum ${f.dMargenObj < -0.5 ? "down" : f.dMargenObj > 0.5 ? "up" : "mut"}">${f.dMargenObj >= 0 ? "+" : ""}${f.dMargenObj.toFixed(1)}</td></tr>`; }).join("")}</tbody></table></div>`, `<span class="mut">puntos</span>`);

  return hero + `<div style="height:16px"></div>` + kpis + `<div class="grid g12" style="margin-top:16px">
    <div class="c8">${atencion}</div><div class="c4">${needHelp}</div>
    <div class="c7">${ventasBlk}</div><div class="c5">${margenTbl}</div>
    <div class="c12">${criterioCard()}</div></div>`;
};

function attRow(a, done) {
  const icn = a.dept === "Sara" ? "wifi" : a.sev === "crit" ? "alert" : a.sev === "imp" ? "alert" : "bell";
  const k = a.sev === "crit" ? "bad" : a.sev === "imp" ? "warn" : "info";
  const reviewed = a.estado === "Revisada";
  return `<div class="att ${reviewed ? "done" : ""}"><div class="ic ${k}">${ic(icn, 17)}</div>
    <div class="grow"><b>${a.causa}</b><div class="meta">${a.local !== "—" ? ic("pin", 11) + " " + a.local + " · " : ""}${a.tiempo} · ${a.dept} · ${a.resp}</div></div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px">${reviewed ? pill("Revisada", "ok") : `<button class="btn ghost sm" data-act="alert-act" data-id="${a.id}">${a.accion}</button><button class="link" data-act="alert-review" data-id="${a.id}" style="font-size:11.5px">Marcar revisada</button>`}</div></div>`;
}

/* Modelo financiero mensual (mock coherente con el día tipo del grupo). */
function finanzasModel(scope) {
  const gDay = getFin("all", "ayer").ventas, sDay = getFin(scope, "ayer").ventas;
  const scale = scope === "all" ? 1 : (gDay ? sDay / gDay : 1);
  const V = Math.round(812000 * scale), Vbud = Math.round(820000 * scale);
  const compras = Math.round(V * 26.0 / 100), personal = Math.round(V * 33.0 / 100), otros = Math.round(V * 8.5 / 100), amort = Math.round(V * 2.7 / 100);
  const margenBruto = V - compras, ebitda = V - compras - personal - otros, ebit = ebitda - amort;
  const budget = { compras: Math.round(Vbud * 25.5 / 100), personal: Math.round(Vbud * 31.5 / 100), otros: Math.round(Vbud * 8.5 / 100) };
  const hist = [726, 690, 648, 712, 612, 590, 648, 705, 762, 815, 848, 812].map(x => Math.round(x * 1000 * scale));
  const teso = scope === "all" ? { saldo: 142000, cobros: 806000, nominas: 268000, prov: 211000, alquileres: 69000, impuestos: 96000 } : null;
  return { scale, scope, V, Vbud, compras, personal, otros, amort, margenBruto, ebitda, ebit, budget, hist,
    mtd: Math.round(V * 0.18), forecast: V, conf: 92, teso,
    comp: { anual: 8.6, mensual: 2.5, semanal: 3.7 },
    margenBrutoPct: margenBruto / V * 100, ebitdaPct: ebitda / V * 100, ebitPct: ebit / V * 100, dObj: (V - Vbud) / Vbud * 100 };
}
function pnlLine(label, val, pctV, bud, o = {}) {
  const dev = bud != null ? val - bud : null;
  const devCls = dev == null ? "mut" : (o.cost ? (dev > 0 ? "down" : "up") : (dev >= 0 ? "up" : "down"));
  return `<tr${o.bold ? ' style="font-weight:700"' : ""}><td style="${o.color ? "color:" + o.color : ""}">${label}</td><td class="r tnum"${o.color ? ` style="color:${o.color}"` : ""}>${o.neg ? "− " : ""}${eur(Math.abs(val))}</td><td class="r tnum mut">${pctV != null ? pctV.toFixed(1) + "%" : ""}</td><td class="r tnum ${devCls}">${dev == null ? "—" : (dev >= 0 ? "+" : "−") + eurK(Math.abs(dev))}</td></tr>`;
}
const miniTrend = (t, sub, d) => `<div style="background:var(--surface2);border-radius:12px;padding:14px"><div class="mut" style="font-size:11.5px;font-weight:600">${t}</div><div class="tnum" style="font-size:24px;font-weight:750;margin:5px 0;color:${d >= 0 ? "var(--success)" : "var(--danger)"}">${signed(d)}</div><div class="mut" style="font-size:11px">${sub}</div></div>`;
const tesoRow = (l, v, cls, bold) => `<div class="between" style="padding:9px 2px;border-top:1px solid var(--border)${bold ? ";font-weight:700" : ""}"><span>${l}</span><b class="tnum ${cls || ""}">${v < 0 ? "− " : ""}${eur(Math.abs(v))}</b></div>`;
V.finanzas = () => {
  const M = finanzasModel(S.estab);
  const bMB = M.Vbud - M.budget.compras, bEbitda = M.Vbud - M.budget.compras - M.budget.personal - M.budget.otros, bEbit = bEbitda - M.amort;
  const kpis = `<div class="grid g4">
    ${stat({ lab: "Ventas mes (previsión)", icon: "euro", val: eur(M.forecast), delta: M.comp.anual })}
    ${stat({ lab: "EBITDA estimado", icon: "chart", val: eur(M.ebitda), unit: M.ebitdaPct.toFixed(0) + "%" })}
    ${stat({ lab: "Margen bruto", icon: "target", val: M.margenBrutoPct.toFixed(0) + "%" })}
    ${stat({ lab: "Beneficio operativo", icon: "euro", val: eur(M.ebit), unit: M.ebitPct.toFixed(0) + "%" })}</div>`;
  const pnl = card(`Cuenta de resultados · ${scopeLabel()} · mes en curso (previsión)`, `<div class="tblwrap"><table class="tbl"><thead><tr><th>Concepto</th><th class="r">Importe</th><th class="r">% ventas</th><th class="r">vs. presup.</th></tr></thead><tbody>
    ${pnlLine("Ventas", M.V, 100, M.Vbud)}
    ${pnlLine("Coste de mercancía / compras", M.compras, M.compras / M.V * 100, M.budget.compras, { neg: true, cost: true })}
    ${pnlLine("= Margen bruto", M.margenBruto, M.margenBrutoPct, bMB, { bold: true })}
    ${pnlLine("Coste de personal", M.personal, M.personal / M.V * 100, M.budget.personal, { neg: true, cost: true })}
    ${pnlLine("Otros gastos operativos", M.otros, M.otros / M.V * 100, M.budget.otros, { neg: true, cost: true })}
    ${pnlLine("= EBITDA estimado", M.ebitda, M.ebitdaPct, bEbitda, { bold: true, color: "var(--brand)" })}
    ${pnlLine("Amortizaciones", M.amort, M.amort / M.V * 100, M.amort, { neg: true, cost: true })}
    ${pnlLine("= Beneficio operativo (EBIT)", M.ebit, M.ebitPct, bEbit, { bold: true, color: "var(--brand)" })}
  </tbody></table></div><div class="mut" style="font-size:11px;margin-top:10px">Cifras estimadas a partir de ventas y estructura de costes; no sustituyen la contabilidad cerrada.</div>`);
  const comparativas = card("Comparativas de ventas", `<div class="grid g3" style="gap:12px">${miniTrend("Anual", "vs. mismo mes de 2025", M.comp.anual)}${miniTrend("Mensual", "vs. mes anterior", M.comp.mensual)}${miniTrend("Semanal", "vs. semana anterior", M.comp.semanal)}</div>`);
  const hist = card("Evolución histórica · 12 meses", area(M.hist, { h: 160, fmt: "eur", labels: ["S", "O", "N", "D", "E", "F", "M", "A", "M", "J", "J", "A"] }), `<span class="mut">${scopeLabel()}</span>`);
  const pctBud = M.forecast / M.Vbud * 100;
  const forecast = card("Previsión de cierre de mes", `<div class="between" style="align-items:flex-end"><div><div class="mut" style="font-size:12px">Proyección de cierre</div><div class="big tnum">${eur(M.forecast)}</div><div class="mut" style="font-size:12px;margin-top:4px">Presupuesto ${eur(M.Vbud)} · <span class="${M.dObj >= 0 ? "up" : "down"}">${signed(M.dObj)}</span></div></div><div style="text-align:right"><div class="mut" style="font-size:12px">Confianza</div><div class="tnum" style="font-size:22px;font-weight:750">${M.conf}%</div></div></div>
    <div class="prog ${M.dObj < 0 ? "warn" : ""}" style="margin-top:14px;height:10px"><i style="width:${Math.min(100, pctBud)}%"></i></div>
    <div class="between mut" style="font-size:11px;margin-top:6px"><span>Llevas ${eur(M.mtd)} (día 5)</span><span>Meta ${eur(M.Vbud)}</span></div>
    <div style="margin-top:12px;padding:11px 13px;background:var(--surface2);border-radius:11px;font-size:12.5px">A este ritmo cerrarías ${M.dObj < 0 ? `<b style="color:var(--warning)">${eurK(Math.abs(M.forecast - M.Vbud))} por debajo</b> del presupuesto` : `<b style="color:var(--success)">por encima</b> del presupuesto`}. Recuperarlo pide +${(Math.abs(M.dObj)).toFixed(1)}% de ventas o −1 pto de personal.</div>`);
  const teso = M.teso ? (() => { const t = M.teso, fin = t.saldo + t.cobros - t.nominas - t.prov - t.alquileres - t.impuestos; return card("Previsión de tesorería · 30 días", `<div style="display:flex;flex-direction:column">
    ${tesoRow("Saldo actual", t.saldo)}${tesoRow("+ Cobros previstos", t.cobros, "up")}${tesoRow("− Nóminas", -t.nominas, "down")}${tesoRow("− Proveedores", -t.prov, "down")}${tesoRow("− Alquileres y otros", -t.alquileres, "down")}${tesoRow("− Impuestos (IVA trimestral)", -t.impuestos, "down")}${tesoRow("= Saldo previsto fin de mes", fin, "", true)}</div>
    <div style="margin-top:10px;padding:10px 12px;background:var(--success-soft);border-radius:10px;font-size:12.5px;color:var(--success);display:flex;gap:8px"><span style="flex:none">${ic("check", 14)}</span><span>Tesorería holgada: el saldo previsto cubre 1,1× las nóminas del mes siguiente.</span></div>`); })()
    : card("Previsión de tesorería", `<div class="mut" style="padding:8px 0">La tesorería se consolida a nivel de grupo. Selecciona «Todos los establecimientos» para verla.</div>`);
  const costes = card("Estructura de costes", `<div class="flex" style="gap:22px;flex-wrap:wrap"><div>${(() => { const s = [{ v: M.personal, c: "#3F6E93" }, { v: M.compras, c: "#B9822B" }, { v: M.otros + M.amort, c: "#8A5A9B" }, { v: M.ebit, c: "var(--brand)" }]; s.dLabel = "% de ventas"; return donut(s); })()}</div>
    <div class="legend" style="flex-direction:column;gap:10px">${[["Personal", M.personal, "#3F6E93"], ["Compras", M.compras, "#B9822B"], ["Otros + amort.", M.otros + M.amort, "#8A5A9B"], ["Beneficio", M.ebit, "var(--brand)"]].map(x => `<div><i style="background:${x[2]}"></i>${x[0]} <b class="tnum" style="margin-left:6px">${eur(x[1])}</b> <span class="mut">· ${(x[1] / M.V * 100).toFixed(0)}%</span></div>`).join("")}</div></div>`);
  const gAll = getFin("all", "ayer");
  const comp = card("Rendimiento por establecimiento · ayer", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Local</th><th class="r">Ventas</th><th class="r">vs. año</th><th class="r">vs. sem.</th><th class="r">Margen</th><th class="r">vs. obj.</th></tr></thead><tbody>${ESTAB.filter(e => !e.cerrado).map(e => { const b = baseFin(e), dpw = e.pw ? (e.ventas - e.pw) / e.pw * 100 : 0; return `<tr><td style="font-weight:600">${e.short}</td><td class="r tnum">${eur(b.ventas)}</td><td class="r tnum ${b.dVentasLY < 0 ? "down" : "up"}">${signed(b.dVentasLY)}</td><td class="r tnum ${dpw < 0 ? "down" : "up"}">${signed(dpw)}</td><td class="r tnum">${b.margenPct.toFixed(0)}%</td><td class="r tnum ${b.dMargenObj < -0.5 ? "down" : b.dMargenObj > 0.5 ? "up" : "mut"}">${b.dMargenObj >= 0 ? "+" : ""}${b.dMargenObj.toFixed(1)}</td></tr>`; }).join("")}
    <tr style="font-weight:700;background:var(--surface2)"><td>Grupo</td><td class="r tnum">${eur(gAll.ventas)}</td><td class="r tnum">${signed(gAll.dVentasLY)}</td><td class="r tnum">${signed(gAll.dVentasPW)}</td><td class="r tnum">${gAll.margenPct.toFixed(0)}%</td><td class="r mut">—</td></tr></tbody></table></div>`);
  return kpis + `<div class="grid g12" style="margin-top:16px">
    <div class="c7">${pnl}</div><div class="c5">${forecast}<div style="height:16px"></div>${comparativas}</div>
    <div class="c7">${hist}</div><div class="c5">${costes}</div>
    <div class="c5">${teso}</div><div class="c7">${comp}</div></div>`;
};

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

const tx = (t) => TEAM_X[t.id] || { horas4s: 0, sinLibrar: 0, form: null, rend: 0 };
V.equipo = () => {
  const act = TEAM.filter(t => t.estado === "Activo");
  const burnout = act.map(t => ({ t, x: tx(t) })).filter(o => o.x.horas4s >= 165 && o.x.sinLibrar >= 9).sort((a, b) => b.x.sinLibrar - a.x.sinLibrar);
  const muchasHoras = act.map(t => ({ t, x: tx(t) })).filter(o => o.x.horas4s > 165).sort((a, b) => b.x.horas4s - a.x.horas4s);
  const extraord = act.map(t => ({ t, x: tx(t) })).filter(o => o.x.rend >= 90).sort((a, b) => b.x.rend - a.x.rend);
  const formacion = TEAM.map(t => ({ t, x: tx(t) })).filter(o => o.x.form);
  const recompensa = extraord.filter(o => o.t.ventas > 0 || o.t.res >= 4.8);
  const stats = `<div class="grid g4">
    ${stat({ lab: "En plantilla", icon: "team", val: "48" })}
    ${stat({ lab: "Riesgo de burnout", icon: "alert", val: String(burnout.length), unit: "personas" })}
    ${stat({ lab: "Horas extra (4 sem.)", icon: "clock", val: String(TEAM.reduce((s, t) => s + Math.max(0, tx(t).horas4s - 160), 0)), unit: "h" })}
    ${stat({ lab: "Formaciones pendientes", icon: "hr", val: String(formacion.length) })}</div>`;
  const empRow = (o, right) => `<div class="row"><span class="ava">${ini(o.t.n)}</span><div class="grow"><div class="t1">${o.t.n}</div><div class="t2">${o.t.puesto} · ${o.t.local}</div></div>${right}</div>`;
  const cBurn = answerCard("¿Quién está cerca de quemarse?", burnout.length ? `<div class="rows" style="margin:0 -18px -18px">${burnout.map(o => empRow(o, `<div style="text-align:right"><b class="tnum down">${o.x.sinLibrar} días</b><div class="mut" style="font-size:11px">sin librar</div></div>`)).join("")}</div>` : `<div class="mut" style="padding:6px 0">Nadie en riesgo.</div>`, { icon: "alert", sev: burnout.length ? "crit" : "ok" });
  const cHoras = answerCard("¿Quién lleva demasiadas horas?", `<div class="rows" style="margin:0 -18px -18px">${muchasHoras.map(o => empRow(o, `<b class="tnum ${o.x.horas4s > 170 ? "down" : ""}">${o.x.horas4s}h</b>`)).join("")}</div>`, { icon: "clock", sev: "warn" });
  const cRend = answerCard("¿Quién rinde de forma extraordinaria?", `<div class="rows" style="margin:0 -18px -18px">${extraord.map(o => empRow(o, `<div style="text-align:right"><b class="tnum" style="color:var(--success)">${o.x.rend}</b><div class="mut" style="font-size:11px">rendimiento</div></div>`)).join("")}</div>`, { icon: "star", sev: "ok" });
  const cForm = answerCard("¿Quién necesita formación?", `<div class="rows" style="margin:0 -18px -18px">${formacion.map(o => empRow(o, `<span class="pill info">${o.x.form}</span>`)).join("")}</div>`, { icon: "hr" });
  const reward = card("Reconocimiento del mes", `<div class="reco"><div class="rc">${ic("star", 16)}</div><div class="grow"><b style="font-size:13.5px">${recompensa[0] ? recompensa[0].t.n : "—"} merece un reconocimiento</b><p class="mut" style="margin:4px 0 10px;font-size:12.5px">Mejor vendedora del grupo (${eur(TEAM.find(t => t.ventas > 0 && t.id === 7) ? 2680 : 0)}) y valoración ${recompensa[0] ? recompensa[0].t.res.toFixed(1).replace(".", ",") : ""}★. Además acumula 176h en 4 semanas: convendría <b>reconocerla y protegerla</b> antes de que se sobrecargue.</p><div class="wrapf"><button class="btn primary sm" data-act="approve-reco" data-txt="Reconocimiento preparado">Reconocer</button><button class="btn ghost sm" data-act="soon">Ajustar turnos</button></div></div></div>`);
  const filters = `<div class="wrapf" style="margin:16px 0 12px">${["Todos", ...[...new Set(TEAM.map(t => t.local))]].map((c, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="teamfilter" data-loc="${c}">${c}</button>`).join("")}</div>`;
  const table = card("Plantilla", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Persona</th><th>Local</th><th>Puesto</th><th>Estado</th><th class="r">Horas 4s</th><th class="r">Rendim.</th><th class="r">Ventas</th><th class="r">Reseña</th></tr></thead><tbody id="teamBody">${teamRows("Todos")}</tbody></table></div>`, `<span class="mut">Gestión de personas</span>`);
  return stats + `<div class="grid g12" style="margin-top:16px">
    <div class="c6">${cBurn}</div><div class="c6">${cHoras}</div>
    <div class="c6">${cRend}</div><div class="c6">${cForm}</div>
    <div class="c12">${reward}</div></div>` + filters + table;
};
const ini = (n) => n.split(" ").map(x => x[0]).slice(0, 2).join("");
function teamRows(loc) {
  return TEAM.filter(t => loc === "Todos" || t.local === loc).map(t => {
    const x = tx(t), estK = t.estado === "Activo" ? "ok" : t.estado === "Baja" ? "bad" : "warn";
    const burn = x.horas4s >= 165 && x.sinLibrar >= 9;
    return `<tr><td><div class="flex"><span class="ava">${ini(t.n)}</span><b style="font-weight:600">${t.n}${burn ? ` ${pill("Burnout", "bad")}` : ""}</b></div></td><td>${t.local}</td><td class="mut">${t.puesto}</td><td>${pill(t.estado, estK)}</td><td class="r tnum ${x.horas4s > 170 ? "down" : ""}">${x.horas4s || "—"}</td><td class="r tnum ${x.rend >= 90 ? "up" : x.rend && x.rend < 72 ? "down" : ""}">${x.rend || "—"}</td><td class="r tnum">${t.ventas ? eur(t.ventas) : "—"}</td><td class="r tnum">${t.res.toFixed(1).replace(".", ",")}</td></tr>`;
  }).join("");
}

V.clientes = () => {
  const vip = CLIENTS.filter(c => clienteEstado(c).k === "VIP");
  const perdidos = CLIENTS.filter(c => c.semanas >= 8).sort((a, b) => b.gasto - a.gasto);
  const riesgo = CLIENTS.filter(c => c.semanas >= 4 && c.semanas < 8).sort((a, b) => b.gasto - a.gasto);
  const vuelven = CLIENTS.filter(c => c.recuperado);
  const topGasto = [...CLIENTS].sort((a, b) => b.gasto - a.gasto).slice(0, 3);
  const topResenas = [...CLIENTS].filter(c => c.resenas > 0).sort((a, b) => b.resenas - a.resenas).slice(0, 3);
  const stats = `<div class="grid g4">
    ${stat({ lab: "Clientes", icon: "users", val: nf.format(3482), delta: 4 })}
    ${stat({ lab: "VIP", icon: "star", val: String(212) })}
    ${stat({ lab: "En riesgo de fuga", icon: "alert", val: String(riesgo.length + perdidos.length), unit: "detectados" })}
    ${stat({ lab: "Recuperados (30 días)", icon: "spark", val: String(MKT.recuperados), delta: 12 })}</div>`;
  const listCard = (q, icon, arr, render, sev) => answerCard(q, arr.length ? `<div class="rows" style="margin:0 -18px -18px">${arr.map(render).join("")}</div>` : `<div class="mut" style="padding:6px 0">Nada que destacar.</div>`, { icon, sev });
  const cliBase = c => `<span class="ava">${ini(c.n)}</span><div class="grow"><div class="t1">${c.n}</div><div class="t2">${c.loc} · ${c.res} reservas</div></div>`;
  const perd = listCard("¿Qué clientes hemos perdido?", "users", perdidos, c => `<div class="row">${cliBase(c)}<div style="text-align:right"><b class="tnum">${eur(c.gasto)}</b><div class="mut" style="font-size:11px">hace ${c.semanas} sem.</div></div></div>`, "crit");
  const rie = listCard("¿Quién lleva tiempo sin venir?", "clock", riesgo, c => `<div class="row">${cliBase(c)}<div style="text-align:right"><span class="pill warn">${c.semanas} sem.</span></div></div>`, "warn");
  const topG = listCard("¿Quién gasta más?", "euro", topGasto, c => `<div class="row">${cliBase(c)}<b class="tnum" style="color:var(--brand)">${eur(c.gasto)}</b></div>`);
  const topR = listCard("¿Quién nos deja más reseñas?", "star", topResenas, c => `<div class="row">${cliBase(c)}<b class="tnum" style="color:var(--warning)">${c.resenas} ★</b></div>`);
  const back = listCard("¿Quién ha vuelto?", "aU", vuelven, c => `<div class="row">${cliBase(c)}<span class="pill ok">Recuperado</span></div>`, "ok");
  const action = card("Acción recomendada de Sara", `<div class="reco"><div class="rc">${ic("spark", 16)}</div><div class="grow"><b style="font-size:13.5px">${perdidos.length + riesgo.length} clientes de valor se están enfriando</b><p class="mut" style="margin:4px 0 10px;font-size:12.5px">Rosa Prat (VIP, ${eur(1560)}) y Toni Mas llevan semanas sin venir. Un mensaje personal con una invitación puede recuperar ~${eur(1200)} de gasto anual.</p><button class="btn primary sm" data-act="approve-camp">Preparar reactivación</button></div></div>`);
  const table = card("Base de clientes", `<div class="wrapf" style="margin-bottom:14px">${["Todos", "VIP", "En riesgo", "Perdido", "Nuevo"].map((c, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="clientfilter" data-tag="${c}">${c}</button>`).join("")}</div><div class="tblwrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Local</th><th>Segmento</th><th class="r">Reservas</th><th class="r">Gasto</th><th class="r">Reseñas</th><th class="r">Últ. visita</th></tr></thead><tbody id="cliBody">${cliRows("Todos")}</tbody></table></div>`, `<button class="btn ghost sm" data-act="toast" data-msg="CSV de ejemplo generado">${ic("doc", 14)} Exportar</button>`);
  return stats + `<div class="grid g12" style="margin-top:16px">
    <div class="c4">${perd}</div><div class="c4">${rie}</div><div class="c4">${back}</div>
    <div class="c4">${topG}</div><div class="c4">${topR}</div><div class="c4">${action}</div>
    <div class="c12">${table}</div></div>`;
};
function cliRows(tg) {
  return CLIENTS.filter(c => { const e = clienteEstado(c).k; return tg === "Todos" || e === tg; }).sort((a, b) => b.gasto - a.gasto).map(c => { const e = clienteEstado(c); return `<tr><td><div class="flex"><span class="ava">${ini(c.n)}</span><b style="font-weight:600">${c.n}</b></div></td><td>${c.loc}</td><td>${pill(e.k, e.c)}</td><td class="r tnum">${c.res}</td><td class="r tnum">${eur(c.gasto)}</td><td class="r tnum">${c.resenas || "—"}</td><td class="r mut">${c.semanas === 0 ? "esta semana" : "hace " + c.semanas + " sem."}</td></tr>`; }).join("");
}

V.rrhh = () => {
  const cols = [["Nuevas", ["Cocinero/a · Girona", "Camarero/a · Lloret"], "info"], ["En proceso", ["Jefe de sala · Blanes", "Ayudante cocina · Tordera"], "warn"], ["Cerradas", ["Barra · Girona"], "ok"]];
  const stats = `<div class="grid g4">${stat({ lab: "Vacantes activas", icon: "hr", val: "5" })}${stat({ lab: "Candidaturas (mes)", icon: "users", val: "37", delta: 24 })}${stat({ lab: "Llamadas del mes", icon: "msg", val: "31/48" })}${stat({ lab: "Altas previstas", icon: "plus", val: "3" })}</div>`;
  const kan = `<div class="kan">${cols.map(c => `<div class="kcol"><div class="kh">${c[0]} <span class="pill ${c[2]}">${c[1].length}</span></div>${c[1].map(k => `<button class="kcard" data-act="soon" style="width:100%;text-align:left"><div class="t1">${k.split(" · ")[0]}</div><div class="t2">${ic("pin", 11)} ${k.split(" · ")[1]} · hace 2 días</div></button>`).join("")}</div>`).join("")}</div>`;
  return stats + `<div class="ph" style="margin:22px 0 12px"><div><div class="eyebrow">Selección</div><h1 style="font-size:19px">Candidaturas</h1></div><button class="btn primary" data-act="soon">${ic("plus", 15)} Nueva vacante</button></div>` + kan;
};

V.compras = () => {
  const gastoMes = CATG.reduce((s, c) => s + c.gasto, 0), budMes = CATG.reduce((s, c) => s + c.bud, 0);
  const overCat = CATG.filter(c => c.gasto > c.bud).sort((a, b) => (b.gasto - b.bud) - (a.gasto - a.bud));
  const priceUp = SUPPLIERS.filter(s => s.trend > 0).sort((a, b) => b.trend - a.trend);
  const wasteUp = INSUMOS.filter(i => i.desp >= 8 && i.tend === "subiendo").sort((a, b) => b.desp - a.desp);
  const rotBad = INSUMOS.filter(i => i.rot === "Anómala" || i.rot === "Baja");
  const ahorroTot = AHORROS.reduce((s, a) => s + a.val, 0);
  const despMed = Math.round(INSUMOS.reduce((s, i) => s + i.desp, 0) / INSUMOS.length);
  const stats = `<div class="grid g4">
    ${stat({ lab: "Gasto del mes", icon: "cart", val: eur(gastoMes), delta: (gastoMes - budMes) / budMes * 100, invert: true })}
    ${stat({ lab: "Ahorro potencial", icon: "euro", val: eur(ahorroTot), unit: "/mes" })}
    ${stat({ lab: "Desperdicio medio", icon: "box", val: despMed + "%" })}
    ${stat({ lab: "Pedidos pendientes", icon: "box", val: String(pendingOrders().length) })}</div>`;
  const rowIc = (icn, k) => `<span class="ic ${k}" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none">${ic(icn, 15)}</span>`;
  const aMore = answerCard("¿Estamos comprando de más?", overCat.length ? `<div class="rows" style="margin:0 -18px -18px">${overCat.map(c => `<div class="row">${rowIc("cart", "warn")}<div class="grow"><div class="t1">${c.cat}</div><div class="t2">Presupuesto ${eur(c.bud)} · gasto ${eur(c.gasto)}</div></div><b class="tnum down">+${eurK(c.gasto - c.bud)}</b></div>`).join("")}</div>` : `<div class="mut" style="padding:6px 0">Todo dentro de presupuesto.</div>`, { icon: "cart", sev: overCat.length ? "warn" : "ok" });
  const aPrice = answerCard("¿Qué proveedor ha subido precios?", `<div class="rows" style="margin:0 -18px -18px">${priceUp.slice(0, 3).map(s => `<div class="row"><div class="grow"><div class="t1">${s.n}</div><div class="t2">${s.cat} · fiabilidad ${s.fiab}%</div></div><b class="tnum down">+${s.trend}%</b></div>`).join("")}</div>`, { icon: "cart", sev: "warn" });
  const aWaste = answerCard("¿Dónde aumenta el desperdicio?", wasteUp.length ? `<div class="rows" style="margin:0 -18px -18px">${wasteUp.map(i => `<div class="row">${rowIc("box", "warn")}<div class="grow"><div class="t1">${i.n}</div><div class="t2">${i.cat} · rotación ${i.rot.toLowerCase()}</div></div><b class="tnum down">${i.desp}% ${ic("aU", 12)}</b></div>`).join("")}</div>` : `<div class="mut" style="padding:6px 0">Desperdicio estable.</div>`, { icon: "box", sev: "warn" });
  const aRot = answerCard("¿Qué producto tiene rotación anormal?", `<div class="rows" style="margin:0 -18px -18px">${rotBad.map(i => `<div class="row"><div class="grow"><div class="t1">${i.n}</div><div class="t2">${i.cat} · merma ${i.desp}%</div></div>${pill(i.rot, i.rot === "Anómala" ? "bad" : "warn")}</div>`).join("")}</div>`, { icon: "spark", sev: "warn" });
  const ahorro = card("¿Cuánto podemos ahorrar?", `<div class="rows" style="margin:-4px -18px 0">${AHORROS.map(a => `<div class="att"><div class="ic ok">${ic("euro", 16)}</div><div class="grow"><b style="font-size:13px">${a.t}</b><p class="mut" style="margin:3px 0 0;font-size:12px">${a.d}</p></div><div style="text-align:right"><b class="tnum" style="color:var(--success)">${eur(a.val)}</b><div class="mut" style="font-size:11px">/mes</div></div></div>`).join("")}</div>
    <div style="margin-top:12px;padding:12px 14px;background:var(--success-soft);border-radius:11px;font-size:13px;color:var(--success);display:flex;gap:9px"><span style="flex:none">${ic("spark", 16)}</span><span>Aplicando las 3 acciones ahorrarías ~<b>${eur(ahorroTot)}/mes</b> (${eur(ahorroTot * 12)}/año) sin afectar al servicio.</span></div>`, `<button class="btn primary sm" data-act="approve-reco" data-txt="Plan de ahorro preparado">Preparar plan</button>`);
  const catBars = card("Gasto por categoría vs. presupuesto", bars(CATG.map(c => ({ label: c.cat, v: c.gasto, c: c.gasto > c.bud ? "var(--danger)" : "var(--brand)" })), { h: 150 }), `<span class="mut">Mes</span>`);
  const provTable = card("Proveedores", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Proveedor</th><th>Categoría</th><th class="r">Precio</th><th class="r">Plazo</th><th class="r">Fiabilidad</th><th class="r">Gasto/mes</th></tr></thead><tbody>${SUPPLIERS.map(s => `<tr><td style="font-weight:600">${s.n}</td><td class="mut">${s.cat}</td><td class="r tnum ${s.trend > 0 ? "down" : s.trend < 0 ? "up" : "mut"}">${s.trend > 0 ? "+" : ""}${s.trend}%</td><td class="r tnum">${s.lead} d</td><td class="r tnum ${s.fiab < 90 ? "down" : ""}">${s.fiab}%</td><td class="r tnum">${eur(s.gasto)}</td></tr>`).join("")}</tbody></table></div>`);
  const pedidos = card("Pedidos", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Proveedor</th><th>Local</th><th>Estado</th><th class="r">Importe</th><th class="r">Desvío</th><th></th></tr></thead><tbody>${ORDERS.map(o => `<tr><td><div><b style="font-weight:600">${o.prov}</b><div class="mut" style="font-size:11.5px">${o.cat} · ${o.fecha}</div></div></td><td>${o.local}</td><td>${pill(o.estado, o.estado === "Pendiente" ? "warn" : o.estado === "Recibido" ? "ok" : "info")}</td><td class="r tnum">${eur(o.importe)}</td><td class="r tnum ${o.desv > 3 ? "down" : o.desv < 0 ? "up" : "mut"}">${o.desv > 0 ? "+" : ""}${o.desv}%</td><td class="r"><button class="btn ghost sm" data-act="order" data-id="${o.id}">Ver</button></td></tr>`).join("")}</tbody></table></div>`, `<button class="btn primary sm" data-act="soon">${ic("plus", 14)} Nuevo pedido</button>`);
  return stats + `<div class="grid g12" style="margin-top:16px">
    <div class="c6">${aMore}</div><div class="c6">${aPrice}</div>
    <div class="c6">${aWaste}</div><div class="c6">${aRot}</div>
    <div class="c7">${ahorro}</div><div class="c5">${catBars}</div>
    <div class="c12">${provTable}</div><div class="c12">${pedidos}</div></div>`;
};

V.marketing = () => {
  const activas = CAMPAIGNS.filter(c => c.reservas > 0);
  const totRes = activas.reduce((s, c) => s + c.reservas, 0), totIng = activas.reduce((s, c) => s + c.ingresos, 0), totCoste = activas.reduce((s, c) => s + c.coste, 0);
  const cprGlobal = totRes ? totCoste / totRes : 0;
  const roiGlobal = totCoste ? (totIng - totCoste) / totCoste * 100 : null;
  const best = [...activas].sort((a, b) => (b.ingresos - b.coste) - (a.ingresos - a.coste))[0];
  const stats = `<div class="grid g4">
    ${stat({ lab: "Reservas generadas", icon: "cal", val: String(totRes), delta: 16 })}
    ${stat({ lab: "Coste por reserva", icon: "euro", val: cprGlobal ? eur(cprGlobal) : "0 €" })}
    ${stat({ lab: "ROI de marketing", icon: "chart", val: roiGlobal != null ? "×" + (roiGlobal / 100 + 1).toFixed(1) : "—", unit: "retorno" })}
    ${stat({ lab: "Ingresos atribuidos", icon: "spark", val: eur(totIng), delta: 22 })}</div>`;
  const perf = card("Rendimiento de campañas", `<div class="tblwrap"><table class="tbl"><thead><tr><th>Campaña</th><th>Canal</th><th class="r">Reservas</th><th class="r">Ingresos</th><th class="r">Coste</th><th class="r">Coste/reserva</th><th class="r">ROI</th></tr></thead><tbody>${CAMPAIGNS.map(c => { const cpr = c.reservas ? c.coste / c.reservas : null, roi = c.coste ? (c.ingresos - c.coste) / c.coste * 100 : (c.reservas ? Infinity : null); return `<tr><td style="font-weight:600">${c.n}${c === best ? " " + pill("Top", "brand") : ""}</td><td class="mut">${c.canal}</td><td class="r tnum">${c.reservas || "—"}</td><td class="r tnum">${c.ingresos ? eur(c.ingresos) : "—"}</td><td class="r tnum">${c.coste ? eur(c.coste) : "0 €"}</td><td class="r tnum">${cpr != null ? eur(cpr) : "—"}</td><td class="r tnum ${roi === Infinity || (roi != null && roi > 100) ? "up" : "mut"}">${roi === Infinity ? "orgánico" : roi != null ? "+" + roi.toFixed(0) + "%" : "—"}</td></tr>`; }).join("")}</tbody></table></div>`, `<button class="btn primary sm" data-act="soon">${ic("plus", 14)} Nueva campaña</button>`);
  const movRow = (l, v, cls, icn) => `<div class="row"><span class="ic ${cls}" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none">${ic(icn, 15)}</span><div class="grow"><div class="t1">${l}</div></div><b class="tnum" style="font-size:18px">${v}</b></div>`;
  const movimiento = card("Movimiento de clientes · 30 días", `<div class="rows" style="margin:-4px -18px -18px">
    ${movRow("Clientes recuperados", MKT.recuperados, "ok", "aU")}
    ${movRow("Clientes perdidos", MKT.perdidos, "bad", "aD")}
    ${movRow("Inactivos > 45 días", MKT.inactivos45, "warn", "clock")}
    ${movRow("Leads nuevos", MKT.leads, "info", "spark")}</div>`, `<button class="link" data-act="go" data-view="clientes">Ver clientes ${ic("chevR", 12)}</button>`);
  const saraSug = card("Sugerencia de Sara", `<div class="reco"><div class="rc">${ic("spark", 16)}</div><div class="grow"><b style="font-size:13.5px">Reactivar ${MKT.inactivos45} clientes inactivos de Girona</b><p class="mut" style="margin:3px 0 8px;font-size:12.5px">La campaña «Reactivación 45+ días» está en borrador. Con el coste/reserva actual (${eur(cprGlobal)}) podría generar ~${eur(800)} con inversión mínima.</p><div class="wrapf" id="sugActions"><button class="btn primary sm" data-act="approve-camp">Aprobar campaña</button><button class="btn ghost sm" data-act="soon">Revisar</button></div></div></div>`);
  const reviews = card("Reseñas recientes", `<div class="rows" style="margin:0 -18px -18px">${REVIEWS.map(r => `<div class="row"><div style="display:flex;color:var(--warning)">${Array.from({ length: r.estrellas }, () => ic("star", 13)).join("")}</div><div class="grow"><div class="t1">${r.autor} · ${r.local}</div><div class="t2">${r.texto}${r.trab ? " — " + r.trab : ""}</div></div>${r.respondida ? pill("Respondida", "ok") : `<button class="btn ghost sm" data-act="reply-review" data-id="${r.id}">Preparar respuesta</button>`}</div>`).join("")}</div>`);
  return stats + `<div class="grid g12" style="margin-top:16px">
    <div class="c8">${perf}</div><div class="c4">${movimiento}</div>
    <div class="c6">${saraSug}</div><div class="c6">${reviews}</div></div>`;
};

V.mantenimiento = () => {
  const reincid = INCID.filter(i => i.reps >= 2).sort((a, b) => b.reps - a.reps);
  const deteriora = MANT_LOCAL.filter(m => m.tend === "subiendo").sort((a, b) => b.inc90 - a.inc90);
  const lentos = MANT_PROV.filter(p => p.lento).sort((a, b) => b.tiempo - a.tiempo);
  const chapuzas = INCID.filter(i => i.reabierta);
  const stats = `<div class="grid g4">
    ${stat({ lab: "Abiertas", icon: "wrench", val: String(openIncid().length), unit: openIncid().some(i => i.sev === "hi") ? "· 1 crítica" : "" })}
    ${stat({ lab: "En proceso", icon: "clock", val: String(INCID.filter(i => i.estado === "En proceso").length) })}
    ${stat({ lab: "Reincidencias", icon: "alert", val: String(reincid.length), unit: "averías repetidas" })}
    ${stat({ lab: "Tiempo medio", icon: "clock", val: "1,8", unit: "días" })}</div>`;
  const trendBadge = t => t === "subiendo" ? pill("↑ subiendo", "bad") : t === "bajando" ? pill("↓ bajando", "ok") : pill("estable");
  const aDet = answerCard("¿Qué locales empiezan a deteriorarse?", `<div class="rows" style="margin:0 -18px -18px">${deteriora.map(m => `<div class="row"><span class="ic warn" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none">${ic("pin", 15)}</span><div class="grow"><div class="t1">${m.local}</div><div class="t2">${m.inc90} incidencias en 90 días</div></div>${trendBadge(m.tend)}</div>`).join("")}</div>`, { icon: "pin", sev: "warn" });
  const aRep = answerCard("¿Qué averías se repiten?", reincid.length ? `<div class="rows" style="margin:0 -18px -18px">${reincid.map(i => `<div class="row"><span class="sev ${i.sev}"></span><div class="grow"><div class="t1">${i.titulo}</div><div class="t2">${i.local} · ${i.prov}</div></div><b class="tnum down">×${i.reps}</b></div>`).join("")}</div>` : `<div class="mut">Sin reincidencias.</div>`, { icon: "wrench", sev: "warn" });
  const aProv = answerCard("¿Qué proveedor tarda demasiado?", `<div class="rows" style="margin:0 -18px -18px">${lentos.map(p => `<div class="row"><div class="grow"><div class="t1">${p.n}</div><div class="t2">${p.cat} · ${p.inc} intervenciones</div></div><b class="tnum down">${p.tiempo.toFixed(1).replace(".", ",")} d</b></div>`).join("")}</div>`, { icon: "clock", sev: "warn" });
  const aChap = answerCard("¿Qué reparación fue una chapuza?", chapuzas.length ? `<div class="rows" style="margin:0 -18px -18px">${chapuzas.map(i => `<div class="row"><span class="ic bad" style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none">${ic("alert", 15)}</span><div class="grow"><div class="t1">${i.titulo}</div><div class="t2">${i.local} · reapareció tras la reparación (${i.prov})</div></div></div>`).join("")}</div>` : `<div class="mut" style="padding:6px 0">Ninguna reapertura.</div>`, { icon: "alert", sev: chapuzas.length ? "crit" : "ok" });
  const plan = card("Plan de prevención de Sara", `<div class="reco"><div class="rc">${ic("spark", 16)}</div><div class="grow"><b style="font-size:13.5px">Can Mateu y Girona concentran el 61% de las incidencias del trimestre</b><p class="mut" style="margin:4px 0 10px;font-size:12.5px">Sustituiría la cámara de Can Mateu (4ª reparación) y revisaría el datáfono de Girona a fondo (ya reabierto una vez con Redsys). Evita ~<b>800 €/año</b> en reparaciones recurrentes y cortes de servicio.</p><div class="wrapf"><button class="btn primary sm" data-act="approve-reco" data-txt="Plan de prevención preparado">Preparar plan</button><button class="btn ghost sm" data-act="go" data-view="compras">Pedir presupuestos</button></div></div></div>`);
  const filters = `<div class="wrapf" style="margin:16px 0 12px">${["Todas", "Crítica", "Abierta", "En proceso"].map((c, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="incidfilter" data-f="${c}">${c}</button>`).join("")}</div>`;
  const list = card("Incidencias", `<div class="rows" id="incidList" style="margin:0 -18px -18px">${INCID.map(i => incidRow(i)).join("")}</div>`, `<button class="btn primary sm" data-act="soon">${ic("plus", 14)} Nueva</button>`);
  return stats + `<div class="grid g12" style="margin-top:16px">
    <div class="c6">${aDet}</div><div class="c6">${aRep}</div>
    <div class="c6">${aProv}</div><div class="c6">${aChap}</div>
    <div class="c12">${plan}</div></div>` + filters + list;
};
function incidRow(i) {
  const kold = i.reps >= 3;
  return `<div class="row"><span class="sev ${i.sev}"></span><div class="grow"><div class="t1">${i.titulo}${i.reabierta ? ` ${pill("Reabierta", "bad")}` : ""}</div><div class="t2">${ic("pin", 11)} ${i.local} · ${i.dias < 1 ? "hace horas" : Math.round(i.dias) + " días"} · ${i.resp}</div>${kold ? `<div class="meta" style="margin-top:5px;font-size:11.5px;color:var(--warning)">${ic("alert", 11)} ${i.reps}ª reparación en 8 meses — revisar sustitución</div>` : ""}</div>
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
  const brief = saraBriefing(), c = saraConcern();
  const parte = `<div class="card"><div class="ch"><h3>Parte de la mañana</h3><span class="pill ok">${ic("wifi", 12)} Todo operativo</span></div>
    <div class="flex" style="gap:12px;margin-bottom:12px"><span class="avatar" style="width:38px;height:38px">S</span><div><b style="font-size:14px">Sara · Dirección de Operaciones</b><div class="mut" style="font-size:12px">Te informo sin que tengas que preguntar</div></div></div>
    <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:7px;font-size:13.5px;line-height:1.5">${brief.map(x => `<li>${x}</li>`).join("")}</ul>
    ${c ? `<div style="display:flex;gap:11px;padding:13px 15px;background:var(--warning-soft);border-radius:12px;align-items:flex-start;margin-top:14px"><span style="color:var(--warning);flex:none">${ic("alert", 18)}</span><div style="flex:1"><b style="font-size:13px">Lo que más me preocupa</b><p style="margin:4px 0 10px;font-size:13px;line-height:1.5">${c.t}</p><button class="btn ghost sm" data-act="estab" data-id="${c.id}">Revisar el local ${ic("chevR", 12)}</button></div></div>` : `<div class="pill ok" style="margin-top:14px">${ic("check", 12)} Nada urgente que revisar</div>`}</div>`;
  const chatMsgs = S.chat.length ? S.chat : [{ who: "her", t: "¿Quieres que profundice en algo? Pregúntame por cualquier local, trabajador o métrica." }];
  const left = card("Preguntas a Sara", `<div class="chat" id="chatBox">${chatMsgs.map(m => `<div class="msg ${m.who}">${m.who === "her" ? '<div class="mn">Sara</div>' : ""}${m.t}</div>`).join("")}</div>
    <div class="suggs">${["¿Cómo fue ayer?", "¿Qué local tuvo peor margen?", "¿Quién hizo horas extra?", "¿Qué pedidos están pendientes?", "¿Qué mantenimiento es urgente?", "¿Quién necesita apoyo?"].map(q => `<button class="chip" data-act="ask" data-q="${q}">${q}</button>`).join("")}</div>
    <div class="chatin"><input id="chatInput" placeholder="Pregúntale a Sara…" aria-label="Pregunta a Sara"/><button class="btn primary" data-act="ask-input">Enviar</button></div>`, `<span class="pill ok">${ic("wifi", 12)} En vivo</span>`);
  const reco = `<div class="card"><div class="ch"><h3>Recomendaciones</h3><span class="mut">Prioridad</span></div><div style="display:flex;flex-direction:column;gap:11px" id="recoList">${RECOS.map(r => recoRow(r)).join("")}</div></div>`;
  const autonomy = card("Niveles de autonomía", `<div class="rows" style="margin:0 -18px -18px">${[["Informar", "Resúmenes y respuestas", "ok"], ["Recomendar", "Sugerencias con impacto", "info"], ["Preparar acción", "Deja la acción lista", "warn"], ["Ejecutar", "Requiere aprobación humana", "brand"]].map(x => `<div class="row"><div class="grow"><div class="t1">${x[0]}</div><div class="t2">${x[1]}</div></div>${pill(x[2] === "brand" ? "Con aprobación" : "Activo", x[2])}</div>`).join("")}</div>`);
  return `<div class="grid g12"><div class="c12">${criterioCard()}</div><div class="c7">${parte}<div style="height:16px"></div>${left}</div><div class="c5">${reco}<div style="height:16px"></div>${autonomy}</div></div>`;
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

/* ---------- Sara: parte de la mañana + NLU mock ---------- */
function saraSummary() {
  const c = saraConcern();
  return "Buenos días, Uriel. " + saraBriefing().join(" ") + (c ? " " + c.t : "");
}
function saraAnswer(q) {
  q = q.toLowerCase();
  const f = getFin(S.estab, S.period);
  if (/ayer|hoy|fue|facturaci|ventas/.test(q)) return saraSummary();
  if (/margen/.test(q)) { const w = [...ESTAB].filter(e => !e.cerrado).map(e => ({ e, m: baseFin(e).margenPct })).sort((a, b) => a.m - b.m)[0]; return `El local con peor margen fue <b class="hl">${w.e.short}</b> con un ${w.m.toFixed(1)}%. ${marginWhy(getFin(w.e.id, "ayer"))}`; }
  if (/extra|horas/.test(q)) { const ex = TEAM.filter(t => t.trab > t.contr); return ex.length ? "Hicieron horas extra: " + ex.map(t => `<b>${t.n}</b> (+${t.trab - t.contr}h, ${t.local})`).join("; ") + "." : "Nadie hizo horas extra."; }
  if (/pedido|compra|proveedor/.test(q)) { const p = pendingOrders(); return p.length ? "Pedidos pendientes: " + p.map(o => `<b>${o.prov}</b> (${o.local}, ${eur(o.importe)}, ${o.fecha})`).join("; ") + "." : "No hay pedidos pendientes."; }
  if (/mantenim|incidenc|urgente|averí/.test(q)) { const c = openIncid().filter(i => i.sev === "hi"); return c.length ? "Urgente: " + c.map(i => `<b>${i.titulo}</b> en ${i.local}`).join("; ") + "." : "No hay incidencias urgentes de mantenimiento."; }
  if (/apoyo|necesita|refuerzo|problema con/.test(q)) { const s = employeeSupport()[0]; return s ? `Quien más necesita apoyo es <b>${s.t.n}</b> (${s.t.local}): ${s.r.join(", ")}.` : "Todo el equipo está dentro de parámetros."; }
  if (/falt|ausen|baja/.test(q)) { const a = absent(); return a.length ? "Hoy falta: " + a.map(t => `<b>${t.n}</b> (${t.local}, ${t.estado})`).join("; ") + "." : "No hay ausencias hoy."; }
  if (/ayuda|peor local|necesita ayuda/.test(q)) { const w = localsByNeed()[0]; return `El local que más atención necesita es <b>${w.e.short}</b> (salud ${w.score}/100): ${w.reasons.join(", ")}.`; }
  if (/reseñ|review|estrell/.test(q)) return `La media de reseñas es <b class="hl">${reviewAvgAll().toFixed(1).replace(".", ",")}</b>. Hay ${REVIEWS.filter(r => !r.respondida).length} sin responder.`;
  return "Puedo darte ventas, margen, horas extra, pedidos pendientes, mantenimiento urgente, ausencias o reseñas. En el prototipo respondo con datos de ejemplo.";
}

/* ============================================================================
   NAV / SHELL / ROUTER
   ========================================================================== */
const NAV = [
  { g: "Operación", items: [["dashboard", "Dashboard", "dash"], ["finanzas", "Finanzas", "euro"], ["establecimientos", "Establecimientos", "shop"], ["equipo", "Equipo", "team"], ["clientes", "Clientes", "users"]] },
  { g: "Gestión", items: [["rrhh", "RR. HH.", "hr"], ["compras", "Compras", "cart"], ["marketing", "Marketing", "mkt"], ["mantenimiento", "Mantenimiento", "wrench"]] },
  { g: "Inteligencia", items: [["alertas", "Centro de alertas", "bell"], ["sara", "Panel de Sara", "spark"]] },
  { g: "Sistema", items: [["config", "Configuración", "cog"]] },
];
const META = {
  dashboard: ["Buenos días, Uriel", "Dashboard ejecutivo", "El estado de todo el grupo, de un vistazo."],
  finanzas: ["Dirección financiera", "Finanzas", "Ventas, márgenes, costes y comparativas del grupo."],
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
