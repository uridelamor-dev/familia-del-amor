// Fidelización con Ágora — Fase 1. PURO: sin BD, sin Express, sin red.
//
// QUÉ HACE ÁGORA Y QUÉ HACEMOS NOSOTROS, según la Guía del Integrador 8.7.2:
//
//   1. El camarero escanea el carné. Ágora hace un GET a nuestra URL con el `member_id` dentro.
//      Contestamos 200 con { MemberId, DisplayText, Rewards } — o 404 si no es nadie.
//   2. Al cerrar la factura, Ágora nos la manda entera por POST. Contestamos 200 con
//      { Status: "accepted", PrinterText }.
//
// LO QUE HAY QUE TENER PRESENTE TODO EL RATO: **un 4xx, un 5xx o no contestar IMPIDEN CERRAR LA
// FACTURA**. Nuestra API está en el camino de la caja. Por eso aquí no hay ni una ruta que pueda
// devolver un error por algo que no sea culpa de la petición: si el socio no existe, si el JSON
// trae algo que no esperábamos o si la factura ya estaba, se acepta y se anota. El camarero
// siempre puede desasociar al participante y cobrar sin fidelización, pero eso es un paso manual
// en hora punta y no debería hacer falta nunca por un fallo nuestro.
//
// FASE 1: CERO PREMIOS. `Rewards` es SIEMPRE `[]`. Esta fase sirve para identificar clientes,
// recibir facturas reales, contar visitas y —lo que más falta hace— ver por fin el JSON exacto
// que manda Ágora. Los premios llegan cuando sepamos cómo es.

/** El piloto es de un solo local. Cualquier otro se rechaza. */
export const LOCAL_PILOTO = "La Tapeta - Lloret";

/** Fase 1: nunca hay premios. Congelado para que no se pueda cambiar por accidente. */
export const REWARDS_FASE_1 = Object.freeze([]);

/** El prefijo de las claves de idempotencia. Lleva versión: si algún día cambia la forma de
 *  calcularlas, las viejas no se confunden con las nuevas. */
export const IDEM_V = "fid:v1";

export const MAX_CUERPO = 4 * 1024 * 1024;
export const MAX_POR_MINUTO = 120;      // una barra llena cierra muchas facturas seguidas
export const VIDA_DIAS = 90;

/** Estados en los que puede quedar una factura recibida. */
export const ESTADOS = Object.freeze({
  ACEPTADA: "aceptada",
  REPETIDA: "repetida",           // mismo GlobalId y mismo cuerpo: un reenvío
  CONFLICTO: "conflicto",         // mismo GlobalId, cuerpo distinto
  SIN_MIEMBRO: "sin_miembro",     // venía identificada pero ese carné ya no existe
});

// ── El token de integración ─────────────────────────────────────────────────────────────────

export function nuevoToken(rndBytes) {
  return Buffer.from(rndBytes(48)).toString("base64url");
}

/** Lo único del token que se puede enseñar después: los cuatro últimos. Ni sirve para adivinarlo
 *  ni para usarlo, y basta para saber cuál de dos tokens está puesto en el TPV. */
export function pistaToken(token) {
  const s = String(token || "");
  return s.length > 4 ? "••••" + s.slice(-4) : "••••";
}

/**
 * ¿Se puede usar esta integración ahora mismo?
 *
 * Al que llama se le contesta 404 pase lo que pase: si el token no vale, no tiene por qué saber
 * si ha caducado, si está revocado o si nunca existió. El motivo es para nuestro registro.
 */
export function estadoIntegracion(fila, { ahora = new Date().toISOString() } = {}) {
  if (!fila) return { ok: false, motivo: "token_desconocido" };
  if (fila.revocado_en) return { ok: false, motivo: "revocada" };
  if (!fila.activo) return { ok: false, motivo: "desactivada" };
  if (fila.caduca_en && String(fila.caduca_en) <= String(ahora)) return { ok: false, motivo: "caducada" };
  if (fila.local !== LOCAL_PILOTO) return { ok: false, motivo: "local_no_permitido" };
  return { ok: true, motivo: null };
}

