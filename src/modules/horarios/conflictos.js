// Horarios — conflictos. Lógica PURA: recibe el cuadrante y el contexto (ausencias,
// contratos, necesidades) y devuelve qué está mal y con qué gravedad.
//
// DOS NIVELES, Y LA DIFERENCIA IMPORTA:
//
//   bloquea → no se puede publicar. Son cosas que no pueden ser ciertas: una persona en
//             dos sitios a la vez, o trabajando durante sus vacaciones aprobadas.
//   avisa   → se puede publicar asumiéndolo, pero queda escrito quién lo asumió. Son
//             cosas que a veces hay que hacer: un descanso corto un sábado de agosto,
//             una semana con horas de más porque alguien está de baja.
//
// La tentación es bloquearlo todo "por seguridad". Sería un error: un encargado que no
// puede publicar el sábado a las 11 de la noche acaba haciendo el cuadrante en un papel,
// y entonces el sistema no sirve para nada. El encargado manda; el sistema deja constancia.

import { diasSemana, solapan, duracionMin, descansoHoras, franjaCorta } from "./tiempo.js";
import { puedeEnArea, estaConfigurado } from "./capacidades.js";

export const BLOQUEA = "bloquea";
export const AVISA = "avisa";

// Umbrales por defecto. Configurables por local (hor_config); aquí solo los valores base.
export const LIMITES = {
  descansoHoras: 12,      // entre el fin de un turno y el inicio del siguiente
  jornadaHoras: 10,       // en un mismo día
  diasSeguidos: 6,        // sin ningún día libre
  margenSemanalHoras: 2,  // por encima del contrato antes de avisar
};

const nombreDe = (w) => (w && (w.nombre || w.username)) || "—";

// ¿Está esta persona ausente ese día? Las ausencias son rangos inclusivos.
function ausenciaEn(ausencias, workerId, dia) {
  return (ausencias || []).find((a) =>
    String(a.worker_id) === String(workerId) &&
    (a.estado || "aprobada") === "aprobada" &&
    String(a.desde) <= String(dia) && String(dia) <= String(a.hasta)
  ) || null;
}

// Contrato vigente en una fecha (el que empezó antes y no ha terminado).
export function contratoVigente(contratos, workerId, fecha) {
  const suyos = (contratos || [])
    .filter((c) => String(c.worker_id) === String(workerId) && String(c.desde) <= String(fecha))
    .filter((c) => !c.hasta || String(c.hasta) >= String(fecha))
    // El desempate por `id` NO es cosmético. Si dos contratos empiezan el mismo día —cosa que
    // el alta permitía— esta función devolvía uno u otro según el orden en que Postgres
    // hubiera leído las filas, y «cuántas horas tiene contratadas» tenía dos respuestas
    // distintas en dos peticiones seguidas. Con el id, gana el último que se escribió, que es
    // el que quiso poner quien lo escribió.
    .sort((a, b) => String(b.desde).localeCompare(String(a.desde)) || (Number(b.id) || 0) - (Number(a.id) || 0));
  return suyos[0] || null;
}

/**
 * Contratos que se pisan: dos vigentes a la vez para la misma persona.
 *
 * Es de SOLO LECTURA y no arregla nada, a propósito. Si en la base hay dos contratos
 * solapados no se puede saber cuál quiso poner quien los metió —¿20 h o 30 h?—, y elegir por
 * él escribiría en una nómina una cifra que nadie ha decidido. Se enseñan y que lo resuelva
 * una persona.
 */
