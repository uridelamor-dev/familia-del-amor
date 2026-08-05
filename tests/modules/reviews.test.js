// Reseñas — lógica pura: normalización de filas, resumen por local y prompt de borrador IA.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mapManageRow, resumenPorLocal, draftRequest, cleanDraft, extractText } from "../../src/modules/reviews/reviews.service.js";

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
