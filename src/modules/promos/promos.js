// Promociones — lógica PURA. Sin Express, sin DOM y sin ejecutar SQL: aquí solo se decide.
//
// La razón de que esto sea un módulo aparte y no código dentro de server.js:
//
//  · UN SOLO SITIO DECIDE SI UN CUPÓN VALE. `estadoDe()` la usan por igual el kiosco de la
//    barra, la página que ve el cliente en su móvil y el panel. Si cada uno lo calculara por
//    su cuenta, el cliente vería «válido» en la pantalla y en la barra le dirían que no, que
//    es la peor forma posible de fallar: el cliente tiene razón y el camarero también.
//  · LAS FRASES TAMBIÉN SALEN DE AQUÍ. `public/fichar.js` es un script clásico dentro de un
//    IIFE y no puede importar módulos, así que el servidor le manda el texto ya escrito. Es
//    el mismo motivo por el que src/modules/reservas/kiosco.js vive en el servidor.
//  · Y así se puede probar con `node --test` sin levantar nada.

/** Dígitos del código que se teclea a mano. Numérico a propósito: el kiosco ya tiene un
 *  teclado numérico pensado para dedos mojados, y no hace falta inventar otro. */
export const CODIGO_LARGO = 8;

/**
 * Código de 8 dígitos.
 *
 * `rndBytes` se inyecta para poder probar sin depender de crypto. Se descartan los bytes
 * ≥ 250 antes del módulo: 256 no es múltiplo de 10, así que sin ese rechazo los dígitos
 * 0-5 saldrían un 20 % más a menudo que el resto. Con 8 dígitos no es un agujero de
 * seguridad, pero un generador sesgado es de las cosas que luego nadie vuelve a mirar.
 *
 * El llamador reintenta si la UNIQUE de `pro_qr.codigo` salta: con 10⁸ combinaciones la
 * colisión es rarísima, pero la base es quien lo garantiza, no la estadística.
 */
export function generarCodigo(rndBytes) {
  let out = "";
  while (out.length < CODIGO_LARGO) {
    const buf = rndBytes(CODIGO_LARGO * 2);
    for (let i = 0; i < buf.length && out.length < CODIGO_LARGO; i++) {
      if (buf[i] >= 250) continue;
      out += String(buf[i] % 10);
    }
  }
  return out;
}

/** Los últimos 9 dígitos del teléfono: la misma clave con la que todo el CRM cruza a la
 *  gente (ver MATCH_TEL9 en server.js). «+34 600 11 22 33» y «600112233» son la misma
 *  persona, y si aquí se guardara el texto tal cual, un cupón se podría usar dos veces
 *  sin más que apuntar el teléfono de otra manera. */
export function tel9(t) {
  return String(t || "").replace(/\D/g, "").slice(-9);
}

/**
 * Lo que ha entrado por el escáner o por el teclado, traducido a algo con lo que buscar.
 *
 * El escáner escupe la URL entera del cupón. Pero por el mismo hueco entra también un
 * token pegado a mano, el código de 8 dígitos tecleado con o sin espacio en medio, y —esto
 * pasa— el QR de otro comercio, el de una lata de refresco o el wifi del bar. Todo eso
 * tiene que caer aquí y salir como `null`, no reventar tres capas más adentro.
 */
export function normalizarEntrada(txt) {
  const s = String(txt == null ? "" : txt).trim();
  if (!s) return null;

  // Código tecleado: solo dígitos y espacios, y justo los que tiene que haber.
  if (/^[\d\s.-]+$/.test(s)) {
    const d = s.replace(/\D/g, "");
    return d.length === CODIGO_LARGO ? { tipo: "codigo", valor: d } : null;
  }

  // URL del cupón: se saca el `t=`. Cualquier otra URL no es nuestra.
  const m = /[?&]t=([A-Za-z0-9_-]+)/.exec(s);
  const token = m ? m[1] : s;
  if (!m && /^[a-z]+:/i.test(s)) return null;          // http:, mailto:, WIFI:…
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return { tipo: "token", valor: token };
}

