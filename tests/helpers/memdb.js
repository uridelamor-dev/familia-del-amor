// Emulador PostgreSQL en memoria para pruebas (JS puro; NO usa pg ni sqlite3).
// Reproduce el contrato de los wrappers de server.js (dbGet/dbAll/dbRun):
//   - placeholders `?` (los módulos los pasan tal cual; aquí se resuelven por posición),
//   - INSERT ... RETURNING id  ⇒ run() devuelve { id, ... } (fila) o undefined,
//   - ON CONFLICT (...) DO NOTHING / DO UPDATE,
//   - tabla ausente ⇒ Error con code "42P01" (undefined_table de PostgreSQL),
//   - transacciones BEGIN/COMMIT/ROLLBACK con snapshot,
//   - COUNT(*)::int devuelto como número.
// Solo cubre las consultas EXACTAS que emiten los módulos portados (dispatch por forma).
// Es infraestructura de test: fiel a la semántica de PostgreSQL, no un motor SQL general.

const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const clone = (o) => JSON.parse(JSON.stringify(o));

function undefinedTable(table) {
  const e = new Error(`relation "${table}" does not exist`);
  e.code = "42P01";
  return e;
}

export function makeMemDb(seed = {}) {
  // Tablas presentes (creadas). Cada una: array de filas.
  const store = {};
  const columns = {}; // nombre de tabla -> Set(columnas conocidas)
  const seq = {};     // nombre de tabla -> último id
  const KNOWN_UNIQUE = {
    establecimientos: [["local_text"]],
    user_locations: [["usuario_id", "establecimiento_id"]],
    legacy_access: [["usuario_id"]],
    migration_state: [["clave"]],
    users: [["username"]],
  };
  const DEFAULT_COLS = {
    users: ["id", "username", "password_hash", "rol", "nombre", "local", "creado_en"],
    maintenance_issues: ["id", "local", "titulo", "descripcion", "estado", "creado_en"],
    establecimientos: ["id", "nombre", "local_text", "empresa_id", "activo", "creado_en"],
    user_locations: ["id", "usuario_id", "establecimiento_id", "activo", "desde", "hasta", "creado_en"],
    legacy_access: ["id", "usuario_id", "motivo", "concedido_en", "activo", "revocar_en"],
    empresas: ["id", "nombre", "cif", "provisional", "activo", "creado_en"],
    migration_state: ["clave", "valor", "actualizado_en"],
  };
  function ensureTable(t) {
    if (!store[t]) { store[t] = []; columns[t] = new Set(DEFAULT_COLS[t] || []); seq[t] = 0; }
  }
  function reg(t, rows) {
    ensureTable(t);
    for (const r of rows) { for (const k of Object.keys(r)) columns[t].add(k); store[t].push(clone(r)); if (typeof r.id === "number" && r.id > seq[t]) seq[t] = r.id; }
  }
  for (const [t, rows] of Object.entries(seed)) reg(t, rows || []);

  let tx = null; // snapshot para ROLLBACK

  const asDate = (v) => (v == null ? null : String(v).slice(0, 10)); // ::date ≈ YYYY-MM-DD

  function run(sql, params = []) {
    const q = norm(sql);
    let pi = 0;
    const next = () => params[pi++];

    // ── Transacciones ─────────────────────────────────────────────
    if (/^BEGIN/i.test(q)) { tx = clone(store); return undefined; }
    if (/^COMMIT/i.test(q)) { tx = null; return undefined; }
    if (/^ROLLBACK/i.test(q)) { if (tx) { for (const k of Object.keys(store)) delete store[k]; Object.assign(store, tx); tx = null; } return undefined; }

    // ── DDL: CREATE TABLE / CREATE INDEX (registra la tabla vacía) ─
    let m = /^CREATE TABLE IF NOT EXISTS (\w+)/i.exec(q);
    if (m) { ensureTable(m[1]); return undefined; }
    if (/^CREATE INDEX/i.test(q)) return undefined;

    // ── INSERT ────────────────────────────────────────────────────
    m = /^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]*)\)(.*)$/i.exec(q);
    if (m) {
      const table = m[1];
      ensureTable(table);
      const cols = m[2].split(",").map((c) => c.trim());
      const valToks = m[3].split(",").map((c) => c.trim());
      const rest = m[4] || "";
      const row = {};
      cols.forEach((c, idx) => {
        const tok = valToks[idx];
        if (tok === "?") row[c] = next();
        else if (/^NULL$/i.test(tok)) row[c] = null;
        else row[c] = tok.replace(/^'|'$/g, ""); // literal 'abierta', 1, 0
      });
      // ON CONFLICT
      const conf = /ON CONFLICT \(([^)]*)\) DO (NOTHING|UPDATE SET (.+?))(?: RETURNING| $|$)/i.exec(rest);
      if (conf) {
        const keys = conf[1].split(",").map((s) => s.trim());
        const existing = store[table].find((r) => keys.every((k) => String(r[k]) === String(row[k])));
        if (existing) {
          if (/^NOTHING/i.test(conf[2])) return undefined; // DO NOTHING ⇒ sin fila
          // DO UPDATE SET col = EXCLUDED.col, ...
          const sets = conf[3].split(",").map((s) => s.trim());
          for (const st of sets) {
            const mm = /^(\w+)\s*=\s*EXCLUDED\.(\w+)$/i.exec(st);
            if (mm) existing[mm[1]] = row[mm[2]];
          }
          return /RETURNING/i.test(rest) ? clone(existing) : undefined;
        }
      }
      if (columns[table].has("id") && row.id == null) { row.id = ++seq[table]; }
      for (const k of Object.keys(row)) columns[table].add(k);
      store[table].push(row);
      return /RETURNING/i.test(rest) ? clone(row) : undefined;
    }

    // ── UPDATE maintenance_issues SET estado = ? WHERE id = ? [RETURNING id] ──
    m = /^UPDATE (\w+) SET estado = \? WHERE id = \?( RETURNING id)?$/i.exec(q);
    if (m) {
      const table = m[1];
      if (!store[table]) throw undefinedTable(table);
      const estado = next(); const id = next();
      const found = store[table].find((r) => String(r.id) === String(id));
      if (found) found.estado = estado;
      return m[2] ? (found ? { id: found.id } : undefined) : undefined;
    }

    if (!store[/INTO (\w+)/i.exec(q)?.[1]]) { /* fallthrough */ }
    throw new Error("memdb: consulta run() no soportada:\n" + q);
  }

  function all(sql, params = []) {
    const q = norm(sql);
    let pi = 0; const next = () => params[pi++];

    // information_schema.tables
    if (/FROM information_schema\.tables/i.test(q)) {
      return Object.keys(store).sort().map((name) => ({ name }));
    }
    // information_schema.columns WHERE table_name = ?
    if (/FROM information_schema\.columns/i.test(q)) {
      const t = next();
      const cols = store[t] ? [...columns[t]] : [];
      return cols.map((name) => ({ name }));
    }
    // reconciliation: SELECT local AS local, COUNT(*)::int AS n FROM "T" WHERE ... GROUP BY local
    let m = /FROM "(\w+)" WHERE local IS NOT NULL AND TRIM\(local\) <> '' GROUP BY local/i.exec(q);
    if (m) {
      const t = m[1];
      if (!store[t]) throw undefinedTable(t);
      const groups = new Map();
      for (const r of store[t]) {
        if (r.local == null || String(r.local).trim() === "") continue;
        groups.set(r.local, (groups.get(r.local) || 0) + 1);
      }
      return [...groups.entries()].map(([local, n]) => ({ local, n }));
    }
    // access A1: user_locations JOIN establecimientos
    if (/FROM user_locations ul JOIN establecimientos e/i.test(q)) {
      if (!store.user_locations) throw undefinedTable("user_locations");
      if (!store.establecimientos) throw undefinedTable("establecimientos");
      const usuarioId = next(); const d1 = asDate(next()); const d2 = asDate(next());
      const estById = new Map(store.establecimientos.map((e) => [e.id, e]));
      const out = [];
      for (const ul of store.user_locations) {
        const e = estById.get(ul.establecimiento_id);
        if (!e) continue;
        if (String(ul.usuario_id) !== String(usuarioId)) continue;
        if (Number(ul.activo) !== 1 || Number(e.activo) !== 1) continue;
        if (ul.desde != null && asDate(ul.desde) > d1) continue;
        if (ul.hasta != null && asDate(ul.hasta) < d2) continue;
        out.push({ eid: e.id, lt: e.local_text });
      }
      return out;
    }
    // scope S1: SELECT local_text FROM establecimientos WHERE activo = 1 AND id IN (?,...)
    if (/SELECT local_text FROM establecimientos WHERE activo = 1 AND id IN/i.test(q)) {
      if (!store.establecimientos) throw undefinedTable("establecimientos");
      const ids = params.map((v) => String(v));
      return store.establecimientos
        .filter((e) => Number(e.activo) === 1 && ids.includes(String(e.id)))
        .map((e) => ({ local_text: e.local_text }));
    }
    // maintenance M2: SELECT * FROM maintenance_issues WHERE local IN (?,...) ORDER BY creado_en DESC
    if (/FROM maintenance_issues WHERE local IN/i.test(q)) {
      if (!store.maintenance_issues) throw undefinedTable("maintenance_issues");
      const locals = params.map((v) => String(v));
      return store.maintenance_issues
        .filter((r) => locals.includes(String(r.local)))
        .sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)))
        .map(clone);
    }
    // maintenance M1: SELECT * FROM maintenance_issues ORDER BY creado_en DESC
    if (/^SELECT \* FROM maintenance_issues ORDER BY creado_en DESC$/i.test(q)) {
      if (!store.maintenance_issues) throw undefinedTable("maintenance_issues");
      return [...store.maintenance_issues].sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en))).map(clone);
    }
    // migration: SELECT id, local_text FROM establecimientos
    if (/^SELECT id, local_text FROM establecimientos$/i.test(q)) {
      if (!store.establecimientos) throw undefinedTable("establecimientos");
      return store.establecimientos.map((e) => ({ id: e.id, local_text: e.local_text }));
    }
    // migration: SELECT id, local FROM users WHERE local IS NOT NULL AND TRIM(local) <> ''
    if (/FROM users WHERE local IS NOT NULL AND TRIM\(local\) <> ''/i.test(q)) {
      if (!store.users) throw undefinedTable("users");
      return store.users.filter((u) => u.local != null && String(u.local).trim() !== "").map((u) => ({ id: u.id, local: u.local }));
    }
    // migration: SELECT id, username, rol, nombre, local FROM users ORDER BY id
    if (/SELECT id, username, rol, nombre, local FROM users ORDER BY id/i.test(q)) {
      if (!store.users) throw undefinedTable("users");
      return [...store.users].sort((a, b) => a.id - b.id).map((u) => ({ id: u.id, username: u.username, rol: u.rol, nombre: u.nombre, local: u.local }));
    }
    throw new Error("memdb: consulta all() no soportada:\n" + q);
  }

  function get(sql, params = []) {
    const q = norm(sql);
    let pi = 0; const next = () => params[pi++];
    // access A2: SELECT 1 AS ok FROM legacy_access WHERE usuario_id = ? AND activo = 1 AND (... revocar_en ...) LIMIT 1
    if (/FROM legacy_access WHERE usuario_id = \? AND activo = 1/i.test(q)) {
      if (!store.legacy_access) throw undefinedTable("legacy_access");
      const usuarioId = next(); const ref = asDate(next());
      const row = store.legacy_access.find((r) =>
        String(r.usuario_id) === String(usuarioId) && Number(r.activo) === 1 &&
        (r.revocar_en == null || asDate(r.revocar_en) >= ref));
      return row ? { ok: 1 } : null;
    }
    // scope S2: SELECT id FROM establecimientos WHERE local_text = ? AND activo = 1
    if (/SELECT id FROM establecimientos WHERE local_text = \? AND activo = 1/i.test(q)) {
      if (!store.establecimientos) throw undefinedTable("establecimientos");
      const lt = next();
      const row = store.establecimientos.find((e) => e.local_text === lt && Number(e.activo) === 1);
      return row ? { id: row.id } : null;
    }
    // maintenance M4: SELECT id, local FROM maintenance_issues WHERE id = ?
    if (/SELECT id, local FROM maintenance_issues WHERE id = \?/i.test(q)) {
      if (!store.maintenance_issues) throw undefinedTable("maintenance_issues");
      const id = next();
      const row = store.maintenance_issues.find((r) => String(r.id) === String(id));
      return row ? { id: row.id, local: row.local } : null;
    }
    // migration: SELECT id FROM users WHERE id = ?
    if (/SELECT id FROM users WHERE id = \?/i.test(q)) {
      if (!store.users) throw undefinedTable("users");
      const id = next();
      const row = store.users.find((u) => String(u.id) === String(id));
      return row ? { id: row.id } : null;
    }
    // migration: SELECT COUNT(*)::int AS n FROM users
    if (/SELECT COUNT\(\*\)::int AS n FROM users/i.test(q)) {
      if (!store.users) throw undefinedTable("users");
      return { n: store.users.length };
    }
    throw new Error("memdb: consulta get() no soportada:\n" + q);
  }

  return {
    get: async (sql, p) => get(sql, p),
    all: async (sql, p) => all(sql, p),
    run: async (sql, p) => run(sql, p),
    _store: store, // inspección en tests
  };
}

// db que SIEMPRE lanza un error real de infraestructura (para probar fail-closed).
export const throwingDb = {
  get: async () => { throw new Error("connection terminated unexpectedly"); },
  all: async () => { throw new Error("connection terminated unexpectedly"); },
  run: async () => { throw new Error("connection terminated unexpectedly"); },
};
