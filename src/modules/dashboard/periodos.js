// Dashboard — rangos de periodo (Hoy / Ayer / Semana / Mes / personalizado). PURO y testeable.
// "hoy" se inyecta (YYYY-MM-DD) para ser determinista; el resto se deriva de él.

function addDays(iso, n) { const d = new Date(iso + "T00:00:00.000Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// Día de la semana con lunes=0 … domingo=6 (para acotar "esta semana").
export function diaSemanaLunes(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  return (((yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1] + d) % 7) + 6) % 7;
}

// Devuelve { preset, from, to, label } para un preset dado y la fecha de hoy.
export function rangoPreset(preset, hoy) {
  switch (String(preset)) {
    case "hoy": return { preset: "hoy", from: hoy, to: hoy, label: "Hoy" };
    case "ayer": { const a = addDays(hoy, -1); return { preset: "ayer", from: a, to: a, label: "Ayer" }; }
    case "semana": { const lun = addDays(hoy, -diaSemanaLunes(hoy)); return { preset: "semana", from: lun, to: hoy, label: "Esta semana" }; }
    case "mes": { const m1 = hoy.slice(0, 8) + "01"; return { preset: "mes", from: m1, to: hoy, label: "Este mes" }; }
    default: { const lun = addDays(hoy, -diaSemanaLunes(hoy)); return { preset: "semana", from: lun, to: hoy, label: "Esta semana" }; }
  }
}

// Nº de días del rango [from, to] inclusive.
export function diasEntre(from, to) {
  if (!from || !to || from > to) return 0;
  let d = from, n = 0;
  while (d <= to && n < 4000) { n++; d = addDays(d, 1); }
  return n;
}

// Etiqueta corta del rango (un día → la fecha; si no, "from → to").
export function etiquetaRango(from, to) {
  if (!from || !to) return "";
  return from === to ? from : `${from} → ${to}`;
}

/**
 * El periodo ANTERIOR con el que comparar, y cómo se llama. Una cifra sola no dice nada:
 * «17.000 €» solo significa algo al lado de con cuánto se compara.
 *
 * DOS REGLAS QUE NO SON OBVIAS, Y LAS DOS SON DE HOSTELERÍA:
 *
 * 1. **Un mes se compara con el mes anterior**, no con «los 31 días de antes». Agosto contra
 *    julio, aunque julio tenga un día más. Y «lo que va de mes» con el mismo trozo del mes
 *    anterior: del 1 al 11 de agosto contra del 1 al 11 de julio, no contra los once días de
 *    antes —que son del 21 al 31, otra parte del mes y con otro ritmo—.
 *
 * 2. **Una semana se compara con la semana de antes, día por día.** Esto importa más de lo que
 *    parece: si el lunes y el martes se compararan con «los dos días anteriores», se estarían
 *    comparando con el sábado y el domingo. En un restaurante eso no es una comparación, es un
 *    disparate — y encima uno que parece un dato.
 *
 * `preset` («hoy» | «ayer» | «semana» | «mes» | «custom») lo sabe quien pregunta, así que se
 * usa cuando viene: un rango de once días puede ser «lo que va de mes» o una ventana de once
 * días, y mirando solo las fechas no hay forma de saberlo.
 *
 * La `etiqueta` es CORTA a propósito («la semana pasada», «julio»): va pegada al porcentaje
 * dentro de una tarjeta, y una frase larga la parte en cuatro líneas. El detalle exacto —qué
 * fechas son— viaja aparte en `from`/`to` y se enseña al pasar el ratón.
 *
 *   → { from, to, etiqueta } o null si el rango no es válido.
 */
export function rangoAnterior(from, to, preset) {
  if (!from || !to || from > to) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;

  const dias = diasEntre(from, to);
  const p = String(preset || "");
  const empiezaMes = from.slice(8) === "01";
  // Sin preset hay que adivinar: un rango que empieza el día 1 y dura más de dos semanas es un
  // mes; uno corto es una ventana de días, aunque empiece el 1.
  const esMes = p === "mes" || (!p && empiezaMes && (dias > 14 || esMesEntero(from, to)));
  const esSemanal = p === "semana" || (!p && !esMes && dias > 1 && dias <= 14);

  if (esMes && empiezaMes) {
    const [y, m] = from.split("-").map(Number);
    const ym = m === 1 ? [y - 1, 12] : [y, m - 1];
    const mesPrev = `${String(ym[0]).padStart(4, "0")}-${String(ym[1]).padStart(2, "0")}`;
    const ultimo = ultimoDiaDeMes(ym[0], ym[1]);
    // Mes entero → mes entero. Mes a medias → el mismo trozo, sin pasarse del último día (un
    // 31 en un mes de 30 se queda en el 30, no salta al 1 del siguiente).
    const entero = esMesEntero(from, to);
    const finPrev = entero ? ultimo : Math.min(Number(to.slice(8)), ultimo);
    return {
      from: `${mesPrev}-01`, to: `${mesPrev}-${String(finPrev).padStart(2, "0")}`,
      etiqueta: MESES[ym[1] - 1],
    };
  }

  if (dias === 1) return { from: addDays(from, -1), to: addDays(to, -1), etiqueta: "ayer" };

  if (esSemanal) {
    return {
      from: addDays(from, -7), to: addDays(to, -7),
      etiqueta: "la semana pasada",
    };
  }

  return { from: addDays(from, -dias), to: addDays(from, -1), etiqueta: "el periodo anterior" };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function ultimoDiaDeMes(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function esMesEntero(from, to) {
  if (from.slice(8) !== "01" || from.slice(0, 7) !== to.slice(0, 7)) return false;
  const [y, m] = from.split("-").map(Number);
  return Number(to.slice(8)) === ultimoDiaDeMes(y, m);
}

/**
 * La variación entre dos cifras, en porcentaje. Devuelve null cuando la comparación NO
 * significa nada, que es la mitad de la gracia: sin dato anterior, o con un anterior de cero,
 * cualquier porcentaje es mentira («+100 %» respecto a nada no es una subida, es un estreno).
 */
export function variacion(actual, anterior) {
  // `null` no es cero, y en JavaScript `Number(null)` sí lo es: sin esta comprobación, «no hay
  // dato» se convertiría en «cayó un 100 %», que es exactamente la clase de cifra falsa que
  // parece revisada.
  if (actual == null || anterior == null || actual === "" || anterior === "") return null;
  const a = Number(actual), b = Number(anterior);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.round(((a - b) / Math.abs(b)) * 1000) / 10;
}
