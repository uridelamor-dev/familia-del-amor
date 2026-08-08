// Horarios — el generador. PURO y DETERMINISTA: los mismos datos dan siempre el mismo
// cuadrante. Nada de Math.random ni de Date.now aquí dentro.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  ESTO PROPONE UN BORRADOR. NO PUBLICA NADA.                                  │
// │                                                                              │
// │  Lo que sale de aquí entra como borrador con `origen='solver:v1'`, y una      │
// │  persona lo revisa, lo cambia y lo publica. El encargado sabe cosas que no    │
// │  están en ninguna tabla —que hoy hay bautizo, que fulano está de bajón, que   │
// │  el sábado viene un autocar—, y un sistema que decida por él acaba en un      │
// │  cuadrante hecho a mano en un papel y en un módulo que no sirve para nada.    │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// Por qué greedy y no un solver de verdad: no se puede añadir ninguna dependencia (npm
// install no funciona en este proyecto), y un ILP escrito a mano sería peor que esto y
// mucho más difícil de explicar. Lo que sí se hace es escoger bien el orden —el hueco más
// difícil primero— y explicar CADA decisión, que es lo que permite que una persona lo
// revise en dos minutos en vez de rehacerlo entero.
//
// Y lo más importante: cuando no cabe, lo dice. Un generador que rellena huecos con quien
// sea para que "no queden rojos" es peor que no tener generador.

import { diasSemana, solapan, descansoHoras } from "./tiempo.js";
import { contratoVigente } from "./conflictos.js";

export const ORIGEN = "solver:v1";

export const AJUSTES = {
  descansoHoras: 12,       // entre el fin de un turno y el inicio del siguiente
  jornadaHoras: 10,        // máximo en un mismo día
  diasSeguidos: 6,         // sin ningún día libre
  margenSemanalHoras: 2,   // cuánto se puede pasar del contrato antes de descartar a alguien
};

// ── Huecos ───────────────────────────────────────────────────────────────────
// Una necesidad de "2 personas en SALA el sábado por la tarde" son DOS huecos. Trabajar
// con huecos de uno en uno es lo que permite cubrir el mínimo de un sitio y dejar sin
// cubrir el objetivo de otro, en vez de todo o nada.
// Cada cuánto se prueba a colocar un refuerzo dentro de su ventana. 30 min: nadie entra a
// las 10:07, y bajar a 15 duplicaría el trabajo sin cambiar ningún cuadrante real.
export const PASO_REFUERZO = 30;

export function construirHuecos({ lunes, necesidades = [], tramos = [], objetivos = true } = {}) {
  const dias = diasSemana(lunes);
  const porTramo = new Map(tramos.map((t) => [String(t.id), t]));
  const huecos = [];

  for (const n of necesidades) {
    const dia = dias[Number(n.dow)];
    if (!dia) continue;
    if (n.desde && dia < n.desde) continue;                 // necesidad con vigencia
    if (n.hasta && dia > n.hasta) continue;

    // Un refuerzo NO tiene horas fijas: tiene una duración y una ventana donde cabe.
    const duracion = Number(n.duracion_min) || 0;
    const esRefuerzo = duracion > 0;

    let inicio, fin, ventana = null;
    if (esRefuerzo) {
      const vIni = Number(n.ventana_inicio_min);
      const vFin = Number(n.ventana_fin_min);
      if (!Number.isFinite(vIni) || !Number.isFinite(vFin) || vFin - vIni < duracion) continue;
      ventana = { inicio: vIni, fin: vFin, duracion };
      inicio = vIni; fin = vIni + duracion;                 // colocación de partida
    } else {
      const tramo = porTramo.get(String(n.tramo_id));
      if (!tramo) continue;                                 // necesidad de un tramo borrado
      inicio = Number(tramo.inicio_min); fin = Number(tramo.fin_min);
    }

    const minimo = Math.max(0, Number(n.minimo) || 0);
    const objetivo = objetivos ? Math.max(minimo, Number(n.objetivo) || minimo) : minimo;
    for (let i = 0; i < objetivo; i++) {
      huecos.push({
        dia, dow: Number(n.dow), area_id: n.area_id, tramo_id: esRefuerzo ? null : n.tramo_id,
        inicio_min: inicio, fin_min: fin,
        ventana, etiqueta: n.etiqueta || null,
        // Un hueco por encima del mínimo es deseable, no obligatorio. La diferencia manda
        // en el orden: primero se cubren TODOS los mínimos y después se rellena.
        obligatorio: i < minimo,
      });
    }
  }
  return huecos;
}

