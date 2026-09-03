// Mantenimiento preventivo: las cosas que hay que hacer cada tanto. Lógica PURA.
//
// LA IDEA: un plan NO es una incidencia. Es una regla —«los filtros de aire de Blanes, cada 3
// meses»— que cuando toca FABRICA una incidencia normal y corriente. Por eso el encargado no
// aprende nada nuevo: le aparece una tarea en su lista de siempre y la cierra igual que las
// demás. Y por eso los permisos, los estados, las fotos y el Dashboard siguen funcionando sin
// tocarlos: lo que se genera es una fila más de `maintenance_issues`, con `plan_id` puesto.
//
// LA DECISIÓN QUE IMPORTA: la siguiente vez se cuenta DESDE QUE SE HIZO DE VERDAD, no desde la
// fecha en que tocaba. Si tocaba el 1 de marzo y se hizo el 20, la próxima es el 20 de junio y
// no el 1 de junio. Con el otro criterio, un retraso te deja la siguiente a diez días vista y
// acabas con tareas que nacen ya vencidas, arrastrando la deuda para siempre. El caso
// estacional sale solo: los toldos se limpian en abril, cada 12 meses → el abril siguiente.

export const UNIDADES = ["dias", "meses"];
const texto = (v) => String(v == null ? "" : v).trim();
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(texto(v));

/** Días de un mes concreto (mes 1-12). */
function diasDelMes(anio, mes) { return new Date(Date.UTC(anio, mes, 0)).getUTCDate(); }

/**
 * Sumar meses a una fecha, con TOPE al último día del mes destino.
 *
 * Sin el tope, el 31 de enero + 1 mes daría el 3 de marzo (JavaScript desborda), y un plan
 * mensual creado un día 31 se iría desplazando solo por el calendario hasta acabar en otro
 * mes. 31 de enero + 1 mes = 28 de febrero.
 */
