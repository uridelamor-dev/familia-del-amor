// Helpers reutilizables de alcance por establecimiento (Iteración 4).
// Traducen el contexto de acceso de src/core/access.js a los `local_text` canónicos que un
// módulo puede usar. NO importan server.js, NO conocen Express y NO contienen lógica de
// Mantenimiento. Reciben la conexión por parámetro, usan consultas parametrizadas, trabajan
// solo con establecimientos activos, deduplican y distinguen error real de lista vacía.
import { isValidId, canAccessEstablecimiento } from "./access.js";

// Traduce un contexto de acceso a los locales permitidos.
//   global / legacy → { scope, locals: "ALL" }  (todos los establecimientos activos)
//   assigned        → { scope, locals: string[] } (local_text de los establecimientos activos del contexto)
//   none / otro     → { scope, locals: [] }
// Un error real de BD se PROPAGA (para fail-closed en el consumidor); no se convierte en [].
export async function resolveAllowedLocalTexts(x, ctx) {
  if (!ctx) return { scope: "none", locals: [] };
  if (ctx.scope === "global" || ctx.scope === "legacy") return { scope: ctx.scope, locals: "ALL" };
  if (ctx.scope === "assigned") {
    const ids = [...new Set((ctx.establecimientoIds || []).filter(isValidId))];
    if (ids.length === 0) return { scope: "assigned", locals: [] };
    const ph = ids.map(() => "?").join(",");
    const rows = await x.all(
      `SELECT local_text FROM establecimientos WHERE activo = 1 AND id IN (${ph})`, ids
    );
    const locals = [...new Set(rows.map((r) => r.local_text))];
    return { scope: "assigned", locals };
  }
  return { scope: ctx.scope || "none", locals: [] };
}

// Resuelve un establecimiento por coincidencia CANÓNICA EXACTA y ACTIVO. Devuelve su id o null.
// No acepta normalizaciones, espacios, guiones ni coincidencias parciales.
export async function resolveEstablishmentByLocalText(x, localText) {
  if (typeof localText !== "string" || localText.length === 0) return null;
  const row = await x.get(
    `SELECT id FROM establecimientos WHERE local_text = ? AND activo = 1`, [localText]
  );
  return row ? row.id : null;
}

// Valida un local solicitado para ESCRITURA. Devuelve un resultado tipado:
//   { code: "OK", establecimientoId } | { code: "VALIDATION_ERROR" } | { code: "FORBIDDEN" }
// - VALIDATION_ERROR: el local no existe, está inactivo o no es canónico exacto → 400.
// - FORBIDDEN: existe y es activo, pero el usuario no tiene acceso → 403.
// Un error real de BD se PROPAGA.
export async function validateRequestedLocal(x, ctx, localText) {
  const estId = await resolveEstablishmentByLocalText(x, localText);
  if (!isValidId(estId)) return { code: "VALIDATION_ERROR" };
  return canAccessEstablecimiento(ctx, estId)
    ? { code: "OK", establecimientoId: estId }
    : { code: "FORBIDDEN" };
}
