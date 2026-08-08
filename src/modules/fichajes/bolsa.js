// Fichajes — bolsa de horas y periodos. PURO.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  LA BOLSA ES UN LIBRO DE MOVIMIENTOS, NO UN CAMPO `saldo`.                   │
// │                                                                              │
// │  Un `saldo` que se suma y se resta se descuadra el primer día que dos cosas   │
// │  pasan a la vez, y cuando se descuadra no hay forma de saber cuándo ni por    │
// │  qué: solo queda un número que alguien tiene que creerse. Con un libro, el    │
// │  saldo es `SUM(minutos)` y siempre se puede señalar de dónde sale cada        │
// │  minuto. Corregir no modifica nada: se escribe un CONTRA-ASIENTO que anula    │
// │  el movimiento viejo, y luego el nuevo. Los dos se quedan.                    │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// La idempotencia es lo que permite recalcular un mes entero sin miedo: cada movimiento
// lleva una clave que incluye la firma de los eventos que lo generaron. Recalcular tres
// veces con los mismos datos produce UN movimiento; si los datos cambian, la clave cambia
// y hace falta contra-asentar el anterior.

export const CONCEPTOS = {
  jornada:      "Diferencia entre lo validado y lo que tocaba",
  ajuste:       "Ajuste manual",
  contra:       "Anulación de un movimiento anterior",
  liquidacion:  "Horas pagadas o disfrutadas",
  arrastre:     "Saldo que viene del periodo anterior",
};

// ── Periodos de nómina ───────────────────────────────────────────────────────
// `diaInicio = 1` es el mes natural. `diaInicio = 21` es el otro caso habitual en
// hostelería (del 21 al 20), y entonces el periodo se ETIQUETA con el mes en que TERMINA:
// el que va del 21 de julio al 20 de agosto es la nómina de agosto, que es como lo llama
// todo el mundo. Es un ajuste de configuración, no una decisión que haya que tomar ahora.
export function periodoDe(dia, { diaInicio = 1 } = {}) {
  const [a, m, d] = String(dia).split("-").map(Number);
  if (!a || !m || !d) return null;
  const ini = Math.min(Math.max(Number(diaInicio) || 1, 1), 31);

  // El día de arranque se recorta al último día que EXISTE en cada mes: con `ini = 31`,
  // en febrero el periodo arranca el 28. Recortar solo el final —o no recortarlo— dejaba
  // el 28 de febrero fuera de todos los periodos y generaba un "2026-02-31" imposible.
  const arranque = (ya, ym) => Math.min(ini, diasDelMes(ya, ym));

  let ya = a, ym = m;
  if (d < arranque(a, m)) { ym -= 1; if (ym === 0) { ym = 12; ya -= 1; } }
  const desde = fecha(ya, ym, arranque(ya, ym));

  let sa = ya, sm = ym + 1;
  if (sm === 13) { sm = 1; sa += 1; }
  const hasta = restaUnDia(fecha(sa, sm, arranque(sa, sm)));

  return { desde, hasta, etiqueta: hasta.slice(0, 7), diaInicio: ini };
}

