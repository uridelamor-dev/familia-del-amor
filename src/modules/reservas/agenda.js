// Reservas — lógica PURA de agenda/calendario (día y semana, por turnos).
// Sin DOM ni fetch: agrupa reservas por turno, calcula ocupación y navega semanas.
// El panel dibuja; aquí solo se decide "qué va dónde y con qué carga".

// Turnos de servicio. "otros" recoge horas fuera de comida/cena (no las perdemos).
export const TURNOS = [
  { key: "comida", label: "Comida", desde: "12:00", hasta: "17:00" },
  { key: "cena", label: "Cena", desde: "19:00", hasta: "23:59" },
];

// Minutos desde medianoche de una hora "HH:MM" (tolera vacío → null).
export function horaAMin(hora) {
  const m = String(hora || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Clasifica una hora en turno. Fuera de comida/cena → "otros".
export function turnoDeHora(hora) {
  const min = horaAMin(hora);
  if (min == null) return "otros";
  for (const t of TURNOS) {
    if (min >= horaAMin(t.desde) && min <= horaAMin(t.hasta)) return t.key;
  }
  return "otros";
}

// Nivel de carga de un turno según nº de personas. Umbrales por defecto pensados para
// un local de tapas; se pueden afinar por local en el futuro. Devuelve "baja"|"media"|"alta".
export function nivelCarga(personas, { media = 20, alta = 40 } = {}) {
  const p = Number(personas) || 0;
  if (p > alta) return "alta";
  if (p > media) return "media";
  return "baja";
}

// Ordena reservas de un día por hora.
export function ordenarPorHora(reservas) {
  return (Array.isArray(reservas) ? reservas.slice() : []).sort((a, b) => (horaAMin(a.hora) ?? 9999) - (horaAMin(b.hora) ?? 9999));
}

// Agenda de un día: reservas repartidas por turno, con totales y carga por turno.
// `reservas` deben ser ya del día pedido (o se filtran por `dia` si se pasa).
export function agendaDia(reservas, dia, umbrales) {
  const delDia = dia ? (reservas || []).filter((r) => r.dia === dia) : (reservas || []);
  const porTurno = { comida: [], cena: [], otros: [] };
  for (const r of delDia) porTurno[turnoDeHora(r.hora)].push(r);
  const turnos = [...TURNOS, { key: "otros", label: "Otras horas" }].map((t) => {
    const lista = ordenarPorHora(porTurno[t.key]);
    const personas = lista.reduce((s, r) => s + (Number(r.personas) || 0), 0);
    return { key: t.key, label: t.label, reservas: lista, personas, total: lista.length, carga: nivelCarga(personas, umbrales) };
  }).filter((t) => t.key !== "otros" || t.total > 0); // "otras horas" solo si hay algo
  return {
    dia,
    turnos,
    totalReservas: delDia.length,
    totalPersonas: delDia.reduce((s, r) => s + (Number(r.personas) || 0), 0),
  };
}

// ── Navegación de fechas (ISO "YYYY-MM-DD", sin dependencia de Date para ser determinista) ──

function aNum(iso) { const [y, m, d] = String(iso).split("-").map(Number); return { y, m, d }; }
function esBisiesto(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function diasEnMes(y, m) { return [31, esBisiesto(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
function pad(n) { return String(n).padStart(2, "0"); }

// Suma días a una fecha ISO (admite negativos). Devuelve ISO.
export function sumarDias(iso, n) {
  let { y, m, d } = aNum(iso);
  d += n;
  while (d > diasEnMes(y, m)) { d -= diasEnMes(y, m); m++; if (m > 12) { m = 1; y++; } }
  while (d < 1) { m--; if (m < 1) { m = 12; y--; } d += diasEnMes(y, m); }
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Día de la semana 0=lunes … 6=domingo (algoritmo de Sakamoto adaptado a lunes=0).
export function diaSemana(iso) {
  const { y, m, d } = aNum(iso);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  const dow = (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1] + d) % 7; // 0=domingo
  return (dow + 6) % 7; // 0=lunes
}

// Lunes de la semana que contiene `iso`.
export function lunesDeSemana(iso) { return sumarDias(iso, -diaSemana(iso)); }

// Los 7 ISO de la semana a partir de su lunes.
export function diasDeSemana(isoLunes) { return Array.from({ length: 7 }, (_, i) => sumarDias(isoLunes, i)); }

// Resumen semanal: por cada uno de los 7 días, totales y carga por turno (para la rejilla).
export function agendaSemana(reservas, isoLunes, umbrales) {
  const porDia = {};
  for (const r of (reservas || [])) (porDia[r.dia] || (porDia[r.dia] = [])).push(r);
  return diasDeSemana(isoLunes).map((dia) => {
    const a = agendaDia(porDia[dia] || [], dia, umbrales);
    return { dia, ...a };
  });
}
