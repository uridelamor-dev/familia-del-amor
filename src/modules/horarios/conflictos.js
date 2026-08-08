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
    .sort((a, b) => String(b.desde).localeCompare(String(a.desde)));
  return suyos[0] || null;
}

export function detectarConflictos({
  lunes, asignaciones = [], trabajadores = [], ausencias = [], contratos = [],
  necesidades = [], tramos = [], areas = [], limites = {},
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
  for (const [wid, lista] of porPersona) {
    const porDia = new Map();
    for (const a of lista) {
      if (!porDia.has(a.dia)) porDia.set(a.dia, []);
      porDia.get(a.dia).push(a);
    }
    const diasCon = [...porDia.keys()].sort();
    for (let i = 0; i < diasCon.length - 1; i++) {
      const d1 = diasCon[i], d2 = diasCon[i + 1];
      const salto = dias.indexOf(d2) - dias.indexOf(d1);
      if (salto !== 1) continue;                       // no son días consecutivos
      const fin = Math.max(...porDia.get(d1).map((a) => a.fin_min));
      const ini = Math.min(...porDia.get(d2).map((a) => a.inicio_min));
      const h = descansoHoras(fin, ini, 1);
      if (h < L.descansoHoras) {
        add({
          tipo: "descanso_insuficiente", severidad: AVISA, worker_id: wid, dia: d2,
          ids: [...porDia.get(d1).map((a) => a.id), ...porDia.get(d2).map((a) => a.id)],
          mensaje: `${nombreDe(porId.get(String(wid)))} descansa ${Math.round(h * 10) / 10} h entre el ${d1} y el ${d2} (el mínimo son ${L.descansoHoras}).`,
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
    const hay = turnos.filter((a) =>
      String(a.dia) === dia && String(a.area_id) === String(n.area_id) && String(a.tramo_id) === String(n.tramo_id)
    ).length;
    if (hay < Number(n.minimo || 0)) {
      const area = idxArea.get(String(n.area_id)), tramo = idxTramo.get(String(n.tramo_id));
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