const dosD = (n) => String(n).padStart(2, "0");
const fecha = (a, m, d) => `${a}-${dosD(m)}-${dosD(d)}`;
function restaUnDia(f) {
  let [a, m, d] = f.split("-").map(Number);
  d -= 1;
  if (d === 0) { m -= 1; if (m === 0) { m = 12; a -= 1; } d = diasDelMes(a, m); }
  return fecha(a, m, d);
}
const bisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const diasDelMes = (a, m) => [31, bisiesto(a) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

export function periodosEntre(desde, hasta, { diaInicio = 1 } = {}) {
  const salida = [];
  let p = periodoDe(desde, { diaInicio });
  while (p && p.desde <= hasta) {
    salida.push(p);
    const siguiente = periodoDe(sumaDia(p.hasta), { diaInicio });
    if (!siguiente || siguiente.desde === p.desde) break;
    p = siguiente;
  }
  return salida;
}
function sumaDia(f) {
  let [a, m, d] = f.split("-").map(Number);
  d += 1;
  if (d > diasDelMes(a, m)) { d = 1; m += 1; if (m === 13) { m = 1; a += 1; } }
  return fecha(a, m, d);
}

// ── El libro ─────────────────────────────────────────────────────────────────
// La clave lleva dentro la firma de los eventos: si cambia el registro del día, cambia la
// clave y el movimiento viejo deja de valer.
export const claveJornada = (workerId, dia, firma) => `jornada:${workerId}:${dia}:${hash32(String(firma || ""))}`;

// Hash corto y estable. No es criptográfico y no tiene por qué serlo: solo distingue
// versiones del mismo día. (FNV-1a de 32 bits.)
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

// El saldo es la suma de TODO. Sin filtros y sin excepciones: si un movimiento ya no debe
// contar, es porque hay un contra-asiento que lo compensa, y los dos suman cero.
//
// Hubo una versión de esto que además marcaba el movimiento viejo como anulado Y escribía
// el contra-asiento: la corrección se descontaba dos veces. Un solo mecanismo, no dos.
export const saldoDe = (movimientos = []) =>
  movimientos.reduce((s, m) => s + Number(m.minutos || 0), 0);

// Cuál es el movimiento vigente de un día: el de concepto `jornada` que NADIE ha
// contra-asentado. No hace falta ninguna columna de estado para saberlo.
export function vigentesDeJornada(movimientos = []) {
  const contrarrestados = new Set(
    movimientos.filter((m) => m.concepto === "contra" && m.referencia_id != null).map((m) => Number(m.referencia_id)));
  return movimientos.filter((m) => m.concepto === "jornada" && !contrarrestados.has(Number(m.id)));
}

// Qué hay que escribir para que el día quede reflejado. Devuelve SIEMPRE lo que hay que
// INSERTAR: nunca lo que hay que modificar, porque no se modifica nada.
//
//   · Si ya existe un movimiento vigente con esta misma clave → no hay nada que hacer.
//   · Si existen movimientos de este día con OTRA clave → están obsoletos: se contra-asientan
//     y se escribe el nuevo. Los tres se quedan en el libro.
//   · Si el resultado es 0 minutos y no había nada, no se escribe una fila de cero.
export function movimientosParaJornada({
  workerId, local, dia, minutos, firma, periodo, existentes = [], autor = "sistema", nota = null,
} = {}) {
  const clave = claveJornada(workerId, dia, firma);
  const vigentes = vigentesDeJornada(existentes);
  if (vigentes.some((m) => m.clave_idem === clave)) return { insertar: [], sinCambios: true };

  const insertar = vigentes.map((m) => ({
    worker_id: workerId, local, dia, periodo, concepto: "contra", minutos: -Number(m.minutos || 0),
    clave_idem: `contra:${m.id}`, referencia_id: m.id, autor,
    nota: "Anula el movimiento anterior de este día porque el registro cambió",
  }));
  if (minutos !== 0 || vigentes.length) {
    insertar.push({ worker_id: workerId, local, dia, periodo, concepto: "jornada", minutos, clave_idem: clave, autor, nota });
  }
  return { insertar, sinCambios: false };
}

// ── Cierre ───────────────────────────────────────────────────────────────────
// Un periodo cerrado no admite fichajes nuevos ni correcciones: lo que entra después va
// al periodo siguiente, con su nota. Sin esto, corregir un día de marzo en noviembre
// cambiaría una nómina ya pagada y nadie se enteraría.
export function estaCerrado(cierres = [], local, dia) {
  return cierres.some((c) => c.local === local && c.desde <= dia && dia <= c.hasta && !c.reabierto_en);
}

export function motivoBloqueo(cierres, local, dia) {
  const c = cierres.find((x) => x.local === local && x.desde <= dia && dia <= x.hasta && !x.reabierto_en);
  if (!c) return null;
  return `El periodo ${c.etiqueta} (del ${c.desde} al ${c.hasta}) está cerrado desde el ${String(c.cerrado_en || "").slice(0, 10)}. ` +
         "Para tocar ese día hay que reabrirlo, y queda constancia de quién lo hizo.";
}
