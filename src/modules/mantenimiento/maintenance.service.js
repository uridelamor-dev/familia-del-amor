// Servicio de Mantenimiento (Iteración 4). Contiene TODA la lógica de autorización y acceso
// a datos de los 3 endpoints. NO importa Express. Recibe explícitamente: conexión/adaptador
// PostgreSQL (con get/all/run; run devuelve la fila de `RETURNING` o undefined, igual que el
// wrapper dbRun de server.js), usuario autenticado, estado de PERMISOS_V2 (`enabled`),
// parámetros de la operación y `now` inyectable.
//
// Resultados tipados: { code: "OK" | "VALIDATION_ERROR" | "FORBIDDEN" | "NOT_FOUND", ... }.
//
// El flag OFF preserva el comportamiento legado en TODO lo que es permisos, que es a lo que se
// comprometió la Iteración 4. Hay dos cosas que ya no se comportan como antes, a propósito y
// en las dos ramas por igual, porque son higiene del dato y no autorización: el `estado` se
// valida contra `estados.js` (antes se guardaba en crudo) y un id inexistente contesta
// NOT_FOUND (antes contestaba OK sin haber tocado nada).
// Errores REALES de infraestructura durante la autorización → fail-closed (FORBIDDEN, sin
// filtrar información). Errores inesperados de la operación de datos → se lanzan para que el
// error handler global responda genérico.
import { buildAccessContext, canAccessEstablecimiento, isValidId } from "../../core/access.js";
import { resolveAllowedLocalTexts, resolveEstablishmentByLocalText } from "../../core/scope.js";
import { normalizarEstado } from "./estados.js";

const LIST_ALL_SQL = `SELECT * FROM maintenance_issues ORDER BY creado_en DESC`;

// ── GET /api/maintenance ─────────────────────────────────────────────────────
export async function listMaintenanceIssues(x, user, { enabled = false, local, now } = {}) {
  // Flag OFF: comportamiento actual EXACTO. No construye contexto ni consulta tablas nuevas.
  if (!enabled) {
    const rows = await x.all(LIST_ALL_SQL);
    return { code: "OK", data: rows || [] };
  }

  // Flag ON: autorización. Un error real en este tramo ⇒ fail-closed (deny, sin info).
  let allowed;
  try {
    const ctx = await buildAccessContext(x, user, { now });
    allowed = await resolveAllowedLocalTexts(x, ctx);
  } catch {
    return { code: "FORBIDDEN" };
  }
  if (allowed.scope === "none") return { code: "FORBIDDEN" };

  // Locales efectivos (nunca se confía en `local` del cliente para conceder acceso).
  let effective;
  try {
    if (allowed.locals === "ALL") {
      if (local != null && local !== "") {
        const est = await resolveEstablishmentByLocalText(x, local); // canónico + activo
        effective = isValidId(est) ? [local] : [];                    // no canónico/inactivo ⇒ vacío
      } else effective = "ALL";
    } else {
      effective = (local != null && local !== "")
        ? (allowed.locals.includes(local) ? [local] : []) // no permitido/ajeno ⇒ vacío (sin revelar)
        : allowed.locals;
    }
  } catch {
    return { code: "FORBIDDEN" };
  }

  if (effective === "ALL") {
    const rows = await x.all(LIST_ALL_SQL);
    return { code: "OK", data: rows || [] };
  }
  if (effective.length === 0) return { code: "OK", data: [] };
  const ph = effective.map(() => "?").join(",");
  const rows = await x.all(
    `SELECT * FROM maintenance_issues WHERE local IN (${ph}) ORDER BY creado_en DESC`, effective
  );
  return { code: "OK", data: rows || [] };
}

