// Núcleo REUTILIZABLE de acceso por establecimiento (Iteración 3).
// Solo construye y evalúa el contexto de acceso. NO se cablea a endpoints, NO hay
// middleware, NO hay modulo.accion, NO toca server.js ni la BD real.
//
// Precedencia de acceso:  global → assigned → legacy → none
//   - Dirección (rol='direccion'): acceso GLOBAL explícito por rol (no depende de la BD).
//   - Con asignaciones activas en user_locations: acotado a esos establecimientos,
//     AUNQUE también aparezca en legacy_access.
//   - legacy_access solo se usa cuando NO hay asignaciones activas.
//   - Sin nada de lo anterior: default-deny ('none').
// La ausencia de tablas o configuración NUNCA concede acceso por accidente (salvo Dirección).
// Un error REAL de BD nunca se transforma en acceso ni se confunde con "sin asignaciones".
import { permisosV2Enabled } from "./flags.js";

// ── Validación de IDs ────────────────────────────────────────────────────────
// Acepta solo enteros positivos. Rechaza null, negativos, 0, NaN, floats y strings.
export function isValidId(v) {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

// Distingue "tabla aún no creada" (transición segura) de un error REAL de BD.
function isMissingTableError(e) {
  const m = e && (e.message || String(e));
  return typeof m === "string" && /no such table/i.test(m);
}

// Fecha de referencia (ISO). Inyectable para pruebas deterministas.
function refNow(now) {
  return now || new Date().toISOString();
}

// ── Rol global (Dirección) ───────────────────────────────────────────────────
export function isGlobalRole(user) {
  return !!user && user.rol === "direccion";
}

// ── Carga de asignaciones EFECTIVAS desde user_locations ─────────────────────
// Efectiva ⇔ ul.activo=1, establecimiento activo=1, y vigente por fechas:
//   (desde NULL o desde<=hoy) y (hasta NULL o hasta>=hoy).
// Devuelve [{establecimiento_id, local_text}] deduplicado por establecimiento_id.
// Tablas ausentes ⇒ [] (transición segura). Error real de BD ⇒ se propaga.
export async function loadUserEstablecimientos(x, usuarioId, { now } = {}) {
  if (!isValidId(usuarioId)) return [];
  const ref = refNow(now);
  let rows;
  try {
    rows = await x.all(
      `SELECT ul.establecimiento_id AS eid, e.local_text AS lt
         FROM user_locations ul
         JOIN establecimientos e ON e.id = ul.establecimiento_id
        WHERE ul.usuario_id = ?
          AND ul.activo = 1
          AND e.activo = 1
          AND (ul.desde IS NULL OR date(ul.desde) <= date(?))
          AND (ul.hasta IS NULL OR date(ul.hasta) >= date(?))`,
      [usuarioId, ref, ref]
    );
  } catch (e) {
    if (isMissingTableError(e)) return []; // transición: tablas todavía no existen
    throw e;                               // error REAL de BD → no silenciar
  }
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!isValidId(r.eid) || seen.has(r.eid)) continue; // dedup + defensa
    seen.add(r.eid);
    out.push({ establecimiento_id: r.eid, local_text: r.lt });
  }
  return out;
}

// ── Legacy (grandfather) vigente ─────────────────────────────────────────────
// Vigente ⇔ activo=1 y (revocar_en NULL o revocar_en>=hoy). Fecha inyectable.
// Tabla ausente ⇒ false (transición segura). Error real ⇒ se propaga.
export async function hasLegacyAccess(x, usuarioId, { now } = {}) {
  if (!isValidId(usuarioId)) return false;
  const ref = refNow(now);
  try {
    const row = await x.get(
      `SELECT 1 AS ok FROM legacy_access
        WHERE usuario_id = ? AND activo = 1
          AND (revocar_en IS NULL OR date(revocar_en) >= date(?))
        LIMIT 1`,
      [usuarioId, ref]
    );
    return !!row;
  } catch (e) {
    if (isMissingTableError(e)) return false;
    throw e;
  }
}

// ── Construcción del contexto de acceso efectivo ─────────────────────────────
// Dirección se resuelve por ROL sin consultar la BD (por eso sobrevive a tablas
// ausentes o a un fallo de BD). El resto consulta asignaciones y, si no hay,
// legacy vigente. Un error real de BD se PROPAGA (para que el consumidor haga
// fail-closed), nunca se convierte en 'none' silencioso.
export async function buildAccessContext(x, user, { now } = {}) {
  const ref = refNow(now);
  if (isGlobalRole(user)) {
    return { usuarioId: isValidId(user.id) ? user.id : null, rol: "direccion", scope: "global", establecimientoIds: [] };
  }
  const usuarioId = user && user.id;
  const rol = (user && user.rol) || null;
  const estabs = await loadUserEstablecimientos(x, usuarioId, { now: ref });
  if (estabs.length > 0) {
    return { usuarioId: isValidId(usuarioId) ? usuarioId : null, rol, scope: "assigned", establecimientoIds: estabs.map((e) => e.establecimiento_id) };
  }
  const legacy = await hasLegacyAccess(x, usuarioId, { now: ref });
  return { usuarioId: isValidId(usuarioId) ? usuarioId : null, rol, scope: legacy ? "legacy" : "none", establecimientoIds: [] };
}

// ── Evaluación pura de acceso a un establecimiento ───────────────────────────
export function canAccessEstablecimiento(ctx, establecimientoId) {
  if (!ctx) return false;
  if (!isValidId(establecimientoId)) return false; // IDs inválidos nunca conceden acceso
  if (ctx.scope === "global" || ctx.scope === "legacy") return true;
  if (ctx.scope === "assigned") return ctx.establecimientoIds.includes(establecimientoId);
  return false; // 'none', 'error' o desconocido
}

// Establecimientos permitidos: 'ALL' para global/legacy; lista para assigned; [] para none.
export function allowedEstablecimientoIds(ctx) {
  if (!ctx) return [];
  if (ctx.scope === "global" || ctx.scope === "legacy") return "ALL";
  if (ctx.scope === "assigned") return [...ctx.establecimientoIds];
  return [];
}

// ── Autorización con semántica del flag ──────────────────────────────────────
// Flag OFF ⇒ { allowed:true, enforced:false, scope:"disabled" } (sin scope real).
// Flag ON  ⇒ construye contexto, evalúa y devuelve el scope real.
//   - Dirección: global por rol validado, incluso si la BD falla o faltan tablas.
//   - Error REAL de BD con el flag ON ⇒ FAIL-CLOSED: { allowed:false, enforced:true,
//     scope:"error", error } (no se confunde con 'none' ni concede acceso).
export async function authorizeEstablecimiento(x, user, establecimientoId, { enabled = permisosV2Enabled(), now } = {}) {
  if (!enabled) return { allowed: true, enforced: false, scope: "disabled" };

  if (isGlobalRole(user)) {
    const ctx = { scope: "global", establecimientoIds: [] };
    return { allowed: canAccessEstablecimiento(ctx, establecimientoId), enforced: true, scope: "global" };
  }

  try {
    const ctx = await buildAccessContext(x, user, { now });
    return { allowed: canAccessEstablecimiento(ctx, establecimientoId), enforced: true, scope: ctx.scope };
  } catch (e) {
    return { allowed: false, enforced: true, scope: "error", error: (e && e.message) ? e.message : "db_error" };
  }
}
