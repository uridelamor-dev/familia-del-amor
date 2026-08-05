// Pruebas del núcleo de acceso por establecimiento (Iteración 3). BD temporales, fechas
// inyectadas para determinismo. No arranca el servidor ni toca la BD real.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import sqlite3 from "sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { permisosV2Enabled } from "../src/core/flags.js";
import {
  isValidId, isGlobalRole, loadUserEstablecimientos, hasLegacyAccess,
  buildAccessContext, canAccessEstablecimiento, allowedEstablecimientoIds, authorizeEstablecimiento,
} from "../src/core/access.js";
import { ensureSchema, seedCatalogo } from "../src/db/establecimientos.migration.js";

const NOW = "2026-08-05", FUTURE = "2026-12-01", PAST = "2026-01-01";
const B = "La Tapeta - Blanes", L = "La Tapeta - Lloret";

function open(dbPath) {
  const db = new sqlite3.Database(dbPath);
  const run = (s, p = []) => new Promise((res, rej) => db.run(s, p, function (e) { e ? rej(e) : res(this); }));
  const get = (s, p = []) => new Promise((res, rej) => db.get(s, p, (e, r) => e ? rej(e) : res(r)));
  const all = (s, p = []) => new Promise((res, rej) => db.all(s, p, (e, r) => e ? rej(e) : res(r || [])));
  const close = () => new Promise((r) => db.close(() => r()));
  return { run, get, all, close };
}
async function createUsers(x) {
  await x.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT,
    rol TEXT NOT NULL, nombre TEXT, local TEXT, creado_en TEXT NOT NULL)`);
}
async function addUser(x, { id, username, rol, local = null }) {
  await x.run(`INSERT INTO users (id, username, password_hash, rol, nombre, local, creado_en)
    VALUES (?, ?, 'x', ?, '', ?, ?)`, [id, username, rol, local, NOW]);
}
async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acc-"));
  const x = open(path.join(dir, "t.sqlite"));
  await x.run("PRAGMA foreign_keys = ON");
  await createUsers(x);
  await ensureSchema(x);
  await seedCatalogo(x);
  return { x };
}
async function estabId(x, lt) { return (await x.get("SELECT id FROM establecimientos WHERE local_text = ?", [lt])).id; }
// Nota: el esquema de It2 define user_locations.desde como NOT NULL, así que el backfill real
// siempre fija `desde`. Por eso la prueba usa una fecha real por defecto (vigente). La lógica
// de access.js soporta `desde` nulo de forma defensiva (forward-compat), pero aquí no se puede
// insertar NULL por la restricción del esquema.
async function assign(x, usuarioId, estabId, { activo = 1, desde = PAST, hasta = null } = {}) {
  await x.run(`INSERT INTO user_locations (usuario_id, establecimiento_id, activo, desde, hasta, creado_en)
    VALUES (?, ?, ?, ?, ?, ?)`, [usuarioId, estabId, activo, desde, hasta, NOW]);
}
async function legacy(x, usuarioId, { activo = 1, revocar_en = null } = {}) {
  await x.run(`INSERT INTO legacy_access (usuario_id, motivo, concedido_en, activo, revocar_en)
    VALUES (?, 'test', ?, ?, ?)`, [usuarioId, NOW, activo, revocar_en]);
}
const worker = (id) => ({ id, rol: "trabajador" });
const direccion = (id) => ({ id, rol: "direccion" });
// Fakes de conexión para caminos de error/dedup sin BD real.
const xThrows = { all: async () => { throw new Error("SQLITE_IOERR: disk I/O error"); },
                  get: async () => { throw new Error("SQLITE_IOERR: disk I/O error"); } };
const xDupes = { all: async () => [{ eid: 3, lt: "X" }, { eid: 3, lt: "X" }, { eid: 5, lt: "Y" }], get: async () => null };

describe("flags · PERMISOS_V2", () => {
  test("solo 'true' activa; el resto desactivado", () => {
    assert.equal(permisosV2Enabled({ PERMISOS_V2: "true" }), true);
    assert.equal(permisosV2Enabled({ PERMISOS_V2: "TRUE" }), false);
    assert.equal(permisosV2Enabled({ PERMISOS_V2: "1" }), false);
    assert.equal(permisosV2Enabled({ PERMISOS_V2: "" }), false);
    assert.equal(permisosV2Enabled({}), false);
  });
});

describe("validación de IDs", () => {
  test("isValidId acepta solo enteros positivos", () => {
    for (const ok of [1, 42]) assert.equal(isValidId(ok), true);
    for (const bad of [0, -1, 1.5, NaN, null, undefined, "5", "", {}]) assert.equal(isValidId(bad), false, String(bad));
  });
  test("canAccessEstablecimiento rechaza IDs inválidos", () => {
    const ctx = { scope: "global", establecimientoIds: [] };
    for (const bad of [null, -1, 0, NaN, "5", 2.2]) assert.equal(canAccessEstablecimiento(ctx, bad), false);
    assert.equal(canAccessEstablecimiento(ctx, 3), true);
  });
});

describe("loadUserEstablecimientos · vigencia y actividad", () => {
  test("asignación válida se carga; establecimiento inactivo NO concede acceso", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "w", rol: "trabajador" });
    const idB = await estabId(x, B);
    await x.run("UPDATE establecimientos SET activo = 0 WHERE id = ?", [idB]); // inactivo
    await assign(x, 1, idB);
    assert.deepEqual(await loadUserEstablecimientos(x, 1, { now: NOW }), []);
  });
  test("asignación futura todavía NO concede acceso", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "w", rol: "trabajador" });
    await assign(x, 1, await estabId(x, B), { desde: FUTURE });
    assert.equal((await loadUserEstablecimientos(x, 1, { now: NOW })).length, 0);
  });
  test("asignación caducada NO concede acceso", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "w", rol: "trabajador" });
    await assign(x, 1, await estabId(x, B), { hasta: PAST });
    assert.equal((await loadUserEstablecimientos(x, 1, { now: NOW })).length, 0);
  });
  test("asignación vigente (desde pasado, hasta futuro) SÍ concede acceso", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "w", rol: "trabajador" });
    const idB = await estabId(x, B);
    await assign(x, 1, idB, { desde: PAST, hasta: FUTURE });
    assert.deepEqual((await loadUserEstablecimientos(x, 1, { now: NOW })).map(e => e.establecimiento_id), [idB]);
  });
  test("IDs de asignación duplicados se deduplican", async () => {
    const out = await loadUserEstablecimientos(xDupes, 1);
    assert.deepEqual(out.map(e => e.establecimiento_id), [3, 5]);
  });
  test("usuarioId inválido ⇒ []", async () => {
    const { x } = await setup();
    for (const bad of [null, -1, "5"]) assert.deepEqual(await loadUserEstablecimientos(x, bad), []);
  });
});

describe("legacy · vigencia", () => {
  test("legacy vigente concede; caducado no", async () => {
    const { x } = await setup();
    await addUser(x, { id: 1, username: "a", rol: "encargado" });
    await addUser(x, { id: 2, username: "b", rol: "encargado" });
    await legacy(x, 1, { revocar_en: null });
    await legacy(x, 2, { revocar_en: PAST });
    assert.equal(await hasLegacyAccess(x, 1, { now: NOW }), true);
    assert.equal(await hasLegacyAccess(x, 2, { now: NOW }), false);
  });
});

describe("buildAccessContext · precedencia global→assigned→legacy→none", () => {
  test("Dirección ⇒ global (aunque no tenga asignaciones)", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "dir", rol: "direccion" });
    const ctx = await buildAccessContext(x, direccion(1), { now: NOW });
    assert.equal(ctx.scope, "global");
    assert.equal(allowedEstablecimientoIds(ctx), "ALL");
    assert.equal(canAccessEstablecimiento(ctx, 999), true);
  });
  test("con asignaciones ⇒ assigned, acotado", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "w", rol: "trabajador" });
    const idB = await estabId(x, B), idL = await estabId(x, L);
    await assign(x, 1, idB);
    const ctx = await buildAccessContext(x, worker(1), { now: NOW });
    assert.equal(ctx.scope, "assigned");
    assert.equal(canAccessEstablecimiento(ctx, idB), true);
    assert.equal(canAccessEstablecimiento(ctx, idL), false);
    assert.deepEqual(allowedEstablecimientoIds(ctx), [idB]);
  });
  test("assigned PREVALECE sobre legacy", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "w", rol: "encargado" });
    const idB = await estabId(x, B), idL = await estabId(x, L);
    await assign(x, 1, idB); await legacy(x, 1); // ambos
    const ctx = await buildAccessContext(x, { id: 1, rol: "encargado" }, { now: NOW });
    assert.equal(ctx.scope, "assigned");
    assert.equal(canAccessEstablecimiento(ctx, idL), false, "legacy NO debe ampliar a otros locales");
  });
  test("sin asignaciones pero con legacy vigente ⇒ legacy", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "sh", rol: "marketing" });
    await legacy(x, 1);
    const ctx = await buildAccessContext(x, { id: 1, rol: "marketing" }, { now: NOW });
    assert.equal(ctx.scope, "legacy");
    assert.equal(canAccessEstablecimiento(ctx, 4), true);
  });
  test("legacy caducado ⇒ none (default-deny)", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "sh", rol: "marketing" });
    await legacy(x, 1, { revocar_en: PAST });
    const ctx = await buildAccessContext(x, { id: 1, rol: "marketing" }, { now: NOW });
    assert.equal(ctx.scope, "none");
  });
  test("usuario nuevo (sin asignaciones ni legacy) ⇒ none", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "n", rol: "trabajador" });
    const ctx = await buildAccessContext(x, worker(1), { now: NOW });
    assert.equal(ctx.scope, "none");
    assert.equal(canAccessEstablecimiento(ctx, 1), false);
    assert.deepEqual(allowedEstablecimientoIds(ctx), []);
  });
});

describe("authorizeEstablecimiento · flag y fail-closed", () => {
  test("flag OFF ⇒ scope 'disabled', permisivo, no enforced", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "n", rol: "trabajador" });
    const r = await authorizeEstablecimiento(x, worker(1), 999, { enabled: false });
    assert.deepEqual(r, { allowed: true, enforced: false, scope: "disabled" });
  });
  test("flag ON evalúa realmente (deniega a usuario sin asignaciones)", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "n", rol: "trabajador" });
    const idB = await estabId(x, B); await assign(x, 1, idB);
    const idL = await estabId(x, L);
    const rOk = await authorizeEstablecimiento(x, worker(1), idB, { enabled: true, now: NOW });
    const rNo = await authorizeEstablecimiento(x, worker(1), idL, { enabled: true, now: NOW });
    assert.deepEqual(rOk, { allowed: true, enforced: true, scope: "assigned" });
    assert.equal(rNo.allowed, false); assert.equal(rNo.scope, "assigned");
  });
  test("flag ON + establecimientoId inválido ⇒ denegado", async () => {
    const { x } = await setup(); await addUser(x, { id: 1, username: "dir", rol: "direccion" });
    const r = await authorizeEstablecimiento(x, direccion(1), "5", { enabled: true, now: NOW });
    assert.equal(r.allowed, false); assert.equal(r.scope, "global");
  });
  test("error REAL de BD ⇒ fail-closed (scope 'error'), NO se convierte en acceso", async () => {
    const r = await authorizeEstablecimiento(xThrows, worker(1), 3, { enabled: true, now: NOW });
    assert.equal(r.allowed, false);
    assert.equal(r.enforced, true);
    assert.equal(r.scope, "error");
    await assert.rejects(() => buildAccessContext(xThrows, worker(1), { now: NOW }), /disk I\/O/);
  });
  test("Dirección global sobrevive a un fallo de BD (rol ya validado)", async () => {
    const r = await authorizeEstablecimiento(xThrows, direccion(1), 3, { enabled: true, now: NOW });
    assert.deepEqual(r, { allowed: true, enforced: true, scope: "global" });
  });
});

describe("transición · tablas todavía no existentes", () => {
  test("tablas ausentes ⇒ none para no-Dirección (deny seguro); Dirección sigue global", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acc2-"));
    const x = open(path.join(dir, "t.sqlite"));
    await x.run("PRAGMA foreign_keys = ON");
    await createUsers(x); // SOLO users; sin ensureSchema (faltan user_locations/establecimientos/legacy_access)
    await addUser(x, { id: 1, username: "w", rol: "trabajador" });
    assert.deepEqual(await loadUserEstablecimientos(x, 1, { now: NOW }), []);
    assert.equal(await hasLegacyAccess(x, 1, { now: NOW }), false);
    const ctx = await buildAccessContext(x, worker(1), { now: NOW });
    assert.equal(ctx.scope, "none");
    const rW = await authorizeEstablecimiento(x, worker(1), 3, { enabled: true, now: NOW });
    assert.equal(rW.allowed, false); assert.equal(rW.scope, "none");
    const rD = await authorizeEstablecimiento(x, direccion(9), 3, { enabled: true, now: NOW });
    assert.deepEqual(rD, { allowed: true, enforced: true, scope: "global" });
    await x.close();
  });
});

describe("no se importa desde server.js (no cableado)", () => {
  test("server.js no importa el núcleo de acceso", () => {
    const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
    assert.ok(!/core\/access/.test(src));
    assert.ok(!/core\/flags/.test(src));
    assert.ok(!/PERMISOS_V2/.test(src));
  });
});
