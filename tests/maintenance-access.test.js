// Pruebas del enforcement por establecimiento en Mantenimiento (Iteración 4). Se prueba el
// SERVICIO directamente (sin arrancar Express) contra BD temporales; nunca la BD real.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import sqlite3 from "sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureSchema, seedCatalogo } from "../src/db/establecimientos.migration.js";
import {
  listMaintenanceIssues, createMaintenanceIssue, updateMaintenanceIssueStatus,
} from "../src/modules/mantenimiento/maintenance.service.js";

const NOW = "2026-08-05", PAST = "2026-01-01";
const B = "La Tapeta - Blanes", L = "La Tapeta - Lloret", G = "La Tapeta - Girona";

// Adaptador con run que devuelve { lastID, changes } (como el de server.js).
function openDb(dbPath) {
  const db = new sqlite3.Database(dbPath);
  const get = (s, p = []) => new Promise((r, j) => db.get(s, p, (e, x) => e ? j(e) : r(x)));
  const all = (s, p = []) => new Promise((r, j) => db.all(s, p, (e, x) => e ? j(e) : r(x || [])));
  const run = (s, p = []) => new Promise((r, j) => db.run(s, p, function (e) { e ? j(e) : r({ lastID: this.lastID, changes: this.changes }); }));
  const close = () => new Promise((r) => db.close(() => r()));
  return { get, all, run, close, _db: db };
}
async function createMaintTable(x) {
  await x.run(`CREATE TABLE IF NOT EXISTS maintenance_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT, local TEXT NOT NULL, titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'abierta', creado_en TEXT NOT NULL)`);
}
async function createUsers(x) {
  await x.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT,
    rol TEXT NOT NULL, nombre TEXT, local TEXT, creado_en TEXT NOT NULL)`);
}
// BD completa (con tablas nuevas) para camino ON.
async function full() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mant-"));
  const x = openDb(path.join(dir, "t.sqlite"));
  await x.run("PRAGMA foreign_keys = ON");
  await createUsers(x); await createMaintTable(x); await ensureSchema(x); await seedCatalogo(x);
  return x;
}
// BD mínima (solo maintenance_issues + users), SIN tablas nuevas → para camino OFF.
async function minimal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mant0-"));
  const x = openDb(path.join(dir, "t.sqlite"));
  await createUsers(x); await createMaintTable(x);
  return x;
}
async function addUser(x, id, rol) { await x.run(`INSERT INTO users (id, username, password_hash, rol, creado_en) VALUES (?, ?, 'x', ?, ?)`, [id, "u" + id, rol, NOW]); }
async function estabId(x, lt) { return (await x.get("SELECT id FROM establecimientos WHERE local_text = ?", [lt])).id; }
async function assign(x, uid, eid, { activo = 1, hasta = null } = {}) { await x.run(`INSERT INTO user_locations (usuario_id, establecimiento_id, activo, desde, hasta, creado_en) VALUES (?, ?, ?, ?, ?, ?)`, [uid, eid, activo, PAST, hasta, NOW]); }
async function legacy(x, uid, { revocar_en = null } = {}) { await x.run(`INSERT INTO legacy_access (usuario_id, motivo, concedido_en, activo, revocar_en) VALUES (?, 't', ?, 1, ?)`, [uid, NOW, revocar_en]); }
async function addIncid(x, local, titulo = "t") { const r = await x.run(`INSERT INTO maintenance_issues (local, titulo, descripcion, estado, creado_en) VALUES (?, ?, 'd', 'abierta', ?)`, [local, titulo, NOW]); return r.lastID; }
async function count(x) { return (await x.get("SELECT COUNT(*) n FROM maintenance_issues")).n; }
const dir = (id = 1) => ({ id, rol: "direccion" });
const enc = (id) => ({ id, rol: "encargado" });
const ON = (extra = {}) => ({ enabled: true, now: NOW, ...extra });

// Fake que SIEMPRE lanza error real de BD.
const xThrows = { get: async () => { throw new Error("SQLITE_IOERR: disk I/O"); }, all: async () => { throw new Error("SQLITE_IOERR: disk I/O"); }, run: async () => { throw new Error("SQLITE_IOERR: disk I/O"); } };

// ─────────────────────────── LISTADO ───────────────────────────
describe("Mantenimiento · listado (flag ON)", () => {
  async function seedIncid(x) { await addIncid(x, B); await addIncid(x, B); await addIncid(x, L); await addIncid(x, G); }
  test("Dirección ve todos los locales", async () => {
    const x = await full(); await addUser(x, 1, "direccion"); await seedIncid(x);
    const r = await listMaintenanceIssues(x, dir(1), ON());
    assert.equal(r.code, "OK"); assert.equal(r.data.length, 4); await x.close();
  });
  test("legacy vigente ve todos", async () => {
    const x = await full(); await addUser(x, 2, "encargado"); await legacy(x, 2); await seedIncid(x);
    const r = await listMaintenanceIssues(x, enc(2), ON());
    assert.equal(r.data.length, 4); await x.close();
  });
  test("assigned Blanes solo ve Blanes", async () => {
    const x = await full(); await addUser(x, 3, "encargado"); await assign(x, 3, await estabId(x, B)); await seedIncid(x);
    const r = await listMaintenanceIssues(x, enc(3), ON());
    assert.equal(r.data.length, 2); assert.ok(r.data.every(i => i.local === B)); await x.close();
  });
  test("assigned Lloret solo ve Lloret", async () => {
    const x = await full(); await addUser(x, 4, "encargado"); await assign(x, 4, await estabId(x, L)); await seedIncid(x);
    const r = await listMaintenanceIssues(x, enc(4), ON());
    assert.equal(r.data.length, 1); assert.equal(r.data[0].local, L); await x.close();
  });
  test("usuario con dos locales ve ambos", async () => {
    const x = await full(); await addUser(x, 5, "encargado");
    await assign(x, 5, await estabId(x, B)); await assign(x, 5, await estabId(x, L)); await seedIncid(x);
    const r = await listMaintenanceIssues(x, enc(5), ON());
    assert.equal(r.data.length, 3); await x.close();
  });
  test("none ⇒ 403", async () => {
    const x = await full(); await addUser(x, 6, "encargado"); await seedIncid(x);
    assert.equal((await listMaintenanceIssues(x, enc(6), ON())).code, "FORBIDDEN"); await x.close();
  });
  test("legacy caducado ⇒ 403", async () => {
    const x = await full(); await addUser(x, 7, "encargado"); await legacy(x, 7, { revocar_en: PAST }); await seedIncid(x);
    assert.equal((await listMaintenanceIssues(x, enc(7), ON())).code, "FORBIDDEN"); await x.close();
  });
  test("assigned prevalece sobre legacy (solo su local)", async () => {
    const x = await full(); await addUser(x, 8, "encargado");
    await assign(x, 8, await estabId(x, B)); await legacy(x, 8); await seedIncid(x);
    const r = await listMaintenanceIssues(x, enc(8), ON());
    assert.equal(r.data.length, 2); assert.ok(r.data.every(i => i.local === B)); await x.close();
  });
  test("?local permitido filtra; ajeno ⇒ vacío; inexistente ⇒ vacío", async () => {
    const x = await full(); await addUser(x, 9, "encargado"); await assign(x, 9, await estabId(x, B)); await seedIncid(x);
    assert.equal((await listMaintenanceIssues(x, enc(9), ON({ local: B }))).data.length, 2);
    assert.equal((await listMaintenanceIssues(x, enc(9), ON({ local: L }))).data.length, 0); // ajeno
    assert.equal((await listMaintenanceIssues(x, enc(9), ON({ local: "No Existe" }))).data.length, 0); // inexistente
    await x.close();
  });
  test("Dirección puede filtrar por un local activo canónico; no canónico ⇒ vacío", async () => {
    const x = await full(); await addUser(x, 10, "direccion"); await seedIncid(x);
    assert.equal((await listMaintenanceIssues(x, dir(10), ON({ local: L }))).data.length, 1);
    assert.equal((await listMaintenanceIssues(x, dir(10), ON({ local: "la tapeta - lloret" }))).data.length, 0); // no exacto
    await x.close();
  });
  test("establecimiento inactivo no concede acceso", async () => {
    const x = await full(); await addUser(x, 11, "encargado");
    const idB = await estabId(x, B); await x.run("UPDATE establecimientos SET activo=0 WHERE id=?", [idB]);
    await assign(x, 11, idB); await seedIncid(x);
    assert.equal((await listMaintenanceIssues(x, enc(11), ON())).code, "FORBIDDEN"); await x.close();
  });
  test("incidencia de local NO reconciliado queda oculta a assigned; visible a Dirección", async () => {
    const x = await full(); await addUser(x, 12, "encargado"); await addUser(x, 13, "direccion");
    await assign(x, 12, await estabId(x, B)); await addIncid(x, B); await addIncid(x, "Bar Pirata");
    assert.equal((await listMaintenanceIssues(x, enc(12), ON())).data.length, 1); // solo Blanes
    assert.equal((await listMaintenanceIssues(x, dir(13), ON())).data.length, 2); // todo
    await x.close();
  });
  test("error real de BD ⇒ fail-closed (FORBIDDEN)", async () => {
    assert.equal((await listMaintenanceIssues(xThrows, enc(1), ON())).code, "FORBIDDEN");
  });
});

// ─────────────────────────── CREACIÓN ───────────────────────────
describe("Mantenimiento · creación (flag ON)", () => {
  const body = (local) => ({ local, titulo: "Fuga", descripcion: "d" });
  test("Dirección crea en cualquier establecimiento activo", async () => {
    const x = await full(); await addUser(x, 1, "direccion");
    const r = await createMaintenanceIssue(x, dir(1), body(G), ON());
    assert.equal(r.code, "OK"); assert.ok(r.id); assert.equal(await count(x), 1); await x.close();
  });
  test("assigned crea en su local; no en otro", async () => {
    const x = await full(); await addUser(x, 2, "encargado"); await assign(x, 2, await estabId(x, B));
    assert.equal((await createMaintenanceIssue(x, enc(2), body(B), ON())).code, "OK");
    assert.equal((await createMaintenanceIssue(x, enc(2), body(L), ON())).code, "FORBIDDEN");
    assert.equal(await count(x), 1); // el forbidden no insertó
    await x.close();
  });
  test("none no crea; legacy vigente crea; legacy caducado no", async () => {
    const x = await full(); await addUser(x, 3, "encargado"); await addUser(x, 4, "encargado"); await addUser(x, 5, "encargado");
    await legacy(x, 4); await legacy(x, 5, { revocar_en: PAST });
    assert.equal((await createMaintenanceIssue(x, enc(3), body(B), ON())).code, "FORBIDDEN"); // none
    assert.equal((await createMaintenanceIssue(x, enc(4), body(B), ON())).code, "OK");        // legacy vigente
    assert.equal((await createMaintenanceIssue(x, enc(5), body(B), ON())).code, "FORBIDDEN"); // legacy caducado
    await x.close();
  });
  test("local inexistente/inactivo/aproximado ⇒ 400", async () => {
    const x = await full(); await addUser(x, 6, "direccion");
    assert.equal((await createMaintenanceIssue(x, dir(6), body("No Existe"), ON())).code, "VALIDATION_ERROR");
    const idB = await estabId(x, B); await x.run("UPDATE establecimientos SET activo=0 WHERE id=?", [idB]);
    assert.equal((await createMaintenanceIssue(x, dir(6), body(B), ON())).code, "VALIDATION_ERROR"); // inactivo
    assert.equal((await createMaintenanceIssue(x, dir(6), body("la tapeta - girona"), ON())).code, "VALIDATION_ERROR"); // aproximado
    await x.close();
  });
  test("body manipulado no salta permisos (assigned Blanes → local Lloret)", async () => {
    const x = await full(); await addUser(x, 7, "encargado"); await assign(x, 7, await estabId(x, B));
    assert.equal((await createMaintenanceIssue(x, enc(7), body(L), ON())).code, "FORBIDDEN");
    assert.equal(await count(x), 0);
    await x.close();
  });
  test("error real de BD no crea fila (FORBIDDEN)", async () => {
    assert.equal((await createMaintenanceIssue(xThrows, enc(1), body(B), ON())).code, "FORBIDDEN");
  });
});

// ─────────────────────────── ACTUALIZACIÓN ───────────────────────────
describe("Mantenimiento · actualización (flag ON)", () => {
  const st = { estado: "cerrada" };
  test("Dirección actualiza cualquiera; assigned la propia; assigned no la ajena", async () => {
    const x = await full(); await addUser(x, 1, "direccion"); await addUser(x, 2, "encargado");
    await assign(x, 2, await estabId(x, B));
    const iB = await addIncid(x, B), iL = await addIncid(x, L);
    assert.equal((await updateMaintenanceIssueStatus(x, dir(1), iL, st, ON())).code, "OK");        // Dirección cualquiera
    assert.equal((await updateMaintenanceIssueStatus(x, enc(2), iB, st, ON())).code, "OK");        // propia
    assert.equal((await updateMaintenanceIssueStatus(x, enc(2), iL, st, ON())).code, "FORBIDDEN"); // ajena
    await x.close();
  });
  test("none/legacy caducado no; legacy vigente sí", async () => {
    const x = await full(); await addUser(x, 3, "encargado"); await addUser(x, 4, "encargado"); await addUser(x, 5, "encargado");
    await legacy(x, 4); await legacy(x, 5, { revocar_en: PAST });
    const i = await addIncid(x, B);
    assert.equal((await updateMaintenanceIssueStatus(x, enc(3), i, st, ON())).code, "FORBIDDEN");
    assert.equal((await updateMaintenanceIssueStatus(x, enc(4), i, st, ON())).code, "OK");
    assert.equal((await updateMaintenanceIssueStatus(x, enc(5), i, st, ON())).code, "FORBIDDEN");
    await x.close();
  });
  test("ID inexistente ⇒ 404; ID inválido ⇒ 400; estado ausente ⇒ 400", async () => {
    const x = await full(); await addUser(x, 6, "direccion");
    assert.equal((await updateMaintenanceIssueStatus(x, dir(6), 99999, st, ON())).code, "NOT_FOUND");
    assert.equal((await updateMaintenanceIssueStatus(x, dir(6), "abc", st, ON())).code, "VALIDATION_ERROR");
    assert.equal((await updateMaintenanceIssueStatus(x, dir(6), -1, st, ON())).code, "VALIDATION_ERROR");
    const i = await addIncid(x, B);
    assert.equal((await updateMaintenanceIssueStatus(x, dir(6), i, { estado: "" }, ON())).code, "VALIDATION_ERROR");
    await x.close();
  });
  test("el `local` del body se IGNORA (manda el registro almacenado)", async () => {
    const x = await full(); await addUser(x, 7, "encargado"); await assign(x, 7, await estabId(x, B));
    const iB = await addIncid(x, B), iL = await addIncid(x, L);
    // propia (Blanes) con body.local=Lloret ⇒ OK (se ignora el body)
    assert.equal((await updateMaintenanceIssueStatus(x, enc(7), iB, { estado: "cerrada", local: L }, ON())).code, "OK");
    // ajena (Lloret) con body.local=Blanes ⇒ FORBIDDEN (manda el registro real Lloret)
    assert.equal((await updateMaintenanceIssueStatus(x, enc(7), iL, { estado: "cerrada", local: B }, ON())).code, "FORBIDDEN");
    await x.close();
  });
  test("local NO reconciliado: assigned fail-closed; Dirección preserva legado", async () => {
    const x = await full(); await addUser(x, 8, "encargado"); await addUser(x, 9, "direccion");
    await assign(x, 8, await estabId(x, B));
    const i = await addIncid(x, "Bar Pirata");
    assert.equal((await updateMaintenanceIssueStatus(x, enc(8), i, st, ON())).code, "FORBIDDEN");
    assert.equal((await updateMaintenanceIssueStatus(x, dir(9), i, st, ON())).code, "OK");
    await x.close();
  });
  test("error real de BD no se convierte en éxito (FORBIDDEN)", async () => {
    assert.equal((await updateMaintenanceIssueStatus(xThrows, enc(1), 1, st, ON())).code, "FORBIDDEN");
  });
});

// ─────────────────────────── FLAG OFF (comportamiento idéntico) ───────────────────────────
describe("Mantenimiento · flag OFF (idéntico y sin tablas nuevas)", () => {
  test("listado devuelve todo sin construir contexto ni tocar tablas nuevas", async () => {
    const x = await minimal(); await addIncid(x, B); await addIncid(x, "cualquier-cosa");
    const r = await listMaintenanceIssues(x, enc(1), { enabled: false });
    assert.equal(r.code, "OK"); assert.equal(r.data.length, 2); await x.close();
  });
  test("POST inserta con el local del body y devuelve id (sin tablas nuevas)", async () => {
    const x = await minimal();
    const r = await createMaintenanceIssue(x, enc(1), { local: "Lo que sea", titulo: "t", descripcion: "d" }, { enabled: false });
    assert.equal(r.code, "OK"); assert.ok(r.id); assert.equal(await count(x), 1); await x.close();
  });
  test("POST sin campos ⇒ VALIDATION_ERROR (missing_fields)", async () => {
    const x = await minimal();
    const r = await createMaintenanceIssue(x, enc(1), { local: "", titulo: "", descripcion: "" }, { enabled: false });
    assert.equal(r.code, "VALIDATION_ERROR"); assert.equal(r.reason, "missing_fields"); await x.close();
  });
  test("PUT actualiza por id y devuelve OK aunque no exista (comportamiento actual)", async () => {
    const x = await minimal(); const i = await addIncid(x, B);
    assert.equal((await updateMaintenanceIssueStatus(x, enc(1), i, { estado: "cerrada" }, { enabled: false })).code, "OK");
    assert.equal((await updateMaintenanceIssueStatus(x, enc(1), 99999, { estado: "cerrada" }, { enabled: false })).code, "OK");
    await x.close();
  });
  test("el camino OFF NO consulta establecimientos/user_locations/legacy_access ni el núcleo", async () => {
    const x = await minimal(); await addIncid(x, B);
    const seen = [];
    const spy = {
      get: (s, p) => { seen.push(s); return x.get(s, p); },
      all: (s, p) => { seen.push(s); return x.all(s, p); },
      run: (s, p) => { seen.push(s); return x.run(s, p); },
    };
    await listMaintenanceIssues(spy, enc(1), { enabled: false });
    await createMaintenanceIssue(spy, enc(1), { local: B, titulo: "t", descripcion: "d" }, { enabled: false });
    await updateMaintenanceIssueStatus(spy, enc(1), 1, { estado: "x" }, { enabled: false });
    const joined = seen.join(" | ");
    for (const t of ["establecimientos", "user_locations", "legacy_access"]) {
      assert.ok(!joined.includes(t), `el camino OFF no debe consultar ${t}`);
    }
    await x.close();
  });
});