export function contratosSolapados(contratos = []) {
  const porWorker = new Map();
  for (const c of contratos) {
    const k = String(c.worker_id);
    if (!porWorker.has(k)) porWorker.set(k, []);
    porWorker.get(k).push(c);
  }
  const fuera = [];
  for (const [worker_id, lista] of porWorker) {
    const orden = [...lista].sort((a, b) => String(a.desde).localeCompare(String(b.desde)) || (Number(a.id) || 0) - (Number(b.id) || 0));
    for (let i = 0; i < orden.length - 1; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        const a = orden[i], b = orden[j];
        // Se pisan si a no ha terminado cuando b empieza.
        if (a.hasta && String(a.hasta) < String(b.desde)) continue;
        fuera.push({ worker_id, ids: [a.id, b.id], desde: [a.desde, b.desde], horas: [a.horas_semana, b.horas_semana] });
      }
    }
  }
  return fuera;
}

/** Días de diferencia entre dos fechas ISO, sin objetos Date que se muevan con el huso. */
const saltoDias = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

export function detectarConflictos({
  lunes, asignaciones = [], trabajadores = [], ausencias = [], contratos = [],
  necesidades = [], tramos = [], areas = [], limites = {},
  // `Map<worker_id, Set<area_id>>`. Si no viene, no se comprueba la capacidad: es lo que
  // permite que quien llame a esto sin capacidades se comporte exactamente como antes.
  capacidades = null,
  // Turnos YA PUBLICADOS del domingo anterior y del lunes siguiente. Solo entran en la
  // comprobación del descanso: el resto de reglas son de esta semana.
  //
  // Sin esto, el descanso entre jornadas se miraba únicamente dentro de la semana, así que el
  // salto que más se incumple en hostelería —cerrar el domingo a las 02:00 y abrir el lunes a
  // las 08:00— era justo el único que no se comprobaba nunca.
  vecinas = [],
} = {}) {
  const L = { ...LIMITES, ...limites };
  const dias = diasSemana(lunes);
  const porId = new Map((trabajadores || []).map((w) => [String(w.id), w]));
  const turnos = (asignaciones || []).filter((a) => (a.tipo || "turno") === "turno");
  const out = [];
  const add = (o) => out.push(o);

  // ── Una persona no puede estar en dos sitios a la vez ──
  const porPersonaDia = new Map();
  for (const a of turnos) {
    const k = `${a.worker_id}|${a.dia}`;
    if (!porPersonaDia.has(k)) porPersonaDia.set(k, []);
    porPersonaDia.get(k).push(a);
  }
  for (const [k, lista] of porPersonaDia) {
    const [wid, dia] = k.split("|");
    const orden = [...lista].sort((a, b) => a.inicio_min - b.inicio_min);
    for (let i = 0; i < orden.length - 1; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        if (!solapan(orden[i], orden[j])) continue;
        add({
          tipo: "solape", severidad: BLOQUEA, worker_id: wid, dia,
          ids: [orden[i].id, orden[j].id],
          mensaje: `${nombreDe(porId.get(String(wid)))} tiene dos turnos que se pisan el ${dia}: ${franjaCorta(orden[i].inicio_min, orden[i].fin_min)} y ${franjaCorta(orden[j].inicio_min, orden[j].fin_min)}.`,
        });
      }
    }
    // Jornada demasiado larga en un día (sumando el turno partido)
    const minutos = orden.reduce((s, a) => s + duracionMin(a.inicio_min, a.fin_min), 0);
    if (minutos > L.jornadaHoras * 60) {
      add({
        tipo: "jornada_larga", severidad: AVISA, worker_id: wid, dia,
        ids: orden.map((a) => a.id),
        mensaje: `${nombreDe(porId.get(String(wid)))} hace ${Math.round(minutos / 6) / 10} h el ${dia}.`,
      });
    }
  }

  // ── Alguien puesto en un área para la que no está habilitado ──
  //
  // AVISA, NO BLOQUEA, y es una decisión pensada. Un sábado a las once de la noche falta un
  // cocinero y el encargado mete a quien tiene delante: eso pasa, es lo correcto, y un sistema
  // que se lo impida acaba con el cuadrante hecho en un papel. El generador nunca lo propone
  // —para él es un descarte duro— pero una persona sí puede decidirlo, y queda escrito.
  if (capacidades) {
    for (const a of turnos) {
      if (a.area_id == null) continue;
      const w = porId.get(String(a.worker_id));
      if (!w || !estaConfigurado(w) || puedeEnArea(w, a.area_id, capacidades)) continue;
      const area = (areas || []).find((x) => String(x.id) === String(a.area_id));
      add({
        tipo: "area_no_habilitada", severidad: AVISA, worker_id: a.worker_id, dia: a.dia, ids: [a.id],
        mensaje: `${nombreDe(w)} no está habilitado para ${area ? area.nombre : "esa área"} y le has puesto turno ahí el ${a.dia}.`,
      });
    }
  }

  // ── Turno durante una ausencia aprobada ──
  for (const a of turnos) {
    const aus = ausenciaEn(ausencias, a.worker_id, a.dia);
    if (!aus) continue;
    add({
      tipo: "ausencia", severidad: BLOQUEA, worker_id: a.worker_id, dia: a.dia, ids: [a.id],
      mensaje: `${nombreDe(porId.get(String(a.worker_id)))} tiene ${aus.tipo} del ${aus.desde} al ${aus.hasta} y le has puesto turno el ${a.dia}.`,
    });
  }

  // ── Descanso entre jornadas ──
  // Se mira el último turno de un día contra el primero del siguiente. Los minutos son
  // absolutos desde su día, así que un turno que acaba a las 02:00 vale 1560 y el cálculo
  // sale solo: no hay que sumar días a mano.
  const porPersona = new Map();
  for (const a of turnos) {
    if (!porPersona.has(String(a.worker_id))) porPersona.set(String(a.worker_id), []);
    porPersona.get(String(a.worker_id)).push(a);
  }
  const vecinasPorPersona = new Map();
  for (const a of (vecinas || []).filter((x) => (x.tipo || "turno") === "turno")) {
    const k = String(a.worker_id);
    if (!vecinasPorPersona.has(k)) vecinasPorPersona.set(k, []);
    vecinasPorPersona.get(k).push(a);
  }
  for (const [wid, lista] of porPersona) {
    const porDia = new Map();
    // Los turnos de fuera de la semana entran SOLO aquí, y marcados: sirven para medir el
    // descanso, no para contar horas ni días seguidos de esta semana.
    const deFuera = new Set();
    for (const a of [...lista, ...(vecinasPorPersona.get(wid) || [])]) {
      if (!porDia.has(a.dia)) porDia.set(a.dia, []);
      porDia.get(a.dia).push(a);
      if (!dias.includes(a.dia)) deFuera.add(a.dia);
    }
    const diasCon = [...porDia.keys()].sort();
    for (let i = 0; i < diasCon.length - 1; i++) {
      const d1 = diasCon[i], d2 = diasCon[i + 1];
      // Diferencia real de fechas, no posición dentro del array de la semana: con
      // `dias.indexOf` un día de fuera daba −1 y el salto salía cualquier cosa.
      const salto = saltoDias(d1, d2);
      if (salto !== 1) continue;                       // no son días consecutivos
      const fin = Math.max(...porDia.get(d1).map((a) => a.fin_min));
      const ini = Math.min(...porDia.get(d2).map((a) => a.inicio_min));
      const h = descansoHoras(fin, ini, 1);
      if (h < L.descansoHoras) {
        const cruzaSemana = deFuera.has(d1) || deFuera.has(d2);
        add({
          tipo: "descanso_insuficiente", severidad: AVISA, worker_id: wid, dia: dias.includes(d2) ? d2 : d1,
          ids: [...porDia.get(d1).map((a) => a.id), ...porDia.get(d2).map((a) => a.id)],
          cruzaSemana,
          mensaje: `${nombreDe(porId.get(String(wid)))} descansa ${Math.round(h * 10) / 10} h entre el ${d1} y el ${d2} (el mínimo son ${L.descansoHoras}).`
            + (cruzaSemana ? " Es el salto entre dos semanas, con el horario ya publicado de la otra." : ""),
        });
      }
    }
    // Días seguidos sin librar
    let racha = 0, maxRacha = 0;
    for (const d of dias) { racha = porDia.has(d) ? racha + 1 : 0; maxRacha = Math.max(maxRacha, racha); }
    if (maxRacha > L.diasSeguidos) {
      add({
        tipo: "sin_libranza", severidad: AVISA, worker_id: wid,
        ids: lista.map((a) => a.id),
        mensaje: `${nombreDe(porId.get(String(wid)))} trabaja ${maxRacha} días seguidos sin librar.`,
      });
    }
    // Horas por encima del contrato
    const min = lista.reduce((s, a) => s + duracionMin(a.inicio_min, a.fin_min), 0);
    const c = contratoVigente(contratos, wid, lunes);
    if (c && Number(c.horas_semana) > 0) {
      const tope = Number(c.horas_semana) + L.margenSemanalHoras;
      const horas = Math.round((min / 60) * 10) / 10;
      if (horas > tope) {
        add({
          tipo: "exceso_semanal", severidad: AVISA, worker_id: wid,
          ids: lista.map((a) => a.id),
          mensaje: `${nombreDe(porId.get(String(wid)))} suma ${horas} h y su contrato son ${c.horas_semana} h.`,
        });
      }
    }
  }

  // ── Cobertura mínima por área y tramo ──
  const idxArea = new Map((areas || []).map((a) => [String(a.id), a]));
  const idxTramo = new Map((tramos || []).map((t) => [String(t.id), t]));
  for (const n of necesidades || []) {
    const dia = dias[Number(n.dow)];
    if (!dia) continue;
    if (n.desde && String(dia) < String(n.desde)) continue;
    if (n.hasta && String(dia) > String(n.hasta)) continue;
    // UN REFUERZO NO TIENE TRAMO. Comparar `tramo_id` con `tramo_id` dejaba fuera a todos:
    // la necesidad de refuerzo lleva `tramo_id = NULL` y el turno que la cubre también, así
    // que `String(null) === String(null)` sí casaba… pero cualquier OTRO refuerzo del mismo
    // día y área también, y encima ningún turno de tramo podía contar para él. El resultado
    // era que las necesidades de refuerzo no se comprobaban de verdad.
    //
    // Para un refuerzo lo que define la cobertura es la DURACIÓN dentro de su ventana, no el
    // bloque: cuenta el turno cuya duración es la pedida y que cae dentro de la horquilla.
    const esRefuerzo = Number(n.duracion_min) > 0;
    const hay = turnos.filter((a) => {
      if (String(a.dia) !== dia || String(a.area_id) !== String(n.area_id)) return false;
      if (!esRefuerzo) return String(a.tramo_id) === String(n.tramo_id);
      const dur = duracionMin(a.inicio_min, a.fin_min);
      return dur === Number(n.duracion_min)
        && Number(a.inicio_min) >= Number(n.ventana_inicio_min)
        && Number(a.fin_min) <= Number(n.ventana_fin_min);
    }).length;
    if (hay < Number(n.minimo || 0)) {
      const area = idxArea.get(String(n.area_id));
      const tramo = esRefuerzo ? { nombre: n.etiqueta || "refuerzo" } : idxTramo.get(String(n.tramo_id));
      add({
        tipo: "bajo_minimo", severidad: AVISA, dia,
        mensaje: `${dia}, ${tramo ? tramo.nombre : "?"} en ${area ? area.nombre : "?"}: hay ${hay} y hacen falta ${n.minimo}.`,
      });
    }
  }

  return out;
}

// Resumen para la interfaz y para decidir si se puede publicar.
export function resumirConflictos(conflictos = []) {
  const bloquean = conflictos.filter((c) => c.severidad === BLOQUEA);
  const avisan = conflictos.filter((c) => c.severidad === AVISA);
  return { total: conflictos.length, bloquean, avisan, puedePublicar: bloquean.length === 0 };
}
