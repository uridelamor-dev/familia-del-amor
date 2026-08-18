// RR.HH. — la bandeja operativa. PURA.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  EL PROBLEMA: el sistema SABE lo que hay que hacer y no lo entrega.           │
// │                                                                              │
// │  Sabe que a Marta le caduca el carnet en 12 días, que Juan no fichó la        │
// │  salida de ayer, que hay dos solicitudes de vacaciones esperando y que        │
// │  alguien tiene dos contratos pisándose. Todo eso está calculado. Y para       │
// │  enterarse hay que entrar en Horarios, en Fichajes, en la bandeja de          │
// │  ausencias y abrir fichas una a una.                                          │
// │                                                                              │
// │  Esto NO calcula nada nuevo: recoge lo que cada parte ya sabe y lo ordena     │
// │  por lo que cuesta ignorarlo.                                                  │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// LA REGLA QUE EVITA QUE ESTO SE VUELVA RUIDO: solo entra lo que alguien puede RESOLVER
// HOY. Un contrato correcto no es un asunto. Un saldo de quince minutos tampoco. En cuanto
// una bandeja enseña treinta cosas de las que veinticinco son informativas, se deja de
// mirar entera — y entonces las cinco que importaban tampoco se ven.

/** Cuánto cuesta ignorarlo. El orden de la bandeja sale de aquí, no de la fecha. */
export const NIVELES = { bloqueo: 0, decision: 1, aviso: 2 };

/** Los grupos, en el orden en que se enseñan. */
export const GRUPOS = [
  { clave: "fichajes",  titulo: "Fichajes" },
  { clave: "ausencias", titulo: "Ausencias" },
  { clave: "horarios",  titulo: "Horarios" },
  { clave: "equipo",    titulo: "Equipo" },
];

