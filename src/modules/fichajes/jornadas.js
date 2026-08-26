// Fichajes — la jornada: cruzar lo PLANIFICADO con lo FICHADO. Puro, sin base de datos.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  Los dos registros NO se copian el uno sobre el otro. Nunca.                  │
// │                                                                              │
// │  · Copiar el plan sobre el fichaje cuando alguien olvida fichar destruye la   │
// │    prueba que la ley obliga a conservar: el registro pasaría a decir          │
// │    exactamente lo mismo que el cuadrante, que es justo lo que un inspector    │
// │    espera encontrar en uno falsificado.                                       │
// │  · Copiar el fichaje sobre el plan borra la desviación, que es la única señal │
// │    de si el cuadrante es realista. Y le quita a la persona el argumento       │
// │    «el cuadro decía 20:00».                                                   │
// │                                                                              │
// │  Lo que sí se hace es EMPAREJARLOS y contar la diferencia. Eso es este        │
// │  fichero: la diferencia, con nombre y apellidos, para que la mire un humano.  │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// Todo va en minutos desde las 00:00 del día de negocio, permitiendo pasar de 1440 (un
// turno de 20:00 a 02:00 es 1200→1560). Ver src/modules/horarios/tiempo.js.

// Gravedad. `revisar` pide una decisión humana; `informa` solo se cuenta.
export const REVISAR = "revisar";
export const INFORMA = "informa";

export const TIPOS = {
  sin_fichar:      { nivel: REVISAR, texto: "Tenía turno y no consta ningún fichaje" },
  sin_entrada:     { nivel: REVISAR, texto: "Fichó la salida sin haber fichado la entrada" },
  sin_salida:      { nivel: REVISAR, texto: "Se fue sin fichar la salida" },
  sin_planificar:  { nivel: REVISAR, texto: "Fichó un día que no tenía turno" },
  entrada_tarde:   { nivel: INFORMA, texto: "Entró más tarde de lo previsto" },
  entrada_pronto:  { nivel: INFORMA, texto: "Entró antes de lo previsto" },
  salida_pronto:   { nivel: INFORMA, texto: "Salió antes de lo previsto" },
  salida_tarde:    { nivel: INFORMA, texto: "Salió más tarde de lo previsto" },
  jornada_larga:   { nivel: REVISAR, texto: "Jornada por encima de las 12 horas" },
};

export const JORNADA_LARGA_MIN = 12 * 60;

// ── Tramos ───────────────────────────────────────────────────────────────────
// Lo planificado: una fila de hor_asignaciones = un tramo. `fin_abierto` («20-cierre»)
// se cierra con la hora de cierre del local; sin ella, el fin que tenga guardado.
export function tramosPlanificados(asignaciones = [], { horaCierreMin = null } = {}) {
  return asignaciones
    .filter((a) => (a.tipo || "turno") === "turno")
    .map((a) => ({
      id: a.id,
      inicio: Number(a.inicio_min),
      fin: a.fin_abierto && horaCierreMin != null ? Math.max(Number(a.inicio_min), Number(horaCierreMin)) : Number(a.fin_min),
      abierto: !!a.fin_abierto,
    }))
    .filter((t) => Number.isFinite(t.inicio) && Number.isFinite(t.fin))
    .sort((a, b) => a.inicio - b.inicio);
}