// ── POST /api/maintenance ────────────────────────────────────────────────────
export async function createMaintenanceIssue(x, user, { local, titulo, descripcion, foto_url = null }, { enabled = false, now } = {}) {
  const camposOk = local && titulo && descripcion;
  const foto = (foto_url && typeof foto_url === "string") ? foto_url.slice(0, 500) : null;

  if (!enabled) {
    if (!camposOk) return { code: "VALIDATION_ERROR", reason: "missing_fields" };
    const creado_en = now || new Date().toISOString();
    const r = await x.run(
      `INSERT INTO maintenance_issues (local, titulo, descripcion, estado, foto_url, creado_en) VALUES (?, ?, ?, 'abierta', ?, ?) RETURNING id`,
      [local, titulo, descripcion, foto, creado_en]
    );
    return { code: "OK", id: r && r.id };
  }

  if (!camposOk) return { code: "VALIDATION_ERROR", reason: "missing_fields" };

  // Autorización: el local debe ser canónico exacto + activo, y el usuario debe tener acceso.
  let ctx, estId;
  try {
    estId = await resolveEstablishmentByLocalText(x, local);
    if (!isValidId(estId)) return { code: "VALIDATION_ERROR", reason: "invalid_local" };
    ctx = await buildAccessContext(x, user, { now });
  } catch {
    return { code: "FORBIDDEN" }; // fail-closed: no se inserta ninguna fila
  }
  if (!canAccessEstablecimiento(ctx, estId)) return { code: "FORBIDDEN" };

  const creado_en = now || new Date().toISOString();
  const r = await x.run(
    `INSERT INTO maintenance_issues (local, titulo, descripcion, estado, foto_url, creado_en) VALUES (?, ?, ?, 'abierta', ?, ?) RETURNING id`,
    [local, titulo, descripcion, foto, creado_en]
  );
  return { code: "OK", id: r && r.id };
}

// ── PUT /api/maintenance/:id ─────────────────────────────────────────────────
export async function updateMaintenanceIssueStatus(x, user, id, { estado } = {}, { enabled = false, now } = {}) {
  // El estado se valida ANTES de mirar el flag y en las dos ramas: es higiene del dato, no
  // permisos. Antes se guardaba en crudo lo que llegara, y por ahí entraban «en_proceso» y
  // «cerrada» de la página vieja — valores que no salen en ningún filtro del panel.
  const estadoOk = normalizarEstado(estado);
  if (!estado) return { code: "VALIDATION_ERROR", reason: "missing_estado" };
  if (!estadoOk) return { code: "VALIDATION_ERROR", reason: "invalid_estado" };

  if (!enabled) {
    // `RETURNING id` para poder contestar 404: antes un id inexistente devolvía OK y quien
    // llamaba se quedaba tan tranquilo creyendo que había cambiado algo.
    const r0 = await x.run(`UPDATE maintenance_issues SET estado = ? WHERE id = ? RETURNING id`, [estadoOk, id]);
    if (!r0) return { code: "NOT_FOUND" };
    return { code: "OK" };
  }

  const idNum = Number(id);
  if (!isValidId(idNum)) return { code: "VALIDATION_ERROR", reason: "invalid_id" };

  // Cargar la incidencia REAL y resolver su establecimiento desde el registro (no del body).
  let row, ctx, est;
  try {
    row = await x.get(`SELECT id, local FROM maintenance_issues WHERE id = ?`, [idNum]);
    if (!row) return { code: "NOT_FOUND" };
    ctx = await buildAccessContext(x, user, { now });
    est = await resolveEstablishmentByLocalText(x, row.local);
  } catch {
    return { code: "FORBIDDEN" }; // fail-closed
  }

  // Acceso según el registro almacenado.
  let permitido;
  if (ctx.scope === "global" || ctx.scope === "legacy") {
    permitido = true; // Dirección/legacy preservan el comportamiento legado (incluso local no reconciliable)
  } else if (ctx.scope === "assigned") {
    permitido = isValidId(est) ? canAccessEstablecimiento(ctx, est) : false; // no reconciliable ⇒ fail-closed
  } else {
    permitido = false; // none / error
  }
  if (!permitido) return { code: "FORBIDDEN" };

  const r = await x.run(`UPDATE maintenance_issues SET estado = ? WHERE id = ? RETURNING id`, [estadoOk, idNum]);
  if (!r) return { code: "NOT_FOUND" }; // RETURNING vacío ⇒ la fila desapareció (carrera)
  return { code: "OK" };
}