export function caducidadDesde(iso, dias = VIDA_DIAS) {
  const d = new Date(iso);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

// ── La validación del socio ─────────────────────────────────────────────────────────────────

/**
 * Lo que lee el camarero en su pantalla. NUNCA lleva teléfono ni correo.
 *
 * Lleva el nombre de pila porque es lo que hace útil el aviso —«Marta, 7 visitas» le dice a quien
 * está detrás de la barra que tiene delante a una clienta habitual— y porque esa persona está ahí
 * mismo. El apellido, el teléfono y el correo no aportan nada en ese momento y sí serían un dato
 * de más en una pantalla que ve todo el turno.
 */
export function textoParaCamarero(qr, { visitas = 0 } = {}) {
  const pila = String(qr?.nombre || "").trim().split(/\s+/)[0] || "";
  const quien = pila ? pila.slice(0, 24) : "Socio";
  if (!visitas) return `${quien} · primera visita`;
  return `${quien} · ${visitas} visita${visitas === 1 ? "" : "s"}`;
}

/** La respuesta exacta de la guía. `Rewards` es `[]` y en esta fase no puede ser otra cosa. */
export function respuestaMiembro(qr, { visitas = 0 } = {}) {
  return {
    MemberId: String(qr.token),
    DisplayText: textoParaCamarero(qr, { visitas }),
    Rewards: [...REWARDS_FASE_1],
  };
}

/** ¿Sirve este carné para identificar a alguien? Un cupón o un vale impreso NO: no son socios. */
export function carnetUtilizable(qr, { ahora = new Date().toISOString() } = {}) {
  if (!qr) return { ok: false, motivo: "no_existe" };
  if (qr.clase !== "carnet") return { ok: false, motivo: "no_es_carnet" };
  if (qr.anulado_en) return { ok: false, motivo: "anulado" };
  if (qr.caduca_en && String(qr.caduca_en) < String(ahora).slice(0, 10)) return { ok: false, motivo: "caducado" };
  return { ok: true, motivo: null };
}

// ── La factura ──────────────────────────────────────────────────────────────────────────────

/** Nombres bajo los que puede venir el importe de una línea. Se prueban en orden y se registra
 *  cuál acertó: con la primera factura real sabremos el bueno y esta lista se podrá recortar. */
const CAMPOS_IMPORTE = ["Amount", "TotalAmount", "Total", "LineTotal", "NetAmount", "Price", "Importe"];

const clave = (obj, nombre) => {
  if (!obj || typeof obj !== "object") return undefined;
  const k = Object.keys(obj).find((x) => x.toLowerCase() === nombre.toLowerCase());
  return k === undefined ? undefined : obj[k];
};

/** Recorre el JSON entero buscando una clave por nombre. La factura puede anidar como quiera. */
export function buscaProfunda(raiz, nombre, { profundidad = 12 } = {}) {
  const pila = [[raiz, 0]];
  while (pila.length) {
    const [v, d] = pila.shift();
    if (!v || typeof v !== "object" || d > profundidad) continue;
    const directo = clave(v, nombre);
    if (directo !== undefined && (typeof directo === "string" || typeof directo === "number")) {
      return String(directo);
    }
    for (const x of Object.values(v)) if (x && typeof x === "object") pila.push([x, d + 1]);
  }
  return null;
}

/**
 * Saca de la factura lo único que nos importa en esta fase: quién es socio y cuánto ha consumido.
 *
 * NO se busca por el nombre del array («InvoiceItems», «Items»…) porque no sabemos cómo se llama:
 * se recorre el árbol entero y se recoge TODO objeto que lleve un `LoyaltyProgram`. Así da igual
 * cómo anide, y una factura de varios albaranes con socios distintos sale bien sin adivinar nada.
 */
export function extraerFactura(json, sha256) {
  const lineas = [];
  const visto = new Set();
  const recorre = (v, d) => {
    if (!v || typeof v !== "object" || d > 12 || visto.has(v)) return;
    visto.add(v);
    if (Array.isArray(v)) { for (const x of v) recorre(x, d + 1); return; }
    const lp = clave(v, "LoyaltyProgram");
    if (lp && typeof lp === "object") {
      const member = clave(lp, "MemberId");
      let importe = 0, campo = null;
      for (const c of CAMPOS_IMPORTE) {
        const n = clave(v, c);
        if (typeof n === "number") { importe = n; campo = c; break; }
        if (typeof n === "string" && n.trim() !== "" && !isNaN(Number(n))) { importe = Number(n); campo = c; break; }
      }
      const premios = clave(lp, "Rewards");
      lineas.push({
        member: member === undefined || member === null ? null : String(member),
        importe, campoImporte: campo,
        premios: Array.isArray(premios) ? premios.length : 0,
      });
    }
    for (const x of Object.values(v)) if (x && typeof x === "object") recorre(x, d + 1);
  };
  recorre(json, 0);

  // El identificador oficial. Si no aparece, se compone uno y se marca como DÉBIL: no se disfraza
  // de GlobalId, porque una idempotencia que no se sabe fuerte hay que poder mirarla luego.
  const oficial = buscaProfunda(json, "GlobalId");
  const cuerpoHash = sha256(JSON.stringify(json));
  let globalId = oficial, claveDebil = false;
  if (!globalId) {
    const partes = ["SerialNumber", "Number", "InvoiceNumber", "Date", "BusinessDay"]
      .map((n) => buscaProfunda(json, n)).filter(Boolean);
    globalId = `debil:${sha256(partes.join("|") + "|" + cuerpoHash).slice(0, 32)}`;
    claveDebil = true;
  }

  const porMiembro = new Map();
  for (const l of lineas) {
    if (!l.member) continue;
    const p = porMiembro.get(l.member) || { member: l.member, importe: 0, lineas: 0, premios: 0 };
    p.importe += l.importe; p.lineas += 1; p.premios += l.premios;
    porMiembro.set(l.member, p);
  }
  const miembros = [...porMiembro.values()];
  const importeTotal = miembros.reduce((s, m) => s + m.importe, 0);

  return {
    globalId, claveDebil, cuerpoHash,
    lineas: lineas.length,
    miembros,
    importeTotal,
    // Una devolución llega como importes negativos. El marcador exacto se confirmará con la
    // primera devolución real; hasta entonces esto es lo que se puede afirmar del JSON.
    devolucion: importeTotal < 0 || lineas.some((l) => l.importe < 0),
    camposImporte: [...new Set(lineas.map((l) => l.campoImporte).filter(Boolean))],
  };
}

/**
 * Los movimientos que genera una factura. Uno por socio y concepto, con su clave de idempotencia.
 *
 * UNA FACTURA ACEPTADA = UNA VISITA POR SOCIO. Si la misma factura trae cinco líneas del mismo
 * carné, la clave `visita:<globalId>:<hash>` es la misma las cinco veces y el índice único de
 * `fid_movimientos` deja pasar solo la primera. No hace falta contarlas aquí: lo garantiza la base,
 * que es donde se cruzan dos reenvíos simultáneos.
 */
export function movimientosDe(extracto, { local, autor = "agora", ahora, facturaId = null, hashMember }) {
  const out = [];
  for (const m of extracto.miembros) {
    const h = hashMember(m.member);
    const base = { member_hash: h, local, factura_id: facturaId, autor, creado_en: ahora, nota: null };

    if (extracto.devolucion) {
      // Movimiento CONTRARIO, nunca un borrado. Y una sola vez: la clave lo impide dos veces.
      out.push({ ...base, concepto: "devolucion", unidades: 0, importe: m.importe,
                 clave_idem: `${IDEM_V}:devolucion:${extracto.globalId}:${h}` });
      continue;
    }
    out.push({ ...base, concepto: "visita", unidades: 1, importe: 0,
               clave_idem: `${IDEM_V}:visita:${extracto.globalId}:${h}` });
    out.push({ ...base, concepto: "consumo", unidades: 0, importe: m.importe,
               clave_idem: `${IDEM_V}:consumo:${extracto.globalId}:${h}` });
  }
  return out;
}

/**
 * Guarda una factura y su libro, DENTRO de una transacción que abre el llamante.
 *
 * Vive aquí y no en el manejador de la ruta porque es lo único de todo esto que puede salir mal de
 * verdad —dos reenvíos cruzándose, un socio que desaparece entre la validación y el cierre, el
 * mismo identificador con otro contenido— y esas tres cosas hay que poder probarlas sin levantar
 * un servidor ni una base.
 *
 * `x` es el contrato de siempre: `{ get, all, run }`.
 */
export async function procesarFactura(x, { extracto, integracion, ahora, cuerpoBytes,
                                           cuerpoEnc = null, esquema = null, version = null, hashMember }) {
  // `ON CONFLICT DO NOTHING` es la idempotencia de verdad: dos reenvíos simultáneos se cruzan en
  // el índice único de la base, no en una comprobación previa que uno de los dos podría adelantar.
  const nueva = await x.run(
    `INSERT INTO fid_facturas (integracion_id, local, global_id, clave_debil, cuerpo_hash, cuerpo_bytes,
       cuerpo_enc, esquema, agora_version, items_n, miembros_n, importe_total, devolucion, estado, recibido_en)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (global_id) DO NOTHING RETURNING id`,
    [integracion.id, integracion.local, extracto.globalId, extracto.claveDebil, extracto.cuerpoHash,
     cuerpoBytes, cuerpoEnc, esquema, version, extracto.lineas, extracto.miembros.length,
     extracto.importeTotal, extracto.devolucion, ESTADOS.ACEPTADA, ahora]);

  if (!nueva) {
    const previa = await x.get(`SELECT id, cuerpo_hash FROM fid_facturas WHERE global_id = ?`, [extracto.globalId]);
    // Mismo identificador, otro contenido. NO se procesa en silencio: se anota el conflicto y se
    // acepta igual, porque esa factura ya se aceptó una vez y devolver un error ahora bloquearía
    // una caja por un problema que es nuestro, no suyo.
    const conflicto = !!(previa && previa.cuerpo_hash !== extracto.cuerpoHash);
    if (conflicto) await x.run(`UPDATE fid_facturas SET estado = ? WHERE id = ?`, [ESTADOS.CONFLICTO, previa.id]);
    return { repetida: true, conflicto, facturaId: previa ? previa.id : null,
             movimientos: 0, sinMiembro: [], estado: conflicto ? ESTADOS.CONFLICTO : ESTADOS.REPETIDA };
  }

  const facturaId = nueva.id;
  const sinMiembro = [];
  const conCarnet = [];
  for (const m of extracto.miembros) {
    const qr = await x.get(`SELECT id, clase, anulado_en, caduca_en FROM pro_qr WHERE token = ?`, [m.member]);
    const util = carnetUtilizable(qr, { ahora });
    // POLÍTICA cuando el socio ya no existe: la factura se ACEPTA y no se apunta ningún movimiento.
    // No se crea un socio nuevo —sería un duplicado de una identidad que ya tuvo su carné— ni se
    // bloquea la caja, que sería mucho peor por algo que el camarero no puede arreglar en barra.
    if (!util.ok) { sinMiembro.push({ hash: hashMember(m.member), motivo: util.motivo }); continue; }
    conCarnet.push({ ...m, qrId: qr.id, hash: hashMember(m.member) });
  }

  const movs = movimientosDe({ ...extracto, miembros: conCarnet }, {
    local: integracion.local, autor: "agora", ahora, facturaId, hashMember,
  });
  const porHash = new Map(conCarnet.map((c) => [c.hash, c.qrId]));
  let escritos = 0;
  for (const mv of movs) {
    const qrId = porHash.get(mv.member_hash);
    if (!qrId) continue;
    const r = await x.run(
      `INSERT INTO fid_movimientos (qr_id, member_hash, local, concepto, unidades, importe, clave_idem,
         factura_id, referencia_id, nota, autor, creado_en)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (clave_idem) DO NOTHING RETURNING id`,
      [qrId, mv.member_hash, mv.local, mv.concepto, mv.unidades, mv.importe, mv.clave_idem,
       mv.factura_id, mv.referencia_id, mv.nota, mv.autor, mv.creado_en]);
    if (r) escritos += 1;
  }

  const estado = sinMiembro.length ? ESTADOS.SIN_MIEMBRO : ESTADOS.ACEPTADA;
  if (sinMiembro.length) await x.run(`UPDATE fid_facturas SET estado = ? WHERE id = ?`, [estado, facturaId]);
  return { repetida: false, conflicto: false, facturaId, movimientos: escritos, sinMiembro, estado };
}

/** La respuesta de la guía cuando la factura entra bien. `PrinterText` vacío: en esta fase no hay
 *  nada que imprimir en el ticket, y escribir algo sería prometer un premio que no existe. */
export function respuestaFactura({ estado = ESTADOS.ACEPTADA } = {}) {
  return { Status: "accepted", PrinterText: "" };
}

/** El mapa del JSON: qué campos hay y de qué tipo, sin un solo valor dentro. Es lo que se mira
 *  para diseñar la Fase 2, y lo único que se puede enseñar sin ninguna precaución. */
export function esquemaDe(valor, { profundidad = 8 } = {}) {
  const paso = (v, resto) => {
    if (v === null) return "null";
    if (Array.isArray(v)) {
      if (!v.length) return ["vacío"];
      if (resto <= 0) return ["…"];
      return [paso(v[0], resto - 1), `×${v.length}`];
    }
    const t = typeof v;
    if (t !== "object") return t;
    if (resto <= 0) return "objeto…";
    const out = {};
    for (const k of Object.keys(v).slice(0, 80)) out[k] = paso(v[k], resto - 1);
    return out;
  };
  return paso(valor, profundidad);
}

/** Cabeceras que no se guardan jamás. `Agora-Version` sí: es justo lo que queremos saber. */
export const CABECERAS_PROHIBIDAS = new Set([
  "authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token",
]);

export function cabecerasSeguras(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const n = String(k).toLowerCase();
    if (CABECERAS_PROHIBIDAS.has(n)) continue;   // ni con «[omitida]»: no se guardan y punto
    out[n] = String(Array.isArray(v) ? v.join(", ") : v).slice(0, 200);
  }
  return out;
}

/** Las dos URL que hay que pegar en Ágora. `{member_id}` es el hueco que sustituye el TPV. */
export function urlsDeIntegracion(base, token) {
  const raiz = String(base || "").replace(/\/+$/, "");
  return {
    validacion: `${raiz}/api/fidelizacion/agora/${token}/member/{member_id}`,
    facturas: `${raiz}/api/fidelizacion/agora/${token}/factura`,
  };
}
