// Enforcement por establecimiento en Mantenimiento (Iteración 4) sobre PostgreSQL (emulado).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { makeMemDb, throwingDb } from "../helpers/memdb.js";
import {
  listMaintenanceIssues, createMaintenanceIssue, updateMaintenanceIssueStatus,
} from "../../src/modules/mantenimiento/maintenance.service.js";

const NOW = "2026-08-05T10:00:00.000Z", PAST = "2026-01-01";
const B = "La Tapeta - Blanes", L = "La Tapeta - Lloret";
const enc = (id) => ({ id, rol: "encargado" });
const dir = (id = 1) => ({ id, rol: "direccion" });
const ON = (extra = {}) => ({ enabled: true, now: NOW, ...extra });
const OFF = { enabled: false, now: NOW };

function baseDb(issues = [], extra = {}) {
  return makeMemDb({
    users: [{ id: 1, rol: "direccion" }, { id: 10, rol: "encargado" }, { id: 12, rol: "encargado" }],
    establecimientos: [
      { id: 1, nombre: B, local_text: B, empresa_id: null, activo: 1, creado_en: PAST },
      { id: 2, nombre: L, local_text: L, empresa_id: null, activo: 1, creado_en: PAST },
    ],
    user_locations: [],
    legacy_access: [],
    maintenance_issues: issues,
    ...extra,
  });
}
const issue = (id, local, o = {}) => ({ id, local, titulo: "t", descripcion: "d", estado: "abierta", creado_en: `2026-08-0${id}`, ...o });
const assign = (uid, eid) => ({ id: eid * 100 + uid, usuario_id: uid, establecimiento_id: eid, activo: 1, desde: PAST, hasta: null, creado_en: PAST });

// ─────────── FLAG OFF: permisos idénticos al comportamiento legado ───────────
describe("Mantenimiento · flag OFF (permisos idénticos)", () => {
  test("lista todas", async () => {
    const x = baseDb([issue(1, B), issue(2, L)]);
    const r = await listMaintenanceIssues(x, enc(10), OFF);
    assert.equal(r.code, "OK"); assert.equal(r.data.length, 2);
  });
  test("crea con el local del body y devuelve id (RETURNING)", async () => {
    const x = baseDb();
    const r = await createMaintenanceIssue(x, enc(10), { local: "Lo que sea", titulo: "t", descripcion: "d" }, OFF);
    assert.equal(r.code, "OK"); assert.ok(Number.isInteger(r.id));
    assert.equal(x._store.maintenance_issues.length, 1);
  });
  test("crea sin campos ⇒ VALIDATION_ERROR", async () => {
    const r = await createMaintenanceIssue(baseDb(), enc(10), { local: "", titulo: "", descripcion: "" }, OFF);
    assert.equal(r.code, "VALIDATION_ERROR"); assert.equal(r.reason, "missing_fields");
  });
  // Estas dos ya NO son «idénticas» al comportamiento legado, y es deliberado: son higiene del
  // dato, no permisos. El compromiso de la Iteración 4 era no cambiar la autorización.
  test("actualiza por id ⇒ OK, guardando el estado canónico", async () => {
    const x = baseDb([issue(1, B)]);
    assert.equal((await updateMaintenanceIssueStatus(x, enc(10), 1, { estado: "cerrada" }, OFF)).code, "OK");
    assert.equal(x._store.maintenance_issues[0].estado, "resuelta", "«cerrada» debe guardarse traducido");
  });
  test("id inexistente ⇒ NOT_FOUND (antes contestaba OK sin tocar nada)", async () => {
    const x = baseDb([issue(1, B)]);
    assert.equal((await updateMaintenanceIssueStatus(x, enc(10), 999, { estado: "resuelta" }, OFF)).code, "NOT_FOUND");
  });
  test("estado ilegible ⇒ VALIDATION_ERROR y NO se escribe nada", async () => {
    const x = baseDb([issue(1, B)]);
    const r = await updateMaintenanceIssueStatus(x, enc(10), 1, { estado: "vaporizada" }, OFF);
    assert.equal(r.code, "VALIDATION_ERROR"); assert.equal(r.reason, "invalid_estado");
    assert.equal(x._store.maintenance_issues[0].estado, "abierta", "la fila no debe haberse tocado");
  });
  test("el camino OFF NO consulta establecimientos/user_locations/legacy_access", async () => {
    const x = baseDb([issue(1, B)]);
    const seen = [];
    const spy = { get: (s, p) => (seen.push(s), x.get(s, p)), all: (s, p) => (seen.push(s), x.all(s, p)), run: (s, p) => (seen.push(s), x.run(s, p)) };
    await listMaintenanceIssues(spy, enc(10), OFF);
    await createMaintenanceIssue(spy, enc(10), { local: B, titulo: "t", descripcion: "d" }, OFF);
    await updateMaintenanceIssueStatus(spy, enc(10), 1, { estado: "en proceso" }, OFF);
    const joined = seen.join(" | ");
    for (const t of ["establecimientos", "user_locations", "legacy_access"]) {
      assert.ok(!joined.includes(t), `OFF no debe consultar ${t}`);
    }
  });
});

