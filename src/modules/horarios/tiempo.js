// Horarios y fichajes — TIEMPO. Lógica pura: sin BD, sin red, y sin leer el reloj por su
// cuenta (el `now` se inyecta siempre). Es la pieza de la que depende todo el módulo.
//
// POR QUÉ EXISTE ESTE FICHERO:
// El resto del proyecto usa `new Date().toISOString().slice(0,10)` para saber "hoy", que es
// UTC. En verano España va dos horas por delante, así que entre las 00:00 y las 02:00 esa
// expresión devuelve el DÍA ANTERIOR — justo la franja en la que se ficha la salida al
// cerrar el restaurante. Aquí nunca se usa: todo pasa por `instanteMadrid`.
//
// TRES IDEAS QUE HAY QUE TENER CLARAS:
//
// 1. TURNOS QUE CRUZAN MEDIANOCHE. Un turno no tiene fecha de fin. Se guarda como minutos
//    desde las 00:00 del día al que pertenece, permitiendo pasar de 1440. Un 20:00→02:00
//    del sábado es inicio_min=1200, fin_min=1560. Sin "+1 día", sin ambigüedad.
//
// 2. DÍA DE NEGOCIO. La jornada de un restaurante no acaba a medianoche. Con un corte a las
//    06:00, un fichaje a las 02:10 del domingo pertenece al SÁBADO. El día de negocio se
//    calcula al escribir el evento y se guarda; no se recalcula nunca, porque cambiar el
//    corte mañana no debe mover los días del pasado.
//
// 3. HORARIO DE VERANO. Las dos noches del año en que el reloj salta:
//      2026-03-29  no existen las 02:00-03:00  → un turno 20:00→03:00 dura 6 h reales
//      2026-10-25  las 02:00-03:00 pasan dos veces → ese mismo turno dura 8 h reales
//    Por eso la duración de lo FICHADO se calcula restando epoch (tiempo real), y la de lo
//    PLANIFICADO restando minutos (el plan es intención de reloj de pared). Esas dos noches
//    difieren de verdad, y esa diferencia debe salir como desviación, no esconderse.

const ZONA = "Europe/Madrid";

// ── Reloj ────────────────────────────────────────────────────────────────────

// Partes de un instante en hora de Madrid. `now` es un Date (o epoch en ms).
// Devuelve { fecha, hora, minutoDia, offsetMin, epochMs }.
export function instanteMadrid(now, zona = ZONA) {
  const d = now instanceof Date ? now : new Date(Number(now));
  const epochMs = d.getTime();
  // "sv-SE" da formato ISO (YYYY-MM-DD HH:MM:SS), que es lo que queremos parsear.
  const local = d.toLocaleString("sv-SE", { timeZone: zona });
  const [fecha, hora] = local.split(" ");
  const [hh, mm] = hora.split(":").map(Number);
  return {
    fecha,
    hora,
    minutoDia: hh * 60 + mm,
    offsetMin: offsetMinutos(epochMs, zona),
    epochMs,
  };
}

// Minutos que la zona va por delante de UTC en ese instante (+60 o +120 en España).
// Se calcula comparando cómo se ve el mismo instante en la zona y en UTC.
export function offsetMinutos(epochMs, zona = ZONA) {
  const d = new Date(Number(epochMs));
  const enZona = new Date(d.toLocaleString("sv-SE", { timeZone: zona }) + "Z");
  const enUtc = new Date(d.toLocaleString("sv-SE", { timeZone: "UTC" }) + "Z");
  return Math.round((enZona - enUtc) / 60000);
}

// Instante ISO con su offset real: "2026-08-09T02:10:00+02:00".
// Se guarda así porque es legible y no pierde información: el offset varía con el DST.
export function isoConOffset(epochMs, zona = ZONA) {
  const { fecha, hora } = instanteMadrid(epochMs, zona);
  const off = offsetMinutos(epochMs, zona);
  const signo = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${fecha}T${hora}${signo}${hh}:${mm}`;
}

// Inverso: de hora local a epoch. Resuelve los dos casos raros del cambio de hora.
//  · Hueco (marzo): las 02:30 no existen → se desplaza hacia delante, a las 03:30.
//  · Solape (octubre): las 02:30 ocurren dos veces → se toma la PRIMERA (offset mayor).
// Devuelve { epochMs, ajustado } para que quien llame sepa si hubo que mover la hora.
export function epochDeLocal(fecha, minutoDia, zona = ZONA) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  const hh = Math.floor(minutoDia / 60), mm = minutoDia % 60;
  const pedido = `${fecha} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  // Leemos la hora local como si fuera UTC y luego probamos los offsets plausibles de
  // alrededor: en un cambio de hora hay dos, y una resta sola se queda con el que no toca.
  const tentativo = Date.UTC(y, m - 1, d, hh, mm, 0);
  const candidatos = [];
  for (const sonda of [tentativo - 7200000, tentativo - 3600000, tentativo, tentativo + 3600000]) {
    const cand = tentativo - offsetMinutos(sonda, zona) * 60000;
    if (!candidatos.includes(cand)) candidatos.push(cand);
  }
  const comoQueda = (epoch) => {
    const v = instanteMadrid(epoch, zona);
    return `${v.fecha} ${v.hora.slice(0, 5)}`;
  };
  // Los que de verdad devuelven la hora pedida. Si hay dos (solape de octubre), gana el
  // más temprano: cuando el reloj marca 02:30 dos veces, la primera es la que cuenta.
  const validos = candidatos.filter((c) => comoQueda(c) === pedido).sort((a, b) => a - b);
  if (validos.length) return { epochMs: validos[0], ajustado: false, real: pedido };
  // Ninguno coincide: la hora no existe (hueco de marzo). Se desplaza HACIA DELANTE, que
  // es lo que hace el reloj: quien tenía turno a las 02:30 entra a las 03:30, no a la 01:30.
  const orden = candidatos.sort((a, b) => a - b);
  const elegido = orden.find((c) => comoQueda(c) >= pedido) ?? orden[orden.length - 1];
  return { epochMs: elegido, ajustado: true, real: comoQueda(elegido) };
}

