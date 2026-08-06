// RRHH — lógica pura de la ficha (antigüedad, caducidades, timeline, resumen de equipo).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { diasEntre, antiguedad, documentosPorCaducar, construyeTimeline, diasHastaCumple, resumenEquipoPorLocal } from "../../src/modules/rrhh/ficha.js";

describe("diasEntre", () => {
  test("cuenta días entre fechas", () => {
    assert.equal(diasEntre("2026-01-01", "2026-01-31"), 30);
    assert.equal(diasEntre("2026-01-01", "2027-01-01"), 365);
    assert.equal(diasEntre("2026-03-01", "2026-02-01"), -28);
  });
  test("fecha inválida → null", () => {
    assert.equal(diasEntre("", "2026-01-01"), null);
    assert.equal(diasEntre("2026-01-01", "x"), null);
  });
});

describe("antiguedad", () => {
  test("años y meses", () => {
    const a = antiguedad("2024-08-07", "2026-08-07");
    assert.equal(a.anios, 2);
    assert.equal(a.texto, "2 años");
  });
  test("menos de un mes → días", () => {
    const a = antiguedad("2026-08-01", "2026-08-07");
    assert.equal(a.anios, 0);
    assert.equal(a.dias, 6);
    assert.ok(a.texto.includes("día"));
  });
  test("sin fecha o futura → null", () => {
    assert.equal(antiguedad(null, "2026-08-07"), null);
    assert.equal(antiguedad("2027-01-01", "2026-08-07"), null);
  });
});

describe("documentosPorCaducar", () => {
  const docs = [
    { id: 1, nombre: "Contrato", fecha_caducidad: "2026-12-31" },
    { id: 2, nombre: "Manipulador", fecha_caducidad: "2026-08-20" },
    { id: 3, nombre: "DNI", fecha_caducidad: "2026-07-01" },
    { id: 4, nombre: "Sin caducidad", fecha_caducidad: null },
  ];
  test("marca vencidos y por caducar, descarta vigentes y sin fecha", () => {
    const r = documentosPorCaducar(docs, "2026-08-07", 30);
    assert.equal(r.length, 2); // DNI vencido + Manipulador por caducar (Contrato vigente, Sin fecha fuera)
    assert.equal(r[0].id, 3);
    assert.equal(r[0].estado, "vencido");
    assert.equal(r[1].id, 2);
    assert.equal(r[1].estado, "porCaducar");
    assert.equal(r[1].diasRestantes, 13);
  });
  test("ventana configurable", () => {
    assert.equal(documentosPorCaducar(docs, "2026-08-07", 200).some((d) => d.id === 1), true);
  });
});

describe("construyeTimeline", () => {
  test("fusiona y ordena por fecha desc", () => {
    const t = construyeTimeline(
      [{ creado_en: "2026-08-01", tipo: "incidencia", contenido: "llegó tarde" }],
      [{ fecha_llamada: "2026-08-05", mes: "2026-08", comentario_libre: "ok" }],
      [{ creado_en: "2026-08-03", tipo: "contrato", nombre: "Contrato 2026", fecha_caducidad: "2027-08-01", url: "/uploads/c.pdf" }]
    );
    assert.equal(t.length, 3);
    assert.equal(t[0].origen, "checkin"); // 08-05 primero
    assert.equal(t[1].origen, "documento"); // 08-03
    assert.equal(t[2].origen, "nota"); // 08-01
  });
  test("items sin fecha se descartan", () => {
    assert.equal(construyeTimeline([{ tipo: "nota", contenido: "x" }], [], []).length, 0);
  });
});

describe("diasHastaCumple", () => {
  test("cumpleaños dentro del año", () => {
    assert.equal(diasHastaCumple("1990-08-20", "2026-08-07"), 13);
  });
  test("cumpleaños ya pasado → salta al año siguiente", () => {
    assert.equal(diasHastaCumple("1990-08-01", "2026-08-07"), diasEntre("2026-08-07", "2027-08-01"));
  });
  test("sin fecha → null", () => {
    assert.equal(diasHastaCumple(null, "2026-08-07"), null);
  });
});

describe("resumenEquipoPorLocal", () => {
  const trabajadores = [
    { id: 1, nombre: "Ana", local: "Lloret", activo: 1, fecha_alta: "2024-08-07", fecha_nac: "1990-08-20" },
    { id: 2, nombre: "Bea", local: "Lloret", activo: 0, fecha_baja: "2026-06-01", fecha_alta: "2023-01-01" },
    { id: 3, nombre: "Cal", local: "Blanes", activo: 1, fecha_alta: "2026-08-01" },
  ];
  const checkins = [{ worker_id: 1, realizada: 1 }];
  const docs = { 1: [{ id: 9, fecha_caducidad: "2026-08-10" }] };
  test("agrupa por local con activos/bajas, check-ins, cumples y docs en alerta", () => {
    const r = resumenEquipoPorLocal(trabajadores, checkins, docs, "2026-08-07", 30);
    const lloret = r.find((x) => x.local === "Lloret");
    assert.equal(lloret.total, 2);
    assert.equal(lloret.activos, 1);
    assert.equal(lloret.bajas, 1);
    assert.equal(lloret.checkinsHechos, 1);
    assert.equal(lloret.docsAlerta, 1);
    assert.equal(lloret.cumples.length, 1);
    assert.equal(lloret.cumples[0].nombre, "Ana");
    const blanes = r.find((x) => x.local === "Blanes");
    assert.equal(blanes.activos, 1);
    assert.equal(blanes.checkinsHechos, 0);
  });
});
