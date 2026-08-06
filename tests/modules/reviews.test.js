// Reseñas — lógica pura: normalización de filas, resumen por local y prompt de borrador IA.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mapManageRow, resumenPorLocal, draftRequest, cleanDraft, extractText, syncReviews, mensajeEstadoReseñas, buildManageQuery, queryTextSearch, elegirSugerido, hayCoincidenciaUnica, normalizarUbicacionBP, normalizarPlaceResult, formatearDireccionBP, placeIdsConfigurados, upsertPlaceEntry } from "../../src/modules/reviews/reviews.service.js";

describe("mapManageRow", () => {
  test("marca respondida y estrellas; fecha recortada", () => {
    const r = mapManageRow({ id: "x", location_name: "La Tapeta Blanes", author: "Ana", rating: 5, text: "genial", fecha: "2026-08-01T10:00:00Z", reply: "gracias", replied_at: "2026-08-02T09:00:00Z", reply_by: "Uri" });
    assert.equal(r.respondida, true);
    assert.equal(r.estrellas, "★★★★★");
    assert.equal(r.fecha, "2026-08-01");
    assert.equal(r.replied_at, "2026-08-02");
    assert.equal(r.negativa, false);
  });
  test("sin reply ⇒ pendiente; rating<=3 ⇒ negativa", () => {
    const r = mapManageRow({ id: "y", location_name: "L", author: "", rating: 2, text: "lento" });
    assert.equal(r.respondida, false);
    assert.equal(r.negativa, true);
    assert.equal(r.author, "Cliente");
  });
});

describe("resumenPorLocal", () => {
  test("cuenta pendientes/respondidas y media por local", () => {
    const rows = [
      { local: "A", rating: 5, respondida: true },
      { local: "A", rating: 3, respondida: false },
      { local: "B", rating: 1, respondida: false },
    ].map((x) => ({ ...x }));
    const res = resumenPorLocal(rows);
    const a = res.find((r) => r.local === "A");
    assert.equal(a.total, 2); assert.equal(a.pendientes, 1); assert.equal(a.respondidas, 1);
    assert.equal(a.media, 4);
    // ordena por pendientes desc: B(1) y A(1) — ambos 1 pendiente, desempata total
    assert.ok(res.length === 2);
  });
});

describe("draftRequest — prompt de borrador", () => {
  test("reseña positiva: instruye agradecer e invitar", () => {
    const { system, messages } = draftRequest({ location_name: "La Tapeta Girona", author: "Marc", rating: 5, text: "espectacular" });
    assert.match(system, /La Tapeta Girona/);
    assert.match(system, /agradece/i);
    assert.match(messages[0].content, /espectacular/);
    assert.equal(messages[0].role, "user");
  });
  test("reseña negativa: instruye disculparse sin defenderse", () => {
    const { system } = draftRequest({ location_name: "L", author: "", rating: 1, text: "muy lento" });
    assert.match(system, /discúlpate/i);
    assert.match(system, /defensiva/i);
  });
});

describe("cleanDraft / extractText", () => {
  test("cleanDraft quita comillas envolventes", () => {
    assert.equal(cleanDraft('"Gracias por tu visita"'), "Gracias por tu visita");
    assert.equal(cleanDraft("«Hola»"), "Hola");
    assert.equal(cleanDraft("  texto normal  "), "texto normal");
  });
  test("extractText concatena bloques de texto y limpia", () => {
    const resp = { content: [{ type: "text", text: '"Hola ' }, { type: "text", text: 'de nuevo"' }, { type: "tool_use" }] };
    assert.equal(extractText(resp), "Hola de nuevo");
    assert.equal(extractText(null), "");
  });
});

