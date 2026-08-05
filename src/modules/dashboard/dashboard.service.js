// Agregado del Dashboard ejecutivo — datos REALES desde PostgreSQL. Solo lectura.
// Recibe `x = { get, all }` (los wrappers dbGet/dbAll de server.js; placeholders `?`) y opciones.
// Compone la "foto del día" + "qué requiere tu atención" en el servidor, reutilizando las tablas
// existentes (reservas, maintenance_issues, google_reviews, hr_applications, facturas_pendientes).
// NO hay ventas/margen (no existen en la BD): se marca ventasDisponible:false.

function addDays(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Prioriza lo que requiere atención a partir de los recuentos reales. Puro y testeable.
export function buildAtencion({ whatsappConnected, incAntiguas, incAbiertas, candidaturas, facturasPendientes, resenasBajas }) {
  const out = [];
  const s = (n) => (n > 1 ? "s" : "");
  if (whatsappConnected === false) out.push({ sev: "crit", tipo: "whatsapp", mensaje: "WhatsApp/Sara desconectado: riesgo de perder reservas.", accion: "Reconectar", go: "config" });
  if (incAntiguas > 0) out.push({ sev: "crit", tipo: "mantenimiento", mensaje: `${incAntiguas} incidencia${s(incAntiguas)} lleva${incAntiguas > 1 ? "n" : ""} demasiado tiempo abierta${s(incAntiguas)}.`, accion: "Ver", go: "mantenimiento" });
  if (facturasPendientes > 0) out.push({ sev: "imp", tipo: "facturas", mensaje: `${facturasPendientes} factura${s(facturasPendientes)} pendiente${s(facturasPendientes)} de asignar.`, accion: "Asignar", go: "facturas" });
  if (candidaturas > 0) out.push({ sev: "imp", tipo: "rrhh", mensaje: `${candidaturas} candidatura${s(candidaturas)} sin revisar.`, accion: "Revisar", go: "rrhh" });
  if (resenasBajas > 0) out.push({ sev: "imp", tipo: "resenas", mensaje: `${resenasBajas} reseña${s(resenasBajas)} de 1–2★ reciente${s(resenasBajas)}.`, accion: "Responder", go: "marketing" });
  if (incAbiertas > 0) out.push({ sev: "info", tipo: "mantenimiento", mensaje: `${incAbiertas} incidencia${s(incAbiertas)} de mantenimiento abierta${s(incAbiertas)}.`, accion: "Ver", go: "mantenimiento" });
  const order = { crit: 0, imp: 1, info: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}

export async function getDashboard(x, { now, whatsappConnected = null } = {}) {
  const hoy = (now || new Date().toISOString()).slice(0, 10);
  const hasta7 = addDays(hoy, 7);
  const hace3 = addDays(hoy, -3);
  const hace7 = addDays(hoy, -7);

  const [rHoy, rHoyLocal, rProx, incLocal, incAntig, resAgg, resUlt, resNuevas, resBajas, cand, facPend] = await Promise.all([
    x.get(`SELECT COUNT(*)::int n, COALESCE(SUM(CAST(personas AS INTEGER)),0)::int personas FROM reservas WHERE dia = ?`, [hoy]),
    x.all(`SELECT local, COUNT(*)::int n, COALESCE(SUM(CAST(personas AS INTEGER)),0)::int personas FROM reservas WHERE dia = ? GROUP BY local ORDER BY n DESC`, [hoy]),
    x.get(`SELECT COUNT(*)::int n FROM reservas WHERE dia > ? AND dia <= ?`, [hoy, hasta7]),
    x.all(`SELECT local, COUNT(*)::int n FROM maintenance_issues WHERE estado NOT IN ('resuelta','cerrada') GROUP BY local ORDER BY n DESC`, []),
    x.get(`SELECT COUNT(*)::int n FROM maintenance_issues WHERE estado NOT IN ('resuelta','cerrada') AND creado_en::date <= ?::date`, [hace3]),
    x.get(`SELECT COALESCE(ROUND(AVG(rating)::numeric,1),0)::float media, COUNT(*)::int total FROM google_reviews`, []),
    x.all(`SELECT author, rating, text, fecha, location_name FROM google_reviews ORDER BY creado_en DESC LIMIT 5`, []),
    x.get(`SELECT COUNT(*)::int n FROM google_reviews WHERE creado_en::date >= ?::date`, [hace7]),
    x.get(`SELECT COUNT(*)::int n FROM google_reviews WHERE rating <= 2 AND creado_en::date >= ?::date`, [hace7]),
    x.get(`SELECT COUNT(*)::int n FROM hr_applications WHERE estado = 'nuevo'`, []),
    x.get(`SELECT COUNT(*)::int n FROM facturas_pendientes`, []),
  ]);

  const incAbiertas = (incLocal || []).reduce((s, r) => s + (r.n || 0), 0);
  const atencion = buildAtencion({
    whatsappConnected,
    incAntiguas: incAntig ? incAntig.n : 0,
    incAbiertas,
    candidaturas: cand ? cand.n : 0,
    facturasPendientes: facPend ? facPend.n : 0,
    resenasBajas: resBajas ? resBajas.n : 0,
  });

  return {
    fecha: hoy,
    ventasDisponible: false, // no hay TPV/ventas en la BD todavía (fase Ágora)
    reservas: {
      hoy: { n: rHoy ? rHoy.n : 0, personas: rHoy ? rHoy.personas : 0 },
      porLocal: rHoyLocal || [],
      proximas7: rProx ? rProx.n : 0,
    },
    mantenimiento: { abiertas: incAbiertas, antiguas: incAntig ? incAntig.n : 0, porLocal: incLocal || [] },
    resenas: { media: resAgg ? resAgg.media : 0, total: resAgg ? resAgg.total : 0, nuevas7: resNuevas ? resNuevas.n : 0, bajas: resBajas ? resBajas.n : 0, ultimas: resUlt || [] },
    candidaturas: { nuevas: cand ? cand.n : 0 },
    facturas: { pendientes: facPend ? facPend.n : 0 },
    whatsapp: { connected: whatsappConnected },
    atencion,
  };
}
