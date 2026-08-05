// Modelo de establecimientos (Iteración 2) sobre PostgreSQL (emulado en memoria).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { makeMemDb } from "../helpers/memdb.js";
import {
  normalizeForCompare, catalogChecksum, detectLocalTables, reconcile,
  CATALOGO_CANONICO, EXPECTED_LOCAL_TABLES,
} from "../../src/db/reconciliation.js";
import {
  ensureSchema, seedCatalogo, computeBackfillCandidates, applyBackfill,
  computeGrandfatherCandidates, applyGrandfather, migrarBackfill,
} from "../../src/db/establecimientos.migration.js";

const B = "La Tapeta - Blanes", L = "La Tapeta - Lloret";

describe("reconciliation — comparación sin alterar originales", () => {
  test("normalizeForCompare: guiones/espacios/mayúsculas; acentos NO", () => {
    assert.equal(normalizeForCompare("La  Tapeta —  Blanes "), "la tapeta - blanes");
    assert.notEqual(normalizeForCompare("Iberica"), normalizeForCompare("Ibérica"));
  });
  test("catalogChecksum estable y determinista", () => {
    assert.equal(catalogChecksum(), catalogChecksum());
    assert.match(catalogChecksum(), /^[0-9a-f]{16}$/);
  });
  test("detectLocalTables encuentra solo tablas con columna 'local'", async () => {
    const x = makeMemDb({
      users: [{ id: 1, local: B }],
      reservas: [{ id: 1, local: L }],
      establecimientos: [{ id: 1, local_text: B }], // local_text, NO local
    });
    const detected = await detectLocalTables(x);
    assert.ok(detected.includes("users") && detected.includes("reservas"));
    assert.ok(!detected.includes("establecimientos"));
  });
  test("reconcile OK: valores exactos y normalizados reconocidos", async () => {
    const x = makeMemDb({
      users: [{ id: 1, local: B }],
      reservas: [{ id: 1, local: "La Tapeta — Blanes" }], // guion largo ⇒ normalizada
    });
    const r = await reconcile(x);
    assert.equal(r.ok, true);
    assert.equal(r.unknown.length, 0);
    assert.equal(r.valueToCanon.get("La Tapeta — Blanes"), B);
  });
  test("reconcile BLOQUEA con valor desconocido", async () => {
    const x = makeMemDb({ users: [{ id: 1, local: "Bar Pirata" }] });
    const r = await reconcile(x);
    assert.equal(r.ok, false);
    assert.equal(r.unknown.length, 1);
  });
  test("reconcile BLOQUEA con tabla inesperada con 'local'", async () => {
    const x = makeMemDb({ users: [{ id: 1, local: B }], tabla_rara: [{ id: 1, local: B }] });
    const r = await reconcile(x);
    assert.equal(r.ok, false);
    assert.ok(r.unexpectedTables.includes("tabla_rara"));
  });
  test("allowlist esperada contiene las tablas conocidas con 'local'", () => {
    for (const t of ["users", "reservas", "maintenance_issues", "announcements"]) {
      assert.ok(EXPECTED_LOCAL_TABLES.includes(t));
    }
  });
});

describe("migración — esquema y catálogo idempotentes", () => {
  test("ensureSchema crea las tablas y es idempotente", async () => {
    const x = makeMemDb({ users: [] });
    await ensureSchema(x);
    await ensureSchema(x); // segunda vez sin error
    for (const t of ["empresas", "establecimientos", "user_locations", "legacy_access", "migration_state"]) {
      assert.ok(x._store[t], `falta tabla ${t}`);
    }
  });
  test("seedCatalogo inserta los 7 y no duplica", async () => {
    const x = makeMemDb({ users: [] });
    await ensureSchema(x);
    await seedCatalogo(x);
    await seedCatalogo(x); // idempotente
    assert.equal(x._store.establecimientos.length, CATALOGO_CANONICO.length);
    assert.equal(x._store.establecimientos.filter((e) => e.local_text === B).length, 1);
  });
});

