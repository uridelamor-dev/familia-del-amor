// Quién se apuntó por un formulario. PURO: sin BD, sin Express, sin red.
//
// ── NO HAY CENSO NUEVO ───────────────────────────────────────────────────────────────────────
//
// Todo esto sale de lo que ya se guardaba: `leads` (quién), `marketing_prefs` (si pidió que le
// dejaran en paz), `fid_consentimientos` (qué aceptó y cuándo), `pro_qr` (su carné) y `cap_cola`
// (si le salió el mensaje). Una tabla paralela habría sido una segunda verdad sobre las mismas
// personas, y la que se quedara sin mantener sería la que alguien mirara.
//
// ── DOS FORMULARIOS, UNA CLAVE ───────────────────────────────────────────────────────────────
//
// El formulario histórico escribe `leads.campana = '<clave>'`. El configurable nació escribiendo
// solo `fuente = 'form:<clave>'`. Se unen las dos por IGUALDAD EXACTA —`campana = ?` O
// `fuente = ?`—, nunca con un `LIKE` abierto: `LIKE 'form:%'` mezclaría campañas distintas, y
// `LIKE '%girona%'` se llevaría por delante cualquier clave que contenga esa palabra.
//
// A partir de ahora el configurable escribe también `campana`, así que el respaldo por `fuente`
// solo hace falta para lo que ya está guardado. No se migra nada: lo escrito, escrito está.

// ── LOS ESTADOS ──────────────────────────────────────────────────────────────────────────────
//
// SON DOS COSAS DISTINTAS Y NO SE MEZCLAN:
//
//   consentimiento  ¿se le puede escribir? activo o baja.
//   entrega         ¿le llegó su código? y por dónde.
//
// Meterlas en una sola etiqueta obligaba a decidir qué gana, y las dos importan: alguien de baja
// que sí recibió su código no es lo mismo que alguien de baja al que nunca le llegó nada.

/** ¿Se le puede escribir? Cerrado. */
export const CONSENTIMIENTO = Object.freeze(["activo", "baja"]);

/**
 * Qué pasó con su código. Cerrado, y ordenado de peor a mejor noticia.
 *
 * ── «CARNÉ DISPONIBLE» NO ES «CÓDIGO ENVIADO» ───────────────────────────────────────────────
 *
 * El formulario configurable NO manda nada: enseña el enlace del carné en la pantalla y ahí
 * acaba. No queda ninguna evidencia de que esa persona lo viera —pudo cerrar la pestaña antes de
 * que cargara—, así que llamarlo «entregado» sería afirmar algo que no consta.
 *
 * `carne_disponible` dice exactamente lo que se sabe: existe un carné suyo y está a su nombre.
 * Ni más.
 */
export const ENTREGA = Object.freeze([
  "sin_carne",        // no hay carné: el alta se quedó a medias
  "fallido",          // se intentó mandar y no salió
  "pendiente",        // está en la cola, todavía no ha salido
  "carne_disponible", // hay carné, pero NO consta que se le haya mandado ni que lo viera
  "enviado",          // consta la fecha en que salió el WhatsApp
]);

/** Cómo se llama cada cosa en la pantalla. Frases, no códigos. */
export const ETIQUETA = Object.freeze({
  activo: "Activo",
  baja: "Baja",
  sin_carne: "Sin carné",
  fallido: "Falló el envío",
  pendiente: "En la cola",
  carne_disponible: "Carné disponible",
  enviado: "Enviado por WhatsApp",
});

/** Lo que significa cada estado, para quien lo mire sin contexto. */
export const AYUDA = Object.freeze({
  activo: "Se le puede escribir.",
  baja: "Pidió dejar de recibir comunicaciones. Sigue aquí como histórico, pero se excluye de todos los envíos.",
  sin_carne: "No llegó a generarse su carné. El alta se quedó a medias.",
  fallido: "Se intentó mandar el mensaje y no salió. Se puede reintentar desde la cola.",
  pendiente: "Está en la cola de WhatsApp, todavía no ha salido.",
  carne_disponible: "Tiene carné a su nombre. No consta que se le haya enviado: en este formulario el código se enseña en pantalla, y de eso no queda registro.",
  enviado: "Consta la fecha en que salió su WhatsApp.",
});

/**
 * El estado de entrega de una persona, a partir de lo que se sabe de ella.
 *
 * `cola` y `carnet` vienen YA AGREGADOS por teléfono: una fila por persona. Si llegaran sin
 * agregar, alguien con tres mensajes en la cola contaría tres veces.
 */