export function sumarMeses(iso, n) {
  if (!esFecha(iso)) return null;
  const [a, m, d] = iso.split("-").map(Number);
  const total = (m - 1) + n;
  const anio = a + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12 + 1;          // 1-12, también con n negativo
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(Math.min(d, diasDelMes(anio, mes))).padStart(2, "0")}`;
}

export function sumarDias(iso, n) {
  if (!esFecha(iso)) return null;
  const d = new Date(iso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Cuándo vuelve a tocar, contando desde `desde`. `null` si el plan o la fecha no valen. */
export function siguienteFecha(desde, { cada_n, unidad } = {}) {
  const n = Number(cada_n);
  if (!Number.isInteger(n) || n < 1) return null;
  if (unidad === "meses") return sumarMeses(desde, n);
  if (unidad === "dias") return sumarDias(desde, n);
  return null;
}

/**
 * Un plan recién dado de alta, a partir de cuándo se hizo la última vez.
 *
 * Se pregunta «¿cuándo se hizo por última vez?» y no «¿cuándo toca la próxima?» porque es la
 * pregunta que la persona sabe contestar. Si nunca se ha hecho, toca HOY: así, al montar esto
 * por primera vez, las tareas aparecen al momento en vez de dentro de tres meses.
 */
export function primeraFecha({ ultima_en, cada_n, unidad }, hoy) {
  if (!esFecha(hoy)) return null;
  if (!esFecha(ultima_en)) return hoy;
  const sig = siguienteFecha(ultima_en, { cada_n, unidad });
  if (!sig) return null;
  return sig < hoy ? hoy : sig;      // se pasó de fecha estando de alta: toca ya, no en el pasado
}

/**
 * Valida lo que llega del formulario. Devuelve { ok, error } o { ok: true, plan }.
 * Estricto a propósito: un plan mal puesto genera tareas mal para siempre, en silencio.
 */
export function validarPlan(datos = {}, hoy) {
  const local = texto(datos.local);
  const titulo = texto(datos.titulo);
  const unidad = texto(datos.unidad);
  const cada_n = Number(datos.cada_n);
  const aviso_dias = datos.aviso_dias == null || datos.aviso_dias === "" ? 0 : Number(datos.aviso_dias);

  if (!local) return { ok: false, error: "Falta el establecimiento" };
  if (!titulo) return { ok: false, error: "Falta el título" };
  if (titulo.length > 200) return { ok: false, error: "El título es demasiado largo" };
  if (!UNIDADES.includes(unidad)) return { ok: false, error: "La periodicidad tiene que ser en días o en meses" };
  if (!Number.isInteger(cada_n) || cada_n < 1) return { ok: false, error: "Cada cuánto tiene que ser un número de 1 o más" };
  // Topes que no son burocracia: «cada 4000 meses» es una errata, y una tarea diaria por aquí
  // sería una lista de la compra, no mantenimiento.
  if (unidad === "meses" && cada_n > 120) return { ok: false, error: "Como mucho, cada 120 meses" };
  if (unidad === "dias" && cada_n > 3650) return { ok: false, error: "Como mucho, cada 3650 días" };
  if (unidad === "dias" && cada_n < 2) return { ok: false, error: "Para algo diario, esto no es la herramienta" };
  if (!Number.isInteger(aviso_dias) || aviso_dias < 0 || aviso_dias > 90) return { ok: false, error: "El aviso previo va de 0 a 90 días" };
  if (datos.ultima_en && !esFecha(datos.ultima_en)) return { ok: false, error: "La fecha de la última vez no es válida" };

  const proxima_en = primeraFecha({ ultima_en: datos.ultima_en, cada_n, unidad }, hoy);
  if (!proxima_en) return { ok: false, error: "No se puede calcular la próxima fecha" };
  // El aviso no puede comerse el ciclo entero: avisar con 30 días para algo que toca cada 15
  // sería generar la siguiente antes de cerrar la anterior.
  const ciclo = unidad === "meses" ? cada_n * 28 : cada_n;
  if (aviso_dias >= ciclo) return { ok: false, error: "El aviso previo es más largo que el propio ciclo" };

  return {
    ok: true,
    plan: {
      local, titulo,
      descripcion: texto(datos.descripcion) || null,
      cada_n, unidad, aviso_dias,
      ultima_en: esFecha(datos.ultima_en) ? datos.ultima_en : null,
      proxima_en,
    },
  };
}

/**
 * De los planes que hay, cuáles hay que materializar HOY.
 *
 * `abiertos` es el conjunto de `plan_id` que ya tienen una incidencia sin resolver. La regla
 * es que si la anterior sigue abierta NO se genera otra: si no limpiaste los filtros en tres
 * meses, el problema no se arregla poniéndote dos tareas — se arregla haciendo la que tienes.
 *
 * Devuelve, por cada uno, la incidencia que hay que crear: `vence_en` es la fecha en que
 * tocaba, y es lo que se guarda en la fila (no la de hoy), para que se vea si va con retraso.
 */
export function planesQueTocan(planes, hoy, abiertos = new Set()) {
  if (!esFecha(hoy)) return [];
  const pendientes = abiertos instanceof Set ? abiertos : new Set(abiertos || []);
  const salida = [];
  for (const p of planes || []) {
    if (!p || p.activo === false || p.activo === 0) continue;
    if (!esFecha(p.proxima_en)) continue;
    if (pendientes.has(p.id)) continue;
    // Se genera cuando llega el día, o `aviso_dias` antes si se pidió antelación.
    const desdeCuando = sumarDias(p.proxima_en, -Math.max(0, Number(p.aviso_dias) || 0));
    if (!desdeCuando || hoy < desdeCuando) continue;
    salida.push({
      plan_id: p.id,
      local: p.local,
      titulo: p.titulo,
      descripcion: p.descripcion || `Mantenimiento periódico: ${p.titulo}.`,
      vence_en: p.proxima_en,
    });
  }
  return salida;
}

/**
 * Cómo queda el plan cuando su incidencia se da por hecha.
 *
 * Aquí es donde vive la decisión de arriba: se cuenta desde `hechaEn`, la fecha real. Y se
 * empuja hasta pasar de hoy, para que cerrar una tarea de hace un año no deje el plan
 * generando de golpe las doce que se saltó.
 */
export function alCompletar(plan, hechaEn, hoy) {
  if (!esFecha(hechaEn)) return null;
  let prox = siguienteFecha(hechaEn, plan);
  if (!prox) return null;
  if (esFecha(hoy)) {
    let guarda = 0;
    while (prox <= hoy && guarda++ < 500) {
      const sig = siguienteFecha(prox, plan);
      if (!sig || sig === prox) break;
      prox = sig;
    }
  }
  return { ultima_en: hechaEn, proxima_en: prox };
}

/** Cómo se lee la periodicidad en pantalla: «cada 3 meses», «cada año», «cada 15 días». */
export function textoCadencia({ cada_n, unidad } = {}) {
  const n = Number(cada_n);
  if (!Number.isInteger(n) || n < 1) return "";
  if (unidad === "meses") {
    if (n === 1) return "cada mes";
    if (n === 12) return "cada año";
    if (n % 12 === 0) return `cada ${n / 12} años`;
    return `cada ${n} meses`;
  }
  if (unidad === "dias") return n === 1 ? "cada día" : `cada ${n} días`;
  return "";
}