// ── Calendario, sin objetos Date ─────────────────────────────────────────────
// Algoritmo de Howard Hinnant, el mismo que src/modules/rrhh/ficha.js. Se repite aquí a
// propósito para que este módulo no dependa de RR.HH.; hay un test que comprueba que las
// dos implementaciones coinciden en 3000 fechas seguidas.

function diasCiviles(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function deDiasCiviles(z) {
  z += 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function aDias(fecha) {
  const m = RE_ISO.exec(String(fecha || ""));
  return m ? diasCiviles(+m[1], +m[2], +m[3]) : null;
}
export function deDias(n) {
  const { y, m, d } = deDiasCiviles(Number(n));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function sumaDias(fecha, n) {
  const base = aDias(fecha);
  return base == null ? null : deDias(base + Number(n));
}
export function diasEntre(a, b) {
  const da = aDias(a), db = aDias(b);
  return (da == null || db == null) ? null : db - da;
}
// 0 = lunes … 6 = domingo. OJO: no es el getDay() de JS, que empieza en domingo.
// Coincide con resDiaSemana() del panel (public/panel/app.js), y hay test que lo cruza.
export function diaSemana(fecha) {
  const n = aDias(fecha);
  return n == null ? null : (((n + 3) % 7) + 7) % 7;
}
export function lunesDe(fecha) {
  const dw = diaSemana(fecha);
  return dw == null ? null : sumaDias(fecha, -dw);
}
export function diasSemana(lunes) {
  return aDias(lunes) == null ? [] : Array.from({ length: 7 }, (_, i) => sumaDias(lunes, i));
}

// ── Minutos y turnos ─────────────────────────────────────────────────────────

// "20:30" → 1230. Admite "26:00" (turnos que pasan de medianoche).
export function aMinutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (mi > 59) return null;
  return h * 60 + mi;
}
// 1560 → "02:00" (formato "corto", el del reloj de pared) o "26:00" (formato "absoluto").
export function deMinutos(min, { formato = "corto" } = {}) {
  if (min == null || Number.isNaN(Number(min))) return "";
  const n = Math.round(Number(min));
  const base = formato === "absoluto" ? n : ((n % 1440) + 1440) % 1440;
  const h = Math.floor(base / 60), mi = base % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}
// Etiqueta corta al estilo del PDF de referencia: 660,900 → "11-15".
export function franjaCorta(inicioMin, finMin, { finAbierto = false } = {}) {
  const h = (m) => {
    const base = ((Math.round(m) % 1440) + 1440) % 1440;
    const hh = Math.floor(base / 60), mm = base % 60;
    return mm === 0 ? String(hh) : `${hh}:${String(mm).padStart(2, "0")}`;
  };
  return `${h(inicioMin)}-${finAbierto ? "cierre" : h(finMin)}`;
}
export function duracionMin(inicioMin, finMin) {
  const a = Number(inicioMin), b = Number(finMin);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return b - a;
}
// ¿Se pisan dos turnos del mismo día? Extremos abiertos: 11-15 y 15-19 NO se solapan.
export function solapan(a, b) {
  return a.inicio_min < b.fin_min && b.inicio_min < a.fin_min;
}
// Horas de descanso entre el fin de un turno y el inicio del siguiente. Ambos en minutos
// ABSOLUTOS desde el día de negocio de cada uno; `diasDeDiferencia` los separa.
export function descansoHoras(finMinA, inicioMinB, diasDeDiferencia) {
  const fin = Number(finMinA);
  const ini = Number(inicioMinB) + Number(diasDeDiferencia) * 1440;
  return (ini - fin) / 60;
}

// ── Día de negocio ───────────────────────────────────────────────────────────

// A qué jornada pertenece un instante. Con corte 360 (06:00), las 02:10 del domingo son
// del sábado. Devuelve { dia, minuto } donde `minuto` puede pasar de 1440.
export function diaDeNegocio(fecha, minutoDia, corteMin = 360) {
  const corte = Number(corteMin);
  if (Number(minutoDia) < corte) {
    return { dia: sumaDias(fecha, -1), minuto: Number(minutoDia) + 1440 };
  }
  return { dia: String(fecha), minuto: Number(minutoDia) };
}

// Lo mismo, partiendo de un instante real. Es la puerta de entrada del fichaje.
export function instanteANegocio(now, { corteMin = 360, zona = ZONA } = {}) {
  const i = instanteMadrid(now, zona);
  const neg = diaDeNegocio(i.fecha, i.minutoDia, corteMin);
  return {
    ...i,
    diaNegocio: neg.dia,
    minutoNegocio: neg.minuto,
    iso: isoConOffset(i.epochMs, zona),
  };
}
