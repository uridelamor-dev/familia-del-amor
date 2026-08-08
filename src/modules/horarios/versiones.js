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
export function construirSnapshot({ semana, areas = [], tramos = [], asignaciones = [], trabajadores = [], dias = [] }) {
  const porId = new Map(trabajadores.map((w) => [String(w.id), w]));
  return {
    v: 1,
    local: semana.local,
    lunes: semana.lunes,
    version: semana.version,
    dias: [...dias],
    areas: areas.map((a) => ({ id: a.id, nombre: a.nombre, orden: a.orden })),
    tramos: tramos.map((t) => ({ id: t.id, nombre: t.nombre, orden: t.orden, inicio_min: t.inicio_min, fin_min: t.fin_min })),
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
export function compararSnapshots(antes, despues) {
  const clave = (a) => `${a.dia}|${a.worker_id}|${a.inicio_min}|${a.fin_min}|${a.area_id}|${a.tramo_id}`;
  const mapa = (s) => new Map(((s && s.asignaciones) || []).map((a) => [clave(a), a]));
  const A = mapa(antes), B = mapa(despues);
  const anadidos = [], quitados = [];
  for (const [k, v] of B) if (!A.has(k)) anadidos.push(v);
  for (const [k, v] of A) if (!B.has(k)) quitados.push(v);
  return { anadidos, quitados, total: anadidos.length + quitados.length };
}
