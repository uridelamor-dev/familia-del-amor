// RRHH — lógica PURA de la ficha del trabajador (sin efectos, sin Date; se pasa `hoy` como
// "YYYY-MM-DD"). Cálculo de antigüedad, documentos por caducar, timeline unificado y resumen
// del equipo por local. Testeable con node:test.

// Nº de día civil (algoritmo de Howard Hinnant) para restar fechas sin usar Date.
function diasCiviles(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function aDias(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ""));
  return m ? diasCiviles(+m[1], +m[2], +m[3]) : null;
}
// Días entre dos fechas "YYYY-MM-DD" (b - a). null si alguna no es válida.
export function diasEntre(a, b) {
  const da = aDias(a), db = aDias(b);
  return (da == null || db == null) ? null : db - da;
}

// Antigüedad desde `fechaAlta` hasta `hoy`. Devuelve { dias, anios, meses, texto } o null.
// Años/meses por aritmética de calendario (exacta con bisiestos), no dividiendo días.
export function antiguedad(fechaAlta, hoy) {
  const ma = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaAlta || ""));
  const mh = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hoy || ""));
  const dias = diasEntre(fechaAlta, hoy);
  if (!ma || !mh || dias == null || dias < 0) return null;
  let anios = +mh[1] - +ma[1];
  let meses = +mh[2] - +ma[2];
  if (+mh[3] < +ma[3]) meses -= 1;
  if (meses < 0) { anios -= 1; meses += 12; }
  const partes = [];
  if (anios) partes.push(anios + (anios === 1 ? " año" : " años"));
  if (meses) partes.push(meses + (meses === 1 ? " mes" : " meses"));
  if (!partes.length) partes.push(dias + (dias === 1 ? " día" : " días"));
  return { dias, anios, meses, texto: partes.join(" y ") };
}

// Documentos que están vencidos o por caducar dentro de `dias`. Ordenados por urgencia.
// Cada uno recibe { diasRestantes, estado: 'vencido'|'porCaducar' }. Los vigentes se descartan.
export function documentosPorCaducar(docs, hoy, dias = 30) {
  return (Array.isArray(docs) ? docs : [])
    .map((d) => {
      const r = d.fecha_caducidad ? diasEntre(hoy, d.fecha_caducidad) : null;
      if (r == null) return null;
      const estado = r < 0 ? "vencido" : (r <= dias ? "porCaducar" : "vigente");
      return { ...d, diasRestantes: r, estado };
    })
    .filter((x) => x && x.estado !== "vigente")
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

// Timeline unificado (notas + check-ins + documentos) ordenado de más reciente a más antiguo.
export function construyeTimeline(notas, checkins, documentos) {
  const items = [];
  for (const n of (notas || [])) items.push({ fecha: n.creado_en, origen: "nota", tipo: n.tipo || "nota", titulo: n.tipo || "nota", detalle: n.contenido || "", autor: n.autor || null });
  for (const c of (checkins || [])) items.push({ fecha: c.fecha_llamada || c.creado_en, origen: "checkin", tipo: "checkin", titulo: "Check-in " + (c.mes || ""), detalle: c.comentario_libre || "", autor: c.autor || null });
  for (const d of (documentos || [])) items.push({ fecha: d.creado_en, origen: "documento", tipo: d.tipo || "otro", titulo: "Documento: " + (d.nombre || d.tipo || ""), detalle: d.fecha_caducidad ? ("caduca " + d.fecha_caducidad) : "", url: d.url || null });
  return items.filter((i) => i.fecha).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

// Días hasta el próximo cumpleaños (por MM-DD, ignora el año). null si no hay fecha válida.
export function diasHastaCumple(fechaNac, hoy) {
  const mn = /^\d{4}-(\d{2})-(\d{2})/.exec(String(fechaNac || ""));
  const mh = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hoy || ""));
  if (!mn || !mh) return null;
  const y = +mh[1];
  let d = diasEntre(hoy, `${y}-${mn[1]}-${mn[2]}`);
  if (d == null) return null;
  if (d < 0) { const d2 = diasEntre(hoy, `${y + 1}-${mn[1]}-${mn[2]}`); return d2 == null ? null : d2; }
  return d;
}

// Resumen del equipo agrupado por local: plantilla, activos/bajas, antigüedad media,
// check-ins hechos, documentos por caducar y cumpleaños próximos.
export function resumenEquipoPorLocal(trabajadores, checkins, docsPorWorker, hoy, dias = 30) {
  const hechos = new Set((checkins || []).filter((c) => c.realizada === 1 || c.realizada === true).map((c) => String(c.worker_id)));
  const porLocal = new Map();
  for (const w of (trabajadores || [])) {
    const k = w.local || "—";
    const e = porLocal.get(k) || { local: k, total: 0, activos: 0, bajas: 0, checkinsHechos: 0, sumaAntig: 0, conAntig: 0, docsAlerta: 0, cumples: [] };
    e.total += 1;
    const activo = w.activo === undefined || w.activo === null || w.activo === 1 || w.activo === true;
    if (activo && !w.fecha_baja) e.activos += 1; else e.bajas += 1;
    if (hechos.has(String(w.id))) e.checkinsHechos += 1;
    const ant = antiguedad(w.fecha_alta, hoy);
    if (ant) { e.sumaAntig += ant.dias; e.conAntig += 1; }
    const dc = diasHastaCumple(w.fecha_nac, hoy);
    if (dc != null && dc <= dias) e.cumples.push({ id: w.id, nombre: w.nombre, dias: dc });
    const docs = (docsPorWorker && docsPorWorker[w.id]) || [];
    e.docsAlerta += documentosPorCaducar(docs, hoy, dias).length;
    porLocal.set(k, e);
  }
  return [...porLocal.values()].map((e) => ({
    ...e,
    antiguedadMediaDias: e.conAntig ? Math.round(e.sumaAntig / e.conAntig) : null,
    cumples: e.cumples.sort((a, b) => a.dias - b.dias),
  })).sort((a, b) => a.local.localeCompare(b.local));
}
