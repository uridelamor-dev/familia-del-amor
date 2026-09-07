// La campaña de captación. Lógica PURA: sin Express, sin DOM y sin SQL.
//
// Una campaña es la puerta de una ruta pública. Todo lo que decide si esa puerta está abierta
// —fechas, tope, interruptor— se calcula aquí, en un solo sitio, porque la respuesta la
// necesitan tres pantallas distintas: la página al cargar, el envío del formulario, y el panel.
// Si cada una lo dedujera por su cuenta, la página diría «apúntate» y el formulario contestaría
// que no, que es la peor forma de fallar.

const texto = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** La clave viaja en la URL del anuncio. Sin acentos, ni espacios, ni mayúsculas: se copia y se
 *  pega en Meta, se manda por WhatsApp y acaba escrita a mano en algún sitio. */
export const CLAVE_VALIDA = /^[a-z0-9][a-z0-9-]{2,39}$/;

export function normalizarClave(v) {
  return String(v == null ? "" : v).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/**
 * El estado de una campaña, con `altas` = cuántas lleva.
 *
 * El orden importa y no es casual: primero lo que decidió una persona (apagarla), luego el
 * calendario, y al final el tope. Así, si alguien la apaga a mitad de campaña, el motivo que se
 * enseña es «apagada» y no «agotada», que sería mentira.
 */
export function estadoCampana(campana, { hoy = "", altas = 0 } = {}) {
  if (!campana) return "no_existe";
  if (!campana.activa) return "apagada";
  if (hoy && campana.altas_desde && hoy < campana.altas_desde) return "aun_no_abre";
  if (hoy && campana.altas_hasta && hoy > campana.altas_hasta) return "cerrada";
  const tope = Number(campana.tope_altas || 0);
  if (tope > 0 && Number(altas || 0) >= tope) return "agotada";
  return "viva";
}

export const admiteAltas = (estado) => estado === "viva";

/** Lo que se le dice a quien llega con la puerta cerrada. Nunca «error»: no ha hecho nada mal. */
export function textoEstadoCampana(estado, campana = null, idioma = "es") {
  const F = {
    es: {
      cerrada: "Se acabó el plazo para apuntarse.",
      aun_no_abre: "Todavía no se puede pedir. Vuelve dentro de unos días.",
      agotada: "Se han repartido todos. ¡La próxima te esperamos!",
      apagada: "Esta promoción ya no está disponible.",
      otro: "Esta promoción ya no está disponible.",
    },
    ca: {
      cerrada: "S'ha acabat el termini per apuntar-s'hi.",
      aun_no_abre: "Encara no es pot demanar. Torna d'aquí a uns dies.",
      agotada: "Ja s'han repartit tots. La propera t'hi esperem!",
      apagada: "Aquesta promoció ja no està disponible.",
      otro: "Aquesta promoció ja no està disponible.",
    },
    en: {
      cerrada: "Sign-ups are closed.",
      aun_no_abre: "Not available yet. Come back in a few days.",
      agotada: "They're all gone. See you next time!",
      apagada: "This offer is no longer available.",
      otro: "This offer is no longer available.",
    },
  };
  const t = F[idioma] || F.es;
  return t[estado] || t.otro;
}

/** La URL que se pega en el anuncio. */
export function urlCampana(base, clave) {
  return `${String(base || "").replace(/\/$/, "")}/promo.html?c=${encodeURIComponent(String(clave || ""))}`;
}

/**
 * Saneado del formulario de campaña del panel. Mismo contrato que `sanearPromocion`: devuelve
 * también lo que se ha caído, porque un campo que desaparece en silencio se convierte en «pues
 * yo lo puse» cuando ya hay dinero gastado en el anuncio.
 */
export function sanearCampana(crudo = {}, { promociones = [] } = {}) {
  const descartados = [];
  const c = {};

  c.clave = normalizarClave(crudo.clave);
  if (!CLAVE_VALIDA.test(c.clave)) {
    descartados.push({ campo: "clave", valor: crudo.clave, motivo: "Entre 3 y 40 letras, números o guiones" });
  }

  c.nombre = texto(crudo.nombre, 80);
  if (!c.nombre) descartados.push({ campo: "nombre", motivo: "Ponle un nombre a la campaña" });

  // La promoción tiene que EXISTIR: es la que decide qué se regala, dónde y qué días. Una
  // campaña apuntando a una promoción borrada emitiría cupones que no valen en ninguna barra.
  const pid = Number(crudo.promocion_id);
  const promo = (promociones || []).find((p) => Number(p.id) === pid);
  if (!promo) {
    c.promocion_id = null;
    descartados.push({ campo: "promocion_id", valor: crudo.promocion_id, motivo: "Elige una promoción que exista" });
  } else {
    c.promocion_id = promo.id;
  }

  for (const campo of ["altas_desde", "altas_hasta"]) {
    const v = texto(crudo[campo], 10);
    if (!v) { c[campo] = null; continue; }
    if (!FECHA.test(v)) { c[campo] = null; descartados.push({ campo, valor: v, motivo: "La fecha debe ser aaaa-mm-dd" }); continue; }
    c[campo] = v;
  }
  if (c.altas_desde && c.altas_hasta && c.altas_desde > c.altas_hasta) {
    descartados.push({ campo: "altas_hasta", valor: c.altas_hasta, motivo: "Cierra antes de abrir" });
    c.altas_hasta = null;
  }

  const tope = Number(crudo.tope_altas);
  c.tope_altas = Number.isInteger(tope) && tope >= 0 && tope <= 100000 ? tope : 0;
  if (crudo.tope_altas !== undefined && c.tope_altas !== tope) {
    descartados.push({ campo: "tope_altas", valor: crudo.tope_altas, motivo: "Entre 0 (sin tope) y 100000" });
  }

  c.idioma = ["es", "ca", "en"].includes(String(crudo.idioma || "")) ? String(crudo.idioma) : "es";
  c.activa = crudo.activa === undefined ? true : !!crudo.activa;
  c.textos = sanearTextos(crudo.textos);

  return { campana: c, descartados };
}

/** Los textos por idioma. Lo que no venga se rellena con los de por defecto al pintarlo. */
export function sanearTextos(crudo) {
  const dentro = typeof crudo === "string" ? intentarJson(crudo) : crudo;
  const out = {};
  for (const idioma of ["es", "ca", "en"]) {
    const t = (dentro && dentro[idioma]) || {};
    const limpio = {};
    if (texto(t.titular, 90)) limpio.titular = texto(t.titular, 90);
    if (texto(t.subtitulo, 220)) limpio.subtitulo = texto(t.subtitulo, 220);
    if (texto(t.wa, 600)) limpio.wa = texto(t.wa, 600);
    if (Object.keys(limpio).length) out[idioma] = limpio;
  }
  return out;
}

function intentarJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
