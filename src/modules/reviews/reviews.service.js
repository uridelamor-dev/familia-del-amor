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
export function buildManageQuery(f = {}) {
  const cond = [], params = [];
  if (f.local) { cond.push("location_name = ?"); params.push(String(f.local)); }
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

// Mensaje explicativo del estado de reseñas (PURA). No incluye tokens ni credenciales.
export function mensajeEstadoReseñas(s = {}) {
  const conectado = !!s.connected;
  const n = s.reviews_count || 0;
  if (n > 0) {
    const fuente = s.source === "places" ? "Google Places" : s.source === "business_profile" ? "Business Profile" : "Google";
    return `Última sincronización correcta: ${n} reseña(s) mediante ${fuente}.`;
  }
  if (!conectado && !s.places_key_set) return "Google no conectado y sin clave de Places: no hay reseñas.";
  if (s.reason === "sin_place_ids") return "Google conectado, pero faltan los Place IDs de los locales (configúralos para usar Places API).";
  if (s.reason === "sin_places_key" || s.reason === "business_sin_datos_y_sin_places_key") return "Google conectado, pero Business Profile no devuelve reseñas (cuota/permisos) y falta la clave GOOGLE_PLACES_API_KEY.";
  if (s.source === "places") return "Conectado. Usando Places API, pero aún sin reseñas (revisa los Place IDs).";
  if (s.businessProfileError || s.reason) return `Google conectado, pero Business Profile no tiene cuota/permiso aprobado.${s.places_configured ? " Usando Places API." : " Configura Place IDs para ver reseñas ya."}`;
  return conectado ? "Google conectado, pero aún no se han sincronizado reseñas." : "Google no conectado.";
}
