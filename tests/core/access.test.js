// Núcleo de acceso por establecimiento (Iteración 3) sobre PostgreSQL (emulado en memoria).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { makeMemDb, throwingDb } from "../helpers/memdb.js";
import {
  isValidId, isGlobalRole, canAccessEstablecimiento, allowedEstablecimientoIds,
  loadUserEstablecimientos, hasLegacyAccess, buildAccessContext, authorizeEstablecimiento,
} from "../../src/core/access.js";
import { resolveAllowedLocalTexts, resolveEstablishmentByLocalText, validateRequestedLocal } from "../../src/core/scope.js";

const NOW = "2026-08-05T10:00:00.000Z", PAST = "2026-01-01", FUT = "2027-01-01";
const B = "La Tapeta - Blanes", L = "La Tapeta - Lloret", G = "La Tapeta - Girona";

// BD con catálogo + tablas de acceso presentes.
function db(extra = {}) {
  return makeMemDb({
    users: [
      { id: 1, username: "direccion", rol: "direccion", nombre: "Dir", local: null },
      { id: 10, username: "enc_blanes", rol: "encargado", nombre: "Enc", local: B },
      { id: 11, username: "enc_lloret", rol: "encargado", nombre: "Enc2", local: L },
      { id: 12, username: "sin", rol: "encargado", nombre: "Sin", local: null },
    ],
    establecimientos: [
      { id: 1, nombre: B, local_text: B, empresa_id: null, activo: 1, creado_en: PAST },
      { id: 2, nombre: L, local_text: L, empresa_id: null, activo: 1, creado_en: PAST },
      { id: 3, nombre: G, local_text: G, empresa_id: null, activo: 0, creado_en: PAST }, // inactivo
    ],
    user_locations: [],
    legacy_access: [],
    ...extra,
  });
}
const assign = (uid, eid, o = {}) => ({ id: eid * 100 + uid, usuario_id: uid, establecimiento_id: eid, activo: 1, desde: PAST, hasta: null, creado_en: PAST, ...o });
const legacy = (uid, o = {}) => ({ id: uid, usuario_id: uid, motivo: "m", concedido_en: PAST, activo: 1, revocar_en: null, ...o });
const enc = (id) => ({ id, rol: "encargado" });
const dir = (id = 1) => ({ id, rol: "direccion" });

describe("helpers puros", () => {
  test("isValidId", () => {
    for (const v of [1, 42, 999]) assert.equal(isValidId(v), true);
    for (const v of [0, -1, 1.5, NaN, null, undefined, "1", "x"]) assert.equal(isValidId(v), false);
  });
  test("isGlobalRole solo dirección", () => {
    assert.equal(isGlobalRole({ rol: "direccion" }), true);
    assert.equal(isGlobalRole({ rol: "encargado" }), false);
    assert.equal(isGlobalRole(null), false);
  });
  test("canAccessEstablecimiento por scope", () => {
    assert.equal(canAccessEstablecimiento({ scope: "global" }, 5), true);
    assert.equal(canAccessEstablecimiento({ scope: "legacy" }, 5), true);
    assert.equal(canAccessEstablecimiento({ scope: "assigned", establecimientoIds: [1, 2] }, 2), true);
    assert.equal(canAccessEstablecimiento({ scope: "assigned", establecimientoIds: [1, 2] }, 3), false);
    assert.equal(canAccessEstablecimiento({ scope: "none" }, 1), false);
    assert.equal(canAccessEstablecimiento({ scope: "global" }, 0), false); // id inválido nunca concede
    assert.equal(canAccessEstablecimiento(null, 1), false);
  });
  test("allowedEstablecimientoIds", () => {
    assert.equal(allowedEstablecimientoIds({ scope: "global" }), "ALL");
    assert.equal(allowedEstablecimientoIds({ scope: "legacy" }), "ALL");
    assert.deepEqual(allowedEstablecimientoIds({ scope: "assigned", establecimientoIds: [1, 2] }), [1, 2]);
    assert.deepEqual(allowedEstablecimientoIds({ scope: "none" }), []);
  });
});

