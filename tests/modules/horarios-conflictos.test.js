import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectarConflictos, resumirConflictos, contratoVigente, BLOQUEA, AVISA } from "../../src/modules/horarios/conflictos.js";
import { transitar, puedeTransitar, validarPublicacion, construirSnapshot, versionVigenteEn, compararSnapshots } from "../../src/modules/horarios/versiones.js";
import { canonicalizar, serializarCanonico, hashCanonico } from "../../src/core/canonico.js";

const LUNES = "2026-08-10";
const EQUIPO = [{ id: 1, nombre: "KEVIN" }, { id: 2, nombre: "JUDIT" }];
const t = (o) => ({ tipo: "turno", area_id: 10, tramo_id: 1, fin_abierto: false, ...o });
const tipos = (c) => c.map((x) => x.tipo).sort();

describe("conflictos — lo que bloquea", () => {
  test("una persona en dos sitios a la vez", () => {
    const c = detectarConflictos({ lunes: LUNES, trabajadores: EQUIPO, asignaciones: [
      t({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 960 }),
      t({ id: 2, worker_id: 1, dia: "2026-08-10", inicio_min: 900, fin_min: 1200 }),
    ]});
    const s = c.find((x) => x.tipo === "solape");
    assert.equal(s.severidad, BLOQUEA);
    assert.match(s.mensaje, /KEVIN.*se pisan/);
  });

  test("turno durante unas vacaciones aprobadas", () => {
    const c = detectarConflictos({
      lunes: LUNES, trabajadores: EQUIPO,
      asignaciones: [t({ id: 1, worker_id: 2, dia: "2026-08-12", inicio_min: 660, fin_min: 960 })],
      ausencias: [{ worker_id: 2, tipo: "vacaciones", desde: "2026-08-10", hasta: "2026-08-16", estado: "aprobada" }],
    });
    const a = c.find((x) => x.tipo === "ausencia");
    assert.equal(a.severidad, BLOQUEA);
    assert.match(a.mensaje, /JUDIT.*vacaciones/);
  });

  test("una ausencia sin aprobar no bloquea", () => {
    const c = detectarConflictos({
      lunes: LUNES, trabajadores: EQUIPO,
      asignaciones: [t({ id: 1, worker_id: 2, dia: "2026-08-12", inicio_min: 660, fin_min: 960 })],
      ausencias: [{ worker_id: 2, tipo: "permiso", desde: "2026-08-12", hasta: "2026-08-12", estado: "pendiente" }],
    });
    assert.equal(c.filter((x) => x.tipo === "ausencia").length, 0);
  });

  test("EL TURNO PARTIDO NO ES UN CONFLICTO", () => {
    const c = detectarConflictos({ lunes: LUNES, trabajadores: EQUIPO, asignaciones: [
      t({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 900 }),
      t({ id: 2, worker_id: 1, dia: "2026-08-10", inicio_min: 1200, fin_min: 1500 }),
    ]});
    assert.deepEqual(tipos(c), [], "partir el turno es lo normal en hostelería");
  });
});

