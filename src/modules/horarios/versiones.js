// Horarios — versionado y publicación. Lógica PURA.
//
// LA PREGUNTA QUE ESTO TIENE QUE PODER CONTESTAR DENTRO DE DOS AÑOS:
// «¿qué horario estaba publicado el 12 de agosto de 2027?». No vale mirar las tablas
// vivas: para entonces alguien habrá renombrado un área, dado de baja a un trabajador o
// cambiado un tramo. Por eso al publicar se congela un JSON con todo, y se guarda su
// hash. El PDF de un horario antiguo se regenera desde ese JSON, no desde la base.

// borrador ──publicar──► publicado ──publicar v+1──► sustituido
//    │                       │
//    └──descartar──►         └──cerrar──► cerrado   (terminal)
const TRANSICIONES = {
  borrador: { publicar: "publicado", descartar: "descartado" },
  publicado: { sustituir: "sustituido", cerrar: "cerrado" },
  sustituido: {},
  cerrado: {},
  descartado: {},
};

export function puedeTransitar(estado, accion) {
  return !!(TRANSICIONES[estado] && TRANSICIONES[estado][accion]);
}
export function transitar(estado, accion) {
  const destino = TRANSICIONES[estado] && TRANSICIONES[estado][accion];
  if (!destino) {
    return { error: `No se puede «${accion}» un horario en estado «${estado}».` };
  }
  return { estado: destino };
}

// ¿Se puede publicar? Los conflictos que bloquean lo impiden; los avisos no, pero hay que
// declararlos: quedan guardados con quién los aceptó. Esa es la diferencia entre un sistema
// que ayuda y uno que estorba.
export function validarPublicacion({ estado, conflictos = [], avisosAceptados = null }) {
  if (estado !== "borrador") {
    return { ok: false, error: "Solo se publica un borrador." };
  }
  const bloquean = conflictos.filter((c) => c.severidad === "bloquea");
  if (bloquean.length) {
    return { ok: false, error: "Hay que resolver esto antes de publicar.", bloquean };
  }
  const avisan = conflictos.filter((c) => c.severidad === "avisa");
  if (avisan.length && !avisosAceptados) {
    return { ok: false, error: "Hay avisos que tienes que revisar antes de publicar.", avisan, requiereConfirmacion: true };
  }
  return { ok: true, avisan };
}

// El JSON que se congela. Se construye a partir de lo que hay AHORA, incluyendo los
// nombres: si mañana alguien se da de baja, el horario publicado sigue diciendo quién
// estaba puesto. Sin los nombres dentro, el snapshot no serviría de nada.
export function construirSnapshot({ semana, areas = [], tramos = [], asignaciones = [], trabajadores = [], ausencias = [], dias = [] }) {
  const porId = new Map(trabajadores.map((w) => [String(w.id), w]));
  return {
    // v2 añade `plantilla` y `ausencias`: sin ellas la fila de fiesta —que es quien NO tiene
    // turno— no se puede recalcular años después, porque haría falta saber quién estaba
    // contratado entonces. Los snapshots v1 que ya existen se quedan como están y su PDF
    // sale idéntico al que se mandó: nunca se le añade una fila a un papel ya enviado.
    v: 2,
    local: semana.local,
    lunes: semana.lunes,
    version: semana.version,
    dias: [...dias],
    areas: areas.map((a) => ({ id: a.id, nombre: a.nombre, orden: a.orden })),
    tramos: tramos.map((t) => ({ id: t.id, nombre: t.nombre, orden: t.orden, inicio_min: t.inicio_min, fin_min: t.fin_min, tipo: t.tipo || "turno" })),
    plantilla: [...trabajadores]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((w) => ({ id: w.id, nombre: w.nombre || w.username || "—", fecha_alta: w.fecha_alta || null, fecha_baja: w.fecha_baja || null })),
    ausencias: [...ausencias]
      .sort((a, b) => Number(a.worker_id) - Number(b.worker_id) || String(a.desde).localeCompare(String(b.desde)))
      .map((x) => ({ worker_id: x.worker_id, tipo: x.tipo, desde: x.desde, hasta: x.hasta, estado: x.estado || "aprobada" })),
    asignaciones: [...asignaciones]
      .sort((a, b) => String(a.dia).localeCompare(String(b.dia)) || a.inicio_min - b.inicio_min || Number(a.id) - Number(b.id))
      .map((a) => ({
        dia: a.dia,
        worker_id: a.worker_id,
        nombre: (porId.get(String(a.worker_id)) || {}).nombre || (porId.get(String(a.worker_id)) || {}).username || "—",
        area_id: a.area_id, tramo_id: a.tramo_id,
        inicio_min: a.inicio_min, fin_min: a.fin_min,
        fin_abierto: !!a.fin_abierto,
        tipo: a.tipo || "turno",
        nota: a.nota || null,
      })),
  };
}

// ¿Qué versión regía en un instante dado? Es la contrapartida en JS de la consulta SQL,
// para poder probar la regla sin base de datos.
export function versionVigenteEn(versiones = [], instanteISO) {
  const candidatas = versiones
    .filter((v) => v.publicado_en && String(v.publicado_en) <= String(instanteISO))
    .filter((v) => !v.sustituido_en || String(v.sustituido_en) > String(instanteISO))
    .sort((a, b) => Number(b.version) - Number(a.version));
  return candidatas[0] || null;
}