// Lo fichado: cada pareja entrada→salida es un tramo. Las pausas se restan aparte, no
// parten el tramo: alguien que hace una pausa a media tarde no ha hecho dos turnos.
export function tramosFichados(eventos = []) {
  const vivos = [...eventos].filter((e) => !e.anulado_por)
    .sort((a, b) => Number(a.epoch_ms) - Number(b.epoch_ms) || Number(a.id) - Number(b.id));

  const tramos = [];
  let abierto = null, pausaIni = null, pausa = 0;
  for (const e of vivos) {
    const m = Number(e.minuto_local);
    if (e.tipo === "entrada") { abierto = m; pausa = 0; pausaIni = null; }
    else if (e.tipo === "pausa_inicio") { if (abierto != null) pausaIni = m; }
    else if (e.tipo === "pausa_fin") { if (pausaIni != null) { pausa += m - pausaIni; pausaIni = null; } }
    else if (e.tipo === "salida") {
      if (abierto == null) { tramos.push({ inicio: null, fin: m, pausa: 0, sinEntrada: true }); continue; }
      if (pausaIni != null) { pausa += m - pausaIni; pausaIni = null; }
      tramos.push({ inicio: abierto, fin: m, pausa });
      abierto = null; pausa = 0;
    }
  }
  if (abierto != null) tramos.push({ inicio: abierto, fin: null, pausa, sinSalida: true });
  return tramos;
}

// Un tramo al que le falta un extremo NO vale cero: sigue abierto. Quien entró a las 20:00
// y no fichó la salida cubre de las 20:00 en adelante, y tiene que emparejar con su turno.
// Si no, saldría a la vez "no fichó" y "se fue sin fichar la salida" — dos incidencias por
// una sola cosa, y la persona apareciendo como que faltó al trabajo cuando estuvo.
const solape = (a, b) => {
  const ini = Math.max(a.inicio ?? -Infinity, b.inicio ?? -Infinity);
  const fin = Math.min(a.fin ?? Infinity, b.fin ?? Infinity);
  if (!Number.isFinite(ini) || !Number.isFinite(fin)) return 0;
  return Math.max(0, fin - ini);
};

// Empareja plan y reloj por el solape más grande. Con turno partido (11-15 y 20-cierre)
// hay dos de cada, y emparejar por orden fallaría en cuanto alguien fichara el segundo
// turno antes de fichar la salida del primero.
export function emparejar(plan = [], fichado = []) {
  const parejas = [];
  const planLibre = plan.map((p, i) => ({ p, i, usado: false }));
  const ficLibre = fichado.map((f, i) => ({ f, i, usado: false }));

  const candidatos = [];
  for (const a of planLibre) for (const b of ficLibre) {
    const s = solape(a.p, b.f);
    if (s > 0) candidatos.push({ a, b, s });
  }
  candidatos.sort((x, y) => y.s - x.s || x.a.i - y.a.i || x.b.i - y.b.i);
  for (const c of candidatos) {
    if (c.a.usado || c.b.usado) continue;
    c.a.usado = true; c.b.usado = true;
    parejas.push({ plan: c.a.p, fichado: c.b.f });
  }
  return {
    parejas,
    planSinFichar: planLibre.filter((x) => !x.usado).map((x) => x.p),
    fichadoSinPlan: ficLibre.filter((x) => !x.usado).map((x) => x.f),
  };
}