describe("conflictos — lo que solo avisa", () => {
  test("descanso corto entre el cierre y la mañana siguiente", () => {
    // Cierra a las 02:00 del martes (1560, día de negocio lunes) y entra el martes a las 11:00.
    const c = detectarConflictos({ lunes: LUNES, trabajadores: EQUIPO, asignaciones: [
      t({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 1200, fin_min: 1560 }),
      t({ id: 2, worker_id: 1, dia: "2026-08-11", inicio_min: 660, fin_min: 960 }),
    ]});
    const d = c.find((x) => x.tipo === "descanso_insuficiente");
    assert.equal(d.severidad, AVISA, "a veces hay que hacerlo; se avisa, no se prohíbe");
    assert.match(d.mensaje, /descansa 9 h/);
  });

  test("con 12 horas justas ya no avisa", () => {
    const c = detectarConflictos({ lunes: LUNES, trabajadores: EQUIPO, asignaciones: [
      t({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 1200, fin_min: 1440 }), // hasta las 24:00
      t({ id: 2, worker_id: 1, dia: "2026-08-11", inicio_min: 720, fin_min: 960 }),   // entra a las 12:00
    ]});
    assert.equal(c.filter((x) => x.tipo === "descanso_insuficiente").length, 0);
  });

  test("días seguidos sin librar", () => {
    const asignaciones = ["10","11","12","13","14","15","16"].map((d, i) =>
      t({ id: i + 1, worker_id: 1, dia: `2026-08-${d}`, inicio_min: 660, fin_min: 900 }));
    const c = detectarConflictos({ lunes: LUNES, trabajadores: EQUIPO, asignaciones });
    const s = c.find((x) => x.tipo === "sin_libranza");
    assert.match(s.mensaje, /7 días seguidos/);
  });

  test("horas por encima del contrato", () => {
    const asignaciones = ["10","11","12","13","14"].map((d, i) =>
      t({ id: i + 1, worker_id: 1, dia: `2026-08-${d}`, inicio_min: 600, fin_min: 1080 })); // 8 h × 5 = 40
    const c = detectarConflictos({
      lunes: LUNES, trabajadores: EQUIPO, asignaciones,
      contratos: [{ worker_id: 1, desde: "2024-01-01", hasta: null, horas_semana: 30 }],
    });
    const e = c.find((x) => x.tipo === "exceso_semanal");
    assert.match(e.mensaje, /40 h y su contrato son 30/);
  });

  test("jornada muy larga en un día, aunque sea partida", () => {
    const c = detectarConflictos({ lunes: LUNES, trabajadores: EQUIPO, asignaciones: [
      t({ id: 1, worker_id: 1, dia: "2026-08-15", inicio_min: 600, fin_min: 960 }),   // 6 h
      t({ id: 2, worker_id: 1, dia: "2026-08-15", inicio_min: 1140, fin_min: 1500 }), // 6 h
    ]});
    assert.ok(c.find((x) => x.tipo === "jornada_larga"), "12 h en un día merece un aviso");
  });

  test("menos gente de la mínima en un turno", () => {
    const c = detectarConflictos({
      lunes: LUNES, trabajadores: EQUIPO,
      areas: [{ id: 10, nombre: "SALA" }], tramos: [{ id: 1, nombre: "MAÑANA" }],
      asignaciones: [t({ id: 1, worker_id: 1, dia: "2026-08-15", inicio_min: 660, fin_min: 960 })],
      necesidades: [{ dow: 5, area_id: 10, tramo_id: 1, minimo: 4 }],  // sábado
    });
    const b = c.find((x) => x.tipo === "bajo_minimo");
    assert.match(b.mensaje, /hay 1 y hacen falta 4/);
  });
});

describe("conflictos — resumen", () => {
  test("con un solape no se puede publicar", () => {
    const r = resumirConflictos([{ tipo: "solape", severidad: BLOQUEA }, { tipo: "sin_libranza", severidad: AVISA }]);
    assert.equal(r.puedePublicar, false);
    assert.equal(r.bloquean.length, 1);
    assert.equal(r.avisan.length, 1);
  });
  test("solo con avisos sí se puede", () => {
    assert.equal(resumirConflictos([{ tipo: "sin_libranza", severidad: AVISA }]).puedePublicar, true);
  });
});

describe("contratoVigente", () => {
  const cs = [
    { worker_id: 1, desde: "2024-01-01", hasta: "2026-05-31", horas_semana: 20 },
    { worker_id: 1, desde: "2026-06-01", hasta: null, horas_semana: 30 },
  ];
  test("coge el que estaba vigente en esa fecha", () => {
    assert.equal(contratoVigente(cs, 1, "2026-03-01").horas_semana, 20);
    assert.equal(contratoVigente(cs, 1, "2026-08-10").horas_semana, 30);
  });
  test("antes del primero no hay contrato", () => {
    assert.equal(contratoVigente(cs, 1, "2023-01-01"), null);
  });
});

describe("versiones — máquina de estados", () => {
  test("el camino normal", () => {
    assert.equal(transitar("borrador", "publicar").estado, "publicado");
    assert.equal(transitar("publicado", "sustituir").estado, "sustituido");
    assert.equal(transitar("publicado", "cerrar").estado, "cerrado");
  });
  test("lo cerrado no se toca", () => {
    assert.ok(transitar("cerrado", "publicar").error);
    assert.equal(puedeTransitar("cerrado", "publicar"), false);
  });
  test("un borrador no se puede cerrar sin publicar", () => {
    assert.ok(transitar("borrador", "cerrar").error);
  });
  test("lo sustituido es terminal", () => {
    assert.ok(transitar("sustituido", "publicar").error);
  });
});

