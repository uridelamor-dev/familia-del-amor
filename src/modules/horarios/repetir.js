// Horarios — repetir un turno en otros días. PURO.
//
// El caso real: Carlos entra el lunes de 16:00 a 00:00 y hace lo mismo martes, miércoles,
// jueves y viernes. Hoy eso son cinco veces el mismo diálogo con los mismos cinco campos.
//
// LO QUE ESTO NO ES: no es una recurrencia, ni una serie, ni un turno «plantilla». No crea
// ningún vínculo entre los turnos: se escriben cuatro turnos normales, exactamente iguales a
// los que se harían a mano, y a partir de ahí cada uno vive su vida. Una serie con identidad
// propia obligaría a decidir qué pasa al editar uno, al borrar el original o al publicar la
// semana, y eso es un módulo entero para ahorrar cuatro clics.
//
// Y NO SE SALTA NINGUNA REGLA. Repetir es una acción MANUAL, así que se comporta como crear
// a mano: avisa de lo que chirría y deja decidir a la persona. Lo único que bloquea de
// verdad es lo que también bloquea al crear —que la persona no sea del local— y el duplicado
// exacto, que no es una decisión sino un descuido.

import { solapan, duracionMin } from "./tiempo.js";

/** Un día ya ocupado por el MISMO turno: repetirlo otra vez es un descuido, no una decisión. */
const mismoTurno = (a, b) =>
  String(a.worker_id) === String(b.worker_id) &&
  Number(a.inicio_min) === Number(b.inicio_min) &&
  Number(a.fin_min) === Number(b.fin_min) &&
  String(a.area_id ?? "") === String(b.area_id ?? "");

/**
 * Qué pasaría al repetir. NO escribe: devuelve el plan para poder enseñarlo antes.
 *
 * Cada día sale con su veredicto y su motivo en castellano. Un «Error» sin explicación
 * obliga a probar de uno en uno hasta descubrir cuál era el que fallaba.
 */
export function planRepetir({
  turno, dias = [], asignaciones = [], ausencias = [], disponibilidad = [], persona = null,
} = {}) {
  if (!turno) return { ok: false, error: "No hay ningún turno que repetir." };
  const objetivo = [...new Set(dias.map(String))].filter((d) => d !== String(turno.dia)).sort();
  if (!objetivo.length) return { ok: false, error: "Elige al menos un día distinto del que ya tiene." };

  const suyas = asignaciones.filter((a) => String(a.worker_id) === String(turno.worker_id));
  const resultado = objetivo.map((dia) => {
    const delDia = suyas.filter((a) => String(a.dia) === dia);

    // 1. Ya lo tiene exactamente igual. No se escribe nada y no es un error.
    if (delDia.some((a) => mismoTurno(a, turno))) {
      return { dia, accion: "omitir", motivo: `${persona?.nombre || "Ya"} tiene exactamente ese turno el ${dia}.` };
    }
    // 2. No estaba en plantilla ese día. Esto sí impide: no es una excepción que alguien
    //    pueda decidir, es que esa persona no trabajaba aquí.
    if (persona && !enPlantillaEseDia(persona, dia)) {
      return { dia, accion: "bloqueado", motivo: `No estaba en plantilla el ${dia}.` };
    }

    const avisos = [];
    const aus = ausencias.find((x) => String(x.worker_id) === String(turno.worker_id)
      && String(x.desde) <= dia && dia <= String(x.hasta) && String(x.estado) === "aprobada");
    if (aus) avisos.push(`tiene ${aus.tipo === "vacaciones" ? "vacaciones" : aus.tipo} aprobadas ese día`);

    const choque = delDia.find((a) => solapan(a, turno));
    if (choque) avisos.push("se pisa con otro turno suyo de ese día");

    const dow = diaSemanaDe(dia);
    const noPuede = disponibilidad.filter((d) => String(d.worker_id) === String(turno.worker_id) && Number(d.dow) === dow)
      .find((d) => d.preferencia !== "disponible" && solapan(d, turno));
    if (noPuede) avisos.push(noPuede.preferencia === "no_disponible" ? "ha dicho que no puede a esa hora" : "prefiere no trabajar a esa hora");

    return { dia, accion: "crear", avisos, motivo: avisos.length ? avisos.join(" y ") : null };
  });

  const crear = resultado.filter((r) => r.accion === "crear");
  return {
    ok: true,
    dias: resultado,
    aCrear: crear.map((r) => r.dia),
    conAviso: crear.filter((r) => r.avisos.length).length,
    omitidos: resultado.filter((r) => r.accion === "omitir").length,
    bloqueados: resultado.filter((r) => r.accion === "bloqueado").length,
    duracion: duracionMin(turno.inicio_min, turno.fin_min),
  };
}

const fecha = (v) => { const s = String(v == null ? "" : v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
/** 0 = domingo, como `hor_disponibilidad.dow`. */
export function diaSemanaDe(dia) {
  const d = fecha(dia);
  return d ? new Date(d + "T12:00:00Z").getUTCDay() : -1;
}
function enPlantillaEseDia(p, dia) {
  const alta = fecha(p.fecha_alta), baja = fecha(p.fecha_baja), d = fecha(dia);
  if (!d) return false;
  if (alta && d < alta) return false;
  if (baja && d > baja) return false;
  return true;
}

/** El resumen que se le enseña a una persona antes de confirmar. */
export function resumenPlan(plan, nombre = "") {
  if (!plan?.ok) return plan?.error || "";
  const n = plan.aCrear.length;
  const partes = [n ? `Se ${n === 1 ? "creará 1 turno" : `crearán ${n} turnos`}` : "No hay ningún día donde crearlo"];
  if (plan.conAviso) partes.push(`${plan.conAviso} con algo que mirar`);
  if (plan.omitidos) partes.push(`${plan.omitidos} ya lo ${plan.omitidos === 1 ? "tenía" : "tenían"}`);
  if (plan.bloqueados) partes.push(`${plan.bloqueados} no se ${plan.bloqueados === 1 ? "puede" : "pueden"}`);
  return partes.join(" · ") + (nombre ? ` para ${nombre}.` : ".");
}
