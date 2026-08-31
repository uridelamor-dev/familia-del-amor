// Cambiar una reserva que ya existe, sin cancelarla. PURO.
//
// POR QUÉ ESTE FICHERO: la herramienta `modificar_reserva` de Sara existe desde el principio,
// está descrita, tiene su esquema y su manejador… y **nunca ha funcionado**. `whatsapp.js`
// exporta `setOnModificarReserva` para que el servidor le diga cómo hacerlo, y el servidor
// nunca lo registró. Así que cada vez que alguien pedía «en vez de 2 seremos 4», el manejador
// lanzaba «sistema de modificaciones no disponible» y el cliente recibía un «ha habido un
// problema técnico». Sin error en ninguna pantalla y sin que nadie se enterara.
//
// La lógica de QUÉ cambia y si el cambio vale se escribe aquí, separada de la base de datos,
// porque es donde están las decisiones: qué campos se pueden tocar, qué es «ningún cambio», y
// qué reglas tiene que cumplir el resultado. Lo que toca la base vive en `server.js`.

/** Lo único que se puede cambiar de una reserva. Fuera de esta lista no se toca nada. */
export const CAMBIABLES = ["personas", "hora", "dia", "zona"];

/** Las franjas de servicio, las mismas que Sara tiene en su prompt. */
export const FRANJAS = [
  { desde: "12:30", hasta: "15:30" },
  { desde: "19:30", hasta: "22:30" },
];

const min = (hhmm) => {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const esDia = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/**
 * Qué cambia de verdad.
 *
 * → { cambios, hayCambios, resumen }
 *
 * Un valor que llega IGUAL al que ya había NO es un cambio, y esa distinción importa: sin ella,
 * «que sean 4» sobre una reserva que ya era de 4 se guardaría igual, avisaría al local y le
 * confirmaría al cliente una modificación que no ha existido. El equipo dejaría de fiarse de
 * los avisos, que es peor que no mandarlos.
 */
export function cambiosDe(reserva = {}, input = {}) {
  const cambios = {};
  const resumen = [];

  const personas = input.nuevas_personas;
  if (personas != null && Number(personas) > 0 && Number(personas) !== Number(reserva.personas)) {
    cambios.personas = Number(personas);
    resumen.push(`${reserva.personas} → ${cambios.personas} personas`);
  }

  const hora = input.nueva_hora;
  if (hora && String(hora).slice(0, 5) !== String(reserva.hora || "").slice(0, 5)) {
    cambios.hora = String(hora).slice(0, 5);
    resumen.push(`${String(reserva.hora || "").slice(0, 5)} → ${cambios.hora}`);
  }

  const dia = input.nuevo_dia;
  if (dia && String(dia) !== String(reserva.dia)) {
    cambios.dia = String(dia);
    resumen.push(`${reserva.dia} → ${cambios.dia}`);
  }

  // La zona hoy no se guarda en ninguna columna —Sara la pregunta y se pierde—, así que se
  // acepta y se pasa al aviso del local, que es quien puede hacer algo con ella. Cuando
  // `reservas` tenga su columna, esto ya estará puesto.
  const zona = String(input.nueva_zona || "").toLowerCase().trim();
  if (zona && ["terraza", "interior", "indiferente"].includes(zona) && zona !== String(reserva.zona || "").toLowerCase()) {
    cambios.zona = zona;
    resumen.push(`zona: ${zona}`);
  }

  return { cambios, hayCambios: Object.keys(cambios).length > 0, resumen: resumen.join(" · ") };
}

/**
 * ¿Se puede aplicar?
 *
 * → { ok, motivo }
 *
 * Las MISMAS reglas que al crear una reserva, y no es un detalle: una modificación que no las
 * comprobara sería la puerta de atrás para meter una reserva a las cuatro de la mañana o en un
 * día bloqueado — bastaría con crear una válida y cambiarla después.
 */
export function validarModificacion({ reserva = {}, cambios = {}, hoy = null, ahoraHHMM = null, bloqueado = false } = {}) {
  const dia = cambios.dia || reserva.dia;
  const hora = cambios.hora || reserva.hora;

  if (cambios.dia && !esDia(cambios.dia)) return { ok: false, motivo: "fecha_invalida" };
  if (cambios.hora && min(cambios.hora) == null) return { ok: false, motivo: "hora_invalida" };
  if (cambios.personas != null && (!Number.isFinite(cambios.personas) || cambios.personas < 1 || cambios.personas > 100)) {
    return { ok: false, motivo: "personas_invalidas" };
  }

  if (hoy && esDia(dia)) {
    if (dia < hoy) return { ok: false, motivo: "fecha_pasada" };
    // Hoy mismo, la hora tiene que estar por delante. Mover una reserva de las 21:00 a las
    // 13:00 cuando son las 20:00 no es un cambio: es perderla.
    if (dia === hoy && ahoraHHMM && min(hora) != null && min(hora) < min(ahoraHHMM)) {
      return { ok: false, motivo: "hora_pasada" };
    }
  }

  if (bloqueado) return { ok: false, motivo: "bloqueado" };

  // La franja se avisa pero NO se rechaza: hay comidas de empresa que empiezan a las 12:00 y
  // cenas de grupo que entran a las 23:00, y el local las acepta. Rechazarlas aquí obligaría a
  // llamar por teléfono para algo que se puede hacer, que es justo lo que Sara evita.
  const dentro = min(hora) != null && FRANJAS.some((f) => min(hora) >= min(f.desde) && min(hora) <= min(f.hasta));
  return { ok: true, motivo: null, fueraDeFranja: !dentro };
}

/** Cuántas personas hacen que la reserva pase a necesitar visto bueno del local. */
export const PENDIENTE_DESDE = 9;
export const quedaPendiente = (personas) => Number(personas) >= PENDIENTE_DESDE;
