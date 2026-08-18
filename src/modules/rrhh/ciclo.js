// RR.HH. — el ciclo de vida laboral: alta, estado y baja. PURO.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  ESTO NO GUARDA NADA. Contesta preguntas sobre datos que ya viven en su       │
// │  sitio: `users`, `hor_contratos`, `hor_worker_areas`, `hor_ausencias`,        │
// │  `hor_asignaciones`, `fic_bolsa_movimientos`.                                 │
// │                                                                              │
// │  Copiar aquí las horas de contrato o el saldo de la bolsa «para que la ficha  │
// │  vaya rápida» sería crear una segunda verdad que se desincroniza el primer    │
// │  día que alguien cambie una y no la otra — y entonces hay dos números y nadie │
// │  sabe cuál mirar.                                                             │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// CONVENIO DE FECHAS, y es el mismo en los dos sitios donde importa:
//
//   `users.fecha_baja`      = ÚLTIMO DÍA TRABAJADO, inclusive.
//   `hor_contratos.hasta`   = ÚLTIMO DÍA VIGENTE,  inclusive  (`contratoVigente` usa `hasta >= fecha`).
//
// Por eso cerrar el contrato de quien causa baja el 31 de agosto es `hasta = '2026-08-31'`
// y NO el día anterior: los dos campos hablan el mismo idioma. Ponerle el 30 le quitaría
// un día de contrato al último día que sí trabajó.

import { marcadoActivo, activoEnFecha, bajaEfectiva } from "./vigencia.js";