// Las horas posibles de un hueco. Un turno completo solo tiene una; un refuerzo, todas las
// que quepan en su ventana. Devolverlas así permite que el resto del generador no sepa
// siquiera que existen los refuerzos: para él son varios huecos-candidatos del mismo sitio.
export function colocaciones(hueco) {
  if (!hueco.ventana) return [{ inicio_min: hueco.inicio_min, fin_min: hueco.fin_min }];
  const { inicio, fin, duracion } = hueco.ventana;
  const salida = [];
  for (let ini = inicio; ini + duracion <= fin; ini += PASO_REFUERZO) {
    salida.push({ inicio_min: ini, fin_min: ini + duracion });
  }
  // Si la ventana no es múltiplo del paso, el último trozo se pega al final: si no, un
  // refuerzo de 4 h en una ventana de 18:00 a 00:00 nunca llegaría a acabar a las 00:00.
  const ultimo = fin - duracion;
  if (!salida.length || salida[salida.length - 1].inicio_min !== ultimo) {
    salida.push({ inicio_min: ultimo, fin_min: fin });
  }
  return salida;
}

// ── Elegibilidad ─────────────────────────────────────────────────────────────
// Cada motivo de descarte se devuelve con su nombre. Es lo que permite decirle al
// encargado «el sábado por la noche no hay nadie porque tres están de vacaciones y los
// otros dos ya llevan seis días seguidos», en lugar de dejarle un hueco rojo y mudo.
export function motivoDescarte(worker, hueco, ctx) {
  const { asignadas, ausencias, disponibilidad, contratos, ajustes } = ctx;
  const A = { ...AJUSTES, ...(ajustes || {}) };
  const id = String(worker.id);
  const mias = asignadas.get(id) || [];

  const aus = (ausencias || []).find((a) =>
    String(a.worker_id) === id && (a.estado || "aprobada") === "aprobada" &&
    String(a.desde) <= hueco.dia && hueco.dia <= String(a.hasta));
  if (aus) return { motivo: "ausencia", detalle: aus.tipo };

  const noDisp = (disponibilidad || []).find((d) =>
    String(d.worker_id) === id && Number(d.dow) === hueco.dow && d.preferencia === "no_disponible" &&
    (!d.desde || d.desde <= hueco.dia) && (!d.hasta || d.hasta >= hueco.dia) &&
    solapan({ inicio_min: Number(d.inicio_min), fin_min: Number(d.fin_min) }, hueco));
  if (noDisp) return { motivo: "no_disponible" };

  // Dos sitios a la vez, no.
  const delDia = mias.filter((a) => a.dia === hueco.dia);
  if (delDia.some((a) => solapan(a, hueco))) return { motivo: "solape" };

  const minDia = delDia.reduce((s, a) => s + (a.fin_min - a.inicio_min), 0) + (hueco.fin_min - hueco.inicio_min);
  if (minDia > A.jornadaHoras * 60) return { motivo: "jornada_larga", detalle: Math.round(minDia / 6) / 10 };

  // Descanso entre turnos de DÍAS DISTINTOS. El turno parte de minutos desde las 00:00 de
  // su día de negocio y puede pasar de 1440 (un 20:00→02:00 acaba en 1560), así que la
  // separación se calcula con la diferencia de días: es la única forma de que el cierre de
  // la noche del viernes choque de verdad con la mañana del sábado.
  for (const a of mias) {
    if (a.dia === hueco.dia) continue;                       // el mismo día ya lo cubren solape y jornada
    const dif = diasEntre(a.dia, hueco.dia);
    if (Math.abs(dif) > 2) continue;                          // demasiado lejos para chocar
    const h = dif > 0
      ? descansoHoras(a.fin_min, hueco.inicio_min, dif)       // el turno viejo es anterior
      : descansoHoras(hueco.fin_min, a.inicio_min, -dif);     // el hueco es anterior
    if (h < A.descansoHoras) return { motivo: "descanso", detalle: Math.round(h * 10) / 10 };
  }

  if (diasSeguidosCon(mias, hueco.dia) > A.diasSeguidos) return { motivo: "dias_seguidos" };

  const c = contratoVigente(contratos, worker.id, hueco.dia);
  if (c) {
    const yaMin = mias.reduce((s, a) => s + (a.fin_min - a.inicio_min), 0);
    const topeMin = (Number(c.horas_semana) + A.margenSemanalHoras) * 60;
    if (yaMin + (hueco.fin_min - hueco.inicio_min) > topeMin) return { motivo: "excede_contrato" };
  }
  return null;
}