// Diferencias entre dos snapshots, para poder decir "3 cambios respecto a lo publicado".
// Compara por (día, persona, hora): es como lo mira una persona, no por id de fila.
//
// QUÉ ENTRA EN LA CLAVE Y QUÉ NO, que es toda la decisión:
//
//   · `fin_abierto` SÍ. Pasar de «20:00–00:00» a «20:00–cierre» cambia a qué hora se va alguien
//     a su casa. Estaba fuera y no se detectaba.
//   · `tipo` SÍ. Convertir un turno en una libranza es el cambio más grande que existe.
//   · `nota` NO. Es un recordatorio interno del encargado; cambiarla no altera lo que la
//     persona tiene que hacer, y avisar por eso enseñaría a ignorar los avisos.
//   · `nombre` NO, y jamás. Corregir cómo se escribe el nombre de alguien no puede producir un
//     «tu horario ha cambiado».
export function compararSnapshots(antes, despues) {
  const clave = (a) => `${a.dia}|${a.worker_id}|${a.inicio_min}|${a.fin_min}|${a.area_id}|${a.tramo_id}|${a.fin_abierto ? 1 : 0}|${a.tipo || "turno"}`;
  const mapa = (s) => new Map(((s && s.asignaciones) || []).map((a) => [clave(a), a]));
  const A = mapa(antes), B = mapa(despues);
  const anadidos = [], quitados = [];
  for (const [k, v] of B) if (!A.has(k)) anadidos.push(v);
  for (const [k, v] of A) if (!B.has(k)) quitados.push(v);
  return { anadidos, quitados, total: anadidos.length + quitados.length };
}

/**
 * Lo mismo, pero contado como lo cuenta una persona: POR TRABAJADOR Y POR DÍA.
 *
 * `compararSnapshots` devuelve una diferencia de conjuntos, que es lo correcto para decir «hay
 * 3 cambios» pero inservible para decírselo a alguien: un turno que pasa de las 16:00 a las
 * 18:00 sale ahí como una fila quitada y otra añadida, y eso no es lo que ha pasado.
 *
 * Aquí se agrupa esa misma diferencia —NO se calcula otra— y se traduce a lo único que le
 * importa a quien lo lee: qué días le cambian, qué tenía y qué tiene ahora.
 *
 * La identidad es SIEMPRE `worker_id`. El nombre viaja para poder enseñarlo, pero no decide
 * nada: un cambio de nombre no puede generar una comunicación.
 */
export function cambiosPorTrabajador(antes, despues) {
  // La PRIMERA publicación de una semana no es un cambio: es el horario. Sin esto, estrenar
  // una semana avisaría a toda la plantilla de que «su horario ha cambiado» respecto a nada.
  if (!antes || !Array.isArray(antes.asignaciones)) return [];
  const d = compararSnapshots(antes, despues);
  if (!d.total) return [];

  // Todos los tramos de cada (persona, día) en los dos snapshots. Hace falta el juego completo
  // y no solo lo que cambió: para poder decir «antes 12-16 y 20-00, ahora 12-16 y 19-23» hay
  // que enseñar también el tramo que NO se movió, o el mensaje miente por omisión.
  const porPersonaDia = (snap) => {
    const m = new Map();
    for (const a of (snap && snap.asignaciones) || []) {
      const k = `${a.worker_id}|${a.dia}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    for (const v of m.values()) v.sort((x, y) => x.inicio_min - y.inicio_min);
    return m;
  };
  const A = porPersonaDia(antes), B = porPersonaDia(despues);

  // Solo las parejas (persona, día) que aparecen en la diferencia: las demás no han cambiado.
  const tocadas = new Set([...d.anadidos, ...d.quitados].map((a) => `${a.worker_id}|${a.dia}`));

  const nombres = new Map();
  for (const a of [...((antes && antes.asignaciones) || []), ...((despues && despues.asignaciones) || [])]) {
    if (a.nombre && a.nombre !== "—") nombres.set(String(a.worker_id), a.nombre);
  }

  const porWorker = new Map();
  for (const k of [...tocadas].sort()) {
    const [wid, dia] = k.split("|");
    const antesTramos = A.get(k) || [];
    const ahoraTramos = B.get(k) || [];
    const tipo = !antesTramos.length ? "anadido" : !ahoraTramos.length ? "quitado" : "modificado";
    if (!porWorker.has(wid)) porWorker.set(wid, { worker_id: Number(wid), nombre: nombres.get(wid) || null, dias: [] });
    porWorker.get(wid).dias.push({
      dia, tipo,
      antes: antesTramos.map(tramoPlano),
      ahora: ahoraTramos.map(tramoPlano),
    });
  }
  return [...porWorker.values()]
    .map((w) => ({ ...w, dias: w.dias.sort((a, b) => a.dia.localeCompare(b.dia)) }))
    .sort((a, b) => a.worker_id - b.worker_id);
}

/** Lo mínimo de un tramo para poder enseñarlo. Sin `nota`: es interna. */
const tramoPlano = (a) => ({
  inicio_min: a.inicio_min, fin_min: a.fin_min, fin_abierto: !!a.fin_abierto,
  area_id: a.area_id ?? null, tramo_id: a.tramo_id ?? null, tipo: a.tipo || "turno",
});