const fecha = (v) => { const s = String(v == null ? "" : v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

/**
 * Quién es plantilla operativa.
 *
 * `users` mezcla a quien trabaja en el local con quien lleva la contabilidad o el marketing.
 * A esos últimos no se les hace una ficha laboral: no tienen cuadrante, ni bolsa, ni áreas,
 * y enseñarles una ficha con seis bloques vacíos es peor que no enseñarles ninguna.
 */
export const ROLES_PLANTILLA = ["trabajador", "encargado"];
export const esPlantilla = (persona) => ROLES_PLANTILLA.includes(String(persona?.rol || ""));

// ── Estado laboral ───────────────────────────────────────────────────────────
/**
 * Un estado inequívoco, DERIVADO. No hay ninguna columna `estado` que mantener.
 *
 * Una columna así habría que actualizarla el día que llega una baja programada, y el día
 * que llega no pasa nada: nadie ejecuta nada a medianoche. Al derivarlo de las fechas, el
 * estado cambia solo cuando toca, sin cron y sin que se pueda quedar desfasado.
 */
export function estadoLaboral(persona, hoy) {
  const h = fecha(hoy);
  const alta = fecha(persona?.fecha_alta);
  const baja = fecha(persona?.fecha_baja);

  if (!persona) return { clave: "desconocido", etiqueta: "Sin datos", detalle: null, enPlantilla: false };

  // Desactivado a mano y sin fecha: es una decisión del presente, corta ya. Se dice aparte
  // de una baja porque no es lo mismo —no hay último día trabajado— y quien lo mire tiene
  // que poder distinguir «se fue el 31» de «alguien le apagó la cuenta».
  if (!marcadoActivo(persona) && !baja) {
    return { clave: "desactivado", etiqueta: "Cuenta desactivada", enPlantilla: false,
      detalle: "Sin fecha de baja. No entra ni sale en el cuadrante, pero su histórico sigue entero." };
  }
  if (baja && h && baja < h) {
    return { clave: "baja", etiqueta: "Baja", enPlantilla: false, detalle: `Su último día fue el ${baja}.` };
  }
  if (baja) {
    return { clave: "baja_futura", etiqueta: "Baja programada", enPlantilla: true, detalle: `Su último día será el ${baja}.` };
  }
  if (alta && h && alta > h) {
    return { clave: "pendiente", etiqueta: "Pendiente de incorporación", enPlantilla: true, detalle: `Empieza el ${alta}.` };
  }
  return { clave: "activo", etiqueta: "Activo", enPlantilla: true, detalle: null };
}

/** El filtro del listado. `activos` incluye a quien tiene baja programada: todavía trabaja. */
export function filtrarPorEstado(personas = [], filtro, hoy) {
  if (filtro === "todos") return personas;
  const bajas = ["baja", "desactivado"];
  return personas.filter((p) => {
    const e = estadoLaboral(p, hoy).clave;
    return filtro === "bajas" ? bajas.includes(e) : !bajas.includes(e);
  });
}

// ── Alta ─────────────────────────────────────────────────────────────────────
/**
 * Lo que hace falta para que una persona quede UTILIZABLE, y solo eso.
 *
 * Pedir el DNI, la fecha de nacimiento y el número de la Seguridad Social en el alta es
 * lo que hace que se den de alta a medias: la persona empieza el lunes, se rellena lo justo
 * para que entre, y el resto no se completa nunca. Se pide lo mínimo y lo demás se añade
 * en la ficha cuando se tenga.
 */
export function validarAlta(datos = {}, { locales = null, hoy = null } = {}) {
  const errores = [];
  const nombre = String(datos.nombre || "").trim();
  const username = String(datos.username || "").trim().toLowerCase();
  const local = String(datos.local || "").trim();
  const rol = ROLES_PLANTILLA.includes(String(datos.rol)) ? String(datos.rol) : "trabajador";
  const alta = fecha(datos.fecha_alta) || fecha(hoy);

  if (nombre.length < 2) errores.push("Falta el nombre.");
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) errores.push("El usuario son de 3 a 32 letras, números, punto, guion o guion bajo.");
  if (!local) errores.push("Falta el establecimiento.");
  else if (Array.isArray(locales) && locales.length && !locales.includes(local)) errores.push("Ese establecimiento no existe.");
  if (!alta) errores.push("Falta la fecha de alta.");

  // El contrato es OPCIONAL, pero si se pone tiene que valer: unas horas a cero o a 200
  // pasarían al cuadrante y el generador repartiría sobre una cifra que nadie quiso.
  let contrato = null;
  if (datos.horas_semana != null && String(datos.horas_semana) !== "") {
    const horas = Number(datos.horas_semana);
    if (!(horas > 0 && horas <= 60)) errores.push("Las horas semanales van de 1 a 60.");
    else contrato = { horas_semana: horas, desde: fecha(datos.contrato_desde) || alta,
                      dias_semana: datos.dias_semana ? Number(datos.dias_semana) : null };
  }
  // `> 0` y no solo `Number.isFinite`: un `null` de la lista se convierte en 0, que es
  // finito, y se colaría como «área 0». Un id de área siempre es un entero positivo.
  const areas = Array.isArray(datos.areas)
    ? [...new Set(datos.areas.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : null;

  return { ok: errores.length === 0, errores, datos: { nombre, username, local, rol, fecha_alta: alta, puesto: String(datos.puesto || "").trim() || null, contrato, areas } };
}

// ── Baja ─────────────────────────────────────────────────────────────────────
/**
 * Ausencias que chocan con una baja. NO decide: separa los casos y que los mire una persona.
 *
 *   · `posteriores`  empiezan DESPUÉS del último día: no tienen ningún sentido y se cancelan.
 *   · `cruzan`       empezaron antes y terminan después. Aquí NO se toca nada, y es el caso
 *                    que más cuidado pide: unas vacaciones que empiezan el 25 y acaban el 5
 *                    de septiembre, con baja el 31, son días ya disfrutados y días que no se
 *                    disfrutarán. Recortarlas automáticamente cambiaría el saldo de
 *                    vacaciones de alguien que ya se ha ido, y eso lo decide RR.HH.
 *   · `pasadas`      terminaron antes: histórico, no se tocan jamás.
 */
export function ausenciasAnteLaBaja(ausencias = [], fechaBaja) {
  const b = fecha(fechaBaja);
  const vivas = (ausencias || []).filter((a) => ["aprobada", "pendiente"].includes(String(a.estado)));
  if (!b) return { posteriores: [], cruzan: [], pasadas: vivas };
  const posteriores = vivas.filter((a) => String(a.desde) > b);
  const cruzan = vivas.filter((a) => String(a.desde) <= b && String(a.hasta) > b);
  const pasadas = vivas.filter((a) => String(a.hasta) <= b);
  return { posteriores, cruzan, pasadas };
}

/**
 * El plan de la baja: TODO lo que va a pasar, antes de que pase.
 *
 * Se calcula entero y se enseña antes de confirmar porque una baja toca cinco sitios a la
 * vez y ninguno de ellos es visible desde el botón. Quien la pulsa tiene que poder decir
 * «espera, tiene cuatro horas a favor» antes, no descubrirlo tres semanas después.
 */
export function planDeBaja({ persona, fechaBaja, asignaciones = [], contratos = [], ausencias = [], saldoBolsa = 0 } = {}) {
  const b = fecha(fechaBaja);
  const avisos = [];
  if (!b) return { ok: false, error: "Falta la fecha del último día trabajado." };
  if (persona?.fecha_alta && b < fecha(persona.fecha_alta)) {
    return { ok: false, error: `No puede irse el ${b} si entró el ${fecha(persona.fecha_alta)}.` };
  }

  // Turnos posteriores al último día, separados por lo que se puede tocar y lo que no.
  const suyos = (asignaciones || []).filter((a) => String(a.worker_id) === String(persona?.id) && String(a.dia) > b);
  const borrador = suyos.filter((a) => a.estado === "borrador");
  const publicados = suyos.filter((a) => a.estado !== "borrador");

  // Contrato que seguiría vivo después de irse. Solo los ABIERTOS o los que terminan más
  // tarde: uno que ya cerró antes de la baja está bien como está.
  const abiertos = (contratos || []).filter((c) => String(c.worker_id) === String(persona?.id))
    .filter((c) => !c.hasta || String(c.hasta) > b);

  const aus = ausenciasAnteLaBaja(ausencias, b);
  const saldo = Math.round(Number(saldoBolsa) || 0);

  if (publicados.length) avisos.push({
    tipo: "turnos_publicados", nivel: "atencion", n: publicados.length,
    semanas: [...new Set(publicados.map((a) => a.lunes).filter(Boolean))].sort(),
    texto: `${publicados.length} turno(s) suyos están en semanas YA PUBLICADAS. No se tocan: para quitarlos hay que crear una versión nueva de esa semana y volver a publicarla.`,
  });
  if (borrador.length) avisos.push({
    tipo: "turnos_borrador", nivel: "info", n: borrador.length,
    texto: `${borrador.length} turno(s) suyos en borradores se retirarán ahora. Un borrador no se ha mandado a nadie.`,
  });
  if (abiertos.length) avisos.push({
    tipo: "contrato", nivel: "info", n: abiertos.length,
    texto: `Su contrato se cerrará el ${b}, que es su último día.`,
  });
  if (aus.posteriores.length) avisos.push({
    tipo: "ausencias_posteriores", nivel: "info", n: aus.posteriores.length,
    texto: `${aus.posteriores.length} ausencia(s) empiezan después de su último día y se cancelarán, con el motivo escrito.`,
  });
  if (aus.cruzan.length) avisos.push({
    tipo: "ausencias_cruzan", nivel: "atencion", n: aus.cruzan.length,
    texto: `${aus.cruzan.length} ausencia(s) empiezan antes de irse y terminan después. NO se tocan: recortarlas cambiaría los días que ya tenía concedidos. Revísalo a mano.`,
  });
  if (saldo > 0) avisos.push({
    tipo: "bolsa", nivel: "atencion", minutos: saldo,
    texto: "Se le siguen debiendo horas. La baja no las borra: se le liquidan desde el libro de horas cuando se decida cómo.",
  });
  if (saldo < 0) avisos.push({
    tipo: "bolsa", nivel: "info", minutos: saldo,
    texto: "Tiene saldo negativo en la bolsa. Se queda como está: qué se hace con esas horas no se decide desde aquí.",
  });

  return {
    ok: true, fecha_baja: b,
    // Los ids salen como NÚMEROS. Van a un `WHERE id = ANY(?)` contra columnas enteras, y
    // una lista de textos ahí no es una consulta que devuelva poco: es un error de tipos que
    // aborta la transacción entera a mitad de la baja.
    retirar: borrador.map((a) => Number(a.id)),
    publicados: publicados.map((a) => ({ id: Number(a.id), dia: a.dia, lunes: a.lunes })),
    semanasAfectadas: [...new Set(publicados.map((a) => a.lunes).filter(Boolean))].sort(),
    contratosACerrar: abiertos.map((c) => Number(c.id)),
    ausenciasACancelar: aus.posteriores.map((a) => Number(a.id)),
    ausenciasQueCruzan: aus.cruzan.map((a) => ({ id: Number(a.id), desde: a.desde, hasta: a.hasta, tipo: a.tipo })),
    saldoBolsa: saldo,
    avisos,
  };
}

/** Firma del plan, para que no se confirme algo distinto de lo que se enseñó. */
export function firmaPlan(plan) {
  if (!plan || !plan.ok) return null;
  return [plan.fecha_baja, plan.retirar.join(","), plan.contratosACerrar.join(","),
          plan.ausenciasACancelar.join(","), plan.publicados.length, plan.saldoBolsa].join("|");
}

// ── Ficha ────────────────────────────────────────────────────────────────────
/** Resumen legible de la disponibilidad, sin repetir el editor entero. */
export function resumenDisponibilidad(filas = []) {
  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const ETIQ = { no_disponible: "no puede", prefiere: "prefiere no", disponible: "disponible" };
  const porDia = new Map();
  for (const f of filas) {
    const d = Number(f.dow);
    if (!porDia.has(d)) porDia.set(d, []);
    // Un tramo de 00:00 a 24:00 es el día entero: decir «no puede de 00:00 a 24:00» se lee
    // peor que «no puede», y es lo que la gente declara casi siempre.
    const todoElDia = Number(f.inicio_min) <= 0 && Number(f.fin_min) >= 1440;
    porDia.get(d).push({ preferencia: f.preferencia, etiqueta: ETIQ[f.preferencia] || f.preferencia,
      franja: todoElDia ? null : `${hhmm(Number(f.inicio_min))}–${hhmm(Number(f.fin_min))}` });
  }
  // Lunes primero, que es como se lee una semana; el domingo al final.
  const orden = [1, 2, 3, 4, 5, 6, 0];
  return orden.filter((d) => porDia.has(d)).map((d) => ({
    dow: d, dia: DIAS[d], tramos: porDia.get(d),
    texto: porDia.get(d).map((t) => t.franja ? `${t.etiqueta} ${t.franja}` : t.etiqueta).join(", "),
  }));
}

/** Las ausencias que importan al abrir una ficha: la de ahora, la próxima y las últimas. */
export function ausenciasDeLaFicha(ausencias = [], hoy, { ultimas = 4 } = {}) {
  const h = fecha(hoy) || "";
  const vivas = (ausencias || []).filter((a) => a.estado === "aprobada");
  const actual = vivas.find((a) => String(a.desde) <= h && h <= String(a.hasta)) || null;
  const proxima = vivas.filter((a) => String(a.desde) > h).sort((a, b) => String(a.desde).localeCompare(String(b.desde)))[0] || null;
  const pendientes = (ausencias || []).filter((a) => a.estado === "pendiente");
  const pasadas = vivas.filter((a) => String(a.hasta) < h)
    .sort((a, b) => String(b.hasta).localeCompare(String(a.hasta))).slice(0, ultimas);
  return { actual, proxima, pendientes, pasadas };
}