describe("syncReviews (fallback Business Profile → Places)", () => {
  const base = { hasRefreshToken: true, hasPlacesKey: true, placeIdsCount: 3 };
  const biz = (r) => async () => r;
  const places = (r) => async () => r;

  test("Business Profile funciona (importa) → NO llama a Places", async () => {
    let placesCalled = false;
    const r = await syncReviews({ ...base, fetchBusiness: biz({ imported: 5, updated: 1 }), fetchPlaces: async () => { placesCalled = true; return { imported: 9 }; } });
    assert.equal(r.source, "business_profile");
    assert.equal(r.imported, 5);
    assert.equal(placesCalled, false);
  });

  test("Business Profile 403 → llama a Places", async () => {
    const r = await syncReviews({ ...base, fetchBusiness: async () => { throw new Error("cuota_o_permiso_403"); }, fetchPlaces: places({ imported: 7, updated: 0, errors: [] }) });
    assert.equal(r.source, "places");
    assert.equal(r.imported, 7);
    assert.match(r.businessProfileError, /403/);
  });

  test("Business Profile 0 cuentas → llama a Places", async () => {
    const r = await syncReviews({ ...base, fetchBusiness: biz({ imported: 0, updated: 0, accounts: 0, reason: "sin_cuentas" }), fetchPlaces: places({ imported: 4 }) });
    assert.equal(r.source, "places");
    assert.equal(r.imported, 4);
    assert.equal(r.businessProfileError, "sin_cuentas");
  });

  test("Business Profile 0 reseñas → llama a Places", async () => {
    const r = await syncReviews({ ...base, fetchBusiness: biz({ imported: 0, updated: 0, reason: "sin_resenas" }), fetchPlaces: places({ imported: 2 }) });
    assert.equal(r.source, "places");
    assert.equal(r.imported, 2);
  });

  test("Sin token → Places directamente", async () => {
    let bizCalled = false;
    const r = await syncReviews({ ...base, hasRefreshToken: false, fetchBusiness: async () => { bizCalled = true; return { imported: 1 }; }, fetchPlaces: places({ imported: 3 }) });
    assert.equal(r.source, "places");
    assert.equal(bizCalled, false);
  });

  test("Sin API key → motivo claro, sin llamar Places", async () => {
    const r = await syncReviews({ ...base, hasPlacesKey: false, fetchBusiness: biz({ imported: 0, reason: "sin_cuentas" }), fetchPlaces: async () => ({ imported: 9 }) });
    assert.equal(r.source, "none");
    assert.equal(r.reason, "business_sin_datos_y_sin_places_key");
    assert.ok(r.errors.some((e) => /GOOGLE_PLACES_API_KEY/.test(e)));
  });

  test("Sin Place IDs → motivo claro", async () => {
    const r = await syncReviews({ ...base, placeIdsCount: 0, fetchBusiness: biz({ imported: 0, reason: "sin_cuentas" }), fetchPlaces: async () => ({ imported: 9 }) });
    assert.equal(r.source, "none");
    assert.equal(r.reason, "sin_place_ids");
  });

  test("Un Place ID falla → procesa los demás (errores agregados, no corta)", async () => {
    const r = await syncReviews({ ...base, hasRefreshToken: false, fetchPlaces: places({ imported: 6, updated: 0, errors: ["Lloret: NOT_FOUND"] }) });
    assert.equal(r.source, "places");
    assert.equal(r.imported, 6);
    assert.deepEqual(r.errors, ["Lloret: NOT_FOUND"]);
  });

  test("resultado estructurado tiene todas las claves", async () => {
    const r = await syncReviews({ ...base, fetchBusiness: biz({ imported: 1 }), fetchPlaces: places({ imported: 0 }) });
    for (const k of ["source", "imported", "updated", "errors", "businessProfileError"]) assert.ok(k in r, `falta ${k}`);
  });
});

describe("mensajeEstadoReseñas", () => {
  test("con reseñas → resumen con fuente", () => {
    assert.match(mensajeEstadoReseñas({ connected: true, reviews_count: 143, source: "places" }), /143.*Places/);
  });
  test("cuota pendiente y con Place IDs → usando Places", () => {
    assert.match(mensajeEstadoReseñas({ connected: true, reviews_count: 0, businessProfileError: "cuota_o_permiso_403", places_configured: 3 }), /Business Profile no tiene cuota/);
  });
  test("faltan Place IDs", () => {
    assert.match(mensajeEstadoReseñas({ connected: true, reviews_count: 0, reason: "sin_place_ids" }), /Place IDs/);
  });
  test("sin Place IDs → mensaje EXACTO (nunca 'Fuente: none' sin explicar)", () => {
    assert.equal(mensajeEstadoReseñas({ connected: true, reviews_count: 0, source: "none", reason: "sin_place_ids", businessProfileError: "cuota_agotada_429" }), "No hay Place IDs configurados.");
  });
  test("reason='sin_place_ids' OBSOLETO pero ya hay Place IDs vivos → NO dice 'No hay Place IDs'", () => {
    // Regresión de coherencia: tras vincular fichas, places_configured>0 manda sobre el reason persistido.
    const m = mensajeEstadoReseñas({ connected: true, reviews_count: 0, reason: "sin_place_ids", places_configured: 3, places_key_set: true });
    assert.notEqual(m, "No hay Place IDs configurados.");
  });
});

