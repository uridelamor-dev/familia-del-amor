// Reseñas — lógica pura y testeable (sin BD ni red). El endpoint de server.js llama a Anthropic
// reutilizando el patrón de /api/sara/chat; aquí solo se construye el prompt del borrador, se
// limpia la respuesta del modelo y se normalizan las filas para el panel.
// Modo borrador: se genera y guarda la respuesta localmente. La publicación DIRECTA en Google
// (updateReply) queda pendiente de que se apruebe la cuota de la Business Profile API y de
// persistir el resource name de cada reseña; por eso aquí NO se llama a Google.

const STAR = ["", "★", "★★", "★★★", "★★★★", "★★★★★"];

// Normaliza una fila de google_reviews para el panel de gestión.
export function mapManageRow(r) {
  const rating = Number(r.rating) || 0;
  const reply = r.reply || null;
  return {
    id: r.id,
    local: r.location_name || "",
    author: r.author || "Cliente",
    rating,
    estrellas: STAR[rating] || "",
    text: r.text || "",
    fecha: String(r.fecha || r.creado_en || "").slice(0, 10),
    reply,
    replied_at: r.replied_at ? String(r.replied_at).slice(0, 10) : null,
    reply_by: r.reply_by || null,
    respondida: !!reply,
    negativa: rating > 0 && rating <= 3,
    origen: r.origen || null,
  };
}

// Constructor PURO de la consulta de la bandeja de reseñas (WHERE + params + ORDER).
// ¿La ficha de Google (location_name) corresponde al local del ERP? Requiere que TODOS los
// tokens significativos (≥4 letras, sin conectores) del local ERP aparezcan en el nombre de
// Google. Así "La Tapeta - Lloret" casa "La Tapeta Lloret" pero NO "La Tapeta Blanes" (la marca
// "tapeta" sola no basta; hace falta también la ciudad). Base del scope por local en Reseñas.
const _STOP_REV = new Set(["la", "el", "los", "las", "de", "del", "d", "en", "y", "sl", "slu", "sa", "s", "l", "u"]);
function _normRev(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function localCoincideConReview(localERP, locationName) {
  const a = _normRev(localERP), b = _normRev(locationName);
  if (!a || !b) return false;
  const toks = a.split(" ").filter((t) => t.length >= 4 && !_STOP_REV.has(t));
  if (!toks.length) return false;
  return toks.every((t) => b.includes(t));
}
// Subconjunto de nombres de ficha de Google que corresponden a un local del ERP.
export function locationNamesDeLocal(localERP, names) {
  return (Array.isArray(names) ? names : []).filter((n) => localCoincideConReview(localERP, n));
}

/**
 * El WHERE de la bandeja. OJO: aquí NO se filtra por local.
 *
 * El local se aplica por otro camino, el de `locationNamesDeLocal`, y tiene que ser así: la
 * ficha de Google se llama «Blanes» y nuestro establecimiento «La Tapeta - Blanes», de modo que
 * un `location_name = 'La Tapeta - Blanes'` no casa con nada y la pantalla sale vacía sin decir
 * por qué. Y la solución NO es renombrar las fichas para que cuadren —eso rompe el casado y se
 * arregla desde «Vincular fichas de Google»—, sino traducir el establecimiento a los nombres de
 * ficha que le correspondan antes de consultar.
 */
export function buildManageQuery(f = {}) {
  const cond = [], params = [];
  if (f.rating) { cond.push("rating = ?"); params.push(parseInt(f.rating)); }
  if (f.estado === "pendientes") cond.push("(reply IS NULL OR reply = '')");
  else if (f.estado === "respondidas") cond.push("(reply IS NOT NULL AND reply <> '')");
  if (f.q) { cond.push("(LOWER(text) LIKE ? OR LOWER(author) LIKE ?)"); const like = "%" + String(f.q).toLowerCase() + "%"; params.push(like, like); }
  if (f.autor) { cond.push("LOWER(author) LIKE ?"); params.push("%" + String(f.autor).toLowerCase() + "%"); }
  if (f.from) { cond.push("COALESCE(fecha, creado_en) >= ?"); params.push(String(f.from)); }
  if (f.to) { cond.push("COALESCE(fecha, creado_en) <= ?"); params.push(String(f.to) + "T23:59:59"); }
  const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
  const orders = {
    recientes: "COALESCE(fecha, creado_en) DESC",
    antiguas: "COALESCE(fecha, creado_en) ASC",
    mejor: "rating DESC, COALESCE(fecha, creado_en) DESC",
    peor: "rating ASC, COALESCE(fecha, creado_en) DESC",
  };
  const orderBy = orders[f.sort] || orders.recientes;
  return { where, params, orderBy };
}

// Agrupa por local para el resumen (conteos y pendientes por establecimiento).
export function resumenPorLocal(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = r.local || "—";
    const cur = map.get(k) || { local: k, total: 0, pendientes: 0, respondidas: 0, suma: 0, conNota: 0 };
    cur.total++;
    if (r.respondida) cur.respondidas++; else cur.pendientes++;
    if (r.rating > 0) { cur.suma += r.rating; cur.conNota++; }
    map.set(k, cur);
  }
  return [...map.values()].map((c) => ({
    local: c.local, total: c.total, pendientes: c.pendientes, respondidas: c.respondidas,
    media: c.conNota ? Math.round((c.suma / c.conNota) * 10) / 10 : null,
  })).sort((a, b) => b.pendientes - a.pendientes || b.total - a.total);
}