/** ¿Vale este QR en esta barra? `locales` vacío = en todas. */
export function localEnLista(local, locales) {
  const lista = String(locales || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!lista.length) return true;
  return lista.some((l) => l.toLowerCase() === String(local || "").toLowerCase());
}

/**
 * El estado de un QR. LA función de este módulo.
 *
 * `local` es opcional a propósito: la página que ve el cliente en su móvil no sabe en qué
 * barra va a canjearlo, así que allí no se comprueba y se le dice «válido en Blanes» en
 * lugar de un «no vale» que sería mentira. En el kiosco siempre viene, porque el
 * dispositivo sabe dónde está.
 *
 * `canjesCliente` son los canjes que ESA PERSONA ya tiene de ESA promoción, no los usos de
 * este QR concreto. Es distinto y es importante: si a alguien le llegan dos cupones de la
 * misma promoción —uno por campaña y otro emitido a mano— mirar solo `usos` le dejaría
 * usarla dos veces.
 */
export function estadoDe(qr, promo, { hoy = "", local = "", canjesCliente = 0 } = {}) {
  if (!qr) return "no_existe";
  if (qr.anulado_en) return "anulado";
  if (qr.clase === "cupon" && !promo) return "no_existe";

  if (promo) {
    if (!promo.activa) return "promo_inactiva";
    if (hoy && promo.desde && hoy < promo.desde) return "fuera_de_fechas";
    if (hoy && promo.hasta && hoy > promo.hasta) return "fuera_de_fechas";
    if (local && !localEnLista(local, promo.locales)) return "fuera_de_local";
  }

  if (hoy && qr.caduca_en && hoy > qr.caduca_en) return "caducado";

  const max = Number(qr.usos_max || 0);
  if (max > 0 && Number(qr.usos || 0) >= max) return "agotado";

  const porCliente = Number(promo && promo.usos_por_cliente);
  if (porCliente > 0 && Number(canjesCliente || 0) >= porCliente) return "limite_cliente";

  return "valido";
}

/** «3 de septiembre a las 21:40», hora de Madrid. */
export function fechaBonita(iso, { conHora = false } = {}) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "Europe/Madrid" }).format(d);
  if (!conHora || iso.length === 10) return dia;
  const hora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(d);
  return `${dia} a las ${hora}`;
}

/**
 * La frase que se lee en la barra.
 *
 * Un «no válido» a secas provoca una discusión con el cliente delante: él enseña su móvil,
 * el camarero enseña la tablet y no hay forma de saber quién tiene razón. Diciendo «ya lo
 * usó el 3 de septiembre a las 21:40» la conversación se acaba sola.
 */
export function textoEstado(estado, { promo = null, qr = null, ultimoCanje = null } = {}) {
  switch (estado) {
    case "valido":
      return promo ? promo.nombre : "Cliente identificado";
    case "no_existe":
      return "Este código no es de aquí.";
    case "anulado":
      return "Este cupón se anuló.";
    case "caducado":
      return qr && qr.caduca_en ? `Caducó el ${fechaBonita(qr.caduca_en)}.` : "Este cupón ya caducó.";
    case "agotado":
    case "limite_cliente":
      return ultimoCanje && ultimoCanje.canjeado_en
        ? `Ya se usó el ${fechaBonita(ultimoCanje.canjeado_en, { conHora: true })}.`
        : "Este cupón ya se usó.";
    case "promo_inactiva":
      return "Esta promoción ya no está activa.";
    case "fuera_de_fechas":
      return promo && promo.hasta ? `Esta promoción terminó el ${fechaBonita(promo.hasta)}.` : "Esta promoción no está vigente.";
    case "fuera_de_local":
      return promo && promo.locales ? `Solo vale en ${promo.locales.split(",").join(" y ")}.` : "No vale en esta barra.";
    default:
      return "No se puede validar.";
  }
}