// ── La jornada ───────────────────────────────────────────────────────────────
// `diaCerrado` es la diferencia entre "todavía está trabajando" y "se fue sin fichar":
// sin ese dato, a media tarde todo el mundo tendría una incidencia.
export function construirJornada({
  eventos = [], asignaciones = [], toleranciaMin = 10, horaCierreMin = null, diaCerrado = false,
} = {}) {
  const plan = tramosPlanificados(asignaciones, { horaCierreMin });
  const fichado = tramosFichados(eventos);
  const { parejas, planSinFichar, fichadoSinPlan } = emparejar(plan, fichado);

  const minPlanificado = plan.reduce((s, t) => s + (t.fin - t.inicio), 0);
  let minFichado = 0, minPausa = 0;
  for (const t of fichado) {
    if (t.inicio == null || t.fin == null) continue;
    minFichado += t.fin - t.inicio;
    minPausa += t.pausa || 0;
  }

  const inc = [];
  const anota = (tipo, extra = {}) => inc.push({ tipo, nivel: TIPOS[tipo].nivel, texto: TIPOS[tipo].texto, ...extra });

  // Turnos que nadie fichó. Solo cuenta cuando el día ya está cerrado: mientras corre,
  // un turno de tarde que aún no ha empezado no es ninguna incidencia.
  if (diaCerrado) for (const p of planSinFichar) anota("sin_fichar", { plan: p, minutos: p.fin - p.inicio });

  for (const f of fichadoSinPlan) {
    if (f.sinEntrada) anota("sin_entrada", { fichado: f });
    else if (f.sinSalida) { if (diaCerrado) anota("sin_salida", { fichado: f }); }
    else anota("sin_planificar", { fichado: f, minutos: f.fin - f.inicio });
  }

  for (const { plan: p, fichado: f } of parejas) {
    if (f.sinEntrada) { anota("sin_entrada", { plan: p, fichado: f }); continue; }
    if (f.sinSalida) { if (diaCerrado) anota("sin_salida", { plan: p, fichado: f }); continue; }
    const dIni = f.inicio - p.inicio;      // + tarde, − pronto
    const dFin = f.fin - p.fin;
    if (dIni > toleranciaMin) anota("entrada_tarde", { plan: p, fichado: f, minutos: dIni });
    else if (-dIni > toleranciaMin) anota("entrada_pronto", { plan: p, fichado: f, minutos: -dIni });
    if (dFin > toleranciaMin) anota("salida_tarde", { plan: p, fichado: f, minutos: dFin });
    else if (-dFin > toleranciaMin) anota("salida_pronto", { plan: p, fichado: f, minutos: -dFin });
  }

  if (minFichado > JORNADA_LARGA_MIN) anota("jornada_larga", { minutos: minFichado });

  return {
    minPlanificado,
    minFichado,
    minPausa,
    minEfectivo: Math.max(0, minFichado - minPausa),
    // La desviación es el número que interesa mirar. Se guarda derivado, nunca sustituye
    // a ninguno de los dos.
    minDesviacion: (minFichado - minPausa) - minPlanificado,
    plan, fichado, parejas,
    incidencias: inc.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === REVISAR ? -1 : 1)),
    requiereRevision: inc.some((i) => i.nivel === REVISAR),
  };
}

// Firma de lo que se estaba mirando al validar. Si después llega otro fichaje —o se
// anula uno—, la firma deja de coincidir y la validación queda marcada como caducada:
// nadie debe poder validar 8 horas y que luego el registro diga otra cosa sin enterarse.
export function firmaDeEventos(eventos = []) {
  return [...eventos]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((e) => `${e.id}:${e.tipo}:${e.epoch_ms}:${e.anulado_por ? "x" : "v"}`)
    .join("|");
}

/**
 * ¿Se sabe cuántas horas hizo?
 *
 * NO es lo mismo que «no tiene incidencias». Quien fichó un día que no le tocaba tiene una
 * incidencia que pide decisión, pero sus horas están completas y se sabe qué contar. Quien se
 * fue sin fichar la salida, no: ahí no hay ninguna cifra que valga, hay que decidirla.
 *
 * Se lee de la FORMA de la jornada —un tramo al que le falta un extremo, un turno del cuadrante
 * que no emparejó con nada— y no de una lista de nombres de incidencia. Así, el día que se
 * añada un tipo nuevo, esto sigue diciendo la verdad sin que nadie se acuerde de tocarlo.
 *
 * Un día que todavía corre nunca está completo, y es correcto: aún puede fichar la salida.
 */
export function horasCompletas(jornada) {
  if (!jornada) return false;
  const fichado = jornada.fichado || [];
  if (!(Number(jornada.minFichado) > 0)) return false;          // no fichó nada que contar
  if (fichado.some((t) => t.inicio == null || t.fin == null)) return false;  // falta un extremo
  // Un turno del cuadrante que no emparejó con ningún fichaje. `parejas` sale de `emparejar`,
  // así que la resta dice exactamente cuántos se quedaron fuera.
  return (jornada.plan || []).length <= (jornada.parejas || []).length;
}
