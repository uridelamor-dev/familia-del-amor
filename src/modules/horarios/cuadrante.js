// Horarios — el cuadrante. Lógica PURA: recibe filas planas de la BD y devuelve la
// estructura que pintan la rejilla del panel y el PDF. Sin BD, sin red, sin Date.
//
// La misma función alimenta las dos vistas, y eso no es ahorro de código: es lo que
// garantiza que el PDF que se manda al grupo diga exactamente lo mismo que la pantalla.

import { franjaCorta, diasSemana, duracionMin, solapan } from "./tiempo.js";
import { descansosPorDia, esTramoDescanso } from "./descansos.js";

// ¿Hay que escribir la hora al lado del nombre? Solo si esa persona se sale del horario
// general del tramo. Es lo que hace legible el cuadrante de papel: la mayoría entra a la
// hora del tramo y no lleva nada; quien difiere lleva "11-15" delante, como siempre.
export function franjaSiDifiere(asig, tramo) {
  if (!asig) return null;
  if (asig.fin_abierto) return franjaCorta(asig.inicio_min, asig.fin_min, { finAbierto: true });
  if (!tramo) return franjaCorta(asig.inicio_min, asig.fin_min);
  const igual = Number(asig.inicio_min) === Number(tramo.inicio_min)
    && Number(asig.fin_min) === Number(tramo.fin_min);
  return igual ? null : franjaCorta(asig.inicio_min, asig.fin_min);
}

