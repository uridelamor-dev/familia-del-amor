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
  };
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
