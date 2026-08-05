// Dashboard ejecutivo — motor de inteligencia sobre datos REALES (PostgreSQL). Solo lectura.
// Filosofía: no enseñar datos, sino RESPONDER preguntas de dirección y terminar en DECISIONES.
// Sara razona como Directora General cruzando TODA la información que ya existe en la BD:
//   reservas (ayer + lo que viene), mantenimiento, reseñas por local, facturas (gasto y lo que
//   debo), equipo (incidencias y check-ins mensuales), clientes (fuga y mejores).
// Lo que NO existe en la BD (ventas/margen vía Ágora, rendimiento/horas vía Skello) se marca
// de forma HONESTA, sin inventar un solo número.
//
// Robustez: cada señal se calcula en su propio try/catch (safe); si una consulta falla, ese
// bloque queda "sin datos" y el resto del dashboard sigue funcionando (nunca tumba la pantalla).
// Recibe x = { get, all } (wrappers dbGet/dbAll de server.js; placeholders `?`).

const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function addDays(iso, n) { const d = new Date(iso + "T00:00:00.000Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function addMonths(ym, n) { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }
const signed = (n, d = 0) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d) + "%";
const eur = (n) => Math.round(n).toLocaleString("es-ES") + " €";
const nombreCorto = (s) => String(s || "").split(" ")[0];
const diasEntre = (aIso, bIso) => Math.max(0, Math.round((new Date(aIso + "T00:00:00Z") - new Date(String(bIso).slice(0, 10) + "T00:00:00Z")) / 86400000));

async function safe(fn, fallback) { try { return await fn(); } catch { return fallback; } }

// Ejecuta un array de "thunks" (funciones que devuelven promesa) con concurrencia limitada.
// El dashboard hace muchas consultas; acotarlas deja conexiones libres del pool para las
// operaciones críticas (reservas, WhatsApp/Sara). Preserva el orden del array de entrada.
async function mapLimit(thunks, limit) {
  const results = new Array(thunks.length);
  let i = 0;
  async function worker() { while (i < thunks.length) { const idx = i++; results[idx] = await thunks[idx](); } }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return results;
}

// ── Recolección de señales reales (cada una defensiva) ───────────────────────
async function gatherSignals(x, { hoy, local }) {
  const ayer = addDays(hoy, -1);
  const dow = new Date(ayer + "T12:00:00.000Z").getUTCDay();
  const mesActual = hoy.slice(0, 7);
  const mesPrev = addMonths(mesActual, -1);
  const finProx = addDays(hoy, 7);
  const lf = local ? " AND local = ?" : "";
  const lp = local ? [local] : [];

  const [
    ayerTot, ayerLocal, base,                                   // cómo fue ayer
    hoyTot, hoyLocal, prox7,                                    // qué viene
    recur, aging, openInc, incPorLocal,                        // mantenimiento
    resAgg, low, repLocal,                                      // reputación
    porPagar, acreedores, masAntigua, gastoAct, gastoPrev,     // dinero
    provAct, provPrev,                                          // proveedores
    incWorkers, plantilla, checkinsMes,                        // equipo
    churn, mejores,                                             // clientes
    cand, facPend,                                              // pendientes
  ] = await mapLimit([
    // — cómo fue ayer —
    () => safe(() => x.get(`SELECT COUNT(*)::int n, COALESCE(SUM(personas),0)::int personas FROM reservas WHERE dia = ?${lf}`, [ayer, ...lp]), null),
    () => safe(() => x.all(`SELECT local, COUNT(*)::int n, COALESCE(SUM(personas),0)::int personas FROM reservas WHERE dia = ? GROUP BY local ORDER BY personas DESC`, [ayer]), []),
    () => safe(() => x.get(`SELECT COUNT(*)::int total, COUNT(DISTINCT dia)::int dias FROM reservas WHERE EXTRACT(DOW FROM dia::date) = ? AND dia::date < ?::date AND dia::date >= ?::date${lf}`, [dow, ayer, addDays(ayer, -56), ...lp]), null),
    // — qué viene (ocupación futura) —
    () => safe(() => x.get(`SELECT COUNT(*)::int n, COALESCE(SUM(personas),0)::int personas FROM reservas WHERE dia = ?${lf}`, [hoy, ...lp]), null),
    () => safe(() => x.all(`SELECT local, COUNT(*)::int n, COALESCE(SUM(personas),0)::int personas FROM reservas WHERE dia = ? GROUP BY local ORDER BY personas DESC`, [hoy]), []),
    () => safe(() => x.get(`SELECT COUNT(*)::int n, COALESCE(SUM(personas),0)::int personas FROM reservas WHERE dia::date > ?::date AND dia::date <= ?::date${lf}`, [hoy, finProx, ...lp]), null),
    // — mantenimiento —
    () => safe(() => x.all(`SELECT local, titulo, COUNT(*)::int c FROM maintenance_issues WHERE creado_en::date >= ?::date${lf} GROUP BY local, titulo HAVING COUNT(*) >= 2 ORDER BY c DESC LIMIT 5`, [addDays(hoy, -56), ...lp]), []),
    () => safe(() => x.all(`SELECT id, local, titulo, creado_en FROM maintenance_issues WHERE estado NOT IN ('resuelta','cerrada') AND creado_en::date <= ?::date${lf} ORDER BY creado_en ASC LIMIT 5`, [addDays(hoy, -3), ...lp]), []),
    () => safe(() => x.get(`SELECT COUNT(*)::int n FROM maintenance_issues WHERE estado NOT IN ('resuelta','cerrada')${lf}`, [...lp]), null),
    () => safe(() => x.all(`SELECT local, COUNT(*)::int n FROM maintenance_issues WHERE estado NOT IN ('resuelta','cerrada') GROUP BY local`, []), []),
    // — reputación —
    () => safe(() => x.get(`SELECT COALESCE(ROUND(AVG(rating)::numeric,1),0)::float media, COUNT(*)::int total FROM google_reviews WHERE COALESCE(fecha,creado_en)::date >= ?::date`, [addDays(hoy, -90)]), null),
    () => safe(() => x.all(`SELECT author, rating, text, COALESCE(fecha,creado_en) AS fecha, location_name FROM google_reviews WHERE rating <= 2 AND COALESCE(fecha,creado_en)::date >= ?::date ORDER BY COALESCE(fecha,creado_en) DESC LIMIT 3`, [addDays(hoy, -30)]), []),
    () => safe(() => x.all(`SELECT location_name, ROUND(AVG(rating)::numeric,1)::float media, COUNT(*)::int n FROM google_reviews WHERE rating IS NOT NULL AND location_name IS NOT NULL AND location_name <> '' AND COALESCE(fecha,creado_en)::date >= ?::date GROUP BY location_name HAVING COUNT(*) >= 3 ORDER BY media ASC`, [addDays(hoy, -180)]), []),
    // — dinero (lo que debo) —
    () => safe(() => x.get(`SELECT COUNT(*)::int n, COALESCE(SUM(total),0)::float total FROM facturas WHERE COALESCE(pagado,0) = 0${lf}`, [...lp]), null),
    () => safe(() => x.all(`SELECT proveedor, COALESCE(SUM(total),0)::float t, COUNT(*)::int n FROM facturas WHERE COALESCE(pagado,0) = 0 AND proveedor IS NOT NULL AND proveedor <> ''${lf} GROUP BY proveedor ORDER BY t DESC LIMIT 5`, [...lp]), []),
    () => safe(() => x.get(`SELECT proveedor, total::float total, fecha FROM facturas WHERE COALESCE(pagado,0) = 0 AND fecha IS NOT NULL AND fecha <> ''${lf} ORDER BY fecha::date ASC LIMIT 1`, [...lp]), null),
    () => safe(() => x.all(`SELECT local, COALESCE(SUM(total),0)::float t FROM facturas WHERE TO_CHAR(fecha::date,'YYYY-MM') = ? GROUP BY local`, [mesActual]), []),
    () => safe(() => x.all(`SELECT local, COALESCE(SUM(total),0)::float t FROM facturas WHERE TO_CHAR(fecha::date,'YYYY-MM') = ? GROUP BY local`, [mesPrev]), []),
    // — proveedores (subida de gasto) —
    () => safe(() => x.all(`SELECT proveedor, COALESCE(SUM(total),0)::float t FROM facturas WHERE proveedor IS NOT NULL AND proveedor <> '' AND fecha::date >= ?::date${lf} GROUP BY proveedor`, [addDays(hoy, -30), ...lp]), []),
    () => safe(() => x.all(`SELECT proveedor, COALESCE(SUM(total),0)::float t FROM facturas WHERE proveedor IS NOT NULL AND proveedor <> '' AND fecha::date >= ?::date AND fecha::date < ?::date${lf} GROUP BY proveedor`, [addDays(hoy, -60), addDays(hoy, -30), ...lp]), []),
    // — equipo —
    () => safe(() => x.all(`SELECT n.worker_id, MAX(u.nombre) AS nombre, MAX(u.local) AS local, COUNT(*)::int c, MAX(n.creado_en) AS ult FROM hr_worker_notes n JOIN users u ON u.id = n.worker_id WHERE n.tipo = 'incidencia' AND n.creado_en::date >= ?::date${local ? " AND u.local = ?" : ""} GROUP BY n.worker_id ORDER BY c DESC LIMIT 5`, [addDays(hoy, -45), ...lp]), []),
    () => safe(() => x.get(`SELECT COUNT(*)::int n FROM users WHERE rol IN ('trabajador','encargado')${local ? " AND local = ?" : ""}`, [...lp]), null),
    () => safe(() => x.get(`SELECT COUNT(DISTINCT worker_id)::int n FROM hr_llamadas_mes WHERE mes = ? AND COALESCE(realizada,0) = 1`, [mesActual]), null),
    // — clientes —
    () => safe(() => x.all(`SELECT telefono, MAX(nombre_reserva) AS nombre, COUNT(*)::int visitas, MAX(dia) AS ultima, MAX(local) AS local FROM reservas WHERE telefono IS NOT NULL AND telefono <> ''${lf} GROUP BY telefono HAVING COUNT(*) >= 3 AND MAX(dia)::date < ?::date ORDER BY visitas DESC LIMIT 8`, [...lp, addDays(hoy, -42)]), []),
    () => safe(() => x.all(`SELECT telefono, MAX(nombre_reserva) AS nombre, COUNT(*)::int visitas, MAX(dia) AS ultima, MAX(local) AS local FROM reservas WHERE telefono IS NOT NULL AND telefono <> ''${lf} GROUP BY telefono HAVING COUNT(*) >= 4 AND MAX(dia)::date >= ?::date ORDER BY visitas DESC LIMIT 6`, [...lp, addDays(hoy, -60)]), []),
    // — pendientes —
    () => safe(() => x.get(`SELECT COUNT(*)::int n, MIN(creado_en) AS oldest FROM hr_applications WHERE estado = 'nuevo'`, []), null),
    () => safe(() => x.get(`SELECT COUNT(*)::int n FROM facturas_pendientes${local ? " WHERE local = ?" : ""}`, [...lp]), null),
  ], 4);

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

  // Gasto por local: mes actual vs mes anterior.
  const gPrevMap = new Map((gastoPrev || []).map((r) => [r.local, r.t]));
  const gastoLocal = (gastoAct || []).map((r) => { const prev = gPrevMap.get(r.local) || 0; const delta = prev > 0 ? (r.t - prev) / prev * 100 : null; return { local: r.local, actual: r.t, prev, delta }; })
    .sort((a, b) => b.actual - a.actual);

  // Radar por local: cruza ocupación próxima + incidencias abiertas + gasto del mes.
  const radar = buildRadar({ hoyLocal, ayerLocal, incPorLocal, gastoAct });

  return {
    hoy, ayer, dow, local, mesActual,
    ayerTot, ayerLocal, base, hoyTot, hoyLocal, prox7,
    recur, aging, openInc, incPorLocal,
    resAgg, low, lowCorr, repLocal,
    porPagar, acreedores, masAntigua, gastoLocal, risers,
    incWorkers, plantilla, checkinsMes,
    churn, mejores, cand, facPend, radar,
  };
}

function buildRadar({ hoyLocal, ayerLocal, incPorLocal, gastoAct }) {
  const locs = new Set();
  (hoyLocal || []).forEach((r) => locs.add(r.local));
  (ayerLocal || []).forEach((r) => locs.add(r.local));
  (incPorLocal || []).forEach((r) => locs.add(r.local));
  (gastoAct || []).forEach((r) => locs.add(r.local));
  const hoyMap = new Map((hoyLocal || []).map((r) => [r.local, r]));
  const incMap = new Map((incPorLocal || []).map((r) => [r.local, r.n]));
  const gasMap = new Map((gastoAct || []).map((r) => [r.local, r.t]));
  return [...locs].filter(Boolean).map((l) => ({
    local: l,
    hoyPersonas: hoyMap.get(l) ? hoyMap.get(l).personas : 0,
    hoyReservas: hoyMap.get(l) ? hoyMap.get(l).n : 0,
    incidenciasAbiertas: incMap.get(l) || 0,
    gastoMes: Math.round(gasMap.get(l) || 0),
  })).sort((a, b) => b.incidenciasAbiertas - a.incidenciasAbiertas || b.gastoMes - a.gastoMes);
}

// ── Razonamiento PURO y testeable ────────────────────────────────────────────
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
    texto += ` El más movido fue <b>${mejor.local}</b> (${mejor.personas} comensales); el más flojo, ${peor.local} (${peor.personas}).`;
  }
  return { disponible: true, texto, delta, reservas: s.ayerTot.n, comensales: s.ayerTot.personas };
}