// Ordena a la gente dentro de una celda: primero quien va con el tramo (sin hora escrita),
// luego los demás por hora de entrada, y a igualdad por nombre. Así la columna se lee de
// arriba abajo sin saltos y coincide con el orden del papel.
function ordenarCelda(items) {
  return [...items].sort((a, b) => {
    if (!a.franja && b.franja) return -1;
    if (a.franja && !b.franja) return 1;
    if (a.inicio_min !== b.inicio_min) return a.inicio_min - b.inicio_min;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
}

// Estructura del cuadrante: bloques (tramos) → áreas → 7 días → personas.
//
//   construirCuadrante({ lunes, tramos, areas, asignaciones, trabajadores })
//     → { lunes, dias, bloques: [{ tramo, areas: [{ area, dias: [[{...}]] }] }],
//         fuera, totales }
//
// `fuera` recoge lo que no encaja en ningún tramo o área (turnos sueltos, libranzas,
// vacaciones). No se descarta nunca en silencio: se devuelve aparte para que la interfaz
// pueda enseñarlo. Perder un turno por no encajar en la rejilla sería el peor fallo posible.
// Índice del bloque con el que más se solapa un turno suelto. Devuelve null si no toca
// ninguno: entonces sí es un turno que no pertenece a la rejilla y va a `fuera`.
export function bloqueQueMasSolapa(item, tramos = []) {
  let mejor = null, mejorSolape = 0;
  for (const [i, t] of tramos.entries()) {
    // La fila de descanso no acepta turnos: se calcula sola. Y suele solapar con la tarde
    // (la de la captura iba de 20 a 3), así que sin esto un turno de noche acabaría dentro.
    if (esTramoDescanso(t)) continue;
    const s = Math.min(Number(item.fin_min), Number(t.fin_min)) - Math.max(Number(item.inicio_min), Number(t.inicio_min));
    // `>` y no `>=`: a igualdad gana el primero, que es el de más arriba en el cuadrante.
    if (s > mejorSolape) { mejorSolape = s; mejor = i; }
  }
  return mejor;
}

export function construirCuadrante({ lunes, tramos = [], areas = [], asignaciones = [], trabajadores = [], ausencias = [] }) {
  const dias = diasSemana(lunes);
  const idxDia = new Map(dias.map((d, i) => [d, i]));
  const porId = new Map(trabajadores.map((w) => [String(w.id), w]));
  const tramoPorId = new Map(tramos.map((t) => [String(t.id), t]));

  const bloques = tramos.map((tramo) => ({
    tramo,
    areas: areas.map((area) => ({ area, dias: dias.map(() => []) })),
  }));
  // A propósito NO se indexan los bloques de descanso: si una asignación vieja arrastra el
  // tramo_id de FIESTA, cae en `bloqueQueMasSolapa` y se recoloca donde toca en vez de
  // aparecer como si alguien tuviera turno en la fila de quien libra.
  const idxTramo = new Map(tramos.filter((t) => !esTramoDescanso(t)).map((t) => [String(t.id), tramos.indexOf(t)]));
  const idxArea = new Map(areas.map((a, i) => [String(a.id), i]));

  const fuera = [];
  for (const a of asignaciones) {
    const d = idxDia.get(String(a.dia));
    const w = porId.get(String(a.worker_id));
    const item = {
      id: a.id,
      worker_id: a.worker_id,
      nombre: (w && (w.nombre || w.username)) || a.nombre || "—",
      inicio_min: Number(a.inicio_min),
      fin_min: Number(a.fin_min),
      fin_abierto: !!a.fin_abierto,
      tipo: a.tipo || "turno",
      nota: a.nota || null,
      area_id: a.area_id, tramo_id: a.tramo_id, dia: a.dia,
      franja: franjaSiDifiere(a, tramoPorId.get(String(a.tramo_id))),
      minutos: duracionMin(a.inicio_min, a.fin_min),
    };
    // Un turno sin tramo —un refuerzo de 4 h, o algo metido a mano a una hora suelta— se
    // coloca en el bloque con el que MÁS SE SOLAPA. Sin esto acababa en `fuera`, o sea,
    // fuera de la rejilla del PDF: el refuerzo no aparecía en el cuadrante que se manda al
    // grupo, que es justo donde la gente lo mira.
    //
    // No hace falta nada más: `franjaSiDifiere` ya escribe las horas al lado del nombre
    // cuando no coinciden con las del bloque, que es exactamente lo que se quiere ver de
    // un refuerzo («10-14» junto a quien lo hace, dentro del bloque de mañana).
    const bi = idxTramo.has(String(a.tramo_id)) ? idxTramo.get(String(a.tramo_id)) : bloqueQueMasSolapa(item, tramos);
    const ai = idxArea.get(String(a.area_id));
    if (d == null || bi == null || ai == null || item.tipo !== "turno") { fuera.push(item); continue; }
    bloques[bi].areas[ai].dias[d].push(item);
  }

  for (const b of bloques) for (const ar of b.areas) ar.dias = ar.dias.map(ordenarCelda);

  // La fila de fiesta no se rellena: es el resto de la plantilla. Se calcula aquí, dentro de
  // la misma función que arma la rejilla, para que la pantalla y el PDF no puedan discrepar.
  const descansos = descansosPorDia({ dias, trabajadores, asignaciones, ausencias, areas });
  for (const b of bloques) {
    if (!esTramoDescanso(b.tramo)) continue;
    b.calculado = true;
    // `franja` en vez de `etiqueta`: es el campo que ya pinta el PDF delante del nombre y en
    // gris. Así «vacaciones Manoli» se dibuja igual que «11-15 Isa», sin tocar el layout.
    const conFranja = (celda) => celda.map((x) => ({ ...x, franja: x.etiqueta }));
    b.areas.forEach((ar, i) => { ar.dias = descansos.areas[i].dias.map(conFranja); });
    // Quien esta semana no trabaja ningún día no tiene área. Va en una fila sin rótulo, y se
    // añade como un área más para que el PDF la imprima sin saber nada de este caso.
    if (descansos.sinArea.some((c) => c.length)) {
      b.areas.push({ area: { id: null, nombre: "—" }, dias: descansos.sinArea.map(conFranja) });
    }
  }

  return {
    lunes, dias, bloques, descansos,
    fuera: ordenarCelda(fuera),
    // Los totales cuentan TURNOS, no personas descansando: es el número que dice cuánto
    // trabajo hay planificado esa semana, y meter ahí las fiestas lo haría subir al vaciarse.
    totales: dias.map((_, i) =>
      bloques.reduce((s, b) => s + (esTramoDescanso(b.tramo) ? 0
        : b.areas.reduce((s2, ar) => s2 + ar.dias[i].length, 0)), 0)
    ),
  };
}

// Cuántas personas distintas hay cada día (una persona con turno partido cuenta una vez).
export function personasPorDia(cuadrante) {
  return cuadrante.dias.map((_, i) => {
    const set = new Set();
    for (const b of cuadrante.bloques) for (const ar of b.areas) for (const p of ar.dias[i]) set.add(String(p.worker_id));
    return set.size;
  });
}

// Vista por persona: una fila por trabajador con sus 7 días. Es la que contesta "¿cuántas
// horas le he puesto esta semana?", que es la pregunta que evita las horas extra.
export function porPersona({ lunes, asignaciones = [], trabajadores = [], tramos = [] }) {
  const dias = diasSemana(lunes);
  const idxDia = new Map(dias.map((d, i) => [d, i]));
  const tramoPorId = new Map(tramos.map((t) => [String(t.id), t]));
  const filas = trabajadores.map((w) => ({
    worker: w,
    dias: dias.map(() => []),
    minutos: 0,
    diasTrabajados: 0,
  }));
  const idxW = new Map(trabajadores.map((w, i) => [String(w.id), i]));

  for (const a of asignaciones) {
    const wi = idxW.get(String(a.worker_id));
    const d = idxDia.get(String(a.dia));
    if (wi == null || d == null) continue;
    const item = {
      id: a.id, tipo: a.tipo || "turno",
      inicio_min: Number(a.inicio_min), fin_min: Number(a.fin_min),
      fin_abierto: !!a.fin_abierto,
      area_id: a.area_id, tramo_id: a.tramo_id,
      franja: franjaSiDifiere(a, tramoPorId.get(String(a.tramo_id))),
      etiqueta: franjaCorta(a.inicio_min, a.fin_min, { finAbierto: !!a.fin_abierto }),
      minutos: duracionMin(a.inicio_min, a.fin_min),
    };
    filas[wi].dias[d].push(item);
    if (item.tipo === "turno") filas[wi].minutos += item.minutos;
  }
  for (const f of filas) {
    f.dias = f.dias.map((ds) => ds.sort((a, b) => a.inicio_min - b.inicio_min));
    f.diasTrabajados = f.dias.filter((ds) => ds.some((x) => x.tipo === "turno")).length;
    f.horas = Math.round((f.minutos / 60) * 100) / 100;
  }
  return { dias, filas };
}

// Solapes de una misma persona el mismo día. Es lo único que se comprueba en esta fase:
// el resto de conflictos (descanso, exceso semanal, ausencias) llegan con las tablas de
// contratos y ausencias, que aún no se llenan.
export function solapesDe(asignaciones = []) {
  const porClave = new Map();
  for (const a of asignaciones) {
    if ((a.tipo || "turno") !== "turno") continue;
    const k = `${a.worker_id}|${a.dia}`;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(a);
  }
  const out = [];
  for (const [, lista] of porClave) {
    const orden = [...lista].sort((a, b) => a.inicio_min - b.inicio_min);
    for (let i = 0; i < orden.length - 1; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        if (solapan(orden[i], orden[j])) out.push({ a: orden[i], b: orden[j] });
      }
    }
  }
  return out;
}
