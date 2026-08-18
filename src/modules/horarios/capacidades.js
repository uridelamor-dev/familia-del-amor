// Horarios — qué trabajo sabe hacer cada persona. PURO.
//
// EL FALLO QUE CIERRA: el generador conocía las horas de todo el mundo, sus vacaciones, sus
// descansos y sus preferencias, pero no sabía que alguien es cocinero. Cubría un hueco de
// COCINA con quien estuviera libre, y el encargado tenía que rehacer a mano lo que le
// proponía — que es la forma más segura de dejar de usar un generador.
//
// NO ES UN SISTEMA DE COMPETENCIAS. Ni niveles, ni años, ni puntuaciones, ni especialidades.
// Una sola pregunta: ¿puede esta persona trabajar en esta área? Sí o no.
//
// LA CAPACIDAD ES UNA RESTRICCIÓN, NO UNA PREFERENCIA. No entra en la puntuación: decide
// quién puede ser candidato, y a partir de ahí manda el reparto de siempre.

/**
 * ¿Le han configurado las áreas alguna vez?
 *
 * ES LA PIEZA QUE PERMITE DESPLEGAR ESTO SIN ROMPER NADA. Hoy no hay ni una capacidad
 * guardada: si «cero áreas» significara «no puede trabajar en ninguna parte», el generador
 * se quedaría sin nadie el mismo día del despliegue.
 *
 * Por eso NO se cuentan filas. Se mira una marca:
 *   · sin marca → nunca se tocó. El generador se comporta como antes.
 *   · con marca → alguien lo decidió a propósito, y entonces CERO áreas significa de verdad
 *     «este no entra en el generador»: alguien de oficina, o de baja larga.
 */
export const estaConfigurado = (persona) => !!(persona && persona.areas_configuradas_en);

/**
 * `[{worker_id, area_id}]` → `Map<worker_id, Set<area_id>>`.
 *
 * `areasActivas` filtra las áreas desactivadas: quitar un área del local no debe borrar el
 * histórico de quién la sabía hacer, pero tampoco puede seguir contando como capacidad viva.
 * Si no se pasa, no se filtra nada.
 */
export function indiceCapacidades(filas = [], { areasActivas = null } = {}) {
  const vivas = areasActivas ? new Set([...areasActivas].map(String)) : null;
  const m = new Map();
  for (const f of filas || []) {
    if (!f || f.area_id == null) continue;
    if (vivas && !vivas.has(String(f.area_id))) continue;
    const k = String(f.worker_id);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(String(f.area_id));
  }
  return m;
}

/**
 * ¿Puede esta persona cubrir un hueco de esta área?
 *
 * Toda la regla nueva del generador cabe aquí, y está en un solo sitio a propósito: repartir
 * comprobaciones de capacidad por el solver es la manera de que dentro de un año una de ellas
 * diga algo distinto de las otras.
 */
export function puedeEnArea(persona, areaId, indice) {
  // SIN ÍNDICE = la comprobación no está en uso, y no restringe nada. Es distinto de un índice
  // VACÍO, que sí restringe: ahí la pregunta se ha hecho y la respuesta es que nadie tiene
  // áreas. La diferencia importa porque quien llame a `detectarConflictos` o al generador sin
  // pasar capacidades tiene que comportarse igual que antes de que existieran, no vaciar el
  // cuadrante en silencio.
  if (!(indice instanceof Map)) return true;
  if (!estaConfigurado(persona)) return true;          // legacy: como antes de esta fase
  if (areaId == null) return true;                     // un hueco sin área no restringe nada
  return (indice.get(String(persona.id)) || new Set()).has(String(areaId));
}

/** Las áreas de una persona, para pintarlas. Vacío si no está configurada. */
export const areasDe = (persona, indice) =>
  estaConfigurado(persona) ? [...((indice instanceof Map ? indice.get(String(persona.id)) : null) || [])] : [];

/**
 * Cuánta gente falta por configurar.
 *
 * Se enseña porque mientras alguien esté sin configurar el generador sigue aceptándolo para
 * cualquier área. Sin este número, se creería que el sistema ya respeta las áreas cuando para
 * media plantilla sigue sin hacerlo — y esa es peor situación que no tenerlo.
 */
export function resumenConfiguracion(trabajadores = []) {
  const sinConfigurar = (trabajadores || []).filter((w) => !estaConfigurado(w));
  return {
    total: (trabajadores || []).length,
    configurados: (trabajadores || []).length - sinConfigurar.length,
    sinConfigurar: sinConfigurar.length,
    quienes: sinConfigurar.map((w) => ({ id: w.id, nombre: w.nombre || w.username || "—" })),
    // Cuando no queda nadie, las áreas mandan de verdad para toda la plantilla.
    completo: (trabajadores || []).length > 0 && sinConfigurar.length === 0,
  };
}

/**
 * Cuántas horas de personal HABILITADO hay para cada área, frente a lo que se pide.
 *
 * Es la «cuenta de la vieja» del generador aplicada por área. Cuando Cocina pide 24 h y solo
 * hay 16 de gente que sepa cocinar, ningún reparto lo va a arreglar, y decirlo con dos números
 * ahorra media hora de mover fichas en vano.
 *
 * `horasDe(worker)` la pone quien llama: aquí no se sabe de contratos ni de ausencias.
 */
export function capacidadPorArea({ huecos = [], trabajadores = [], indice, areas = [], horasDe } = {}) {
  const nombreArea = new Map((areas || []).map((a) => [String(a.id), a.nombre]));
  const porArea = new Map();
  for (const h of huecos) {
    if (h.area_id == null) continue;
    const k = String(h.area_id);
    if (!porArea.has(k)) porArea.set(k, { area_id: h.area_id, nombre: nombreArea.get(k) || null, minMinimos: 0, minPedidos: 0 });
    const dur = Number(h.fin_min) - Number(h.inicio_min);
    porArea.get(k).minPedidos += dur;
    if (h.obligatorio) porArea.get(k).minMinimos += dur;
  }
  const salida = [];
  for (const [k, v] of porArea) {
    const habilitados = (trabajadores || []).filter((w) => puedeEnArea(w, k, indice));
    const minDisponibles = habilitados.reduce((s, w) => s + (Number(horasDe ? horasDe(w) : 0) || 0), 0);
    salida.push({
      ...v,
      habilitados: habilitados.length,
      // Solo se afirma cuando la cuenta es clara: si ni los MÍNIMOS caben en las horas de la
      // gente que puede hacer ese trabajo, no es un problema de reparto.
      faltaGente: v.minMinimos > minDisponibles,
      horasMinimas: Math.round(v.minMinimos / 6) / 10,
      horasDisponibles: Math.round(minDisponibles / 6) / 10,
    });
  }
  return salida.sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
}