export function estadoEntrega({ carnetVivos = 0, carnetEnviadoEn = null,
                                colaEnviadoEn = null, colaPendientes = 0, colaFallidos = 0 } = {}) {
  // Que conste una fecha de envío es la única evidencia fuerte que hay.
  if (colaEnviadoEn || carnetEnviadoEn) return "enviado";
  if (Number(colaPendientes) > 0) return "pendiente";
  if (Number(colaFallidos) > 0) return "fallido";
  if (Number(carnetVivos) > 0) return "carne_disponible";
  return "sin_carne";
}

/** ¿Está de baja? Basta con que lo diga cualquiera de los dos sitios donde se anota. */
export const estadoConsentimiento = ({ prefBaja = 0, consentimientosDeBaja = 0 } = {}) =>
  (Number(prefBaja) === 1 || Number(consentimientosDeBaja) > 0) ? "baja" : "activo";

// ── LOS FILTROS ──────────────────────────────────────────────────────────────────────────────

/** Cuántos se piden de una vez. Nunca «todos»: el censo entero no cabe en una pantalla. */
export const POR_PAGINA = 50;
export const POR_PAGINA_MAX = 200;
/** El tope del CSV. Es un fichero que sale del sistema; no puede ser ilimitado. */
export const CSV_MAX = 5000;

/**
 * Sanea lo que llega por la URL. Devuelve SOLO valores de listas cerradas y números acotados.
 *
 * Nada de esto se concatena en el SQL: se usa para decidir QUÉ trozo de consulta se añade, y los
 * valores van siempre como parámetros.
 */
export function filtrosSeguros(q = {}) {
  const texto = (v, max) => {
    const t = String(v == null ? "" : v).replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
    return t ? t.slice(0, max) : null;
  };
  const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
  const entero = (v, min, max, def) => {
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
  };

  const consentimiento = CONSENTIMIENTO.includes(String(q.consentimiento)) ? String(q.consentimiento) : null;
  const entrega = ENTREGA.includes(String(q.entrega)) ? String(q.entrega) : null;

  return {
    buscar: texto(q.buscar, 80),
    poblacion: texto(q.poblacion, 120),
    desde: fecha(q.desde),
    hasta: fecha(q.hasta),
    consentimiento,
    entrega,
    limite: entero(q.limite, 1, POR_PAGINA_MAX, POR_PAGINA),
    offset: entero(q.offset, 0, 100000, 0),
  };
}

/** Los filtros que de verdad se aplicaron, para dejarlos escritos en la auditoría. */
export function filtrosAplicados(f) {
  const out = {};
  for (const k of ["buscar", "poblacion", "desde", "hasta", "consentimiento", "entrega"]) {
    if (f[k]) out[k] = k === "buscar" ? `«${String(f[k]).length} car.»` : f[k];
  }
  return out;
}

// ── EL CSV ───────────────────────────────────────────────────────────────────────────────────

/**
 * Las columnas que salen. SIN TELÉFONO, y no es un olvido.
 *
 * Un CSV sale del sistema: se abre en un portátil, se manda por correo y se queda en una carpeta
 * compartida durante años. El teléfono se consulta en la ficha del cliente, que tiene sus
 * permisos y deja rastro de quién entró; en un fichero suelto no hay ni lo uno ni lo otro.
 */
export const COLUMNAS_CSV = Object.freeze([
  ["fecha", "Fecha de inscripción"],
  ["nombre", "Nombre"],
  ["apellidos", "Apellidos"],
  ["poblacion", "Población"],
  ["campana", "Campaña"],
  ["formulario", "Formulario"],
  ["consentimiento", "Consentimiento"],
  ["entrega", "Estado del código"],
]);

const celda = (v) => {
  const t = String(v == null ? "" : v).replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").trim();
  // Comillas dobladas, y entre comillas siempre: un nombre con `;` partiría la fila en dos.
  return `"${t.replace(/"/g, '""')}"`;
};

/** BOM, `;` y CRLF: es lo que Excel en español abre a la primera, como el resto de los CSV. */
export function csvInscritos(filas = []) {
  const cabecera = COLUMNAS_CSV.map(([, t]) => celda(t)).join(";");
  const cuerpo = (filas || []).map((f) =>
    COLUMNAS_CSV.map(([k]) => celda(
      k === "consentimiento" || k === "entrega" ? (ETIQUETA[f[k]] || f[k]) : f[k])).join(";"));
  return "\uFEFF" + [cabecera, ...cuerpo].join("\r\n") + "\r\n";
}

/** Un nombre de fichero que no se pueda usar para escribir donde no toca. */
export const nombreCsv = (clave, hoy) =>
  `inscritos-${String(clave || "campana").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "campana"}-${String(hoy || "").slice(0, 10)}.csv`;