/** Los únicos estados con los que se puede canjear. Se usa en el servidor antes de tocar
 *  la base, y en la interfaz para decidir si se pinta el botón verde. */
export const esCanjeable = (estado) => estado === "valido";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

/**
 * Saneado de una promoción. Mismo contrato que `sanearSegmento`: devuelve también lo que se
 * ha caído, porque un campo que desaparece en silencio se convierte en «pues yo lo puse» una
 * semana después.
 */
export function sanearPromocion(crudo = {}, { locales = [] } = {}) {
  const descartados = [];
  const p = {};

  p.nombre = texto(crudo.nombre, 80);
  if (!p.nombre) descartados.push({ campo: "nombre", motivo: "Ponle un nombre a la promoción" });

  p.descripcion = texto(crudo.descripcion, 300);

  // Locales: lista blanca contra los que existen de verdad. Vacío = todos.
  const permitidos = (Array.isArray(locales) ? locales : []).map((l) => String(l));
  const pedidos = String(crudo.locales || "").split(",").map((s) => s.trim()).filter(Boolean);
  const buenos = [];
  for (const l of pedidos) {
    const encaja = permitidos.find((p2) => p2.toLowerCase() === l.toLowerCase());
    if (encaja) buenos.push(encaja);
    else descartados.push({ campo: "locales", valor: l, motivo: "Ese local no existe" });
  }
  p.locales = buenos.join(",");

  for (const campo of ["desde", "hasta"]) {
    const v = texto(crudo[campo], 10);
    if (!v) { p[campo] = null; continue; }
    if (!FECHA.test(v)) { p[campo] = null; descartados.push({ campo, valor: v, motivo: "La fecha debe ser aaaa-mm-dd" }); continue; }
    p[campo] = v;
  }
  // Al revés no se guarda: una promoción que empieza después de terminar no valdría nunca y
  // nadie entendería por qué.
  if (p.desde && p.hasta && p.desde > p.hasta) {
    descartados.push({ campo: "hasta", valor: p.hasta, motivo: "Termina antes de empezar" });
    p.hasta = null;
  }

  const n = Number(crudo.usos_por_cliente);
  p.usos_por_cliente = Number.isInteger(n) && n >= 0 && n <= 99 ? n : 1;
  if (crudo.usos_por_cliente !== undefined && p.usos_por_cliente !== n) {
    descartados.push({ campo: "usos_por_cliente", valor: crudo.usos_por_cliente, motivo: "Entre 0 (sin límite) y 99" });
  }

  p.activa = crudo.activa === undefined ? true : !!crudo.activa;

  return { promocion: p, descartados };
}

// ── SQL que ejecuta server.js ────────────────────────────────────────────────
// Vive aquí, junto a la lógica que lo justifica, como SQL_RECALCULO en clientes/metricas.js.

/**
 * El canje, en UNA sola sentencia.
 *
 * Sin `SELECT` previo a propósito. Con dos tablets en la misma barra, «mira si queda uso y
 * luego réstalo» son dos viajes a la base y entre uno y otro cabe el otro camarero: los dos
 * ven que queda y los dos canjean. Aquí el filtro va dentro del propio UPDATE, así que lo
 * resuelve PostgreSQL: si devuelve 0 filas, es que ya no quedaba.
 */
export const SQL_CANJEAR = `
  UPDATE pro_qr SET usos = usos + 1
   WHERE id = ? AND anulado_en IS NULL AND (usos_max = 0 OR usos < usos_max)
  RETURNING id, usos`;

/** Cuántas veces ha usado ESTA PERSONA esta promoción (por tel9, no por QR). */
export const SQL_CANJES_CLIENTE = `
  SELECT COUNT(*)::int AS n FROM pro_canjes WHERE promocion_id = ? AND telefono = ?`;

/** El último canje, para poder decir «ya se usó el 3 de septiembre a las 21:40». */
export const SQL_ULTIMO_CANJE = `
  SELECT canjeado_en, local FROM pro_canjes WHERE qr_id = ? ORDER BY epoch_ms DESC LIMIT 1`;
