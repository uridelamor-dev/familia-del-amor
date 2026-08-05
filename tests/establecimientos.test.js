// Pruebas de la Iteración 2 (modelo de establecimientos). Usan BD temporales en archivo,
// nunca la database.sqlite real. FKs activadas explícitamente. No arrancan el servidor.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import sqlite3 from "sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CATALOGO_CANONICO, EXPECTED_LOCAL_TABLES, reconcile, normalizeForCompare, catalogChecksum,
} from "../src/db/reconciliation.js";
import {
  ensureSchema, seedCatalogo, computeBackfillCandidates, applyBackfill,
  computeGrandfatherCandidates, applyGrandfather, migrarBackfill, CREATED_TABLES,
} from "../src/db/establecimientos.migration.js";
import { run } from "../scripts/migrate-establecimientos.js";

// ── Helpers ──────────────────────────────────────────────────────────────────
function mkDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "est2-"));
  return { dir, dbPath: path.join(dir, "t.sqlite") };
}
function open(dbPath) {
  const db = new sqlite3.Database(dbPath);
  const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));
  const get = (s, p = []) => new Promise((res, rej) => db.get(s, p, (e, r) => e ? rej(e) : res(r)));
  const all = (s, p = []) => new Promise((res, rej) => db.all(s, p, (e, r) => e ? rej(e) : res(r || [])));
  const close = () => new Promise((r) => db.close(() => r()));
  return { run, get, all, close };
}
async function openFk(dbPath) { const x = open(dbPath); await x.run("PRAGMA foreign_keys = ON"); return x; }
async function createUsers(x) {
  await x.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT,
    rol TEXT NOT NULL, nombre TEXT, local TEXT, creado_en TEXT NOT NULL)`);
}
async function addUser(x, { id, username, rol, nombre = "", local = null }) {
  await x.run(`INSERT INTO users (id, username, password_hash, rol, nombre, local, creado_en)
    VALUES (?, ?, 'x', ?, ?, ?, ?)`, [id, username, rol, nombre, local, "2026-01-01T00:00:00Z"]);
}
async function tableExists(x, t) {
  return !!(await x.get("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [t]));
}
async function count(x, t) {
  if (!(await tableExists(x, t))) return 0;
  return (await x.get(`SELECT COUNT(*) AS n FROM "${t}"`, [])).n;
}
const B = "La Tapeta - Blanes", L = "La Tapeta - Lloret";

// ── Esquema / catálogo ───────────────────────────────────────────────────────
describe("Esquema y catálogo", () => {
  test("creación de tablas idempotente (ejecutable dos veces)", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await ensureSchema(x); await ensureSchema(x);
    for (const t of CREATED_TABLES) assert.ok(await tableExists(x, t), `falta ${t}`);
    await x.close();
  });
  test("catálogo sin duplicados aunque se siembre dos veces", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await ensureSchema(x); await seedCatalogo(x); await seedCatalogo(x);
    assert.equal(await count(x, "establecimientos"), CATALOGO_CANONICO.length);
    const nulls = (await x.get("SELECT COUNT(*) AS n FROM establecimientos WHERE empresa_id IS NULL", [])).n;
    assert.equal(nulls, CATALOGO_CANONICO.length, "empresa_id debe quedar NULL (sin inventar empresas)");
    await x.close();
  });
});

// ── Reconciliación ───────────────────────────────────────────────────────────
describe("Reconciliación", () => {
  test("coincidencia exacta ⇒ ok", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "u1", rol: "trabajador", local: B });
    const r = await reconcile(x);
    assert.equal(r.ok, true);
    assert.equal(r.rows.find((y) => y.local === B).matchType, "exacta");
    await x.close();
  });
  test("espacios finales ⇒ coincidencia normalizada, ok", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "u1", rol: "trabajador", local: "La Tapeta - Blanes  " });
    const r = await reconcile(x);
    assert.equal(r.ok, true);
    assert.equal(r.rows[0].matchType, "normalizada");
    assert.equal(r.rows[0].canonical, B);
    await x.close();
  });
  test("mayúsc/minúsc y guion se resuelven de forma determinista (no ambiguo)", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "u1", rol: "trabajador", local: "la tapeta – blanes" }); // guion largo + minúsculas
    const r = await reconcile(x);
    assert.equal(r.ok, true);
    assert.equal(r.ambiguous.length, 0);
    assert.equal(r.rows[0].canonical, B);
    await x.close();
  });
  test("valor desconocido ⇒ bloqueo", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "u1", rol: "trabajador", local: "Bar Pepe" });
    const r = await reconcile(x);
    assert.equal(r.ok, false);
    assert.equal(r.unknown.length, 1);
    await x.close();
  });
  test("tabla inesperada con columna 'local' ⇒ bloqueo", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "u1", rol: "trabajador", local: B });
    await x.run(`CREATE TABLE tabla_inesperada (id INTEGER PRIMARY KEY, local TEXT)`);
    await x.run(`INSERT INTO tabla_inesperada (local) VALUES (?)`, [B]);
    const r = await reconcile(x);
    assert.equal(r.ok, false);
    assert.ok(r.unexpectedTables.includes("tabla_inesperada"));
    await x.close();
  });
  test("normalizeForCompare no altera y solo sirve para comparar", () => {
    assert.equal(normalizeForCompare("  La  Tapeta – Blanes  "), "la tapeta - blanes");
    assert.equal(catalogChecksum().length, 16);
    assert.equal(EXPECTED_LOCAL_TABLES.includes("reservas"), true);
  });
  test("allowlist cerrada incluye las 3 tablas verificadas y no usa comodines", () => {
    for (const t of ["facturas_emails_procesados", "followup_scheduled", "sara_respuestas"]) {
      assert.ok(EXPECTED_LOCAL_TABLES.includes(t), `falta ${t} en la allowlist`);
    }
    assert.ok(EXPECTED_LOCAL_TABLES.every((t) => typeof t === "string" && !t.includes("*")), "sin comodines");
  });
  test("una tabla nueva NO listada sigue bloqueando (lista cerrada)", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "u1", rol: "trabajador", local: B });
    await x.run(`CREATE TABLE otra_tabla_local (id INTEGER PRIMARY KEY, local TEXT)`);
    await x.run(`INSERT INTO otra_tabla_local (local) VALUES (?)`, [B]);
    const r = await reconcile(x);
    assert.equal(r.ok, false);
    assert.ok(r.unexpectedTables.includes("otra_tabla_local"));
    await x.close();
  });
});

// ── Backfill ─────────────────────────────────────────────────────────────────
describe("Backfill de trabajadores", () => {
  test("trabajador con local válido recibe asignación al establecimiento correcto", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "w1", rol: "trabajador", local: B });
    await migrarBackfill(x, { approvedLegacyIds: [] });
    const rows = await x.all("SELECT ul.usuario_id, e.local_text FROM user_locations ul JOIN establecimientos e ON e.id = ul.establecimiento_id", []);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { usuario_id: 1, local_text: B });
    await x.close();
  });
  test("trabajador sin local no recibe asignación", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "w1", rol: "trabajador", local: null });
    await migrarBackfill(x, { approvedLegacyIds: [] });
    assert.equal(await count(x, "user_locations"), 0);
    await x.close();
  });
  test("segundo pase no duplica filas", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "w1", rol: "trabajador", local: B });
    await addUser(x, { id: 2, username: "w2", rol: "trabajador", local: L });
    await migrarBackfill(x, { approvedLegacyIds: [] });
    await migrarBackfill(x, { approvedLegacyIds: [] });
    assert.equal(await count(x, "user_locations"), 2);
    assert.equal(await count(x, "establecimientos"), CATALOGO_CANONICO.length);
    await x.close();
  });
});

// ── Grandfather ──────────────────────────────────────────────────────────────
describe("Grandfather explícito", () => {
  async function setup() {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "direccion", rol: "direccion" });
    await addUser(x, { id: 2, username: "w1", rol: "trabajador", local: B });      // asignable
    await addUser(x, { id: 3, username: "encargado", rol: "encargado", local: null }); // compartida
    return { x, dbPath };
  }
  test("trabajador asignado y Dirección quedan auto-excluidos; compartida es candidata", async () => {
    const { x } = await setup();
    const gf = await computeGrandfatherCandidates(x, [2]);
    const byId = Object.fromEntries(gf.map((c) => [c.id, c]));
    assert.equal(byId[1].autoExcluded, true); // Dirección
    assert.equal(byId[2].autoExcluded, true); // trabajador asignado
    assert.equal(byId[3].autoExcluded, false); // compartida
    assert.ok(byId[3].posibleLegacy);
    await x.close();
  });
  test("solo se inserta en legacy_access el ID aprobado explícitamente", async () => {
    const { x } = await setup();
    await migrarBackfill(x, { approvedLegacyIds: [3] });
    const ids = (await x.all("SELECT usuario_id FROM legacy_access ORDER BY usuario_id", [])).map((r) => r.usuario_id);
    assert.deepEqual(ids, [3]);
    await x.close();
  });
  test("whitelist vacía es válida (legacy_access queda vacío)", async () => {
    const { x } = await setup();
    await migrarBackfill(x, { approvedLegacyIds: [] });
    assert.equal(await count(x, "legacy_access"), 0);
    await x.close();
  });
  test("usuario nuevo no entra por una segunda ejecución con la misma whitelist", async () => {
    const { x } = await setup();
    await migrarBackfill(x, { approvedLegacyIds: [3] });
    await addUser(x, { id: 4, username: "nuevo", rol: "encargado", local: null });
    await migrarBackfill(x, { approvedLegacyIds: [3] });
    const ids = (await x.all("SELECT usuario_id FROM legacy_access ORDER BY usuario_id", [])).map((r) => r.usuario_id);
    assert.deepEqual(ids, [3]);
    await x.close();
  });
  test("aplicar un ID inexistente falla (no se inserta 'todos')", async () => {
    const { x } = await setup();
    await ensureSchema(x); await seedCatalogo(x);
    await assert.rejects(() => applyGrandfather(x, [9999]), /no existe/);
    await x.close();
  });
});

// ── Atomicidad / transacción ─────────────────────────────────────────────────
describe("Atomicidad del backfill", () => {
  test("fallo durante el backfill revierte TODO (sin migration_state ni parciales)", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "w1", rol: "trabajador", local: B }); // se asignaría
    // ID de grandfather inexistente ⇒ applyGrandfather lanza ⇒ ROLLBACK
    await assert.rejects(() => migrarBackfill(x, { approvedLegacyIds: [9999] }), /no existe/);
    assert.equal(await count(x, "user_locations"), 0, "sin asignaciones parciales");
    assert.equal(await count(x, "legacy_access"), 0, "sin legacy parcial");
    assert.equal(await count(x, "migration_state"), 0, "migration_state no queda tras rollback");
    await x.close();
  });
  test("migration_state registra la información mínima tras un backfill correcto", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "w1", rol: "trabajador", local: B });
    await migrarBackfill(x, { approvedLegacyIds: [] });
    const st = Object.fromEntries((await x.all("SELECT clave, valor FROM migration_state", [])).map((r) => [r.clave, r.valor]));
    for (const k of ["migration_version", "migrated_at", "catalog_checksum", "users_count", "workers_assigned", "grandfather_ids", "reconciliation_result"]) {
      assert.ok(k in st, `falta ${k} en migration_state`);
    }
    assert.equal(st.workers_assigned, "1");
    assert.equal(st.reconciliation_result, "ok");
    await x.close();
  });
});

// ── Foreign keys ─────────────────────────────────────────────────────────────
describe("Foreign keys (runner/pruebas con PRAGMA foreign_keys=ON)", () => {
  test("no se puede asignar a usuario o establecimiento inexistente", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "w1", rol: "trabajador", local: B });
    await ensureSchema(x); await seedCatalogo(x);
    const estab = await x.get("SELECT id FROM establecimientos WHERE local_text = ?", [B]);
    const now = "2026-01-01T00:00:00Z";
    await assert.rejects(() => x.run(
      `INSERT INTO user_locations (usuario_id, establecimiento_id, activo, desde, creado_en) VALUES (?, ?, 1, ?, ?)`,
      [9999, estab.id, now, now]), /FOREIGN KEY/);
    await assert.rejects(() => x.run(
      `INSERT INTO user_locations (usuario_id, establecimiento_id, activo, desde, creado_en) VALUES (?, ?, 1, ?, ?)`,
      [1, 9999, now, now]), /FOREIGN KEY/);
    await x.close();
  });
});

// ── No modifica lo existente ─────────────────────────────────────────────────
describe("No modifica tablas/columnas ni rutas existentes", () => {
  test("users y una tabla reservas de fixture quedan intactas", async () => {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    await addUser(x, { id: 1, username: "w1", rol: "trabajador", local: B });
    await x.run(`CREATE TABLE reservas (id INTEGER PRIMARY KEY, local TEXT NOT NULL, dia TEXT)`);
    await x.run(`INSERT INTO reservas (local, dia) VALUES (?, '2026-08-10')`, [L]);
    const usersBefore = await x.all("PRAGMA table_info(users)", []);
    const resvBefore = await x.all("PRAGMA table_info(reservas)", []);
    const usersCount = await count(x, "users"), resvCount = await count(x, "reservas");
    await migrarBackfill(x, { approvedLegacyIds: [] });
    assert.deepEqual(await x.all("PRAGMA table_info(users)", []), usersBefore);
    assert.deepEqual(await x.all("PRAGMA table_info(reservas)", []), resvBefore);
    assert.equal(await count(x, "users"), usersCount);
    assert.equal(await count(x, "reservas"), resvCount);
    await x.close();
  });
  test("server.js no importa los módulos de la migración", () => {
    const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
    assert.ok(!/establecimientos\.migration/.test(src));
    assert.ok(!/db\/reconciliation/.test(src));
  });
});

// ── Runner ───────────────────────────────────────────────────────────────────
describe("Runner (modos y protecciones)", () => {
  const quiet = { log() {}, err() {} };
  async function seedFile(users) {
    const { dbPath } = mkDb(); const x = await openFk(dbPath); await createUsers(x);
    for (const u of users) await addUser(x, u); await x.close(); return dbPath;
  }
  test("--dry-run no modifica la base de datos", async () => {
    const dbPath = await seedFile([{ id: 1, username: "w1", rol: "trabajador", local: B }]);
    const r = await run(["--dry-run", "--db", dbPath], quiet);
    assert.equal(r.code, 0);
    const x = await openFk(dbPath);
    assert.equal(await tableExists(x, "establecimientos"), false, "dry-run no debe crear tablas");
    await x.close();
  });
  test("--dry-run devuelve código ≠ 0 si hay bloqueos", async () => {
    const dbPath = await seedFile([{ id: 1, username: "w1", rol: "trabajador", local: "Bar Pepe" }]);
    const r = await run(["--dry-run", "--db", dbPath], quiet);
    assert.equal(r.code, 1);
  });
  test("--schema-only crea tablas vacías (sin catálogo ni backfill)", async () => {
    const dbPath = await seedFile([{ id: 1, username: "w1", rol: "trabajador", local: B }]);
    const r = await run(["--schema-only", "--db", dbPath], quiet);
    assert.equal(r.code, 0);
    const x = await openFk(dbPath);
    assert.equal(await tableExists(x, "establecimientos"), true);
    assert.equal(await count(x, "establecimientos"), 0, "schema-only no siembra catálogo");
    assert.equal(await count(x, "user_locations"), 0);
    await x.close();
  });
  test("--backfill sin whitelist explícita se rechaza (código 2)", async () => {
    const dbPath = await seedFile([{ id: 1, username: "w1", rol: "trabajador", local: B }]);
    const r = await run(["--backfill", "--db", dbPath], quiet);
    assert.equal(r.code, 2);
    const x = await openFk(dbPath);
    assert.equal(await tableExists(x, "establecimientos"), false, "no debe haber tocado nada");
    await x.close();
  });
  test("--backfill con whitelist vacía explícita funciona", async () => {
    const dbPath = await seedFile([{ id: 1, username: "w1", rol: "trabajador", local: B }]);
    const r = await run(["--backfill", "--db", dbPath, "--legacy-users", ""], quiet);
    assert.equal(r.code, 0);
    const x = await openFk(dbPath);
    assert.equal(await count(x, "establecimientos"), CATALOGO_CANONICO.length);
    assert.equal(await count(x, "user_locations"), 1);
    assert.equal(await count(x, "legacy_access"), 0);
    await x.close();
  });
  test("protección contra ejecución accidental en producción", async () => {
    const dbPath = await seedFile([{ id: 1, username: "w1", rol: "trabajador", local: B }]);
    const prev = process.env.DB_PATH;
    process.env.DB_PATH = dbPath; // hace que looksLikeProd sea true
    try {
      const r = await run(["--schema-only", "--db", dbPath], quiet);
      assert.equal(r.code, 2, "sin --confirm-production-migration debe rechazarse");
      const r2 = await run(["--schema-only", "--db", dbPath, "--confirm-production-migration"], quiet);
      assert.equal(r2.code, 0, "con confirmación explícita procede");
    } finally {
      if (prev === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = prev;
    }
  });
});