// "Qué tengo por delante": ocupación de hoy + próximos 7 días.
export function hoyNarrativa(s, localName) {
  if (!s.hoyTot || s.hoyTot.n == null) return { disponible: false, texto: "" };
  const sujeto = localName ? "" : " en el grupo";
  let texto = `Para hoy hay <b>${s.hoyTot.n} reserva${s.hoyTot.n === 1 ? "" : "s"}</b> (${s.hoyTot.personas} comensales)${sujeto}`;
  if (!localName && s.hoyLocal && s.hoyLocal.length) {
    const top = s.hoyLocal[0];
    if (top && top.personas > 0) texto += `; el que más llena es <b>${top.local}</b> (${top.personas})`;
  }
  if (s.prox7 && s.prox7.n != null) texto += `. Los próximos 7 días suman ${s.prox7.n} reservas (${s.prox7.personas} comensales)`;
  texto += ".";
  const vacio = (s.hoyTot.n === 0) && (!s.prox7 || s.prox7.n === 0);
  if (vacio) texto = `No hay reservas registradas para hoy ni los próximos días${localName ? "" : " en ningún local"}. Si esperas servicio, conviene revisar que Sara esté tomando reservas.`;
  return { disponible: true, texto, hoy: s.hoyTot, prox7: s.prox7 || null, alerta: vacio };
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

  // Dinero que debo: factura antigua sin pagar.
  if (s.masAntigua && s.masAntigua.fecha) {
    const dias = diasEntre(s.hoy, s.masAntigua.fecha);
    if (dias >= 45) {
      const tot = s.porPagar && s.porPagar.total ? ` En total hay ${eur(s.porPagar.total)} sin pagar (${s.porPagar.n} facturas).` : "";
      out.push({ sev: dias >= 75 ? "crit" : "imp", tipo: "facturas", titulo: `Factura de ${s.masAntigua.proveedor || "un proveedor"} sin pagar desde hace ${dias} días`, narrativa: `La factura más antigua pendiente (${eur(s.masAntigua.total || 0)}) lleva <b>${dias} días</b> sin pagarse.${tot} Los proveedores que se cansan de esperar suben precios o dejan de servir.`, decision: `Pagaría hoy las vencidas o hablaría con el proveedor para pactar plazo. No dejaría que una deuda vieja se enquiste.`, impacto: "Mantienes la relación con proveedores y evitas recargos o cortes de suministro.", go: "facturas" });
    }
  }

  // Gasto de un local disparado mes vs mes.
  if (s.gastoLocal && s.gastoLocal.length) {
    const sube = s.gastoLocal.filter((g) => g.delta != null && g.delta >= 25 && g.actual >= 500).sort((a, b) => b.delta - a.delta)[0];
    if (sube) out.push({ sev: "imp", tipo: "facturas", titulo: `El gasto de ${sube.local} se ha disparado`, narrativa: `${sube.local} lleva gastado <b>${eur(sube.actual)}</b> este mes, un <b>${signed(sube.delta)}</b> más que el mes pasado (${eur(sube.prev)}). Sin ventas conectadas no puedo saber si lo justifica más facturación, pero el salto es grande.`, decision: `Miraría qué facturas concretas lo explican. Si no hay más ventas detrás, hay una fuga de coste que cortar.`, impacto: "Cada euro de coste que se dispara sin ventas detrás sale directo del margen.", go: "facturas" });
  }

  if (s.aging && s.aging.length) {
    const a = s.aging[0]; const dias = diasEntre(s.hoy, a.creado_en);
    out.push({ sev: "imp", tipo: "mantenimiento", titulo: `Incidencia estancada en ${a.local}`, narrativa: `«${a.titulo}» lleva <b>${dias} días</b> abierta sin resolver${scope ? "" : ` en ${a.local}`}. Cuanto más espera, más caro sale y peor imagen da.`, decision: `La cerraría hoy o la escalaría a un técnico externo. Nada debería llevar más de 3 días abierto.`, impacto: "Evitas que una avería menor se convierta en una gorda.", go: "mantenimiento" });
  }

  // Reputación de un local en riesgo.
  if (s.repLocal && s.repLocal.length) {
    const peor = s.repLocal[0];
    if (peor && peor.media > 0 && peor.media <= 3.8 && peor.n >= 5) out.push({ sev: peor.media <= 3.2 ? "crit" : "imp", tipo: "resenas", titulo: `La reputación de ${peor.location_name} está en riesgo`, narrativa: `${peor.location_name} tiene una media de <b>${peor.media}★</b> (${peor.n} reseñas en los últimos meses), por debajo del resto. En hostelería, media estrella en Google cambia cuántos clientes nuevos entran por la puerta.`, decision: `Leería las últimas reseñas de ese local, respondería a las negativas y hablaría con el encargado de qué está fallando en sala o cocina.`, impacto: "La nota de Google es el escaparate: subirla medio punto llena mesas.", go: "marketing" });
  }

  if (s.lowCorr) {
    const lc = s.lowCorr; const lugar = lc.review.location_name ? ` (${lc.review.location_name})` : "";
    let conexion = "";
    if (lc.incidenciasDia > 0) conexion = ` Y coincide con una incidencia registrada ese mismo día${lugar}. Probablemente están relacionadas.`;
    else if (lc.reservasDia && lc.reservasDia >= 20) conexion = ` Cayó el día de más carga del mes (${lc.reservasDia} reservas): probablemente fue saturación de sala, no mala comida.`;
    out.push({ sev: "imp", tipo: "resenas", titulo: `Reseña de ${lc.review.rating}★ el ${lc.dia}`, narrativa: `«${String(lc.review.text || "").slice(0, 120)}»${conexion}`, decision: `Respondería públicamente hoy con educación y revisaría qué pasó ese turno para que no se repita.`, impacto: "Una respuesta rápida y honesta recupera reputación; ignorarla la hunde.", go: "marketing" });
  }

  // Equipo: trabajador con incidencias acumuladas.
  if (s.incWorkers && s.incWorkers.length && s.incWorkers[0].c >= 2) {
    const w = s.incWorkers[0];
    out.push({ sev: "imp", tipo: "rrhh", titulo: `${nombreCorto(w.nombre) || "Un trabajador"} acumula incidencias`, narrativa: `${w.nombre || "Un trabajador"}${w.local ? ` (${w.local})` : ""} tiene <b>${w.c} incidencias</b> registradas en las últimas semanas. Cuando se acumulan, no suele ser solo la persona: puede ser sobrecarga, falta de formación o un problema de equipo.`, decision: `Me sentaría a hablar con esa persona esta semana, antes de que la situación derive en una baja o una marcha.`, impacto: "Cuidar a tiempo a quien flojea evita perderlo y tener que formar a otro desde cero.", go: "rrhh" });
  }

  if (s.churn && s.churn.length) {
    const top = s.churn.slice(0, 3).map((c) => nombreCorto(c.nombre)).filter(Boolean);
    out.push({ sev: s.churn.length >= 5 ? "imp" : "info", tipo: "clientes", titulo: `${s.churn.length} clientes habituales se están enfriando${scope}`, narrativa: `${s.churn.length} personas que venían a menudo (3+ reservas) llevan <b>más de 6 semanas</b> sin volver. Perder un habitual es mucho más caro que recuperar uno.`, decision: `Hoy llamaría o mandaría un mensaje personal a los de más valor${top.length ? `: ${top.join(", ")}` : ""}. Un "te echamos de menos" funciona.`, impacto: "Recuperar un habitual cuesta una llamada; captar uno nuevo cuesta una campaña.", go: "clientes" });
  }

  if (s.risers && s.risers.length) {
    const r = s.risers[0];
    out.push({ sev: "info", tipo: "proveedores", titulo: `${r.proveedor} está subiendo el gasto`, narrativa: `El gasto con <b>${r.proveedor}</b> ha subido un <b>${signed(r.delta)}</b> respecto al mes anterior${scope}. O han subido precios o estamos pidiendo de más.`, decision: `Revisaría la última factura y renegociaría, o pediría una alternativa antes de que se consolide.`, impacto: "Un punto de coste de compras se lo come el margen directamente.", go: "facturas" });
  }

  // Equipo: check-ins del mes sin hacer (solo si vamos avanzados de mes).
  if (s.plantilla && s.plantilla.n > 0) {
    const hechos = s.checkinsMes ? s.checkinsMes.n : 0;
    const faltan = s.plantilla.n - hechos;
    const diaMes = Number(s.hoy.slice(8, 10));
    if (faltan >= 3 && diaMes >= 18) out.push({ sev: "info", tipo: "rrhh", titulo: `Te faltan ${faltan} check-ins del equipo este mes`, narrativa: `Este mes has hablado con ${hechos} de ${s.plantilla.n} personas del equipo. A quien no escuchas, no sabes cómo está.`, decision: `Cerraría los ${faltan} pendientes antes de fin de mes; son 10 minutos por persona y previenen marchas.`, impacto: "El equipo que se siente escuchado rota menos.", go: "rrhh" });
  }

  if (s.cand && s.cand.n > 0) {
    let age = null; if (s.cand.oldest) age = diasEntre(s.hoy, s.cand.oldest);
    out.push({ sev: "info", tipo: "rrhh", titulo: `${s.cand.n} candidatura${s.cand.n === 1 ? "" : "s"} sin revisar`, narrativa: `Hay ${s.cand.n} candidatura${s.cand.n === 1 ? "" : "s"} esperando${age && age >= 2 ? `, la más antigua de hace ${age} días` : ""}. Los buenos candidatos se enfrían rápido.`, decision: `Las revisaría hoy y contactaría a los que encajen antes de que los pille otro.`, impacto: "El mejor talento dura días disponible, no semanas.", go: "rrhh" });
  }

  const order = { crit: 0, imp: 1, info: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]).slice(0, 7);
}