const fecha = (v) => { const s = String(v == null ? "" : v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const dias = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/**
 * Construye la bandeja a partir de lo que ya han calculado los demás.
 *
 * Cada asunto lleva a DÓNDE se resuelve, con el contexto puesto. Un aviso que no se puede
 * pulsar obliga a la persona a memorizar una fecha y un nombre y a buscarlos a mano, que es
 * exactamente el trabajo que esto viene a quitar.
 */
export function construirAtencion({
  jornadas = [], ausenciasPendientes = [], turnosTrasBaja = [], documentos = [],
  contratosSolapados = [], sinAreas = [], cambiosSinVer = [], hoy = null, local = null,
} = {}) {
  const asuntos = [];
  const add = (a) => asuntos.push({ local, ...a });

  // ── Fichajes: jornadas que piden una decisión ────────────────────────────
  // Solo las que están ABIERTAS. Una validada ya no es trabajo de nadie.
  for (const j of jornadas) {
    add({
      grupo: "fichajes", tipo: "jornada_revisar", nivel: "decision",
      clave: `jornada:${j.worker_id}:${j.dia}`,
      persona: { id: j.worker_id, nombre: j.nombre }, fecha: j.dia,
      texto: `${j.nombre} · ${j.motivo || "la jornada necesita una decisión"}`,
      cuando: j.dia,
      accion: { etiqueta: "Revisar", destino: "revision", local, worker_id: j.worker_id, dia: j.dia },
    });
  }

  // ── Ausencias esperando respuesta ────────────────────────────────────────
  // Van con su fecha de inicio: una que empieza el lunes que viene no es lo mismo que una
  // de dentro de tres meses, aunque las dos lleven igual de tiempo esperando.
  for (const a of ausenciasPendientes) {
    const faltan = fecha(hoy) && fecha(a.desde) ? dias(fecha(hoy), fecha(a.desde)) : null;
    add({
      grupo: "ausencias", tipo: "ausencia_pendiente",
      nivel: faltan !== null && faltan <= 7 ? "bloqueo" : "decision",
      clave: `ausencia:${a.id}`,
      persona: { id: a.worker_id, nombre: a.nombre }, fecha: a.desde,
      texto: `${a.nombre} · ${a.tipo_etiqueta || a.tipo} del ${a.desde} al ${a.hasta}` +
             (faltan !== null && faltan <= 7 ? faltan <= 0 ? " · YA HA EMPEZADO" : ` · empieza en ${faltan} día(s)` : ""),
      cuando: a.desde,
      accion: { etiqueta: "Resolver", destino: "ausencias", local, ausencia_id: a.id },
    });
  }

  // ── Horarios: turnos que quedaron después de una baja ────────────────────
  // Es un BLOQUEO: hay un cuadrante publicado con alguien que ya no trabaja aquí, y el
  // resto del equipo lo está leyendo.
  for (const t of turnosTrasBaja) {
    add({
      grupo: "horarios", tipo: "turnos_tras_baja", nivel: "bloqueo",
      clave: `trasbaja:${t.worker_id}:${t.lunes}`,
      persona: { id: t.worker_id, nombre: t.nombre }, fecha: t.lunes,
      texto: `${t.nombre} causó baja el ${t.fecha_baja} y sigue teniendo ${t.turnos} turno(s) en la semana del ${t.lunes}`,
      cuando: t.lunes,
      accion: { etiqueta: "Ver la semana", destino: "horarios", local: t.local || local, lunes: t.lunes },
    });
  }

  // ── Cambios publicados que nadie ha confirmado ───────────────────────────
  // Solo si el turno YA ESTÁ CERCA. Un cambio publicado el lunes para dentro de dos semanas
  // no es trabajo de nadie todavía; uno para mañana sin leer sí, porque alguien puede no
  // presentarse.
  for (const c of cambiosSinVer) {
    add({
      grupo: "horarios", tipo: "cambio_sin_ver", nivel: "aviso",
      clave: `cambio:${c.id}`,
      persona: { id: c.worker_id, nombre: c.nombre }, fecha: c.primer_dia,
      texto: `${c.nombre} no ha confirmado el cambio de su horario, y empieza el ${c.primer_dia}`,
      cuando: c.primer_dia,
      accion: { etiqueta: "Ver la semana", destino: "horarios", local, lunes: c.lunes },
    });
  }

  // ── Equipo ───────────────────────────────────────────────────────────────
  for (const c of contratosSolapados) {
    add({
      grupo: "equipo", tipo: "contrato_solapado", nivel: "bloqueo",
      clave: `contrato:${c.worker_id}`,
      persona: { id: c.worker_id, nombre: c.nombre }, fecha: null,
      texto: `${c.nombre} tiene ${c.n} contrato(s) que se pisan: no se puede saber cuántas horas tiene`,
      accion: { etiqueta: "Abrir ficha", destino: "ficha", worker_id: c.worker_id },
    });
  }
  for (const w of sinAreas) {
    add({
      grupo: "equipo", tipo: "sin_areas", nivel: "decision",
      clave: `areas:${w.id}`,
      persona: { id: w.id, nombre: w.nombre }, fecha: null,
      texto: `${w.nombre} no tiene áreas configuradas: el generador puede ponerle en cualquiera`,
      accion: { etiqueta: "Configurar", destino: "areas", local: w.local || local, worker_id: w.id },
    });
  }
  for (const d of documentos) {
    const vencido = d.estado === "vencido";
    add({
      grupo: "equipo", tipo: "documento_caduca", nivel: vencido ? "bloqueo" : "aviso",
      clave: `doc:${d.id}`,
      persona: { id: d.worker_id, nombre: d.nombre }, fecha: d.fecha_caducidad,
      texto: vencido
        ? `${d.nombre} · ${d.doc} está VENCIDO desde el ${d.fecha_caducidad}`
        : `${d.nombre} · ${d.doc} caduca en ${d.diasRestantes} día(s)`,
      cuando: d.fecha_caducidad,
      accion: { etiqueta: "Ver documentos", destino: "documentos", worker_id: d.worker_id },
    });
  }

  return ordenar(asuntos);
}

/**
 * Primero lo que bloquea, después lo que espera una decisión, y dentro de cada nivel lo más
 * cercano en el tiempo. Ordenar todo por fecha mezclaría un contrato roto con un carnet que
 * caduca en tres semanas.
 */
export function ordenar(asuntos = []) {
  return [...asuntos].sort((a, b) =>
    NIVELES[a.nivel] - NIVELES[b.nivel] ||
    String(a.cuando || "9999").localeCompare(String(b.cuando || "9999")) ||
    String(a.grupo).localeCompare(String(b.grupo)));
}

/** La bandeja lista para pintar: por grupos, con su cuenta y su total. */
export function agrupar(asuntos = []) {
  const grupos = GRUPOS.map((g) => ({
    ...g, asuntos: asuntos.filter((a) => a.grupo === g.clave),
  })).filter((g) => g.asuntos.length);
  return {
    total: asuntos.length,
    bloqueos: asuntos.filter((a) => a.nivel === "bloqueo").length,
    grupos,
  };
}

/**
 * Qué NO entra, escrito para que se pueda discutir:
 *
 *   · Un trabajador activo con todo en orden.        No hay nada que hacer.
 *   · Un contrato correcto o unas horas normales.    Es un dato, no un asunto.
 *   · Vacaciones aprobadas sin conflicto.            Ya se decidió.
 *   · Un horario publicado y confirmado.             Ya está.
 *   · CUALQUIER saldo de bolsa.                      No existe una regla de negocio que
 *     diga cuándo un saldo «hay que resolverlo». Inventar un umbral aquí sería poner una
 *     alerta que nadie ha pedido sobre un número que se decide una vez al mes. Queda fuera
 *     a propósito, y se ve donde tiene sentido: en el libro de horas y en la ficha.
 */
export const FUERA_A_PROPOSITO = [
  "trabajador activo sin incidencias", "contrato correcto", "saldo de bolsa",
  "ausencia aprobada sin conflicto", "horario publicado y confirmado",
];
