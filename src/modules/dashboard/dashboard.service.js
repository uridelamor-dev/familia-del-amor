// Dashboard ejecutivo — motor de inteligencia sobre datos REALES (PostgreSQL). Solo lectura.
// Filosofía: no enseñar datos, sino RESPONDER preguntas y terminar en DECISIONES. Sara razona
// como Directora General a partir de señales reales (reservas, mantenimiento, reseñas, clientes,
// proveedores). Lo que NO existe en la BD (ventas/margen/personal) se marca honesto, sin inventar.
//
// Robustez: cada señal se calcula en su propio try/catch; si una consulta falla, ese bloque queda
// "sin datos" y el resto del dashboard sigue funcionando (nunca tumba la pantalla en producción).
// Recibe x = { get, all } (wrappers dbGet/dbAll de server.js; placeholders `?`).

const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function addDays(iso, n) { const d = new Date(iso + "T00:00:00.000Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const signed = (n, d = 0) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d) + "%";
const nombreCorto = (s) => String(s || "").split(" ")[0];

// ── Recolección de señales reales (cada una defensiva) ───────────────────────
async function safe(fn, fallback) { try { return await fn(); } catch { return fallback; } }

async function gatherSignals(x, { hoy, local }) {
  const ayer = addDays(hoy, -1);
  const dow = new Date(ayer + "T12:00:00.000Z").getUTCDay();
  const lf = local ? " AND local = ?" : "";
  const lp = local ? [local] : [];

  const [ayerTot, ayerLocal, base, recur, aging, openInc, resAgg, low, churn, provAct, provPrev, cand, facPend] = await Promise.all([
    safe(() => x.get(`SELECT COUNT(*)::int n, COALESCE(SUM(personas),0)::int personas FROM reservas WHERE dia = ?${lf}`, [ayer, ...lp]), null),
    safe(() => x.all(`SELECT local, COUNT(*)::int n, COALESCE(SUM(personas),0)::int personas FROM reservas WHERE dia = ? GROUP BY local ORDER BY n DESC`, [ayer]), []),
    safe(() => x.get(`SELECT COUNT(*)::int total, COUNT(DISTINCT dia)::int dias FROM reservas WHERE EXTRACT(DOW FROM dia::date) = ? AND dia::date < ?::date AND dia::date >= ?::date${lf}`, [dow, ayer, addDays(ayer, -56), ...lp]), null),
    safe(() => x.all(`SELECT local, titulo, COUNT(*)::int c FROM maintenance_issues WHERE creado_en::date >= ?::date${lf} GROUP BY local, titulo HAVING COUNT(*) >= 2 ORDER BY c DESC LIMIT 5`, [addDays(hoy, -56), ...lp]), []),
    safe(() => x.all(`SELECT id, local, titulo, creado_en FROM maintenance_issues WHERE estado NOT IN ('resuelta','cerrada') AND creado_en::date <= ?::date${lf} ORDER BY creado_en ASC LIMIT 5`, [addDays(hoy, -3), ...lp]), []),
    safe(() => x.get(`SELECT COUNT(*)::int n FROM maintenance_issues WHERE estado NOT IN ('resuelta','cerrada')${lf}`, [...lp]), null),
    safe(() => x.get(`SELECT COALESCE(ROUND(AVG(rating)::numeric,1),0)::float media, COUNT(*)::int total FROM google_reviews WHERE COALESCE(fecha,creado_en)::date >= ?::date`, [addDays(hoy, -90)]), null),
    safe(() => x.all(`SELECT author, rating, text, COALESCE(fecha,creado_en) AS fecha, location_name FROM google_reviews WHERE rating <= 2 AND COALESCE(fecha,creado_en)::date >= ?::date ORDER BY COALESCE(fecha,creado_en) DESC LIMIT 3`, [addDays(hoy, -30)]), []),
    safe(() => x.all(`SELECT telefono, MAX(nombre_reserva) AS nombre, COUNT(*)::int visitas, MAX(dia) AS ultima, MAX(local) AS local FROM reservas WHERE telefono IS NOT NULL AND telefono <> ''${lf} GROUP BY telefono HAVING COUNT(*) >= 3 AND MAX(dia)::date < ?::date ORDER BY visitas DESC LIMIT 8`, [...lp, addDays(hoy, -42)]), []),
    safe(() => x.all(`SELECT proveedor, COALESCE(SUM(total),0)::float t FROM facturas WHERE proveedor IS NOT NULL AND proveedor <> '' AND fecha::date >= ?::date${lf} GROUP BY proveedor`, [addDays(hoy, -30), ...lp]), []),
    safe(() => x.all(`SELECT proveedor, COALESCE(SUM(total),0)::float t FROM facturas WHERE proveedor IS NOT NULL AND proveedor <> '' AND fecha::date >= ?::date AND fecha::date < ?::date${lf} GROUP BY proveedor`, [addDays(hoy, -60), addDays(hoy, -30), ...lp]), []),
    safe(() => x.get(`SELECT COUNT(*)::int n, MIN(creado_en) AS oldest FROM hr_applications WHERE estado = 'nuevo'`, []), null),
    safe(() => x.get(`SELECT COUNT(*)::int n FROM facturas_pendientes${local ? " WHERE local = ?" : ""}`, [...lp]), null),
  ]);

  // Correlación de la peor reseña reciente con la carga/incidencias de ese día.
  let lowCorr = null;
  if (low && low[0] && low[0].fecha) {
    const dia = String(low[0].fecha).slice(0, 10);
    const [resDia, incDia] = await Promise.all([
      safe(() => x.get(`SELECT COUNT(*)::int n FROM reservas WHERE dia = ?`, [dia]), null),
      safe(() => x.get(`SELECT COUNT(*)::int n FROM maintenance_issues WHERE creado_en::date = ?::date`, [dia]), null),
    ]);
    lowCorr = { review: low[0], dia, reservasDia: resDia ? resDia.n : null, incidenciasDia: incDia ? incDia.n : null };
  }

  // Proveedor con mayor subida de gasto mes vs mes anterior.
  const prevMap = new Map((provPrev || []).map((r) => [r.proveedor, r.t]));
  const risers = (provAct || []).map((r) => { const prev = prevMap.get(r.proveedor) || 0; const delta = prev > 0 ? (r.t - prev) / prev * 100 : null; return { proveedor: r.proveedor, actual: r.t, prev, delta }; })
    .filter((r) => r.delta != null && r.delta >= 15 && r.actual >= 200).sort((a, b) => b.delta - a.delta);

  return { hoy, ayer, dow, local, ayerTot, ayerLocal, base, recur, aging, openInc, resAgg, low, lowCorr, churn, risers, cand, facPend };
}

// ── Razonamiento (PURO y testeable): señales → preocupaciones que terminan en DECISIÓN ───────
export function ayerNarrativa(s, localName) {
  if (!s.ayerTot || s.ayerTot.n == null) return { disponible: false, texto: "Aún no hay datos de reservas de ayer." };
  const sujeto = localName || "el grupo";
  const dowN = DOW[s.dow] || "día";
  let texto = `Ayer ${sujeto} tuvo <b>${s.ayerTot.n} reserva${s.ayerTot.n === 1 ? "" : "s"}</b> (${s.ayerTot.personas} comensales)`;
  let delta = null;
  if (s.base && s.base.dias >= 3) {
    const avg = s.base.total / s.base.dias;
    delta = avg > 0 ? (s.ayerTot.n - avg) / avg * 100 : 0;
    texto += `, un ${signed(delta)} respecto a un ${dowN} normal`;
  } else {
    texto += ` (aún sin histórico suficiente para comparar con un ${dowN} normal)`;
  }
  texto += ".";
  if (!localName && s.ayerLocal && s.ayerLocal.length > 1) {
    const mejor = s.ayerLocal[0], peor = s.ayerLocal[s.ayerLocal.length - 1];
    texto += ` El más movido fue <b>${mejor.local}</b> (${mejor.n}); el más flojo, ${peor.local} (${peor.n}).`;
  }
  return { disponible: true, texto, delta, reservas: s.ayerTot.n, comensales: s.ayerTot.personas };
}

export function buildConcerns(s, { localName, whatsappConnected } = {}) {
  const out = [];
  const scope = localName ? ` en ${localName}` : "";
  if (whatsappConnected === false)
    out.push({ sev: "crit", tipo: "whatsapp", titulo: "Sara está desconectada de WhatsApp", narrativa: "Mientras WhatsApp esté caído, Sara no responde a los clientes y se pueden perder reservas sin que nos enteremos.", decision: "Reconectaría ahora mismo escaneando el QR. Es lo primero del día.", impacto: "Cada hora caída son reservas y clientes perdidos.", go: "whatsapp" });

  if (s.recur && s.recur.length) {
    const r = s.recur[0];
    out.push({ sev: r.c >= 3 ? "crit" : "imp", tipo: "mantenimiento", titulo: `«${r.titulo}» se repite en ${r.local}`, narrativa: `La incidencia «${r.titulo}» de ${r.local} se ha repetido <b>${r.c} veces</b> en las últimas semanas. No es mala suerte: es un equipo o un proveedor que no está resolviendo el problema de raíz.`, decision: `No la repararía otra vez. A partir de la 3ª intervención, sustituir sale más a cuenta que seguir pagando reparaciones. Pediría hoy presupuesto de sustitución.`, impacto: "Dejas de pagar reparaciones recurrentes y evitas un corte de servicio en plena hora punta.", go: "mantenimiento" });
  }
  if (s.aging && s.aging.length) {
    const a = s.aging[0]; const dias = Math.max(1, Math.round((new Date(s.hoy) - new Date(String(a.creado_en).slice(0, 10))) / 86400000));
    out.push({ sev: "imp", tipo: "mantenimiento", titulo: `Incidencia estancada en ${a.local}`, narrativa: `«${a.titulo}» lleva <b>${dias} días</b> abierta sin resolver${scope ? "" : ` en ${a.local}`}. Cuanto más espera, más caro sale y peor imagen da.`, decision: `La cerraría hoy o la escalaría a un técnico externo. Nada debería llevar más de 3 días abierto.`, impacto: "Evitas que una avería menor se convierta en una gorda.", go: "mantenimiento" });
  }
  if (s.lowCorr) {
    const lc = s.lowCorr; const lugar = lc.review.location_name ? ` (${lc.review.location_name})` : "";
    let conexion = "";
    if (lc.incidenciasDia > 0) conexion = ` Y coincide con una incidencia registrada ese mismo día${lugar}. Probablemente están relacionadas.`;
    else if (lc.reservasDia && lc.reservasDia >= 20) conexion = ` Cayó el día de más carga del mes (${lc.reservasDia} reservas): probablemente fue saturación de sala, no mala comida.`;
    out.push({ sev: "imp", tipo: "resenas", titulo: `Reseña de ${lc.review.rating}★ el ${lc.dia}`, narrativa: `«${String(lc.review.text || "").slice(0, 120)}»${conexion}`, decision: `Respondería públicamente hoy con educación y revisaría qué pasó ese turno para que no se repita.`, impacto: "Una respuesta rápida y honesta recupera reputación; ignorarla la hunde.", go: "marketing" });
  }
  if (s.churn && s.churn.length) {
    const top = s.churn.slice(0, 3).map((c) => nombreCorto(c.nombre)).filter(Boolean);
    out.push({ sev: s.churn.length >= 5 ? "imp" : "info", tipo: "clientes", titulo: `${s.churn.length} clientes habituales se están enfriando${scope}`, narrativa: `${s.churn.length} personas que venían a menudo (3+ reservas) llevan <b>más de 6 semanas</b> sin volver. Perder un habitual es mucho más caro que recuperar uno.`, decision: `Hoy llamaría o mandaría un mensaje personal a los de más valor${top.length ? `: ${top.join(", ")}` : ""}. Un "te echamos de menos" funciona.`, impacto: "Recuperar un habitual cuesta una llamada; captar uno nuevo cuesta una campaña.", go: "clientes" });
  }
  if (s.risers && s.risers.length) {
    const r = s.risers[0];
    out.push({ sev: "imp", tipo: "proveedores", titulo: `${r.proveedor} está subiendo el gasto`, narrativa: `El gasto con <b>${r.proveedor}</b> ha subido un <b>${signed(r.delta)}</b> respecto al mes anterior${scope}. O han subido precios o estamos pidiendo de más.`, decision: `Revisaría la última factura y renegociaría, o pediría una alternativa antes de que se consolide.`, impacto: "Un punto de coste de compras se lo come el margen directamente.", go: "facturas" });
  }
  if (s.cand && s.cand.n > 0) {
    let age = null; if (s.cand.oldest) age = Math.round((new Date(s.hoy) - new Date(String(s.cand.oldest).slice(0, 10))) / 86400000);
    out.push({ sev: "info", tipo: "rrhh", titulo: `${s.cand.n} candidatura${s.cand.n === 1 ? "" : "s"} sin revisar`, narrativa: `Hay ${s.cand.n} candidatura${s.cand.n === 1 ? "" : "s"} esperando${age && age >= 2 ? `, la más antigua de hace ${age} días` : ""}. Los buenos candidatos se enfrían rápido.`, decision: `Las revisaría hoy y contactaría a los que encajen antes de que los pille otro.`, impacto: "El mejor talento dura días disponible, no semanas.", go: "rrhh" });
  }
  if (s.facPend && s.facPend.n > 0) {
    out.push({ sev: "info", tipo: "facturas", titulo: `${s.facPend.n} factura${s.facPend.n === 1 ? "" : "s"} sin asignar`, narrativa: `${s.facPend.n} factura${s.facPend.n === 1 ? "" : "s"} llevan tiempo sin asignar a un local. Sin eso, la contabilidad de cada local no cuadra.`, decision: `Las asignaría hoy; es un minuto y evita líos a fin de mes.`, impacto: "Contabilidad limpia por local desde el día 1.", go: "facturas" });
  }
  const order = { crit: 0, imp: 1, info: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]).slice(0, 6);
}

export function buildAgenda(concerns) {
  return concerns.filter((c) => c.sev !== "info").slice(0, 3).map((c) => ({ t: c.titulo, decision: c.decision, go: c.go }));
}

export async function getDashboard(x, { now, whatsappConnected = null, local = null } = {}) {
  const hoy = (now || new Date().toISOString()).slice(0, 10);
  const s = await gatherSignals(x, { hoy, local });
  const localName = local || null;
  const concerns = buildConcerns(s, { localName, whatsappConnected });
  const agenda = buildAgenda(concerns);
  const decisionSara = concerns.length ? concerns[0].decision : null;

  return {
    fecha: hoy, ayerFecha: s.ayer, scope: { local: localName },
    ayer: ayerNarrativa(s, localName),
    preocupaciones: concerns,
    agenda,
    decisionSara,
    // Bloque honesto: fuentes que aún no existen.
    pendienteFuentes: {
      ventasMargen: { disponible: false, fuente: "TPV Ágora", nota: "Cuando conectemos el TPV, Sara te dirá dónde ganas y dónde pierdes dinero por local (ventas, margen, ticket)." },
      personal: { disponible: false, fuente: "Skello (fichajes/turnos)", nota: "Con los fichajes, Sara podrá relacionar coste de personal, horas extra y ausencias con el margen." },
    },
    reservas: { hoy: null, porLocalAyer: local ? [] : (s.ayerLocal || []) },
    resenas: s.resAgg ? { media: s.resAgg.media, total: s.resAgg.total } : { media: 0, total: 0 },
    mantenimiento: { abiertas: s.openInc ? s.openInc.n : 0 },
    clientesRiesgo: (s.churn || []).slice(0, 8).map((c) => ({ nombre: c.nombre, telefono: c.telefono, visitas: c.visitas, ultima: String(c.ultima || "").slice(0, 10), local: c.local })),
    proveedoresRiesgo: (s.risers || []).slice(0, 5).map((r) => ({ proveedor: r.proveedor, delta: Math.round(r.delta), actual: Math.round(r.actual) })),
    whatsapp: { connected: whatsappConnected },
  };
}
