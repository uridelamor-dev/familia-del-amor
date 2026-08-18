// Horarios/Fichajes — los cuatro parámetros que decidían cosas y solo se podían cambiar
// entrando en PostgreSQL. PURO.
//
// Cada uno se describe con lo que HACE, no con su nombre de columna. «tolerancia_min = 10»
// no dice nada; «avisar cuando alguien entra o sale más de 10 minutos fuera de su turno» sí,
// y es la diferencia entre que alguien lo ajuste con criterio o no lo toque nunca.
//
// OJO CON LA DIFERENCIA que más se confunde, porque los dos valen 10 por defecto:
//   · `tolerancia_min`       decide si se PINTA UN AVISO. No mueve ni un minuto de nadie.
//   · `tolerancia_bolsa_min` decide HORAS QUE SE DEBEN O SE COBRAN.
// Por eso son dos columnas y no una, y por eso aquí se explican por separado.

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const PARAMETROS = {
  tolerancia_min: {
    etiqueta: "Margen para avisar de una entrada o salida",
    unidad: "minutos", min: 0, max: 60, defecto: 10, editable: true,
    ayuda: "Si alguien entra o sale con más diferencia que esta respecto a su turno, la jornada se marca para revisar. " +
           "No mueve ni un minuto de sus horas: solo decide qué se te señala.",
    ejemplo: (v) => `Con ${v} min: entrar ${v - 1} tarde no se señala; entrar ${v + 1} sí.`,
  },
  tolerancia_bolsa_min: {
    etiqueta: "Franquicia de la bolsa por jornada",
    unidad: "minutos", min: 0, max: 120, defecto: 10, editable: true,
    ayuda: "Los primeros minutos de diferencia con el cuadrante —de más o de menos— no suman ni restan en la bolsa. " +
           "Solo se apunta lo que pase de ahí, y se aplica a cada día por separado.",
    ejemplo: (v) => `Con ${v} min: una diferencia de +${v + 1} apunta +1, y una de +${v + 15} apunta +15. ` +
                    `Dos días de +${Math.max(v - 1, 0)} siguen sumando cero.`,
    aviso: "Esto decide horas que se deben o se cobran. El margen de arriba solo decide avisos.",
  },
  dia_inicio_periodo: {
    etiqueta: "Día en que empieza el mes de nómina",
    unidad: "día del mes", min: 1, max: 28, defecto: 1, editable: true,
    ayuda: "Marca el corte con el que se agrupan las horas y se cierra cada periodo.",
    ejemplo: (v) => v === 1
      ? "Del primer al último día de cada mes."
      : `Del ${v} de cada mes al ${v - 1} del siguiente. El periodo se llama por el mes en que TERMINA.`,
  },
  corte_dia_min: {
    etiqueta: "Hora a la que empieza el día de trabajo",
    unidad: "hora", min: 0, max: 720, defecto: 360, editable: false,
    ayuda: "Decide a qué jornada pertenece un fichaje de madrugada.",
    ejemplo: (v) => `A las ${hhmm(v)}. Quien sale a las 02:10 del domingo cierra la jornada del sábado.`,
    // NO SE DEJA EDITAR. Cambiarlo REINTERPRETA fichajes ya registrados: los de madrugada
    // saltarían de un día a otro, y con ellos las horas validadas, la bolsa y periodos que
    // pueden estar cerrados. Una pantalla bonita no justifica poder mover una nómina
    // firmada. Si algún local lo necesita, se hace a mano y mirando qué arrastra.
    porQueNo: "Cambiarlo movería fichajes de madrugada de un día a otro, y con ellos horas ya validadas y periodos cerrados. " +
              "Si de verdad hace falta cambiarlo en algún establecimiento, se hace a mano revisando qué arrastra.",
  },
};

/** La configuración tal como se enseña: valor, texto y si se puede tocar. */
export function configLegible(fila = {}, { puedeEditar = false } = {}) {
  return Object.entries(PARAMETROS).map(([clave, p]) => {
    const v = Number(fila[clave] ?? p.defecto);
    const valor = Number.isFinite(v) ? v : p.defecto;
    return {
      clave, etiqueta: p.etiqueta, unidad: p.unidad, valor,
      // El corte se enseña como hora, no como «360 minutos desde medianoche».
      valorTexto: clave === "corte_dia_min" ? hhmm(valor) : String(valor),
      ayuda: p.ayuda, ejemplo: p.ejemplo(valor), aviso: p.aviso || null,
      min: p.min, max: p.max, defecto: p.defecto,
      editable: !!p.editable && puedeEditar,
      porQueNo: p.editable ? null : p.porQueNo,
    };
  });
}

/** Valida un cambio. Devuelve el motivo por el que NO, o null. */
export function motivoNoGuardar(clave, valor) {
  const p = PARAMETROS[clave];
  if (!p) return "Ese ajuste no existe.";
  if (!p.editable) return p.porQueNo;
  const v = Number(valor);
  if (!Number.isInteger(v)) return "Tiene que ser un número entero.";
  if (v < p.min || v > p.max) return `Tiene que estar entre ${p.min} y ${p.max}.`;
  return null;
}

/**
 * Qué cambia y qué NO. Lo segundo importa más: cambiar la franquicia de 10 a 5 no reescribe
 * ni un saldo de los que ya hay, porque la clave de un movimiento sale de los fichajes del
 * día y no de la franquicia. Sin decirlo, alguien la bajaría esperando ver subir los saldos
 * viejos, no pasaría nada, y volvería a bajarla.
 */
export const AVISO_NO_RETROACTIVO =
  "Los cambios valen para lo que se valide a partir de ahora. Nada de lo ya registrado se recalcula: " +
  "los saldos, las horas validadas y los periodos cerrados se quedan exactamente como están.";