describe("buildAccessContext — precedencia global→assigned→legacy→none", () => {
  test("Dirección ⇒ global (sin tocar la BD)", async () => {
    const ctx = await buildAccessContext(throwingDb, dir(1), { now: NOW });
    assert.equal(ctx.scope, "global");
  });
  test("con asignaciones ⇒ assigned con esos ids", async () => {
    const x = db({ user_locations: [assign(10, 1), assign(10, 2)] });
    const ctx = await buildAccessContext(x, enc(10), { now: NOW });
    assert.equal(ctx.scope, "assigned");
    assert.deepEqual([...ctx.establecimientoIds].sort(), [1, 2]);
  });
  test("assigned prevalece sobre legacy", async () => {
    const x = db({ user_locations: [assign(10, 1)], legacy_access: [legacy(10)] });
    const ctx = await buildAccessContext(x, enc(10), { now: NOW });
    assert.equal(ctx.scope, "assigned");
    assert.deepEqual(ctx.establecimientoIds, [1]);
  });
  test("sin asignaciones + legacy vigente ⇒ legacy", async () => {
    const x = db({ legacy_access: [legacy(12)] });
    const ctx = await buildAccessContext(x, enc(12), { now: NOW });
    assert.equal(ctx.scope, "legacy");
  });
  test("sin nada ⇒ none", async () => {
    const ctx = await buildAccessContext(db(), enc(12), { now: NOW });
    assert.equal(ctx.scope, "none");
  });
  test("establecimiento inactivo no cuenta como asignación", async () => {
    const x = db({ user_locations: [assign(10, 3)] }); // estab 3 activo=0
    const ctx = await buildAccessContext(x, enc(10), { now: NOW });
    assert.equal(ctx.scope, "none");
  });
  test("asignación caducada (hasta pasado) no cuenta", async () => {
    const x = db({ user_locations: [assign(10, 1, { hasta: PAST })] });
    assert.equal((await buildAccessContext(x, enc(10), { now: NOW })).scope, "none");
  });
  test("asignación futura (desde futuro) no cuenta", async () => {
    const x = db({ user_locations: [assign(10, 1, { desde: FUT })] });
    assert.equal((await buildAccessContext(x, enc(10), { now: NOW })).scope, "none");
  });
  test("legacy caducado (revocar_en pasado) ⇒ none", async () => {
    const x = db({ legacy_access: [legacy(12, { revocar_en: PAST })] });
    assert.equal((await buildAccessContext(x, enc(12), { now: NOW })).scope, "none");
  });
});

describe("tablas ausentes (42P01) vs error real", () => {
  test("sin tablas de acceso: no-Dirección ⇒ none; Dirección ⇒ global", async () => {
    const x = makeMemDb({ users: [{ id: 10, rol: "encargado" }] }); // sin user_locations/legacy_access
    assert.equal((await buildAccessContext(x, enc(10), { now: NOW })).scope, "none");
    assert.equal((await buildAccessContext(x, dir(1), { now: NOW })).scope, "global");
  });
  test("loadUserEstablecimientos con tabla ausente ⇒ [] (transición segura)", async () => {
    const x = makeMemDb({ users: [] });
    assert.deepEqual(await loadUserEstablecimientos(x, 10, { now: NOW }), []);
  });
  test("hasLegacyAccess con tabla ausente ⇒ false", async () => {
    const x = makeMemDb({ users: [] });
    assert.equal(await hasLegacyAccess(x, 10, { now: NOW }), false);
  });
  test("error REAL de BD se propaga (no se confunde con vacío)", async () => {
    await assert.rejects(() => loadUserEstablecimientos(throwingDb, 10, { now: NOW }));
    await assert.rejects(() => buildAccessContext(throwingDb, enc(10), { now: NOW }));
  });
});