// Días seguidos si se añadiera `dia`, contando hacia atrás y hacia delante.
function diasSeguidosCon(mias, dia) {
  const trabajados = new Set(mias.map((a) => a.dia));
  trabajados.add(dia);
  let n = 1;
  for (let d = suma(dia, -1); trabajados.has(d); d = suma(d, -1)) n++;
  for (let d = suma(dia, 1); trabajados.has(d); d = suma(d, 1)) n++;
  return n;
}
function suma(iso, n) {
  const d = new Date(iso + "T12:00:00Z");   // mediodía: ningún cambio de hora mueve el día
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

// ── A quién le toca ──────────────────────────────────────────────────────────
// El criterio principal es el DÉFICIT respecto al contrato: quien va más corto de horas
// entra antes. Es lo que de verdad le importa a la gente y a la nómina, y sin ello un
// generador reparte "equitativamente" y deja a media plantilla sin llegar a sus horas.
//
// Después, y solo para desempatar:
//   · quien HA PEDIDO ese día ("prefiere") entra antes que quien solo está disponible;
//   · el que menos fines de semana y menos cierres lleva, para que no caigan siempre
//     sobre los mismos;
//   · y por último el id, para que el resultado sea reproducible.
export function puntuar(worker, hueco, ctx) {
  const { asignadas, disponibilidad, contratos } = ctx;
  const id = String(worker.id);
  const mias = asignadas.get(id) || [];
  const yaMin = mias.reduce((s, a) => s + (a.fin_min - a.inicio_min), 0);
  const c = contratoVigente(contratos, worker.id, hueco.dia);
  const objetivoMin = c ? Number(c.horas_semana) * 60 : 0;

  const prefiere = (disponibilidad || []).some((d) =>
    String(d.worker_id) === id && Number(d.dow) === hueco.dow && d.preferencia === "prefiere" &&
    (!d.desde || d.desde <= hueco.dia) && (!d.hasta || d.hasta >= hueco.dia) &&
    solapan({ inicio_min: Number(d.inicio_min), fin_min: Number(d.fin_min) }, hueco));

  const finesDeSemana = mias.filter((a) => a.dow === 5 || a.dow === 6).length;
  const cierres = mias.filter((a) => a.fin_min > 1380).length;   // acaba pasadas las 23:00

  return {
    // El déficit manda, pero POR HORAS ENTERAS. Al minuto siempre gana el mismo y el
    // reparto se vuelve ciego a todo lo demás; redondeando, dos personas que van igual de
    // cortas empatan y deciden los criterios de abajo.
    deficitH: Math.round((objetivoMin - yaMin) / 60),
    // Cuántos días seguidos quedarían. Poner a alguien seis días seguidos lo deja inservible
    // para el resto de la semana: se prefiere a quien conserva más margen. Es lo que evita
    // que el generador queme a tres personas el lunes y luego no tenga a nadie el jueves.
    seguidos: diasSeguidosCon(mias, hueco.dia),
    prefiere: prefiere ? 1 : 0,
    finesDeSemana, cierres,
    id: Number(worker.id) || 0,
  };
}

const mejorQue = (a, b) =>
  b.deficitH - a.deficitH ||
  b.prefiere - a.prefiere ||
  a.seguidos - b.seguidos ||
  a.finesDeSemana - b.finesDeSemana ||
  a.cierres - b.cierres ||
  a.id - b.id;

// ── El generador ─────────────────────────────────────────────────────────────
// Orden de resolución: PRIMERO todos los huecos obligatorios, y dentro de ellos el más
// difícil (el que menos candidatos tiene). Es la diferencia entre cubrir el sábado noche
// y quedarse sin nadie porque los tres que podían ya están puestos en el martes a mediodía.
export function generarSemana({
  lunes, trabajadores = [], necesidades = [], tramos = [], areas = [],
  ausencias = [], contratos = [], disponibilidad = [], ajustes = {}, objetivos = true,
} = {}) {
  const huecos = construirHuecos({ lunes, necesidades, tramos, objetivos });
  const asignadas = new Map();          // worker_id → [asignaciones ya puestas]
  const ctx = { asignadas, ausencias, contratos, disponibilidad, ajustes };
  const propuestas = [];
  const sinCubrir = [];

  const pendientes = huecos.slice();
  const nombreArea = new Map((areas || []).map((a) => [String(a.id), a.nombre]));
  const nombreTramo = new Map((tramos || []).map((t) => [String(t.id), t.nombre]));

  while (pendientes.length) {
    // Se recalculan los candidatos en cada vuelta: cada asignación cambia quién puede.
    // En un refuerzo se prueban TODAS las horas posibles dentro de su ventana, y cuenta
    // como apta la persona que pueda en alguna de ellas: rechazar a alguien porque no le
    // cuadra la primera colocación sería descartarlo por un horario que aún no existe.
    const evaluados = pendientes.map((h, i) => {
      const opciones = colocaciones(h);
      const aptos = [], descartes = new Map();
      for (const w of trabajadores) {
        let mejor = null, motivo = null;
        for (const c of opciones) {
          const no = motivoDescarte(w, { ...h, ...c }, ctx);
          if (!no) { mejor = c; break; }
          motivo = motivo || no;                 // el primer porqué sirve para explicarlo
        }
        if (mejor) aptos.push({ w, colocacion: mejor });
        else descartes.set(w.id, { worker_id: w.id, nombre: w.nombre || w.username, ...motivo });
      }
      return { h, i, aptos, descartes: [...descartes.values()] };
    });

    // Primero los obligatorios; dentro, el que menos candidatos tiene; y a igualdad, por
    // día y hora, para que el resultado no dependa del orden en que vinieran las filas.
    evaluados.sort((a, b) =>
      (b.h.obligatorio - a.h.obligatorio) ||
      (a.aptos.length - b.aptos.length) ||
      a.h.dia.localeCompare(b.h.dia) ||
      (a.h.inicio_min - b.h.inicio_min) ||
      (Number(a.h.area_id) - Number(b.h.area_id)));

    const elegido = evaluados[0];
    pendientes.splice(elegido.i, 1);

    if (!elegido.aptos.length) {
      // No se rellena con quien sea. Se explica POR QUÉ no hay nadie, agrupado, que es lo
      // que el encargado necesita para arreglarlo (mover una vacación, pedir un cambio).
      const porMotivo = {};
      for (const d of elegido.descartes) (porMotivo[d.motivo] = porMotivo[d.motivo] || []).push(d.nombre);
      sinCubrir.push({
        dia: elegido.h.dia, area: nombreArea.get(String(elegido.h.area_id)) || null,
        // Un refuerzo no tiene tramo, así que se identifica por su etiqueta y sus horas.
        tramo: elegido.h.etiqueta || nombreTramo.get(String(elegido.h.tramo_id)) || null,
        refuerzo: !!elegido.h.ventana,
        obligatorio: elegido.h.obligatorio,
        porque: Object.entries(porMotivo).map(([motivo, quienes]) => ({ motivo, n: quienes.length, quienes })),
      });
      continue;
    }

    const ordenados = elegido.aptos
      .map(({ w, colocacion }) => ({ w, colocacion, p: puntuar(w, { ...elegido.h, ...colocacion }, ctx) }))
      .sort((a, b) => mejorQue(a.p, b.p));
    const { w, colocacion, p } = ordenados[0];

    const asig = {
      worker_id: w.id, nombre: w.nombre || w.username,
      dia: elegido.h.dia, dow: elegido.h.dow,
      area_id: elegido.h.area_id, tramo_id: elegido.h.tramo_id,
      inicio_min: colocacion.inicio_min, fin_min: colocacion.fin_min,
      refuerzo: !!elegido.h.ventana, etiqueta: elegido.h.etiqueta,
      tipo: "turno", origen: ORIGEN,
      // El porqué viaja con la propuesta: es lo que hace que se pueda revisar de un
      // vistazo en vez de tener que reconstruir el razonamiento.
      porque: explicar(p, ordenados.length),
    };
    if (!asignadas.has(String(w.id))) asignadas.set(String(w.id), []);
    asignadas.get(String(w.id)).push(asig);
    propuestas.push(asig);
  }

  return {
    origen: ORIGEN,
    asignaciones: propuestas.sort((a, b) => a.dia.localeCompare(b.dia) || a.inicio_min - b.inicio_min || a.nombre.localeCompare(b.nombre, "es")),
    sinCubrir: sinCubrir.sort((a, b) => (b.obligatorio - a.obligatorio) || a.dia.localeCompare(b.dia)),
    resumen: resumir({ trabajadores, contratos, asignadas, lunes, huecos, sinCubrir, ausencias }),
  };
}

function explicar(p, candidatos) {
  if (candidatos === 1) return "era la única persona disponible";
  if (p.prefiere) return `lo había pedido${p.deficitH > 0 ? ` y le faltan ${p.deficitH} h` : ""}`;
  if (p.deficitH > 0) return `le faltan ${p.deficitH} h para su contrato`;
  if (p.deficitH < 0) return "ya va por encima de su contrato, pero no había nadie mejor";
  return "reparto de días, fines de semana y cierres";
}

// El resumen es lo que se mira ANTES de aceptar el borrador: quién se queda corto de
// horas, quién se pasa, y qué no ha cabido.
function resumir({ trabajadores, contratos, asignadas, lunes, huecos, sinCubrir, ausencias = [] }) {
  const dias = diasSemana(lunes);
  const personas = trabajadores.map((w) => {
    const mias = asignadas.get(String(w.id)) || [];
    const min = mias.reduce((s, a) => s + (a.fin_min - a.inicio_min), 0);
    const c = contratoVigente(contratos, w.id, lunes);
    const contratoMin = c ? Number(c.horas_semana) * 60 : null;
    return {
      id: w.id, nombre: w.nombre || w.username,
      minutos: min, turnos: mias.length,
      contratoMin,
      desviacion: contratoMin == null ? null : min - contratoMin,
      dias: [...new Set(mias.map((a) => a.dia))].length,
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // LA CUENTA DE LA VIEJA, que es la que de verdad explica un cuadrante que no sale.
  // Cuando faltan turnos, la primera pregunta no es "qué ha hecho mal el generador" sino
  // "¿hay gente suficiente para lo que estoy pidiendo?". Casi siempre la respuesta es que
  // no, y decirlo con dos números ahorra media hora de mover fichas en vano.
  const minPedidos = huecos.reduce((s, h) => s + (h.fin_min - h.inicio_min), 0);
  const minMinimos = huecos.filter((h) => h.obligatorio).reduce((s, h) => s + (h.fin_min - h.inicio_min), 0);
  let minDisponibles = 0;
  for (const w of trabajadores) {
    const c = contratoVigente(contratos, w.id, lunes);
    if (!c) continue;
    // Las ausencias descuentan a prorrata: quien está de vacaciones tres de los siete días
    // aporta cuatro séptimos de su contrato, no su contrato entero.
    const fuera = dias.filter((d) => (ausencias || []).some((a) =>
      String(a.worker_id) === String(w.id) && (a.estado || "aprobada") === "aprobada" &&
      String(a.desde) <= d && d <= String(a.hasta))).length;
    minDisponibles += Number(c.horas_semana) * 60 * ((7 - fuera) / 7);
  }

  const capacidad = {
    horasPedidas: Math.round(minPedidos / 6) / 10,
    horasMinimas: Math.round(minMinimos / 6) / 10,
    horasDisponibles: Math.round(minDisponibles / 6) / 10,
    // Solo se afirma cuando la cuenta es clara: si ni siquiera los MÍNIMOS caben en las
    // horas contratadas, ningún reparto lo va a arreglar.
    faltaGente: minMinimos > minDisponibles,
  };
  capacidad.mensaje = capacidad.faltaGente
    ? `Los mínimos de esta semana suman ${capacidad.horasMinimas} h y el equipo disponible tiene ${capacidad.horasDisponibles} h contratadas. No es un problema de reparto: faltan ${Math.round(capacidad.horasMinimas - capacidad.horasDisponibles)} h de plantilla.`
    : null;

  return {
    huecos: huecos.length,
    cubiertos: huecos.length - sinCubrir.length,
    sinCubrirObligatorios: sinCubrir.filter((s) => s.obligatorio).length,
    personas, capacidad,
    // Que alguien se quede a 8 horas de su contrato es un problema de nómina, no un
    // detalle: sale destacado y con nombre.
    cortos: personas.filter((p) => p.desviacion != null && p.desviacion < -60),
    pasados: personas.filter((p) => p.desviacion != null && p.desviacion > 60),
  };
}