describe("coherencia Vincular → Guardar → Sincronización (mismo Place ID)", () => {
  test("upsertPlaceEntry guarda y placeIdsConfigurados/sync encuentran ese mismo Place ID", () => {
    // 1) Vincular ficha: se guarda en el array de places_ids (misma pura que usa server.js).
    const guardado = upsertPlaceEntry([], { name: "La Tapeta - Blanes", placeId: "ChIJ123", google_location_id: "accounts/1/locations/99", official_name: "La Tapeta Blanes", address: "C/ Mayor 1, Blanes" });
    // 2) La sincronización cuenta Place IDs con la MISMA fuente de verdad → debe ver 1.
    assert.equal(placeIdsConfigurados(guardado), 1);
    // 3) Y el Place ID recuperado es exactamente el vinculado (mismo campo `placeId`).
    const entrada = guardado.find((l) => l.name === "La Tapeta - Blanes");
    assert.equal(entrada.placeId, "ChIJ123");
  });
  test("upsert por nombre no duplica; actualiza el Place ID del mismo local", () => {
    let arr = upsertPlaceEntry([], { name: "Cooperativa - Blanes", placeId: "OLD" });
    arr = upsertPlaceEntry(arr, { name: "Cooperativa - Blanes", placeId: "NEW" });
    assert.equal(arr.length, 1);
    assert.equal(placeIdsConfigurados(arr), 1);
    assert.equal(arr[0].placeId, "NEW");
  });
  test("placeIdsConfigurados ignora entradas sin placeId y tolera no-array", () => {
    assert.equal(placeIdsConfigurados([{ name: "X" }, { name: "Y", placeId: "" }, { name: "Z", placeId: "ChIJz" }]), 1);
    assert.equal(placeIdsConfigurados(null), 0);
    assert.equal(placeIdsConfigurados(undefined), 0);
  });
});

describe("buildManageQuery (bandeja: filtros/orden)", () => {
  test("sin filtros → sin WHERE, orden recientes", () => {
    const q = buildManageQuery({});
    assert.equal(q.where, "");
    assert.match(q.orderBy, /DESC/);
    assert.deepEqual(q.params, []);
  });
  test("local + rating + estado pendientes", () => {
    const q = buildManageQuery({ local: "Haddock", rating: "5", estado: "pendientes" });
    assert.match(q.where, /location_name = \?/);
    assert.match(q.where, /rating = \?/);
    assert.match(q.where, /reply IS NULL/);
    assert.deepEqual(q.params, ["Haddock", 5]);
  });
  test("búsqueda de texto y autor (LIKE en minúsculas)", () => {
    const q = buildManageQuery({ q: "Genial", autor: "Ana" });
    assert.match(q.where, /LOWER\(text\) LIKE/);
    assert.match(q.where, /LOWER\(author\) LIKE/);
    assert.ok(q.params.includes("%genial%"));
    assert.ok(q.params.includes("%ana%"));
  });
  test("rango de fechas", () => {
    const q = buildManageQuery({ from: "2026-01-01", to: "2026-08-01" });
    assert.ok(q.params.includes("2026-01-01"));
    assert.ok(q.params.some((p) => String(p).startsWith("2026-08-01T23")));
  });
  test("orden peor valoración primero", () => {
    assert.match(buildManageQuery({ sort: "peor" }).orderBy, /rating ASC/);
    assert.match(buildManageQuery({ sort: "mejor" }).orderBy, /rating DESC/);
    assert.match(buildManageQuery({ sort: "antiguas" }).orderBy, /ASC/);
  });
});


describe("auto-vinculación de fichas Google", () => {
  test("queryTextSearch: quita el guion y normaliza espacios", () => {
    assert.equal(queryTextSearch("La Tapeta - Blanes"), "La Tapeta Blanes");
    assert.equal(queryTextSearch("Botiga d'en Mateu - Tordera"), "Botiga d'en Mateu Tordera");
  });
  test("elegirSugerido / hayCoincidenciaUnica", () => {
    assert.equal(elegirSugerido([]), null);
    assert.equal(elegirSugerido([{ place_id: "a" }]), 0);
    assert.equal(elegirSugerido([{ place_id: "a" }, { place_id: "b" }]), 0);
    assert.equal(hayCoincidenciaUnica([{ place_id: "a" }]), true);
    assert.equal(hayCoincidenciaUnica([{ place_id: "a" }, { place_id: "b" }]), false);
  });
  test("normalizarUbicacionBP: extrae placeId, título, dirección y location_id", () => {
    const loc = { name: "accounts/1/locations/99", title: "La Tapeta Blanes", metadata: { placeId: "ChIJxxx" }, storefrontAddress: { addressLines: ["C/ Mayor 1"], locality: "Blanes", administrativeArea: "Girona" } };
    assert.deepEqual(normalizarUbicacionBP(loc), { place_id: "ChIJxxx", name: "La Tapeta Blanes", address: "C/ Mayor 1, Blanes, Girona", google_location_id: "accounts/1/locations/99" });
  });
  test("normalizarPlaceResult: Text Search → candidato uniforme", () => {
    assert.deepEqual(normalizarPlaceResult({ place_id: "ChIJyyy", name: "La Tapeta", formatted_address: "C/ Mayor 1, Blanes" }), { place_id: "ChIJyyy", name: "La Tapeta", address: "C/ Mayor 1, Blanes", google_location_id: null });
  });
  test("formatearDireccionBP tolera vacíos", () => {
    assert.equal(formatearDireccionBP(null), "");
    assert.equal(formatearDireccionBP({ locality: "Lloret" }), "Lloret");
  });
});
