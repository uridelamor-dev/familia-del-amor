// Horarios — quién libra. Lógica PURA.
//
// La fila de FIESTA del cuadrante de papel no se rellena: se deduce. Es *el resto* de la
// plantilla, o sea, quien ese día no tiene turno. Escribirla a mano tiene dos problemas que
// no se ven hasta que ya está impreso:
//
//   1. Se olvida. Se mueve un turno del jueves al viernes y nadie se acuerda de mover
//      también el nombre en la fila de fiesta, así que el papel dice que esa persona libra
//      y trabaja el mismo día.
//   2. Miente por omisión. Si alguien no aparece en ninguna fila, no se sabe si es que
//      libra o es que se olvidaron de ponerle turno. Calculada, la ausencia es una respuesta.
//
// Aquí se calcula, y además se distingue: no es lo mismo librar que estar de vacaciones o
// de baja. Poner a alguien de baja bajo el rótulo «FIESTA» sin más sería un error feo.

/** Motivos por los que alguien no trabaja, en el orden en que se muestran dentro de la celda. */
export const MOTIVOS = {
  fiesta: { etiqueta: null, orden: 0 },              // el descanso semanal: sin marca, es lo normal
  libranza: { etiqueta: "libra", orden: 1 },
  asuntos_propios: { etiqueta: "asuntos propios", orden: 2 },
  permiso: { etiqueta: "permiso", orden: 3 },
  vacaciones: { etiqueta: "vacaciones", orden: 4 },
  baja: { etiqueta: "baja", orden: 5 },
  festivo: { etiqueta: "festivo", orden: 6 },
};

// `formacion` es trabajo aunque no sea un turno de sala: quien está en formación NO libra.
const CUENTA_COMO_TRABAJO = new Set(["turno", "formacion"]);

const enRango = (dia, desde, hasta) =>
  (!desde || String(dia) >= String(desde)) && (!hasta || String(dia) <= String(hasta));

/**
 * Área en la que suele estar esa persona esta semana. Quien libra no tiene turno ese día y
 * por tanto no tiene área: se toma la de sus otros días, que es lo que hace que la fiesta de
 * la cocinera salga en la fila de COCINA y no en la de SALA.
 * @returns {string|null} area_id, o null si esa semana no trabaja ningún día.
 */
export function areaHabitual(workerId, asignaciones = [], areas = []) {
  const cuenta = new Map();
  for (const a of asignaciones) {
    if (String(a.worker_id) !== String(workerId)) continue;
    if (!CUENTA_COMO_TRABAJO.has(a.tipo || "turno") || a.area_id == null) continue;
    const k = String(a.area_id);
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  }
  if (!cuenta.size) return null;
  // A igualdad gana el área que va antes en el cuadrante, para que no baile entre semanas.
  const orden = new Map(areas.map((a, i) => [String(a.id), i]));
  let mejor = null, mejorN = -1;
  for (const [id, n] of cuenta) {
    const gana = n > mejorN || (n === mejorN && (orden.get(id) ?? 1e9) < (orden.get(mejor) ?? 1e9));
    if (gana) { mejor = id; mejorN = n; }
  }
  return mejor;
}

/**
 * Por qué esta persona no trabaja ese día. `null` si sí trabaja.
 * El orden importa: una ausencia aprobada manda sobre la fiesta (quien está de baja no
 * «libra»), y un turno manda sobre todo (si se le ha puesto turno, trabaja).
 */
export function motivoDelDia(worker, dia, asigsDelDia = [], ausencias = []) {
  if (asigsDelDia.some((a) => CUENTA_COMO_TRABAJO.has(a.tipo || "turno"))) return null;

  const aus = ausencias.find((x) => String(x.worker_id) === String(worker.id)
    && (x.estado || "aprobada") === "aprobada" && enRango(dia, x.desde, x.hasta));
  if (aus) return MOTIVOS[aus.tipo] ? aus.tipo : "permiso";

  // Una asignación que no es turno (libranza, vacaciones, festivo…) dice el motivo exacto.
  const marca = asigsDelDia.find((a) => MOTIVOS[a.tipo]);
  if (marca) return marca.tipo;

  return "fiesta";
}

/**
 * Quién no trabaja cada día, repartido por área.
 *
 *   descansosPorDia({ dias, trabajadores, asignaciones, ausencias, areas })
 *     → { areas: [{ area, dias: [[{worker_id, nombre, motivo, etiqueta}]] }],
 *         sinArea: [[...]],   // quien esta semana no trabaja ningún día: no se le inventa área
 *         totales: [n, ...] }
 *
 * `sinArea` existe a propósito. Quien está de vacaciones toda la semana no tiene área en la
 * que colocarlo, y meterlo en la primera de la lista sería inventarse un dato: la interfaz
 * lo enseña en una fila aparte, sin rótulo.
 */
export function descansosPorDia({ dias = [], trabajadores = [], asignaciones = [], ausencias = [], areas = [] } = {}) {
  // asignaciones indexadas por persona+día: sin esto son N×M comparaciones por celda.
  const porWD = new Map();
  for (const a of asignaciones) {
    const k = `${a.worker_id}|${a.dia}`;
    if (!porWD.has(k)) porWD.set(k, []);
    porWD.get(k).push(a);
  }

  const filas = areas.map((area) => ({ area, dias: dias.map(() => []) }));
  const idxArea = new Map(areas.map((a, i) => [String(a.id), i]));
  const sinArea = dias.map(() => []);

  for (const w of trabajadores) {
    const ai = idxArea.get(String(areaHabitual(w.id, asignaciones, areas)));
    for (const [d, dia] of dias.entries()) {
      // Antes de entrar o después de irse no se libra: es que todavía no está, o ya no está.
      if (!enRango(dia, w.fecha_alta, w.fecha_baja)) continue;
      const motivo = motivoDelDia(w, dia, porWD.get(`${w.id}|${dia}`) || [], ausencias);
      if (!motivo) continue;
      const item = {
        worker_id: w.id,
        nombre: w.nombre || w.username || "—",
        motivo,
        etiqueta: (MOTIVOS[motivo] || {}).etiqueta || null,
      };
      (ai == null ? sinArea[d] : filas[ai].dias[d]).push(item);
    }
  }

  const ordenar = (celda) => celda.sort((a, b) => {
    const oa = (MOTIVOS[a.motivo] || {}).orden ?? 9, ob = (MOTIVOS[b.motivo] || {}).orden ?? 9;
    return oa !== ob ? oa - ob : String(a.nombre).localeCompare(String(b.nombre), "es");
  });
  for (const f of filas) f.dias.forEach(ordenar);
  sinArea.forEach(ordenar);

  return {
    areas: filas,
    sinArea,
    totales: dias.map((_, i) => filas.reduce((s, f) => s + f.dias[i].length, 0) + sinArea[i].length),
  };
}

/** ¿Este bloque del cuadrante es la fila de descanso (la que se calcula sola)? */
export const esTramoDescanso = (tramo) => !!tramo && String(tramo.tipo || "turno") === "descanso";

/**
 * Nombres que ya se usaban a mano para esa fila, para reconocerla al migrar. Solo se consulta
 * UNA vez, al marcar los bloques existentes; a partir de ahí manda la columna `tipo` y nadie
 * depende de cómo se llame el bloque.
 */
export const PARECE_DESCANSO = /^\s*(fiesta|fiestas|descanso|descans|libre|libres|libranza|festa|festes)\s*$/i;
