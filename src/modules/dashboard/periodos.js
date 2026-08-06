// Dashboard — rangos de periodo (Hoy / Ayer / Semana / Mes / personalizado). PURO y testeable.
// "hoy" se inyecta (YYYY-MM-DD) para ser determinista; el resto se deriva de él.

function addDays(iso, n) { const d = new Date(iso + "T00:00:00.000Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// Día de la semana con lunes=0 … domingo=6 (para acotar "esta semana").
export function diaSemanaLunes(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  return (((yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1] + d) % 7) + 6) % 7;
}

// Devuelve { preset, from, to, label } para un preset dado y la fecha de hoy.
export function rangoPreset(preset, hoy) {
  switch (String(preset)) {
    case "hoy": return { preset: "hoy", from: hoy, to: hoy, label: "Hoy" };
    case "ayer": { const a = addDays(hoy, -1); return { preset: "ayer", from: a, to: a, label: "Ayer" }; }
    case "semana": { const lun = addDays(hoy, -diaSemanaLunes(hoy)); return { preset: "semana", from: lun, to: hoy, label: "Esta semana" }; }
    case "mes": { const m1 = hoy.slice(0, 8) + "01"; return { preset: "mes", from: m1, to: hoy, label: "Este mes" }; }
    default: { const lun = addDays(hoy, -diaSemanaLunes(hoy)); return { preset: "semana", from: lun, to: hoy, label: "Esta semana" }; }
  }
}

// Nº de días del rango [from, to] inclusive.
export function diasEntre(from, to) {
  if (!from || !to || from > to) return 0;
  let d = from, n = 0;
  while (d <= to && n < 4000) { n++; d = addDays(d, 1); }
  return n;
}

// Etiqueta corta del rango (un día → la fecha; si no, "from → to").
export function etiquetaRango(from, to) {
  if (!from || !to) return "";
  return from === to ? from : `${from} → ${to}`;
}