export function buildAgenda(concerns) {
  return concerns.filter((c) => c.sev !== "info").slice(0, 4).map((c) => ({ t: c.titulo, decision: c.decision, go: c.go }));
}

export async function getDashboard(x, { now, whatsappConnected = null, local = null } = {}) {
  const hoy = (now || new Date().toISOString()).slice(0, 10);
  const s = await gatherSignals(x, { hoy, local });
  const localName = local || null;
  const concerns = buildConcerns(s, { localName, whatsappConnected });
  const agenda = buildAgenda(concerns);

  return {
    fecha: hoy, ayerFecha: s.ayer, scope: { local: localName },
    ayer: ayerNarrativa(s, localName),
    hoy: hoyNarrativa(s, localName),
    preocupaciones: concerns,
    agenda,
    decisionSara: concerns.length ? concerns[0].decision : null,
    radarLocales: local ? [] : (s.radar || []),
    dinero: {
      porPagar: s.porPagar ? { total: Math.round(s.porPagar.total), n: s.porPagar.n } : { total: 0, n: 0 },
      acreedores: (s.acreedores || []).map((a) => ({ proveedor: a.proveedor, total: Math.round(a.t), n: a.n })),
      masAntigua: s.masAntigua ? { proveedor: s.masAntigua.proveedor, total: Math.round(s.masAntigua.total || 0), fecha: String(s.masAntigua.fecha).slice(0, 10), dias: diasEntre(hoy, s.masAntigua.fecha) } : null,
      gastoLocal: (s.gastoLocal || []).slice(0, 8).map((g) => ({ local: g.local, actual: Math.round(g.actual), prev: Math.round(g.prev), delta: g.delta == null ? null : Math.round(g.delta) })),
      sinFuente: { disponible: false, fuente: "TPV Ágora", nota: "Registramos lo que gastamos, no lo que ingresamos. Con Ágora, Sara cruzará ventas y margen por local; hasta entonces, aquí solo hay gasto." },
    },
    equipo: {
      incidencias: (s.incWorkers || []).map((w) => ({ nombre: w.nombre, local: w.local, c: w.c })),
      checkins: s.plantilla ? { plantilla: s.plantilla.n, hechos: s.checkinsMes ? s.checkinsMes.n : 0, mes: s.mesActual } : null,
      sinFuente: { disponible: false, fuente: "Skello (fichajes/turnos)", nota: "Con los fichajes, Sara relacionará coste de personal, horas extra y ausencias con cada local. Hoy solo vemos incidencias y check-ins registrados a mano." },
    },
    clientes: {
      enfriando: (s.churn || []).slice(0, 8).map((c) => ({ nombre: c.nombre, telefono: c.telefono, visitas: c.visitas, ultima: String(c.ultima || "").slice(0, 10), local: c.local })),
      mejores: (s.mejores || []).map((c) => ({ nombre: c.nombre, telefono: c.telefono, visitas: c.visitas, ultima: String(c.ultima || "").slice(0, 10), local: c.local })),
    },
    reputacionLocales: (s.repLocal || []).map((r) => ({ local: r.location_name, media: r.media, n: r.n })),
    resenas: s.resAgg ? { media: s.resAgg.media, total: s.resAgg.total } : { media: 0, total: 0 },
    mantenimiento: { abiertas: s.openInc ? s.openInc.n : 0 },
    whatsapp: { connected: whatsappConnected },
  };
}
