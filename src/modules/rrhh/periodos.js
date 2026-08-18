// RR.HH. — periodos laborales. PURO.
//
// ┌──────────────────────────────────────────────────────────────────────────────┐
// │  EL PROBLEMA: `users.fecha_alta` es UNA SOLA FECHA.                          │
// │                                                                              │
// │  Juan trabajó de 2022 a 2024, se fue, y vuelve en 2026. Con una sola fecha    │
// │  solo caben dos salidas, y las dos son malas: crear `juan.blanes2` —dos       │
// │  personas donde hay una, con el histórico partido— o pisar la fecha de 2022,  │
// │  que BORRA que estuvo aquí dos años y medio.                                  │
// │                                                                              │
// │  Un periodo laboral dice una cosa y solo una: «trabajó aquí entre estas dos   │
// │  fechas». No lleva horas, ni áreas, ni sueldo — eso es el CONTRATO, que vive  │
// │  en `hor_contratos` y puede cambiar varias veces dentro del mismo periodo.    │
// └──────────────────────────────────────────────────────────────────────────────┘
//
// ANTIGÜEDAD: la que se enseña es LA DE LA INCORPORACIÓN ACTUAL, no la suma de periodos.
// Sumarlos daría un número que parece la antigüedad reconocida y no lo es: cuánto se
// reconoce al volver depende del convenio y de lo que se pactara, y eso no lo decide una
// función. Los periodos anteriores se enseñan enteros, con sus fechas, para que quien tenga
// que hacer ese cálculo lo tenga delante.
//
// `fecha_baja` sigue siendo el ÚLTIMO DÍA TRABAJADO, inclusive — el mismo convenio que
// `vigencia.js` y que `hor_contratos.hasta`.

const fecha = (v) => { const s = String(v == null ? "" : v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const ordena = (ps) => [...ps].sort((a, b) => String(a.fecha_alta).localeCompare(String(b.fecha_alta)) || (Number(a.id) || 0) - (Number(b.id) || 0));

/** El periodo abierto, si lo hay. Solo puede haber uno: lo garantiza un índice único. */
export const periodoAbierto = (periodos = []) => ordena(periodos).find((p) => !fecha(p.fecha_baja)) || null;

/** El más reciente, esté abierto o cerrado. Es el que manda para la compatibilidad. */
export const periodoActual = (periodos = []) => ordena(periodos).slice(-1)[0] || null;

/** ¿Trabajaba en esta fecha? En el hueco entre dos periodos la respuesta es NO. */
export function enPeriodo(periodos = [], dia) {
  const d = fecha(dia);
  if (!d) return false;
  return periodos.some((p) => {
    const a = fecha(p.fecha_alta), b = fecha(p.fecha_baja);
    if (a && d < a) return false;
    if (b && d > b) return false;
    return !!a;
  });
}

/**
 * Antigüedad de la incorporación ACTUAL, en años y meses.
 *
 * Deliberadamente NO suma los periodos anteriores. Un «3 años» que en realidad son 2+1 con
 * año y medio de por medio se lee como antigüedad reconocida, y decidir cuánta se reconoce
 * al volver es del convenio, no de aquí.
 */
export function antiguedadActual(periodos = [], hoy) {
  const p = periodoActual(periodos);
  const desde = fecha(p && p.fecha_alta);
  const h = fecha(hoy);
  if (!desde || !h) return null;
  const hasta = fecha(p.fecha_baja) && fecha(p.fecha_baja) < h ? fecha(p.fecha_baja) : h;
  if (hasta < desde) return null;
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (meses < 0) meses = 0;
  const anios = Math.floor(meses / 12), resto = meses % 12;
  const trozo = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const texto = anios && resto ? `${trozo(anios, "año", "años")} y ${trozo(resto, "mes", "meses")}`
    : anios ? trozo(anios, "año", "años")
    : resto ? trozo(resto, "mes", "meses")
    : "menos de un mes";
  return { desde, hasta, meses, anios, mesesResto: resto, texto, cerrado: !!fecha(p.fecha_baja) };
}

/** Los periodos como se leen en una ficha: del más reciente al más antiguo. */
export function historialLegible(periodos = []) {
  return ordena(periodos).reverse().map((p) => ({
    id: Number(p.id), local: p.local || null,
    desde: fecha(p.fecha_alta), hasta: fecha(p.fecha_baja),
    abierto: !fecha(p.fecha_baja), motivo: p.motivo_baja || null,
    texto: `${fecha(p.fecha_alta) || "?"} — ${fecha(p.fecha_baja) || "actual"}`,
  }));
}

/** ¿Se puede recontratar? Devuelve el motivo por el que NO, o null. */
export function motivoNoRecontratar(periodos = [], desde) {
  const abierto = periodoAbierto(periodos);
  if (abierto) return "Ya está en plantilla: su última incorporación sigue abierta.";
  const d = fecha(desde);
  if (!d) return "Falta la fecha de la nueva incorporación.";
  const ultimo = periodoActual(periodos);
  // Volver ANTES de haberse ido sería un solape: dos periodos vivos el mismo día y una
  // antigüedad que depende de cuál se lea primero.
  if (ultimo && fecha(ultimo.fecha_baja) && d <= fecha(ultimo.fecha_baja)) {
    return `Su último día fue el ${fecha(ultimo.fecha_baja)}: la nueva incorporación tiene que ser posterior.`;
  }
  return null;
}

/** Solapes en un histórico ya existente. De solo lectura: se enseñan, no se arreglan. */
export function periodosSolapados(periodos = []) {
  const o = ordena(periodos), fuera = [];
  for (let i = 0; i < o.length - 1; i++) {
    const a = o[i], finA = fecha(a.fecha_baja);
    for (let j = i + 1; j < o.length; j++) {
      const b = o[j];
      if (!finA || fecha(b.fecha_alta) <= finA) fuera.push({ a: Number(a.id), b: Number(b.id) });
    }
  }
  return fuera;
}

/**
 * ¿Se puede crear el periodo inicial de alguien a partir de `users`?
 *
 * SOLO si los datos son deterministas. Sin fecha de alta no se inventa ninguna: ni hoy, ni
 * el primer fichaje, ni 1970. Esa fecha decide antigüedad y finiquito, y ponerla a ojo es
 * escribir un dato que parece bueno y no lo es. Se diagnostica y lo arregla una persona.
 */
export function periodoInicialDe(persona) {
  const alta = fecha(persona && persona.fecha_alta);
  const baja = fecha(persona && persona.fecha_baja);
  if (!alta) return { migrable: false, motivo: "sin fecha de alta" };
  if (baja && baja < alta) return { migrable: false, motivo: "la baja es anterior al alta" };
  return { migrable: true, periodo: { worker_id: persona.id, local: persona.local || null, fecha_alta: alta, fecha_baja: baja } };
}

/** Lo que hay que dejar en `users` para que el código de siempre siga funcionando. */
export function compatibilidadUsers(periodos = []) {
  const p = periodoActual(periodos);
  return p ? { fecha_alta: fecha(p.fecha_alta), fecha_baja: fecha(p.fecha_baja) } : { fecha_alta: null, fecha_baja: null };
}