// Construye el prompt para que Claude redacte un borrador de respuesta pública.
// Devuelve { system, messages } listos para anthropic.messages.create (sin tools).
export function draftRequest(review) {
  const local = String(review.location_name || review.local || "el restaurante").trim();
  const author = String(review.author || "").trim();
  const rating = Number(review.rating) || 0;
  const text = String(review.text || "").trim();
  const positiva = rating >= 4;
  const system = [
    `Eres la persona responsable de "${local}", un restaurante familiar, respondiendo PÚBLICAMENTE en Google a una reseña de un cliente.`,
    `Redacta la respuesta en español natural y cercano (si la reseña está claramente en otro idioma, responde en ese idioma).`,
    `Tono: cálido, humano y profesional; nunca corporativo ni robótico. Extensión: 2 a 4 frases, breve.`,
    author ? `Dirígete al cliente por su nombre ("${author}") si es natural.` : `No inventes el nombre del cliente.`,
    positiva
      ? `La reseña es positiva: agradece de corazón, menciona algo concreto de lo que dice si lo hay, e invítale a volver.`
      : `La reseña es crítica o negativa: discúlpate con sinceridad y SIN ponerte a la defensiva, muestra que os lo tomáis en serio, y ofrece resolverlo (invita a contactar). No prometas compensaciones concretas ni inventes hechos.`,
    `No inventes datos, ofertas ni detalles que no aparezcan en la reseña.`,
    `Devuelve ÚNICAMENTE el texto de la respuesta, sin comillas, sin encabezados y sin firma tipo "Atentamente".`,
  ].join(" ");
  const contenido = `Reseña de ${author || "un cliente"} — ${rating}★ en ${local}:\n"${text || "(sin texto, solo puntuación)"}"`;
  return { system, messages: [{ role: "user", content: contenido }] };
}

