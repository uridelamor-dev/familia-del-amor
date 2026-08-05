// Migración aditiva del modelo de establecimientos (Iteración 2) — PostgreSQL nativo.
// - Solo crea tablas/índices nuevos; NO toca tablas ni columnas existentes.
// - NO se auto-ejecuta al arrancar el servidor: el ESQUEMA se crea de forma idempotente
//   (ensureSchema, invocable desde initDB), pero el BACKFILL/grandfather/migration_state solo
//   se ejecutan deliberadamente desde el runner (scripts/migrate-establecimientos.js).
// - El --backfill corre ATÓMICO (una transacción) sobre un ÚNICO cliente (no el pool).
// Recibe siempre un `x` con { run, get, all } (run devuelve la fila de RETURNING o undefined).
// Preparado para cientos de establecimientos: catálogo idempotente, índices por usuario y por
// establecimiento, y unicidad de local_text.
import { reconcile, CATALOGO_CANONICO, catalogChecksum } from "./reconciliation.js";

export const MIGRATION_VERSION = "establecimientos-v1";

// ── Esquema (idempotente, ejecutable de forma independiente) ─────────────────
export async function ensureSchema(x) {
  await x.run(`CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    cif TEXT,
    provisional INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL
  )`);
  await x.run(`CREATE TABLE IF NOT EXISTS establecimientos (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    local_text TEXT NOT NULL UNIQUE,
    empresa_id INTEGER REFERENCES empresas(id),
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL
  )`);
  await x.run(`CREATE TABLE IF NOT EXISTS user_locations (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES users(id),
    establecimiento_id INTEGER NOT NULL REFERENCES establecimientos(id),
    activo INTEGER NOT NULL DEFAULT 1,
    desde TEXT NOT NULL,
    hasta TEXT,
    creado_en TEXT NOT NULL,
    UNIQUE (usuario_id, establecimiento_id)
  )`);
  await x.run(`CREATE TABLE IF NOT EXISTS legacy_access (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    motivo TEXT NOT NULL DEFAULT 'cuenta existente en la migración',
    concedido_en TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    revocar_en TEXT
  )`);
  await x.run(`CREATE TABLE IF NOT EXISTS migration_state (
    clave TEXT PRIMARY KEY,
    valor TEXT,
    actualizado_en TEXT NOT NULL
  )`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_user_locations_usuario ON user_locations(usuario_id)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_user_locations_estab   ON user_locations(establecimiento_id)`);
  await x.run(`CREATE INDEX IF NOT EXISTS idx_establecimientos_activo ON establecimientos(activo)`);
}

// ── Catálogo (idempotente; empresa_id NULL, sin inventar sociedades) ─────────
export async function seedCatalogo(x, catalogo = CATALOGO_CANONICO) {
  const now = new Date().toISOString();
  for (const nombre of catalogo) {
    await x.run(
      `INSERT INTO establecimientos (nombre, local_text, empresa_id, activo, creado_en)
       VALUES (?, ?, NULL, 1, ?)
       ON CONFLICT (local_text) DO NOTHING`, [nombre, nombre, now]
    );
  }
}

// ── Backfill de trabajadores (solo los que tienen users.local reconocido) ────
export async function computeBackfillCandidates(x, reconResult) {
  const estabs = await x.all("SELECT id, local_text FROM establecimientos", []);
  const estabByCanon = new Map(estabs.map((e) => [e.local_text, e.id]));
  const users = await x.all(
    "SELECT id, local FROM users WHERE local IS NOT NULL AND TRIM(local) <> ''", []
  );
  const candidates = [];
  for (const u of users) {
    const canon = reconResult.valueToCanon.get(u.local) || (estabByCanon.has(u.local) ? u.local : null);
    const establecimiento_id = canon ? estabByCanon.get(canon) : null;
    if (establecimiento_id) candidates.push({ usuario_id: u.id, establecimiento_id, local: u.local });
  }
  return candidates;
}

export async function applyBackfill(x, candidates) {
  const now = new Date().toISOString();
  let inserted = 0;
  for (const c of candidates) {
    const r = await x.run(
      `INSERT INTO user_locations (usuario_id, establecimiento_id, activo, desde, hasta, creado_en)
       VALUES (?, ?, 1, ?, NULL, ?)
       ON CONFLICT (usuario_id, establecimiento_id) DO NOTHING
       RETURNING id`, [c.usuario_id, c.establecimiento_id, now, now]
    );
    if (r) inserted += 1; // RETURNING vacío ⇒ ya existía (ON CONFLICT DO NOTHING)
  }
  return inserted;
}

// ── Grandfather: SOLO informe de candidatos + aplicación por lista explícita ─
// NUNCA inserta "todos los usuarios". Excluye automáticamente: Dirección (acceso global
// explícito futuro) y trabajadores asignables por backfill.
export async function computeGrandfatherCandidates(x, assignedUserIds = []) {
  const assigned = new Set(assignedUserIds);
  const users = await x.all("SELECT id, username, rol, nombre, local FROM users ORDER BY id", []);
  return users.map((u) => {
    const willGetBackfill = assigned.has(u.id);
    let excludedReason = null;
    if (u.rol === "direccion") excludedReason = "Dirección: acceso global explícito (no necesita grandfather)";
    else if (willGetBackfill) excludedReason = "trabajador asignable por backfill (no necesita grandfather)";
    return {
      id: u.id, username: u.username, rol: u.rol, nombre: u.nombre, local: u.local,
      willGetBackfill,
      autoExcluded: !!excludedReason,
      excludedReason,
      posibleLegacy: excludedReason ? null
        : "cuenta de gestión/compartida sin asignación automática: podría necesitar acceso legado temporal",
    };
  });
}

// Aplica SOLO los IDs aprobados explícitamente (validando que existan). Idempotente.
export async function applyGrandfather(x, approvedIds) {
  if (!Array.isArray(approvedIds)) throw new Error("whitelist grandfather explícita requerida (array, puede ser vacío)");
  const now = new Date().toISOString();
  const applied = [];
  for (const id of approvedIds) {
    const u = await x.get("SELECT id FROM users WHERE id = ?", [id]);
    if (!u) throw new Error(`legacy-user id ${id} no existe en users`);
    await x.run(
      `INSERT INTO legacy_access (usuario_id, motivo, concedido_en, activo, revocar_en)
       VALUES (?, 'cuenta existente en la migración', ?, 1, NULL)
       ON CONFLICT (usuario_id) DO NOTHING`, [id, now]
    );
    applied.push(id);
  }
  return { count: applied.length, applied };
}

// ── Estado de migración (sin datos personales ni contraseñas) ────────────────
export async function recordMigrationState(x, info) {
  const now = new Date().toISOString();
  const set = (clave, valor) => x.run(
    `INSERT INTO migration_state (clave, valor, actualizado_en) VALUES (?, ?, ?)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = EXCLUDED.actualizado_en`,
    [clave, String(valor), now]
  );
  await set("migration_version", MIGRATION_VERSION);
  await set("migrated_at", now);
  await set("catalog_checksum", catalogChecksum());
  await set("users_count", info.usersCount);
  await set("workers_assigned", info.workersAssigned);
  await set("grandfather_ids", JSON.stringify(info.grandfatherIds || []));
  await set("reconciliation_result", info.reconOk ? "ok" : "blocked");
}

// ── Orquestador ATÓMICO del --backfill ───────────────────────────────────────
// Orden: schema → catálogo → reconciliar → abortar si desconocido/ambiguo →
// asignaciones de trabajadores → whitelist grandfather aprobada → migration_state → commit.
// Cualquier fallo revierte TODO. `x` DEBE estar ligado a un único cliente (pool.connect())
// para que BEGIN/COMMIT/ROLLBACK sean una transacción real en PostgreSQL.
export async function migrarBackfill(x, { approvedLegacyIds } = {}) {
  if (!Array.isArray(approvedLegacyIds)) {
    throw new Error("Se requiere una whitelist grandfather explícita (aunque sea []).");
  }
  await x.run("BEGIN");
  try {
    await ensureSchema(x);
    await seedCatalogo(x);

    const recon = await reconcile(x);
    if (!recon.ok) throw new Error(`Reconciliación bloqueada: ${recon.blockers.join("; ")}`);

    const backfillCandidates = await computeBackfillCandidates(x, recon);
    const workersAssigned = await applyBackfill(x, backfillCandidates);

    const gf = await applyGrandfather(x, approvedLegacyIds);

    const usersCount = (await x.get("SELECT COUNT(*)::int AS n FROM users", [])).n;
    await recordMigrationState(x, {
      usersCount, workersAssigned, grandfatherIds: gf.applied, reconOk: recon.ok,
    });

    await x.run("COMMIT");
    return { recon, workersAssigned, grandfather: gf, usersCount };
  } catch (e) {
    try { await x.run("ROLLBACK"); } catch { /* noop */ }
    throw e;
  }
}

// Nombres de las tablas/índices creados por esta migración (para rollback documentado).
export const CREATED_TABLES = ["empresas", "establecimientos", "user_locations", "legacy_access", "migration_state"];
export const CREATED_INDEXES = ["idx_user_locations_usuario", "idx_user_locations_estab", "idx_establecimientos_activo"];