describe("authorizeEstablecimiento — semántica del flag", () => {
  test("flag OFF ⇒ allowed:true, enforced:false", async () => {
    const r = await authorizeEstablecimiento(db(), enc(12), 1, { enabled: false, now: NOW });
    assert.deepEqual(r, { allowed: true, enforced: false, scope: "disabled" });
  });
  test("flag ON: Dirección global aunque falle la BD", async () => {
    const r = await authorizeEstablecimiento(throwingDb, dir(1), 1, { enabled: true, now: NOW });
    assert.equal(r.allowed, true); assert.equal(r.scope, "global");
  });
  test("flag ON assigned: concede solo su local; deniega ajeno", async () => {
    const x = db({ user_locations: [assign(10, 1)] });
    assert.equal((await authorizeEstablecimiento(x, enc(10), 1, { enabled: true, now: NOW })).allowed, true);
    assert.equal((await authorizeEstablecimiento(x, enc(10), 2, { enabled: true, now: NOW })).allowed, false);
  });
  test("flag ON none ⇒ deniega", async () => {
    assert.equal((await authorizeEstablecimiento(db(), enc(12), 1, { enabled: true, now: NOW })).allowed, false);
  });
  test("flag ON con error real de BD ⇒ fail-closed (scope 'error')", async () => {
    const r = await authorizeEstablecimiento(throwingDb, enc(10), 1, { enabled: true, now: NOW });
    assert.equal(r.allowed, false); assert.equal(r.scope, "error");
  });
});

describe("scope.js — traducción a local_text", () => {
  test("global/legacy ⇒ ALL", async () => {
    assert.equal((await resolveAllowedLocalTexts(db(), { scope: "global" })).locals, "ALL");
    assert.equal((await resolveAllowedLocalTexts(db(), { scope: "legacy" })).locals, "ALL");
  });
  test("assigned ⇒ local_text de sus establecimientos activos", async () => {
    const r = await resolveAllowedLocalTexts(db(), { scope: "assigned", establecimientoIds: [1, 2] });
    assert.deepEqual([...r.locals].sort(), [B, L].sort());
  });
  test("assigned con establecimiento inactivo ⇒ no aparece", async () => {
    const r = await resolveAllowedLocalTexts(db(), { scope: "assigned", establecimientoIds: [3] });
    assert.deepEqual(r.locals, []);
  });
  test("none ⇒ []", async () => {
    assert.deepEqual((await resolveAllowedLocalTexts(db(), { scope: "none" })).locals, []);
  });
  test("resolveEstablishmentByLocalText: canónico+activo ⇒ id; inactivo/inexistente/no exacto ⇒ null", async () => {
    const x = db();
    assert.equal(await resolveEstablishmentByLocalText(x, B), 1);
    assert.equal(await resolveEstablishmentByLocalText(x, G), null); // inactivo
    assert.equal(await resolveEstablishmentByLocalText(x, "la tapeta - blanes"), null); // no exacto
    assert.equal(await resolveEstablishmentByLocalText(x, "No Existe"), null);
    assert.equal(await resolveEstablishmentByLocalText(x, ""), null);
  });
  test("validateRequestedLocal: OK / VALIDATION_ERROR / FORBIDDEN", async () => {
    const x = db();
    const ctxAssigned = { scope: "assigned", establecimientoIds: [1] };
    assert.equal((await validateRequestedLocal(x, ctxAssigned, B)).code, "OK");
    assert.equal((await validateRequestedLocal(x, ctxAssigned, L)).code, "FORBIDDEN"); // existe pero ajeno
    assert.equal((await validateRequestedLocal(x, ctxAssigned, "No Existe")).code, "VALIDATION_ERROR");
    assert.equal((await validateRequestedLocal(x, { scope: "global" }, L)).code, "OK");
  });
});