describe("versiones — publicar", () => {
  const solape = { tipo: "solape", severidad: "bloquea" };
  const aviso = { tipo: "sin_libranza", severidad: "avisa" };
  test("un solape lo impide", () => {
    const r = validarPublicacion({ estado: "borrador", conflictos: [solape] });
    assert.equal(r.ok, false);
    assert.equal(r.bloquean.length, 1);
  });
  test("los avisos piden confirmación, no impiden", () => {
    const r = validarPublicacion({ estado: "borrador", conflictos: [aviso] });
    assert.equal(r.ok, false);
    assert.equal(r.requiereConfirmacion, true);
    const r2 = validarPublicacion({ estado: "borrador", conflictos: [aviso], avisosAceptados: ["sin_libranza"] });
    assert.equal(r2.ok, true, "asumiéndolos sí se publica, y queda escrito");
  });
  test("sin nada que revisar se publica directamente", () => {
    assert.equal(validarPublicacion({ estado: "borrador", conflictos: [] }).ok, true);
  });
  test("no se republica lo ya publicado", () => {
    assert.equal(validarPublicacion({ estado: "publicado", conflictos: [] }).ok, false);
  });
});

describe("versiones — el snapshot y la pregunta de dentro de dos años", () => {
  const base = {
    semana: { local: "Blanes", lunes: LUNES, version: 1 },
    dias: ["2026-08-10"],
    areas: [{ id: 10, nombre: "SALA", orden: 1 }],
    tramos: [{ id: 1, nombre: "MAÑANA", orden: 1, inicio_min: 660, fin_min: 960 }],
    trabajadores: EQUIPO,
    asignaciones: [t({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 960 })],
  };

  test("EL SNAPSHOT GUARDA LOS NOMBRES: si mañana se da de baja, el horario sigue diciendo quién estaba", () => {
    const s = construirSnapshot(base);
    assert.equal(s.asignaciones[0].nombre, "KEVIN");
  });

  test("el hash no cambia aunque cambie el orden de las claves", () => {
    const sha = (txt) => [...txt].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16);
    const a = { b: 2, a: 1, c: [{ y: 2, x: 1 }] };
    const b = { c: [{ x: 1, y: 2 }], a: 1, b: 2 };
    assert.equal(serializarCanonico(a), serializarCanonico(b));
    assert.equal(hashCanonico(a, sha), hashCanonico(b, sha));
  });

  test("undefined no se cuela en el JSON", () => {
    assert.equal(serializarCanonico({ a: 1, b: undefined }), '{"a":1}');
  });

  test("versionVigenteEn devuelve la que regía en ese instante", () => {
    const vs = [
      { version: 1, publicado_en: "2026-08-01T10:00:00+02:00", sustituido_en: "2026-08-05T09:00:00+02:00" },
      { version: 2, publicado_en: "2026-08-05T09:00:00+02:00", sustituido_en: null },
    ];
    assert.equal(versionVigenteEn(vs, "2026-08-03T12:00:00+02:00").version, 1);
    assert.equal(versionVigenteEn(vs, "2026-08-09T12:00:00+02:00").version, 2);
    assert.equal(versionVigenteEn(vs, "2026-07-30T12:00:00+02:00"), null, "antes de publicar nada");
  });

  test("cuenta los cambios respecto a lo publicado", () => {
    const antes = construirSnapshot(base);
    const despues = construirSnapshot({
      ...base,
      asignaciones: [
        t({ id: 1, worker_id: 1, dia: "2026-08-10", inicio_min: 660, fin_min: 900 }),  // cambia la hora
        t({ id: 2, worker_id: 2, dia: "2026-08-10", inicio_min: 660, fin_min: 960 }),  // uno nuevo
      ],
    });
    const d = compararSnapshots(antes, despues);
    assert.equal(d.anadidos.length, 2);
    assert.equal(d.quitados.length, 1);
  });
});
