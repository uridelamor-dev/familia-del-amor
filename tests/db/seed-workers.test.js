// Seed de trabajadores (portado a PostgreSQL) — idempotente y sin duplicados. Sin BD real.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { makeMemDb } from "../helpers/memdb.js";
import { seedWorkers, WORKERS } from "../../seed-workers.js";
import { CATALOGO_CANONICO } from "../../src/db/reconciliation.js";

const HASH = "$2b$10$fakehashfakehashfakehashfake", NOW = "2026-08-05T10:00:00.000Z";

describe("seed-workers · roster", () => {
  test("hay trabajadores y los username son únicos", () => {
    assert.ok(WORKERS.length >= 40);
    const usernames = WORKERS.map((w) => w.username);
    assert.equal(new Set(usernames).size, usernames.length, "usernames duplicados");
  });
  test("todos los locales pertenecen al catálogo canónico", () => {
    const cat = new Set(CATALOGO_CANONICO);
    for (const w of WORKERS) assert.ok(cat.has(w.local), `local fuera de catálogo: ${w.local}`);
  });
});

describe("seed-workers · idempotencia (sin duplicar)", () => {
  test("primera pasada crea todos; segunda no crea ninguno", async () => {
    const x = makeMemDb({ users: [] });
    const r1 = await seedWorkers(x, { hash: HASH, now: NOW });
    assert.equal(r1.creados, WORKERS.length);
    assert.equal(r1.existentes, 0);
    assert.equal(x._store.users.length, WORKERS.length);

    const r2 = await seedWorkers(x, { hash: HASH, now: NOW });
    assert.equal(r2.creados, 0);
    assert.equal(r2.existentes, WORKERS.length);
    assert.equal(x._store.users.length, WORKERS.length, "no debe duplicar trabajadores");
  });
  test("todos quedan con rol 'trabajador' y su local", async () => {
    const x = makeMemDb({ users: [] });
    await seedWorkers(x, { hash: HASH, now: NOW });
    assert.ok(x._store.users.every((u) => u.rol === "trabajador"));
    const kevin = x._store.users.find((u) => u.username === "kevin_blanes");
    assert.equal(kevin.local, "La Tapeta - Blanes");
  });
});