// ─────────── FLAG ON: enforcement ───────────
describe("Mantenimiento · listado (flag ON)", () => {
  const seed = () => baseDb([issue(1, B), issue(2, B), issue(3, L)]);
  test("Dirección ve todas", async () => {
    assert.equal((await listMaintenanceIssues(seed(), dir(1), ON())).data.length, 3);
  });
  test("assigned Blanes ve solo Blanes", async () => {
    const x = seed(); x._store.user_locations.push(assign(10, 1));
    const r = await listMaintenanceIssues(x, enc(10), ON());
    assert.equal(r.data.length, 2); assert.ok(r.data.every((i) => i.local === B));
  });
  test("none ⇒ FORBIDDEN", async () => {
    assert.equal((await listMaintenanceIssues(seed(), enc(12), ON())).code, "FORBIDDEN");
  });
  test("?local ajeno ⇒ vacío; propio ⇒ filtra", async () => {
    const x = seed(); x._store.user_locations.push(assign(10, 1));
    assert.equal((await listMaintenanceIssues(x, enc(10), ON({ local: L }))).data.length, 0);
    assert.equal((await listMaintenanceIssues(x, enc(10), ON({ local: B }))).data.length, 2);
  });
  test("error real de BD ⇒ fail-closed", async () => {
    assert.equal((await listMaintenanceIssues(throwingDb, enc(10), ON())).code, "FORBIDDEN");
  });
});

describe("Mantenimiento · creación (flag ON)", () => {
  const body = (local) => ({ local, titulo: "Fuga", descripcion: "d" });
  test("Dirección crea en cualquier local activo y devuelve id (RETURNING)", async () => {
    const x = baseDb();
    const r = await createMaintenanceIssue(x, dir(1), body(L), ON());
    assert.equal(r.code, "OK"); assert.ok(Number.isInteger(r.id));
    assert.equal(x._store.maintenance_issues.length, 1);
  });
  test("assigned crea en su local; no en ajeno (sin insertar)", async () => {
    const x = baseDb(); x._store.user_locations.push(assign(10, 1));
    assert.equal((await createMaintenanceIssue(x, enc(10), body(B), ON())).code, "OK");
    assert.equal((await createMaintenanceIssue(x, enc(10), body(L), ON())).code, "FORBIDDEN");
    assert.equal(x._store.maintenance_issues.length, 1);
  });
  test("local inexistente/no canónico ⇒ VALIDATION_ERROR invalid_local", async () => {
    const r = await createMaintenanceIssue(baseDb(), dir(1), body("No Existe"), ON());
    assert.equal(r.code, "VALIDATION_ERROR"); assert.equal(r.reason, "invalid_local");
  });
  test("body manipulado (assigned Blanes → Lloret) ⇒ FORBIDDEN, sin fila", async () => {
    const x = baseDb(); x._store.user_locations.push(assign(10, 1));
    assert.equal((await createMaintenanceIssue(x, enc(10), body(L), ON())).code, "FORBIDDEN");
    assert.equal(x._store.maintenance_issues.length, 0);
  });
  test("error real de BD ⇒ fail-closed", async () => {
    assert.equal((await createMaintenanceIssue(throwingDb, enc(10), body(B), ON())).code, "FORBIDDEN");
  });
});

describe("Mantenimiento · actualización (flag ON)", () => {
  const st = { estado: "cerrada" };
  test("Dirección cualquiera; assigned propia OK, ajena FORBIDDEN", async () => {
    const x = baseDb([issue(1, B), issue(2, L)]); x._store.user_locations.push(assign(10, 1));
    assert.equal((await updateMaintenanceIssueStatus(x, dir(1), 2, st, ON())).code, "OK");
    assert.equal((await updateMaintenanceIssueStatus(x, enc(10), 1, st, ON())).code, "OK");
    assert.equal((await updateMaintenanceIssueStatus(x, enc(10), 2, st, ON())).code, "FORBIDDEN");
  });
  test("id inexistente ⇒ NOT_FOUND; id inválido ⇒ 400; estado ausente ⇒ 400", async () => {
    const x = baseDb([issue(1, B)]);
    assert.equal((await updateMaintenanceIssueStatus(x, dir(1), 999, st, ON())).code, "NOT_FOUND");
    assert.equal((await updateMaintenanceIssueStatus(x, dir(1), "abc", st, ON())).code, "VALIDATION_ERROR");
    assert.equal((await updateMaintenanceIssueStatus(x, dir(1), -1, st, ON())).code, "VALIDATION_ERROR");
    assert.equal((await updateMaintenanceIssueStatus(x, dir(1), 1, { estado: "" }, ON())).code, "VALIDATION_ERROR");
  });
  test("el body.local se IGNORA (manda el registro real)", async () => {
    const x = baseDb([issue(1, B), issue(2, L)]); x._store.user_locations.push(assign(10, 1));
    assert.equal((await updateMaintenanceIssueStatus(x, enc(10), 1, { estado: "cerrada", local: L }, ON())).code, "OK");
    assert.equal((await updateMaintenanceIssueStatus(x, enc(10), 2, { estado: "cerrada", local: B }, ON())).code, "FORBIDDEN");
  });
  test("error real de BD ⇒ fail-closed", async () => {
    assert.equal((await updateMaintenanceIssueStatus(throwingDb, enc(10), 1, st, ON())).code, "FORBIDDEN");
  });
});
