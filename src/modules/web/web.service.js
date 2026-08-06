// Editor de la web pública — lógica PURA y testeable (sin DOM ni red).
// El registry viene de GET /api/content/registry = { locales:[{slug,name}], campos:{ key:{label,section,type,scope,local?} } }.
// Los valores vienen de GET /api/content = { key: value }. Los campos text_i18n se guardan como key_es/_ca/_en.

export const LANGS = ["es", "ca", "en"];
export const LANG_LABEL = { es: "Español", ca: "Català", en: "English" };

export function i18nKey(base, lang) { return `${base}_${lang}`; }

// Agrupa el registry: secciones globales (portada) + un bloque por local (en el orden de `locales`).
export function groupRegistry(registry) {
  const campos = (registry && registry.campos) || {};
  const locales = (registry && registry.locales) || [];
  const globalSecs = new Map();
  const localSecs = new Map();
  for (const key of Object.keys(campos)) {
    const def = campos[key]; const entry = { key, ...def };
    if (def.scope === "local") {
      const slug = def.local || "";
      if (!localSecs.has(slug)) localSecs.set(slug, { slug, name: def.section, campos: [] });
      localSecs.get(slug).campos.push(entry);
    } else {
      const sec = def.section || "General";
      if (!globalSecs.has(sec)) globalSecs.set(sec, []);
      globalSecs.get(sec).push(entry);
    }
  }
  return {
    global: [...globalSecs.entries()].map(([section, list]) => ({ section, campos: list })),
    locales: locales.map((l) => localSecs.get(l.slug) || { slug: l.slug, name: l.name, campos: [] }),
  };
}

// Valor actual de un campo para el idioma dado (i18n resuelve key_lang con fallback a la base).
export function fieldValue(content, campo, lang) {
  const c = content || {};
  if (campo.type === "text_i18n") {
    const k = i18nKey(campo.key, lang);
    if (c[k] != null) return c[k];
    return c[campo.key] != null ? c[campo.key] : "";
  }
  return c[campo.key] != null ? c[campo.key] : "";
}

// La key que se persiste al editar (i18n añade el sufijo de idioma).
export function saveKeyFor(campo, lang) {
  return campo.type === "text_i18n" ? i18nKey(campo.key, lang) : campo.key;
}

// Idiomas que faltan por traducir en un campo i18n (no hay valor ni por idioma ni base).
export function missingLangs(content, baseKey, langs = LANGS) {
  const c = content || {};
  return langs.filter((l) => !(c[i18nKey(baseKey, l)] || c[baseKey]));
}

// Galería: se guarda como texto, una URL por línea.
export function parseGallery(value) {
  return String(value == null ? "" : value).split("\n").map((s) => s.trim()).filter(Boolean);
}
export function serializeGallery(urls) {
  return (urls || []).map((u) => String(u).trim()).filter(Boolean).join("\n");
}

// ── Bloques (Fase B: constructor de secciones/páginas) ──────────────────────
// Un "scope" (nosotros/eventos/trabaja/home_extra) se guarda como content key
// `blocks_<scope>` = JSON de bloques tipados. Los textos son i18n {es,ca,en}.
export const BLOCK_TYPES = [
  { type: "heading", label: "Título" },
  { type: "paragraph", label: "Párrafo" },
  { type: "image", label: "Imagen" },
  { type: "gallery", label: "Galería" },
  { type: "cta", label: "Botón" },
  { type: "pdf", label: "PDF / documento" },
];
export function blockText(b, field, lang) { const v = b && b[field]; if (v && typeof v === "object") return v[lang] || v.es || ""; return v == null ? "" : String(v); }
export function parseBlocks(raw) { if (!raw) return []; try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; } }
export function serializeBlocks(arr) { return JSON.stringify(Array.isArray(arr) ? arr : []); }
export function newBlock(type, id) {
  const b = { id: id || ("b_" + type), type };
  if (type === "heading" || type === "paragraph" || type === "cta") b.text = { es: "", ca: "", en: "" };
  if (type === "image") { b.url = ""; b.alt = { es: "", ca: "", en: "" }; }
  if (type === "gallery") b.urls = [];
  if (type === "cta") b.href = "";
  if (type === "pdf") { b.url = ""; b.label = { es: "", ca: "", en: "" }; }
  return b;
}
export function moveItem(arr, from, to) { const a = (arr || []).slice(); if (from < 0 || from >= a.length || to < 0 || to >= a.length) return a; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; }

// Filtro de búsqueda de campos por etiqueta o key.
export function matchCampo(campo, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return String(campo.label || "").toLowerCase().includes(q) || String(campo.key || "").toLowerCase().includes(q);
}