describe("migración — backfill y grandfather", () => {
  async function prep() {
    const x = makeMemDb({
      users: [
        { id: 1, username: "direccion", rol: "direccion", nombre: "Dir", local: null },
        { id: 10, username: "enc", rol: "encargado", nombre: "E", local: B },
        { id: 11, username: "sala", rol: "trabajador", nombre: "S", local: "La Tapeta — Lloret" }, // normalizada
        { id: 12, username: "gestion", rol: "encargado", nombre: "G", local: null }, // sin local
      ],
    });
    await ensureSchema(x); await seedCatalogo(x);
    return x;
  }
  test("computeBackfillCandidates mapea solo locales reconocidos", async () => {
    const x = await prep();
    const recon = await reconcile(x);
    const cands = await computeBackfillCandidates(x, recon);
    const ids = cands.map((c) => c.usuario_id).sort();
    assert.deepEqual(ids, [10, 11]); // dirección y sin-local excluidos
  });
  test("applyBackfill inserta asignaciones (idempotente)", async () => {
    const x = await prep();
    const recon = await reconcile(x);
    const cands = await computeBackfillCandidates(x, recon);
    const n1 = await applyBackfill(x, cands);
    const n2 = await applyBackfill(x, cands); // ya existen
    assert.equal(n1, 2); assert.equal(n2, 0);
    assert.equal(x._store.user_locations.length, 2);
  });
  test("computeGrandfatherCandidates excluye dirección y asignables", async () => {
    const x = await prep();
    const cands = await computeGrandfatherCandidates(x, [10, 11]);
    const byId = Object.fromEntries(cands.map((c) => [c.id, c]));
    assert.equal(byId[1].autoExcluded, true); // dirección
    assert.equal(byId[10].autoExcluded, true); // backfill
    assert.equal(byId[12].autoExcluded, false); // gestión sin asignación ⇒ posible legacy
    assert.ok(byId[12].posibleLegacy);
  });
  test("applyGrandfather solo IDs aprobados; id inexistente lanza", async () => {
    const x = await prep();
    const r = await applyGrandfather(x, [12]);
    assert.equal(r.count, 1);
    assert.equal(x._store.legacy_access.length, 1);
    await assert.rejects(() => applyGrandfather(x, [999]), /no existe/);
  });
});

describe("migración — orquestador ATÓMICO", () => {
  test("happy path: schema+catálogo+backfill+grandfather+state, todo cuadra", async () => {
    const x = makeMemDb({
      users: [
        { id: 1, rol: "direccion", username: "d", nombre: "D", local: null },
        { id: 10, rol: "encargado", username: "e", nombre: "E", local: B },
        { id: 12, rol: "encargado", username: "g", nombre: "G", local: null },
      ],
    });
    const res = await migrarBackfill(x, { approvedLegacyIds: [12] });
    assert.equal(res.workersAssigned, 1);
    assert.equal(res.grandfather.count, 1);
    assert.equal(x._store.establecimientos.length, CATALOGO_CANONICO.length);
    assert.equal(x._store.migration_state.find((m) => m.clave === "migration_version").valor, "establecimientos-v1");
  });
  test("whitelist grandfather obligatoria", async () => {
    await assert.rejects(() => migrarBackfill(makeMemDb({ users: [] }), {}), /whitelist grandfather/);
  });
  test("valor 'local' desconocido ⇒ aborta y revierte TODO (rollback)", async () => {
    const x = makeMemDb({ users: [{ id: 10, rol: "encargado", username: "e", nombre: "E", local: "Bar Pirata" }] });
    await assert.rejects(() => migrarBackfill(x, { approvedLegacyIds: [] }), /Reconciliación bloqueada/);
    // Rollback: no deben quedar establecimientos ni asignaciones ni migration_state.
    assert.ok(!x._store.establecimientos || x._store.establecimientos.length === 0);
    assert.ok(!x._store.user_locations || x._store.user_locations.length === 0);
    assert.ok(!x._store.migration_state || x._store.migration_state.length === 0);
  });
});