// Limpia el texto que devuelve el modelo (quita comillas envolventes y espacios).
export function cleanDraft(text) {
  let t = String(text || "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("«") && t.endsWith("»"))) t = t.slice(1, -1).trim();
  return t;
}

// Extrae el texto de la respuesta de Anthropic (bloques content type=text).
export function extractText(response) {
  if (!response || !Array.isArray(response.content)) return "";
  return cleanDraft(response.content.filter((b) => b && b.type === "text").map((b) => b.text).join("").trim());
}

// ── Orquestación de sincronización de reseñas (PURA/testeable, sin BD ni red) ──
// Fuente principal Business Profile; si por cuota/permisos/403/cuentas vacías/0 reseñas o
// cualquier error no devuelve reseñas, cae automáticamente a Places API. Las funciones de I/O
// (fetchBusiness/fetchPlaces) se inyectan. Devuelve un resultado estructurado.
export async function syncReviews(deps = {}) {
  const { hasRefreshToken, hasPlacesKey, placeIdsCount, fetchBusiness, fetchPlaces } = deps;
  const out = { source: "none", imported: 0, updated: 0, errors: [], businessProfileError: null, reason: null };

  // A. Business Profile primero, si hay refresh_token.
  if (hasRefreshToken && typeof fetchBusiness === "function") {
    let b = null;
    try { b = await fetchBusiness(); }
    catch (e) { out.businessProfileError = (e && e.message) ? e.message : "business_profile_error"; }
    if (b) {
      out.imported = b.imported || 0; out.updated = b.updated || 0;
      if (((b.imported || 0) + (b.updated || 0)) > 0) { out.source = "business_profile"; return out; }
      out.businessProfileError = b.reason || out.businessProfileError || "business_profile_sin_resultados";
    }
    // 0 reseñas o error recuperable → seguimos a Places (D: el fallo no impide el fallback).
  }

  // B/C. Places API: requiere key + Place IDs.
  if (!hasPlacesKey) {
    out.reason = hasRefreshToken ? "business_sin_datos_y_sin_places_key" : "sin_places_key";
    out.errors.push("Falta GOOGLE_PLACES_API_KEY");
    return out;
  }
  if (!placeIdsCount) { out.reason = "sin_place_ids"; out.errors.push("No hay Place IDs configurados"); return out; }
  if (typeof fetchPlaces !== "function") { out.reason = "places_no_disponible"; return out; }
  try {
    const p = await fetchPlaces();
    out.source = "places";
    out.imported = (p && p.imported) || 0;
    out.updated = (p && p.updated) || 0;
    if (p && Array.isArray(p.errors)) out.errors = out.errors.concat(p.errors);
    if ((out.imported + out.updated) === 0) out.reason = "places_sin_resultados";
    return out;
  } catch (e) {
    out.reason = "places_error";
    out.errors.push((e && e.message) ? e.message : "places_error");
    return out;
  }
}

// ── Auto-descubrimiento y vinculación de fichas de Google (PURO/testeable) ──
// Texto de búsqueda para Places Text Search a partir del nombre del local del ERP.
// "La Tapeta - Blanes" → "La Tapeta Blanes".
export function queryTextSearch(local) {
  return String(local || "").replace(/\s*[-–—]\s*/g, " ").replace(/\s+/g, " ").trim();
}
// Índice de candidato sugerido: si hay exactamente uno, es el 0; si hay varios, el primero
// (más relevante en Text Search / se puede confirmar); si no hay, null.
export function elegirSugerido(candidatos) {
  if (!Array.isArray(candidatos) || !candidatos.length) return null;
  return 0;
}
export function hayCoincidenciaUnica(candidatos) {
  return Array.isArray(candidatos) && candidatos.length === 1;
}
// Formatea la dirección del storefrontAddress de Business Profile.
export function formatearDireccionBP(sa) {
  if (!sa) return "";
  const parts = [];
  if (Array.isArray(sa.addressLines)) parts.push(...sa.addressLines);
  if (sa.locality) parts.push(sa.locality);
  if (sa.administrativeArea) parts.push(sa.administrativeArea);
  return parts.filter(Boolean).join(", ");
}
// Normaliza una ubicación de Business Profile a candidato uniforme.
export function normalizarUbicacionBP(loc) {
  if (!loc) return null;
  return {
    place_id: (loc.metadata && loc.metadata.placeId) || null,
    name: loc.title || "",
    address: formatearDireccionBP(loc.storefrontAddress),
    google_location_id: loc.name || null,
  };
}
// Normaliza un resultado de Places Text Search a candidato uniforme.
export function normalizarPlaceResult(r) {
  if (!r) return null;
  return {
    place_id: r.place_id || null,
    name: r.name || "",
    address: r.formatted_address || r.vicinity || "",
    google_location_id: null,
  };
}

// Cuenta Place IDs válidos configurados — FUENTE DE VERDAD de "hay/no hay Place IDs".
// La misma lógica que usa la sincronización para decidir si ejecutar Places.
export function placeIdsConfigurados(arr) {
  return (Array.isArray(arr) ? arr : []).filter((l) => l && l.placeId).length;
}
// Upsert (por nombre de local) de una ficha en el array de places_ids. PURA.
export function upsertPlaceEntry(arr, entry) {
  const list = Array.isArray(arr) ? arr.slice() : [];
  const nuevo = { name: entry.name, placeId: entry.placeId, google_location_id: entry.google_location_id || null, official_name: entry.official_name || "", address: entry.address || "" };
  const i = list.findIndex((l) => l && l.name === entry.name);
  if (i >= 0) list[i] = { ...list[i], ...nuevo }; else list.push(nuevo);
  return list;
}

// Mensaje explicativo del estado de reseñas (PURA). No incluye tokens ni credenciales.
export function mensajeEstadoReseñas(s = {}) {
  const conectado = !!s.connected;
  const n = s.reviews_count || 0;
  if (n > 0) {
    const fuente = s.source === "places" ? "Google Places" : s.source === "business_profile" ? "Business Profile" : "Google";
    return `Última sincronización correcta: ${n} reseña(s) mediante ${fuente}.`;
  }
  if (!conectado && !s.places_key_set) return "Google no conectado y sin clave de Places: no hay reseñas.";
  if (s.reason === "sin_places_key" || s.reason === "business_sin_datos_y_sin_places_key") return "Google conectado, pero Business Profile no devuelve reseñas (cuota/permisos) y falta la clave GOOGLE_PLACES_API_KEY.";
  // OJO: "reason" puede venir PERSISTIDO de una sync anterior. Para "no hay Place IDs" mandamos
  // sobre el conteo LIVE (places_configured), así el banner es coherente tras vincular fichas.
  if (!(Number(s.places_configured) > 0)) return "No hay Place IDs configurados.";
  if (s.source === "places") return "Conectado. Usando Places API, pero aún sin reseñas (revisa los Place IDs).";
  if (s.businessProfileError || s.reason) return `Google conectado, pero Business Profile no tiene cuota/permiso aprobado.${s.places_configured ? " Usando Places API." : " Configura Place IDs para ver reseñas ya."}`;
  return conectado ? "Google conectado, pero aún no se han sincronizado reseñas." : "Google no conectado.";
}
